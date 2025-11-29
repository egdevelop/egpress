import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import crypto from "crypto";
import { storage, type SearchConsoleConfig, type IndexingStatus } from "./storage";
import { getGitHubClient, getAuthenticatedUser, isGitHubConnected, getGitHubConnectionInfo, setManualGitHubToken, clearManualToken } from "./github";
import { generateBlogPost } from "./gemini";
import { 
  saveUserSettings, 
  loadUserSettings, 
  updateGeminiKey, 
  updateVercelConfig, 
  updateSearchConsoleConfig, 
  updateAdsenseConfig, 
  clearVercelConfig, 
  clearSearchConsoleConfig,
  // Repository-based settings
  getRepositorySettings,
  saveRepositorySettings,
  updateRepositoryVercel,
  clearRepositoryVercel,
  updateRepositorySearchConsole,
  clearRepositorySearchConsole,
  updateRepositoryGemini,
  updateRepositoryAdsense,
} from "./supabase";
import matter from "gray-matter";
import yaml from "yaml";
import { Octokit } from "@octokit/rest";
import type { Repository, Post, ThemeSettings, FileTreeItem, PageContent, SiteConfig, AdsenseConfig, StaticPage, BranchInfo } from "@shared/schema";
import { siteConfigSchema, adsenseConfigSchema } from "@shared/schema";
import { Project, SyntaxKind, ObjectLiteralExpression, PropertyAssignment } from 'ts-morph';

declare module "express-session" {
  interface SessionData {
    githubToken?: string;
    githubUsername?: string;
  }
}

function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.session.githubToken) {
    return res.status(401).json({ success: false, error: "Authentication required" });
  }
  setManualGitHubToken(req.session.githubToken);
  next();
}

// Default configurations
const defaultSiteConfig: SiteConfig = {
  siteName: "My Blog",
  tagline: "A modern blog",
  description: "",
};

const defaultAdsenseConfig: AdsenseConfig = {
  enabled: false,
  publisherId: "",
  autoAdsEnabled: false,
};

// Helper to find item in file tree
function findInTree(tree: FileTreeItem[], path: string): FileTreeItem | undefined {
  for (const item of tree) {
    if (item.path === path) return item;
    if (item.children) {
      const found = findInTree(item.children, path);
      if (found) return found;
    }
  }
  return undefined;
}

// Parse repository URL (owner/repo format)
function parseRepoUrl(url: string): { owner: string; repo: string } | null {
  // Handle full GitHub URLs
  const fullUrlMatch = url.match(/github\.com[\/:]([^\/]+)\/([^\/\.]+)/);
  if (fullUrlMatch) {
    return { owner: fullUrlMatch[1], repo: fullUrlMatch[2] };
  }
  // Handle owner/repo format
  const shortMatch = url.match(/^([^\/]+)\/([^\/]+)$/);
  if (shortMatch) {
    return { owner: shortMatch[1], repo: shortMatch[2] };
  }
  return null;
}

// Convert GitHub tree to our FileTreeItem format
function buildFileTree(items: Array<{ path: string; type: string }>): FileTreeItem[] {
  const root: Map<string, FileTreeItem> = new Map();

  for (const item of items) {
    const parts = item.path.split("/");
    let currentPath = "";
    let parent: FileTreeItem[] | undefined = undefined;

    for (let i = 0; i < parts.length; i++) {
      const name = parts[i];
      const isLast = i === parts.length - 1;
      const fullPath = currentPath ? `${currentPath}/${name}` : name;

      if (i === 0) {
        if (!root.has(name)) {
          const newItem: FileTreeItem = {
            name,
            path: fullPath,
            type: isLast ? (item.type === "tree" ? "dir" : "file") : "dir",
            children: isLast && item.type !== "tree" ? undefined : [],
          };
          root.set(name, newItem);
        }
        parent = root.get(name)?.children;
      } else if (parent) {
        let existing = parent.find(p => p.name === name);
        if (!existing) {
          const newItem: FileTreeItem = {
            name,
            path: fullPath,
            type: isLast ? (item.type === "tree" ? "dir" : "file") : "dir",
            children: isLast && item.type !== "tree" ? undefined : [],
          };
          parent.push(newItem);
          existing = newItem;
        }
        parent = existing.children;
      }

      currentPath = fullPath;
    }
  }

  // Sort directories first, then alphabetically
  const sortTree = (items: FileTreeItem[]): FileTreeItem[] => {
    return items.sort((a, b) => {
      if (a.type === "dir" && b.type === "file") return -1;
      if (a.type === "file" && b.type === "dir") return 1;
      return a.name.localeCompare(b.name);
    }).map(item => ({
      ...item,
      children: item.children ? sortTree(item.children) : undefined,
    }));
  };

  return sortTree(Array.from(root.values()));
}

// Parse Astro frontmatter post
function parsePost(path: string, content: string): Post | null {
  try {
    const { data, content: markdown } = matter(content);
    const slug = path.split("/").pop()?.replace(/\.(md|mdx)$/, "") || "";
    
    // Clone only serializable frontmatter fields (avoid gray-matter metadata)
    const rawFrontmatter: Record<string, any> = {};
    for (const key of Object.keys(data)) {
      const val = data[key];
      // Skip internal gray-matter properties and non-serializable values
      if (key.startsWith('_') || typeof val === 'function') continue;
      rawFrontmatter[key] = val;
    }
    
    return {
      path,
      slug,
      title: data.title || "Untitled",
      description: data.description || "",
      pubDate: data.pubDate ? new Date(data.pubDate).toISOString() : new Date().toISOString(),
      heroImage: data.featuredImage || data.heroImage || "",
      author: data.author || undefined,
      category: data.category || "",
      tags: Array.isArray(data.tags) ? data.tags : [],
      draft: data.draft === true,
      content: markdown,
      // Store raw frontmatter to preserve original structure when saving
      rawFrontmatter,
    };
  } catch {
    return null;
  }
}

// Generate frontmatter content for a post
function generatePostContent(post: Omit<Post, "path">, originalFrontmatter?: Record<string, any>): string {
  // Start with original frontmatter to preserve any custom fields
  const frontmatter: Record<string, any> = originalFrontmatter ? { ...originalFrontmatter } : {};
  
  // Update with new values from the form (required fields)
  frontmatter.title = post.title;
  frontmatter.pubDate = post.pubDate;
  
  // Handle description - remove if empty
  if (post.description && post.description.trim()) {
    frontmatter.description = post.description;
  } else {
    delete frontmatter.description;
  }
  
  // Handle featuredImage (mapped from heroImage form field) - remove if empty
  if (post.heroImage && post.heroImage.trim()) {
    frontmatter.featuredImage = post.heroImage;
    delete frontmatter.heroImage; // Remove old heroImage if exists
  } else {
    delete frontmatter.featuredImage;
    delete frontmatter.heroImage;
  }
  
  // Handle author - ALWAYS output as object for Astro compatibility
  const authorValue = typeof post.author === 'string' ? post.author.trim() : post.author;
  if (authorValue && (typeof authorValue !== 'string' || authorValue.length > 0)) {
    if (typeof authorValue === 'object' && authorValue !== null) {
      // Author is already an object, use as is
      frontmatter.author = authorValue;
    } else if (typeof authorValue === 'string') {
      // Author is a string - check if original was an object
      if (originalFrontmatter?.author && typeof originalFrontmatter.author === 'object' && originalFrontmatter.author !== null) {
        // Preserve object structure, update name
        frontmatter.author = {
          ...originalFrontmatter.author,
          name: authorValue,
        };
      } else {
        // Original was string or didn't exist - convert to object for Astro
        frontmatter.author = { name: authorValue };
      }
    }
  } else if (originalFrontmatter?.author) {
    // Keep original author if field was cleared
    if (typeof originalFrontmatter.author === 'string') {
      // Convert string to object
      frontmatter.author = { name: originalFrontmatter.author };
    } else {
      frontmatter.author = originalFrontmatter.author;
    }
  } else {
    delete frontmatter.author;
  }
  
  // Handle category (required by some Astro templates) - remove if empty
  if (post.category && post.category.trim()) {
    frontmatter.category = post.category;
  } else if (originalFrontmatter?.category) {
    // Preserve original category if field was cleared
    frontmatter.category = originalFrontmatter.category;
  }
  
  // Handle tags - remove if empty array
  if (post.tags && post.tags.length > 0) {
    frontmatter.tags = post.tags;
  } else if (originalFrontmatter?.tags && originalFrontmatter.tags.length > 0) {
    // Keep original tags if field was cleared
    frontmatter.tags = originalFrontmatter.tags;
  } else {
    delete frontmatter.tags;
  }
  
  // Handle draft - only include if true
  if (post.draft) {
    frontmatter.draft = true;
  } else {
    delete frontmatter.draft;
  }

  // Use yaml library for proper formatting
  const frontmatterStr = yaml.stringify(frontmatter).trim();

  return `---\n${frontmatterStr}\n---\n\n${post.content}`;
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  
  // ============== HEALTH CHECK ==============
  
  app.get("/api/health", (req, res) => {
    res.json({ 
      status: "ok", 
      timestamp: new Date().toISOString(),
      uptime: process.uptime()
    });
  });

  // ============== AUTHENTICATION ROUTES ==============

  // Check auth status
  app.get("/api/auth/status", async (req, res) => {
    try {
      if (req.session.githubToken && req.session.githubUsername) {
        res.json({ 
          success: true, 
          data: { 
            authenticated: true, 
            username: req.session.githubUsername 
          } 
        });
      } else {
        res.json({ success: true, data: { authenticated: false } });
      }
    } catch (error) {
      res.json({ success: true, data: { authenticated: false } });
    }
  });

  // Login with GitHub token
  app.post("/api/auth/login", async (req, res) => {
    try {
      const { token } = req.body;
      
      if (!token) {
        return res.json({ success: false, error: "GitHub token is required" });
      }

      // Validate the token by getting user info
      const octokit = new Octokit({ auth: token });
      
      try {
        const { data: user } = await octokit.users.getAuthenticated();
        
        // Store in session
        req.session.githubToken = token;
        req.session.githubUsername = user.login;
        
        // Set as manual token for GitHub operations
        setManualGitHubToken(token);
        
        // Load saved settings from Supabase (using username for OAuth compatibility)
        const savedSettings = await loadUserSettings(token, user.login);
        
        // If there are saved settings, restore them to storage
        if (savedSettings) {
          if (savedSettings.gemini_api_key) {
            await storage.setGeminiApiKey(savedSettings.gemini_api_key);
          }
          if (savedSettings.vercel_token) {
            await storage.setVercelConfig({
              token: savedSettings.vercel_token,
              teamId: savedSettings.vercel_team_id,
              username: user.login,
            });
          }
          if (savedSettings.search_console_client_email && savedSettings.search_console_private_key) {
            await storage.setSearchConsoleConfig({
              clientEmail: savedSettings.search_console_client_email,
              privateKey: savedSettings.search_console_private_key,
              siteUrl: savedSettings.search_console_site_url || "",
            });
          }
        } else {
          // Create initial settings record
          await saveUserSettings(token, user.login, {});
        }
        
        res.json({ 
          success: true, 
          data: { 
            username: user.login, 
            name: user.name,
            avatar_url: user.avatar_url 
          } 
        });
      } catch (authError: any) {
        res.json({ success: false, error: "Invalid GitHub token. Please check your Personal Access Token." });
      }
    } catch (error: any) {
      res.json({ success: false, error: error.message || "Authentication failed" });
    }
  });

  // Logout
  app.post("/api/auth/logout", async (req, res) => {
    try {
      clearManualToken();
      await storage.clearRepository();
      req.session.destroy((err) => {
        if (err) {
          console.error("Session destroy error:", err);
        }
        res.json({ success: true });
      });
    } catch (error) {
      res.json({ success: false, error: "Logout failed" });
    }
  });

  // Check if GitHub OAuth is configured
  app.get("/api/auth/github/config", (req, res) => {
    const hasOAuth = !!(process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET);
    res.json({ success: true, data: { oauthEnabled: hasOAuth } });
  });

  // GitHub OAuth - initiate login
  app.get("/api/auth/github", (req, res) => {
    const clientId = process.env.GITHUB_CLIENT_ID;
    
    if (!clientId) {
      return res.status(400).json({ success: false, error: "GitHub OAuth not configured" });
    }

    // Generate cryptographically secure state for CSRF protection
    const state = crypto.randomBytes(32).toString('hex');
    
    // Store state in session for validation on callback
    (req.session as any).oauthState = state;

    // Build the callback URL dynamically
    const protocol = req.headers['x-forwarded-proto'] || req.protocol || 'http';
    const host = req.headers['x-forwarded-host'] || req.headers.host;
    const redirectUri = `${protocol}://${host}/api/auth/github/callback`;
    
    // Request repo scope for full repository access (space-separated)
    const scope = "repo read:user";
    
    const authUrl = `https://github.com/login/oauth/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${encodeURIComponent(scope)}&state=${state}`;
    
    res.redirect(authUrl);
  });

  // GitHub OAuth - callback
  app.get("/api/auth/github/callback", async (req, res) => {
    const { code, error: oauthError, state } = req.query;
    
    if (oauthError) {
      return res.redirect(`/login?error=${encodeURIComponent(oauthError as string)}`);
    }
    
    if (!code || typeof code !== 'string') {
      return res.redirect('/login?error=No authorization code received');
    }

    // Validate state parameter for CSRF protection
    const storedState = (req.session as any).oauthState;
    if (!state || state !== storedState) {
      return res.redirect('/login?error=Invalid state parameter. Please try again.');
    }
    
    // Clear the state from session after validation
    delete (req.session as any).oauthState;

    const clientId = process.env.GITHUB_CLIENT_ID;
    const clientSecret = process.env.GITHUB_CLIENT_SECRET;
    
    if (!clientId || !clientSecret) {
      return res.redirect('/login?error=GitHub OAuth not configured');
    }

    try {
      // Exchange code for access token
      const tokenResponse = await fetch('https://github.com/login/oauth/access_token', {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          client_id: clientId,
          client_secret: clientSecret,
          code: code,
        }),
      });

      const tokenData = await tokenResponse.json() as { access_token?: string; error?: string; error_description?: string };
      
      if (tokenData.error || !tokenData.access_token) {
        return res.redirect(`/login?error=${encodeURIComponent(tokenData.error_description || tokenData.error || 'Failed to get access token')}`);
      }

      const accessToken = tokenData.access_token;

      // Validate token and get user info
      const octokit = new Octokit({ auth: accessToken });
      const { data: user } = await octokit.users.getAuthenticated();
      
      // Store in session
      req.session.githubToken = accessToken;
      req.session.githubUsername = user.login;
      
      // Set as manual token for GitHub operations
      setManualGitHubToken(accessToken);
      
      // Load user settings from Supabase if available (using username for OAuth compatibility)
      const savedSettings = await loadUserSettings(accessToken, user.login);
      if (savedSettings) {
        if (savedSettings.gemini_api_key) {
          await storage.setGeminiApiKey(savedSettings.gemini_api_key);
        }
        if (savedSettings.vercel_token) {
          await storage.setVercelConfig({
            token: savedSettings.vercel_token,
            teamId: savedSettings.vercel_team_id,
            username: user.login,
          });
        }
        if (savedSettings.search_console_client_email && savedSettings.search_console_private_key) {
          await storage.setSearchConsoleConfig({
            clientEmail: savedSettings.search_console_client_email,
            privateKey: savedSettings.search_console_private_key,
            siteUrl: savedSettings.search_console_site_url || "",
          });
        }
      } else {
        // Create initial settings record
        await saveUserSettings(accessToken, user.login, {});
      }
      
      // Redirect to dashboard
      res.redirect('/');
    } catch (error: any) {
      console.error('GitHub OAuth callback error:', error);
      res.redirect(`/login?error=${encodeURIComponent('Authentication failed')}`);
    }
  });

  // ============== GITHUB ROUTES ==============

  // Check GitHub connection status
  app.get("/api/github/status", requireAuth, async (req, res) => {
    try {
      const info = await getGitHubConnectionInfo();
      res.json({ success: true, data: info });
    } catch (error) {
      res.json({ success: false, error: "GitHub not connected" });
    }
  });

  // Get authenticated GitHub user
  app.get("/api/github/user", async (req, res) => {
    try {
      const user = await getAuthenticatedUser();
      res.json({ success: true, data: { 
        login: user.login, 
        name: user.name, 
        avatar_url: user.avatar_url 
      }});
    } catch (error) {
      res.json({ success: false, error: "Failed to get user info" });
    }
  });

  // Set manual GitHub token
  app.post("/api/github/token", async (req, res) => {
    try {
      const { token } = req.body;
      
      if (!token) {
        return res.json({ success: false, error: "Token is required" });
      }

      // Validate the token by trying to get user info
      const { Octokit } = await import("@octokit/rest");
      const octokit = new Octokit({ auth: token });
      
      try {
        const { data: user } = await octokit.users.getAuthenticated();
        
        // Token is valid, save it
        setManualGitHubToken(token);
        
        res.json({ 
          success: true, 
          data: { 
            login: user.login, 
            name: user.name,
            avatar_url: user.avatar_url 
          } 
        });
      } catch (authError: any) {
        res.json({ success: false, error: "Invalid GitHub token. Please check your Personal Access Token." });
      }
    } catch (error: any) {
      res.json({ success: false, error: error.message || "Failed to set GitHub token" });
    }
  });

  // Clear manual GitHub token
  app.post("/api/github/token/clear", async (req, res) => {
    try {
      clearManualToken();
      res.json({ success: true });
    } catch (error) {
      res.json({ success: false, error: "Failed to clear token" });
    }
  });

  // Get user's repositories (paginated)
  app.get("/api/github/repos", async (req, res) => {
    try {
      const octokit = await getGitHubClient();
      
      // Fetch all repos using pagination
      const repos = await octokit.paginate(octokit.repos.listForAuthenticatedUser, {
        sort: "updated",
        per_page: 100,
        affiliation: "owner,collaborator",
      });
      
      const repoList = repos.map(repo => ({
        id: repo.id.toString(),
        name: repo.name,
        fullName: repo.full_name,
        owner: repo.owner.login,
        description: repo.description || "",
        isPrivate: repo.private,
        defaultBranch: repo.default_branch || "main",
        updatedAt: repo.updated_at || null,
      }));
      
      res.json({ success: true, data: repoList });
    } catch (error: any) {
      console.error("Fetch repos error:", error);
      res.json({ success: false, error: "Failed to fetch repositories" });
    }
  });

  // Get connected repository
  app.get("/api/repository", async (req, res) => {
    try {
      const repo = await storage.getRepository();
      res.json({ success: true, data: repo });
    } catch (error) {
      res.json({ success: false, error: "Failed to get repository" });
    }
  });

  // Connect to a repository
  app.post("/api/repository/connect", async (req, res) => {
    try {
      const { url } = req.body;
      const parsed = parseRepoUrl(url);
      
      if (!parsed) {
        return res.json({ success: false, error: "Invalid repository URL format. Use owner/repo" });
      }

      const octokit = await getGitHubClient();
      
      // Verify repository access
      const { data: repoData } = await octokit.repos.get({
        owner: parsed.owner,
        repo: parsed.repo,
      });

      const repository: Repository = {
        id: repoData.id.toString(),
        owner: parsed.owner,
        name: parsed.repo,
        fullName: repoData.full_name,
        defaultBranch: repoData.default_branch,
        activeBranch: repoData.default_branch, // Start on template branch
        connected: true,
        lastSynced: new Date().toISOString(),
      };

      await storage.setRepository(repository);

      // Fetch branches and initial data
      await fetchBranches(parsed.owner, parsed.repo);
      await syncRepositoryData(parsed.owner, parsed.repo, repoData.default_branch);

      // Load repository-specific settings from Supabase
      const repoSettings = await getRepositorySettings(repoData.full_name);
      if (repoSettings) {
        // Load Gemini API key
        if (repoSettings.gemini_api_key) {
          await storage.setGeminiApiKey(repoSettings.gemini_api_key);
        }
        // Load Vercel config
        if (repoSettings.vercel_token) {
          await storage.setVercelConfig({
            token: repoSettings.vercel_token,
            teamId: repoSettings.vercel_team_id,
            username: req.session.githubUsername || "",
          });
          if (repoSettings.vercel_project_id) {
            await storage.setVercelProject({
              id: repoSettings.vercel_project_id,
              name: repoSettings.vercel_project_name || "",
              framework: "astro",
            });
          }
        }
        // Load Search Console config (full JSON)
        if (repoSettings.search_console_service_account) {
          try {
            const parsed = JSON.parse(repoSettings.search_console_service_account);
            await storage.setSearchConsoleConfig({
              serviceAccountJson: repoSettings.search_console_service_account,
              clientEmail: parsed.client_email,
              privateKey: parsed.private_key,
              siteUrl: repoSettings.search_console_site_url || "",
            });
          } catch (e) {
            console.warn("Failed to parse saved Search Console config");
          }
        }
        // Load AdSense config
        if (repoSettings.adsense_publisher_id) {
          await storage.setAdsenseConfig({
            enabled: true,
            publisherId: repoSettings.adsense_publisher_id,
            autoAdsEnabled: false,
            slots: repoSettings.adsense_slots || {},
          });
        }
      } else if (req.session.githubToken && req.session.githubUsername) {
        // Create initial repository settings record
        await saveRepositorySettings(
          repoData.full_name,
          req.session.githubToken,
          req.session.githubUsername,
          {}
        );
      }

      res.json({ success: true, data: repository });
    } catch (error: any) {
      console.error("Connect error:", error);
      res.json({ 
        success: false, 
        error: error.status === 404 
          ? "Repository not found or not accessible" 
          : "Failed to connect to repository" 
      });
    }
  });

  // Disconnect from repository
  app.post("/api/repository/disconnect", async (req, res) => {
    try {
      await storage.clearRepository();
      res.json({ success: true });
    } catch (error) {
      res.json({ success: false, error: "Failed to disconnect" });
    }
  });

  // Sync repository data
  app.post("/api/repository/sync", async (req, res) => {
    try {
      const repo = await storage.getRepository();
      if (!repo) {
        return res.json({ success: false, error: "No repository connected" });
      }

      await fetchBranches(repo.owner, repo.name);
      await syncRepositoryData(repo.owner, repo.name, repo.activeBranch);
      
      repo.lastSynced = new Date().toISOString();
      await storage.setRepository(repo);

      res.json({ success: true });
    } catch (error) {
      console.error("Sync error:", error);
      res.json({ success: false, error: "Failed to sync repository" });
    }
  });
  
  // Get all branches (sites)
  app.get("/api/branches", async (req, res) => {
    try {
      const branches = await storage.getBranches();
      res.json({ success: true, data: branches });
    } catch (error) {
      res.json({ success: false, error: "Failed to get branches" });
    }
  });
  
  // Create new branch (new site from template)
  app.post("/api/branches", async (req, res) => {
    try {
      const { domain } = req.body;
      
      if (!domain) {
        return res.json({ success: false, error: "Domain name is required" });
      }
      
      const repo = await storage.getRepository();
      if (!repo) {
        return res.json({ success: false, error: "No repository connected" });
      }
      
      // Sanitize domain to branch name (e.g., "my-blog.com" -> "site-my-blog-com")
      const branchName = `site-${domain.replace(/[^a-zA-Z0-9-]/g, "-").toLowerCase()}`;
      
      const octokit = await getGitHubClient();
      
      // Get the SHA of the template branch (main/defaultBranch)
      const { data: ref } = await octokit.git.getRef({
        owner: repo.owner,
        repo: repo.name,
        ref: `heads/${repo.defaultBranch}`,
      });
      
      // Create new branch from template
      await octokit.git.createRef({
        owner: repo.owner,
        repo: repo.name,
        ref: `refs/heads/${branchName}`,
        sha: ref.object.sha,
      });
      
      // Update branches list
      await fetchBranches(repo.owner, repo.name);
      
      // Switch to the new branch
      await storage.setActiveBranch(branchName);
      await syncRepositoryData(repo.owner, repo.name, branchName);
      
      res.json({ 
        success: true, 
        data: { 
          name: branchName, 
          domain,
          isTemplate: false 
        } 
      });
    } catch (error: any) {
      console.error("Create branch error:", error);
      if (error.status === 422) {
        res.json({ success: false, error: "Branch already exists" });
      } else {
        res.json({ success: false, error: error.message || "Failed to create branch" });
      }
    }
  });
  
  // Switch active branch
  app.post("/api/branches/switch", async (req, res) => {
    try {
      const { branch } = req.body;
      
      if (!branch) {
        return res.json({ success: false, error: "Branch name is required" });
      }
      
      const repo = await storage.getRepository();
      if (!repo) {
        return res.json({ success: false, error: "No repository connected" });
      }
      
      // Clear caches and switch branch
      await storage.setActiveBranch(branch);
      
      // Sync data from new branch
      await syncRepositoryData(repo.owner, repo.name, branch);
      
      res.json({ success: true, data: { activeBranch: branch } });
    } catch (error: any) {
      console.error("Switch branch error:", error);
      res.json({ success: false, error: error.message || "Failed to switch branch" });
    }
  });

  // Get all posts
  app.get("/api/posts", async (req, res) => {
    try {
      const posts = await storage.getPosts();
      res.json({ success: true, data: posts });
    } catch (error) {
      res.json({ success: false, error: "Failed to get posts" });
    }
  });

  // Get single post
  app.get("/api/posts/:slug", async (req, res) => {
    try {
      const post = await storage.getPost(req.params.slug);
      if (!post) {
        return res.json({ success: false, error: "Post not found" });
      }
      res.json({ success: true, data: post });
    } catch (error) {
      res.json({ success: false, error: "Failed to get post" });
    }
  });

  // Create new post
  app.post("/api/posts", async (req, res) => {
    try {
      const repo = await storage.getRepository();
      if (!repo) {
        return res.json({ success: false, error: "No repository connected" });
      }

      const { slug, title, description, pubDate, heroImage, author, category, tags, draft, content, commitMessage } = req.body;
      
      const path = `src/content/blog/${slug}.md`;
      const fileContent = generatePostContent({
        slug, title, description, pubDate, heroImage, author, category, tags, draft, content
      });

      const octokit = await getGitHubClient();

      // Create or update file
      await octokit.repos.createOrUpdateFileContents({
        owner: repo.owner,
        repo: repo.name,
        path,
        message: commitMessage || `Create post: ${title}`,
        content: Buffer.from(fileContent).toString("base64"),
        branch: repo.activeBranch,
      });

      // Build new raw frontmatter for the new post
      const newRawFrontmatter: Record<string, any> = { title, pubDate };
      if (description && description.trim()) newRawFrontmatter.description = description;
      if (heroImage && heroImage.trim()) newRawFrontmatter.heroImage = heroImage;
      if (author && author.trim()) newRawFrontmatter.author = author;
      if (category && category.trim()) newRawFrontmatter.category = category;
      if (tags && tags.length > 0) newRawFrontmatter.tags = tags;
      if (draft) newRawFrontmatter.draft = true;

      const newPost: Post = {
        path, slug, title, 
        description: description || "", 
        pubDate, 
        heroImage: heroImage || "", 
        author: author || undefined,
        category: category || "", 
        tags: tags || [], 
        draft: draft || false, 
        content,
        rawFrontmatter: newRawFrontmatter,
      };

      // Update cache
      const posts = await storage.getPosts();
      posts.push(newPost);
      await storage.setPosts(posts);

      res.json({ success: true, data: newPost });
    } catch (error: any) {
      console.error("Create post error:", error);
      res.json({ success: false, error: error.message || "Failed to create post" });
    }
  });

  // Update post
  app.put("/api/posts/:slug", async (req, res) => {
    try {
      const repo = await storage.getRepository();
      if (!repo) {
        return res.json({ success: false, error: "No repository connected" });
      }

      const existingPost = await storage.getPost(req.params.slug);
      if (!existingPost) {
        return res.json({ success: false, error: "Post not found" });
      }

      const { title, description, pubDate, heroImage, author, category, tags, draft, content, commitMessage } = req.body;
      
      // Pass original frontmatter to preserve structure (author as object, custom fields)
      const fileContent = generatePostContent({
        slug: req.params.slug, title, description, pubDate, heroImage, author, category, tags, draft, content
      }, existingPost.rawFrontmatter);

      const octokit = await getGitHubClient();

      // Get current file SHA
      const { data: currentFile } = await octokit.repos.getContent({
        owner: repo.owner,
        repo: repo.name,
        path: existingPost.path,
        ref: repo.activeBranch,
      });

      const sha = Array.isArray(currentFile) ? undefined : currentFile.sha;

      // Update file
      await octokit.repos.createOrUpdateFileContents({
        owner: repo.owner,
        repo: repo.name,
        path: existingPost.path,
        message: commitMessage || `Update post: ${title}`,
        content: Buffer.from(fileContent).toString("base64"),
        sha,
        branch: repo.activeBranch,
      });

      // Rebuild rawFrontmatter based on what was actually written
      // Parse the generated content to get the actual frontmatter
      const { data: newFrontmatter } = matter(fileContent);
      const updatedRawFrontmatter: Record<string, any> = {};
      for (const key of Object.keys(newFrontmatter)) {
        const val = newFrontmatter[key];
        if (key.startsWith('_') || typeof val === 'function') continue;
        updatedRawFrontmatter[key] = val;
      }

      const updatedPost: Post = {
        ...existingPost,
        title, 
        description: description || "", 
        pubDate,
        heroImage: heroImage || "", 
        author: newFrontmatter.author || existingPost.author,
        category: newFrontmatter.category || category || "",
        tags: newFrontmatter.tags || tags || [], 
        draft: draft || false, 
        content,
        rawFrontmatter: updatedRawFrontmatter,
      };

      // Update cache
      const posts = await storage.getPosts();
      const postIndex = posts.findIndex(p => p.slug === req.params.slug);
      if (postIndex >= 0) {
        posts[postIndex] = updatedPost;
        await storage.setPosts(posts);
      }

      res.json({ success: true, data: updatedPost });
    } catch (error: any) {
      console.error("Update post error:", error);
      res.json({ success: false, error: error.message || "Failed to update post" });
    }
  });

  // Delete post
  app.delete("/api/posts/:slug", async (req, res) => {
    try {
      const repo = await storage.getRepository();
      if (!repo) {
        return res.json({ success: false, error: "No repository connected" });
      }

      const existingPost = await storage.getPost(req.params.slug);
      if (!existingPost) {
        return res.json({ success: false, error: "Post not found" });
      }

      const octokit = await getGitHubClient();

      // Get current file SHA
      const { data: currentFile } = await octokit.repos.getContent({
        owner: repo.owner,
        repo: repo.name,
        path: existingPost.path,
        ref: repo.activeBranch,
      });

      const sha = Array.isArray(currentFile) ? undefined : currentFile.sha;

      // Delete file
      await octokit.repos.deleteFile({
        owner: repo.owner,
        repo: repo.name,
        path: existingPost.path,
        message: `Delete post: ${existingPost.title}`,
        sha: sha!,
        branch: repo.activeBranch,
      });

      // Update cache
      const posts = await storage.getPosts();
      await storage.setPosts(posts.filter(p => p.slug !== req.params.slug));

      res.json({ success: true });
    } catch (error: any) {
      console.error("Delete post error:", error);
      res.json({ success: false, error: error.message || "Failed to delete post" });
    }
  });

  // Get file tree
  app.get("/api/files", async (req, res) => {
    try {
      const files = await storage.getFileTree();
      res.json({ success: true, data: files });
    } catch (error) {
      res.json({ success: false, error: "Failed to get files" });
    }
  });

  // Get file content
  app.get("/api/files/content", async (req, res) => {
    try {
      const { path } = req.query;
      if (!path || typeof path !== "string") {
        return res.json({ success: false, error: "Path is required" });
      }

      const repo = await storage.getRepository();
      if (!repo) {
        return res.json({ success: false, error: "No repository connected" });
      }

      const octokit = await getGitHubClient();

      const { data } = await octokit.repos.getContent({
        owner: repo.owner,
        repo: repo.name,
        path,
        ref: repo.activeBranch,
      });

      if (Array.isArray(data) || !("content" in data)) {
        return res.json({ success: false, error: "Not a file" });
      }

      const content = Buffer.from(data.content, "base64").toString("utf-8");
      await storage.setFileContent(path, content);

      const pageContent: PageContent = {
        path,
        content,
        name: path.split("/").pop() || path,
      };

      res.json({ success: true, data: pageContent });
    } catch (error: any) {
      console.error("Get file content error:", error);
      res.json({ success: false, error: error.message || "Failed to get file content" });
    }
  });

  // Update file content
  app.put("/api/files/content", async (req, res) => {
    try {
      const { path, content, commitMessage } = req.body;
      
      if (!path || typeof content !== "string") {
        return res.json({ success: false, error: "Path and content are required" });
      }

      const repo = await storage.getRepository();
      if (!repo) {
        return res.json({ success: false, error: "No repository connected" });
      }

      const octokit = await getGitHubClient();

      // Get current file SHA
      const { data: currentFile } = await octokit.repos.getContent({
        owner: repo.owner,
        repo: repo.name,
        path,
        ref: repo.activeBranch,
      });

      const sha = Array.isArray(currentFile) ? undefined : currentFile.sha;

      // Update file
      await octokit.repos.createOrUpdateFileContents({
        owner: repo.owner,
        repo: repo.name,
        path,
        message: commitMessage || `Update ${path}`,
        content: Buffer.from(content).toString("base64"),
        sha,
        branch: repo.activeBranch,
      });

      await storage.setFileContent(path, content);

      res.json({ success: true });
    } catch (error: any) {
      console.error("Update file content error:", error);
      res.json({ success: false, error: error.message || "Failed to update file" });
    }
  });

  // Analyze CSS structure in repository (for debugging theme issues)
  app.get("/api/theme/analyze", async (req, res) => {
    try {
      const repo = await storage.getRepository();
      if (!repo) {
        return res.json({ success: false, error: "No repository connected" });
      }

      const octokit = await getGitHubClient();
      const results: any[] = [];
      
      const cssFiles = [
        "src/styles/global.css",
        "src/styles/base.css", 
        "src/css/global.css",
        "src/global.css",
        "src/styles/index.css",
        "tailwind.config.js",
        "tailwind.config.ts",
        "tailwind.config.mjs",
      ];

      for (const filePath of cssFiles) {
        try {
          const { data } = await octokit.repos.getContent({
            owner: repo.owner,
            repo: repo.name,
            path: filePath,
            ref: repo.activeBranch,
          });

          if (!Array.isArray(data) && "content" in data) {
            const content = Buffer.from(data.content, "base64").toString("utf-8");
            
            // Find all CSS custom properties
            const cssVarMatches = content.match(/--[\w-]+:\s*[^;]+;/g) || [];
            
            // Find color-related patterns
            const colorPatterns = content.match(/(--[\w-]*(?:color|primary|secondary|accent|background|foreground|text|success|warning|error|muted|border|card)[\w-]*):\s*([^;]+);/gi) || [];
            
            results.push({
              file: filePath,
              found: true,
              size: content.length,
              hasHslFormat: /--\w+:\s*\d+\s+\d+%\s+\d+%/.test(content),
              hasHexColors: /#[0-9A-Fa-f]{3,8}/.test(content),
              cssVariables: cssVarMatches.slice(0, 20), // First 20 vars
              colorVariables: colorPatterns.slice(0, 20),
              preview: content.substring(0, 500),
            });
          }
        } catch {
          results.push({ file: filePath, found: false });
        }
      }

      res.json({ success: true, data: results });
    } catch (error: any) {
      res.json({ success: false, error: error.message });
    }
  });

  // Get theme settings - reads from repository's theme.json file
  app.get("/api/theme", async (req, res) => {
    try {
      const repo = await storage.getRepository();
      
      // Default theme
      const defaultTheme = {
        primary: "#FF5D01",
        secondary: "#0C0C0C",
        background: "#FAFAFA",
        text: "#1E293B",
        accent: "#8B5CF6",
        success: "#10B981",
      };

      if (!repo) {
        return res.json({ success: true, data: defaultTheme });
      }

      // Try to read from repository's theme.json file
      try {
        const octokit = await getGitHubClient();
        const { data } = await octokit.repos.getContent({
          owner: repo.owner,
          repo: repo.name,
          path: "src/config/theme.json",
          ref: repo.activeBranch,
        });

        if (!Array.isArray(data) && "content" in data) {
          const content = Buffer.from(data.content, "base64").toString("utf-8");
          const theme = JSON.parse(content);
          // Merge with defaults to ensure all keys exist
          res.json({ success: true, data: { ...defaultTheme, ...theme } });
          return;
        }
      } catch (err) {
        // File doesn't exist in repo, try reading from CSS variables
        console.log("theme.json not found, trying to read from CSS...");
      }

      // Try to read colors from global.css or styles/global.css
      try {
        const octokit = await getGitHubClient();
        
        // Try different possible CSS file locations
        const cssFiles = [
          "src/styles/global.css",
          "src/styles/base.css",
          "src/css/global.css",
          "src/global.css",
        ];

        for (const cssPath of cssFiles) {
          try {
            const { data } = await octokit.repos.getContent({
              owner: repo.owner,
              repo: repo.name,
              path: cssPath,
              ref: repo.activeBranch,
            });

            if (!Array.isArray(data) && "content" in data) {
              const cssContent = Buffer.from(data.content, "base64").toString("utf-8");
              
              // Parse CSS custom properties for colors
              const extractedTheme = { ...defaultTheme };
              
              // Match --color-primary, --primary, --accent-color etc.
              const colorPatterns = [
                { pattern: /--(?:color-)?primary\s*:\s*([^;]+)/i, key: "primary" },
                { pattern: /--(?:color-)?secondary\s*:\s*([^;]+)/i, key: "secondary" },
                { pattern: /--(?:color-)?background\s*:\s*([^;]+)/i, key: "background" },
                { pattern: /--(?:color-)?text\s*:\s*([^;]+)/i, key: "text" },
                { pattern: /--(?:color-)?accent\s*:\s*([^;]+)/i, key: "accent" },
                { pattern: /--(?:color-)?success\s*:\s*([^;]+)/i, key: "success" },
              ];

              for (const { pattern, key } of colorPatterns) {
                const match = cssContent.match(pattern);
                if (match && match[1]) {
                  const value = match[1].trim();
                  // Only use if it looks like a valid color (hex, rgb, etc.)
                  if (value.startsWith("#") || value.startsWith("rgb") || value.startsWith("hsl")) {
                    (extractedTheme as any)[key] = value;
                  }
                }
              }

              res.json({ success: true, data: extractedTheme, source: cssPath });
              return;
            }
          } catch {
            // Try next file
          }
        }
      } catch (err) {
        console.log("Could not read CSS files:", err);
      }

      // Fall back to storage
      let theme = await storage.getTheme();
      res.json({ success: true, data: theme || defaultTheme });
    } catch (error) {
      console.error("Get theme error:", error);
      res.json({ success: false, error: "Failed to get theme" });
    }
  });

  // Helper: Convert hex color to HSL values (H S% L% format for Tailwind)
  function hexToHsl(hex: string): string {
    // Remove # if present
    hex = hex.replace(/^#/, "");
    
    // Parse hex values
    let r = parseInt(hex.substring(0, 2), 16) / 255;
    let g = parseInt(hex.substring(2, 4), 16) / 255;
    let b = parseInt(hex.substring(4, 6), 16) / 255;

    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    let h = 0, s = 0, l = (max + min) / 2;

    if (max !== min) {
      const d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      switch (max) {
        case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
        case g: h = ((b - r) / d + 2) / 6; break;
        case b: h = ((r - g) / d + 4) / 6; break;
      }
    }

    // Return in Tailwind-compatible format: "H S% L%" (no hsl() wrapper)
    return `${Math.round(h * 360)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
  }

  // Update theme settings
  app.put("/api/theme", async (req, res) => {
    try {
      const { theme, commitMessage } = req.body;
      
      const repo = await storage.getRepository();
      if (!repo) {
        return res.json({ success: false, error: "No repository connected" });
      }

      const octokit = await getGitHubClient();

      // Try to find and update the CSS file with color variables
      const cssFiles = [
        "src/styles/global.css",
        "src/styles/base.css",
        "src/css/global.css",
        "src/global.css",
      ];

      let cssUpdated = false;
      let cssPath = "";
      let updatedVars: string[] = [];
      
      for (const filePath of cssFiles) {
        try {
          const { data } = await octokit.repos.getContent({
            owner: repo.owner,
            repo: repo.name,
            path: filePath,
            ref: repo.activeBranch,
          });

          if (!Array.isArray(data) && "content" in data) {
            let cssContent = Buffer.from(data.content, "base64").toString("utf-8");
            const originalContent = cssContent;
            
            // Detect if the CSS uses HSL format (Tailwind style: "H S% L%")
            const usesHslFormat = /--\w+:\s*\d+\s+\d+%\s+\d+%/.test(cssContent);
            
            // Update CSS custom properties
            const colorMappings = [
              { cssVar: "--primary", themeKey: "primary" },
              { cssVar: "--secondary", themeKey: "secondary" },
              { cssVar: "--background", themeKey: "background" },
              { cssVar: "--foreground", themeKey: "text" },
              { cssVar: "--accent", themeKey: "accent" },
              { cssVar: "--success", themeKey: "success" },
              // Also try with color- prefix
              { cssVar: "--color-primary", themeKey: "primary" },
              { cssVar: "--color-secondary", themeKey: "secondary" },
              { cssVar: "--color-background", themeKey: "background" },
              { cssVar: "--color-text", themeKey: "text" },
              { cssVar: "--color-accent", themeKey: "accent" },
            ];

            for (const { cssVar, themeKey } of colorMappings) {
              const hexValue = (theme as any)[themeKey];
              if (hexValue && hexValue.startsWith("#")) {
                // Convert to appropriate format
                const newValue = usesHslFormat ? hexToHsl(hexValue) : hexValue;
                
                // Match patterns like: --primary: 24 95% 54%; or --primary: #FF5D01;
                const regex = new RegExp(`(${cssVar.replace(/-/g, "\\-")}\\s*:\\s*)([^;]+)(;)`, "g");
                const before = cssContent;
                cssContent = cssContent.replace(regex, `$1${newValue}$3`);
                if (cssContent !== before) {
                  updatedVars.push(cssVar);
                }
              }
            }

            // Only update if content changed
            if (cssContent !== originalContent) {
              await octokit.repos.createOrUpdateFileContents({
                owner: repo.owner,
                repo: repo.name,
                path: filePath,
                message: commitMessage || "Update theme colors",
                content: Buffer.from(cssContent).toString("base64"),
                sha: data.sha,
                branch: repo.activeBranch,
              });
              cssUpdated = true;
              cssPath = filePath;
              console.log(`Updated CSS variables in ${filePath}:`, updatedVars);
              break;
            }
          }
        } catch (err) {
          // Try next file
          console.log(`CSS file not found: ${filePath}`);
        }
      }

      // Also save theme.json for reference
      const themeContent = JSON.stringify(theme, null, 2);
      const jsonPath = "src/config/theme.json";
      
      let jsonSha: string | undefined;
      try {
        const { data: currentFile } = await octokit.repos.getContent({
          owner: repo.owner,
          repo: repo.name,
          path: jsonPath,
          ref: repo.activeBranch,
        });
        jsonSha = Array.isArray(currentFile) ? undefined : currentFile.sha;
      } catch {
        // File doesn't exist yet
      }

      await octokit.repos.createOrUpdateFileContents({
        owner: repo.owner,
        repo: repo.name,
        path: jsonPath,
        message: cssUpdated ? "Update theme.json" : (commitMessage || "Update theme configuration"),
        content: Buffer.from(themeContent).toString("base64"),
        sha: jsonSha,
        branch: repo.activeBranch,
      });

      await storage.setTheme(theme);

      res.json({ 
        success: true, 
        data: theme,
        cssUpdated,
        cssPath: cssPath || null,
        updatedVars,
        message: cssUpdated 
          ? `Updated ${updatedVars.length} CSS variables in ${cssPath}` 
          : "Theme saved to theme.json (CSS file not found or no matching variables)"
      });
    } catch (error: any) {
      console.error("Update theme error:", error);
      res.json({ success: false, error: error.message || "Failed to update theme" });
    }
  });

  // Get site config (branding)
  app.get("/api/site-config", async (req, res) => {
    try {
      const config = await storage.getSiteConfig();
      res.json({ success: true, data: config || defaultSiteConfig });
    } catch (error) {
      res.json({ success: false, error: "Failed to get site config" });
    }
  });

  // Update site config
  app.put("/api/site-config", async (req, res) => {
    try {
      const repo = await storage.getRepository();
      if (!repo) {
        return res.json({ success: false, error: "No repository connected" });
      }

      const parseResult = siteConfigSchema.safeParse(req.body);
      if (!parseResult.success) {
        return res.json({ success: false, error: parseResult.error.message });
      }
      const config = parseResult.data;
      const configContent = JSON.stringify(config, null, 2);
      const path = "src/config/site.json";

      const octokit = await getGitHubClient();

      let sha: string | undefined;
      try {
        const { data: currentFile } = await octokit.repos.getContent({
          owner: repo.owner,
          repo: repo.name,
          path,
          ref: repo.activeBranch,
        });
        sha = Array.isArray(currentFile) ? undefined : currentFile.sha;
      } catch {
        // File doesn't exist yet
      }

      await octokit.repos.createOrUpdateFileContents({
        owner: repo.owner,
        repo: repo.name,
        path,
        message: req.body.commitMessage || "Update site configuration",
        content: Buffer.from(configContent).toString("base64"),
        sha,
        branch: repo.activeBranch,
      });

      await storage.setSiteConfig(config);
      res.json({ success: true, data: config });
    } catch (error: any) {
      console.error("Update site config error:", error);
      res.json({ success: false, error: error.message || "Failed to update site config" });
    }
  });

  // Get branding from Header.astro and Footer.astro
  app.get("/api/branding", async (req, res) => {
    try {
      const repo = await storage.getRepository();
      if (!repo) {
        return res.json({ success: true, data: null });
      }

      const octokit = await getGitHubClient();
      
      let headerContent = "";
      let footerContent = "";
      
      try {
        const { data: headerFile } = await octokit.repos.getContent({
          owner: repo.owner,
          repo: repo.name,
          path: "src/components/Header.astro",
          ref: repo.activeBranch,
        });
        if (!Array.isArray(headerFile) && headerFile.content) {
          headerContent = Buffer.from(headerFile.content, "base64").toString("utf-8");
        }
      } catch {}
      
      try {
        const { data: footerFile } = await octokit.repos.getContent({
          owner: repo.owner,
          repo: repo.name,
          path: "src/components/Footer.astro",
          ref: repo.activeBranch,
        });
        if (!Array.isArray(footerFile) && footerFile.content) {
          footerContent = Buffer.from(footerFile.content, "base64").toString("utf-8");
        }
      } catch {}

      // Parse site name from Header
      const siteNameMatch = headerContent.match(/<span[^>]*>([^<]+)<\/span>\s*<\/a>\s*(?:<!--\s*Desktop|<\/div>|$)/);
      const siteName = siteNameMatch ? siteNameMatch[1].trim() : "";
      
      // Parse logo letter from Header  
      const logoLetterMatch = headerContent.match(/<span class="text-white font-bold[^"]*">([^<]+)<\/span>/);
      const logoLetter = logoLetterMatch ? logoLetterMatch[1].trim() : "";

      // Parse description from Footer
      const descMatch = footerContent.match(/<p class="text-sm text-gray-400[^"]*">\s*([^<]+)/);
      const description = descMatch ? descMatch[1].trim() : "";

      // Parse social links from Footer
      const twitterMatch = footerContent.match(/\{\s*href:\s*['"]([^'"]+)['"],\s*label:\s*['"]Twitter['"]/);
      const linkedinMatch = footerContent.match(/\{\s*href:\s*['"]([^'"]+)['"],\s*label:\s*['"]LinkedIn['"]/);
      const facebookMatch = footerContent.match(/\{\s*href:\s*['"]([^'"]+)['"],\s*label:\s*['"]Facebook['"]/);

      res.json({
        success: true,
        data: {
          siteName,
          logoLetter,
          description,
          socialLinks: {
            twitter: twitterMatch ? twitterMatch[1] : "",
            linkedin: linkedinMatch ? linkedinMatch[1] : "",
            facebook: facebookMatch ? facebookMatch[1] : "",
          },
          headerContent,
          footerContent,
        }
      });
    } catch (error: any) {
      console.error("Get branding error:", error);
      res.json({ success: false, error: error.message || "Failed to get branding" });
    }
  });

  // Update branding in Header.astro and Footer.astro
  app.put("/api/branding", async (req, res) => {
    try {
      const repo = await storage.getRepository();
      if (!repo) {
        return res.json({ success: false, error: "No repository connected" });
      }

      const { siteName, logoLetter, description, socialLinks } = req.body;
      const octokit = await getGitHubClient();

      // Get current Header.astro
      let headerContent = "";
      let headerSha: string | undefined;
      try {
        const { data: headerFile } = await octokit.repos.getContent({
          owner: repo.owner,
          repo: repo.name,
          path: "src/components/Header.astro",
          ref: repo.activeBranch,
        });
        if (!Array.isArray(headerFile) && headerFile.content) {
          headerContent = Buffer.from(headerFile.content, "base64").toString("utf-8");
          headerSha = headerFile.sha;
        }
      } catch {}

      // Get current Footer.astro
      let footerContent = "";
      let footerSha: string | undefined;
      try {
        const { data: footerFile } = await octokit.repos.getContent({
          owner: repo.owner,
          repo: repo.name,
          path: "src/components/Footer.astro",
          ref: repo.activeBranch,
        });
        if (!Array.isArray(footerFile) && footerFile.content) {
          footerContent = Buffer.from(footerFile.content, "base64").toString("utf-8");
          footerSha = footerFile.sha;
        }
      } catch {}

      // Update Header.astro
      if (headerContent && siteName) {
        // Update site name in header
        headerContent = headerContent.replace(
          /(<span class="text-xl font-bold[^"]*">)[^<]+(<\/span>)/g,
          `$1${siteName}$2`
        );
        // Update logo letter
        if (logoLetter) {
          headerContent = headerContent.replace(
            /(<span class="text-white font-bold[^"]*">)[^<]+(<\/span>)/g,
            `$1${logoLetter}$2`
          );
        }

        await octokit.repos.createOrUpdateFileContents({
          owner: repo.owner,
          repo: repo.name,
          path: "src/components/Header.astro",
          message: "Update Header branding",
          content: Buffer.from(headerContent).toString("base64"),
          sha: headerSha,
          branch: repo.activeBranch,
        });
      }

      // Update Footer.astro
      if (footerContent) {
        // Update site name in footer
        if (siteName) {
          footerContent = footerContent.replace(
            /(<span class="text-xl font-bold text-white">)[^<]+(<\/span>)/g,
            `$1${siteName}$2`
          );
          // Update copyright
          footerContent = footerContent.replace(
            /(&copy; \{currentYear\} )[^.]+(\. All rights reserved\.)/g,
            `$1${siteName}$2`
          );
        }
        // Update description
        if (description !== undefined) {
          footerContent = footerContent.replace(
            /(<p class="text-sm text-gray-400 mb-4">)\s*[^<]+(<\/p>)/,
            `$1\n          ${description}\n        $2`
          );
        }
        // Update social links
        if (socialLinks) {
          if (socialLinks.twitter) {
            footerContent = footerContent.replace(
              /(\{\s*href:\s*['"])[^'"]+(['"],\s*label:\s*['"]Twitter['"])/,
              `$1${socialLinks.twitter}$2`
            );
          }
          if (socialLinks.linkedin) {
            footerContent = footerContent.replace(
              /(\{\s*href:\s*['"])[^'"]+(['"],\s*label:\s*['"]LinkedIn['"])/,
              `$1${socialLinks.linkedin}$2`
            );
          }
          if (socialLinks.facebook) {
            footerContent = footerContent.replace(
              /(\{\s*href:\s*['"])[^'"]+(['"],\s*label:\s*['"]Facebook['"])/,
              `$1${socialLinks.facebook}$2`
            );
          }
        }

        await octokit.repos.createOrUpdateFileContents({
          owner: repo.owner,
          repo: repo.name,
          path: "src/components/Footer.astro",
          message: "Update Footer branding",
          content: Buffer.from(footerContent).toString("base64"),
          sha: footerSha,
          branch: repo.activeBranch,
        });
      }

      res.json({ success: true });
    } catch (error: any) {
      console.error("Update branding error:", error);
      res.json({ success: false, error: error.message || "Failed to update branding" });
    }
  });

  // ============== SITE SETTINGS (New Template) ==============
  // For template-egpress-v1 which uses src/config/siteSettings.ts

  // Helper to extract the value from any AST node
  function extractNodeValue(node: any): any {
    if (!node) return undefined;
    
    if (node.isKind(SyntaxKind.StringLiteral)) {
      return node.getLiteralText();
    }
    if (node.isKind(SyntaxKind.NumericLiteral)) {
      return node.getLiteralValue();
    }
    if (node.isKind(SyntaxKind.TrueKeyword)) {
      return true;
    }
    if (node.isKind(SyntaxKind.FalseKeyword)) {
      return false;
    }
    if (node.isKind(SyntaxKind.ObjectLiteralExpression)) {
      const result: Record<string, any> = {};
      const properties = node.getProperties();
      for (const prop of properties) {
        if (prop.isKind(SyntaxKind.PropertyAssignment)) {
          const name = prop.getName();
          const value = extractNodeValue(prop.getInitializer());
          if (value !== undefined) {
            result[name] = value;
          }
        }
      }
      return result;
    }
    if (node.isKind(SyntaxKind.ArrayLiteralExpression)) {
      const elements = node.getElements();
      return elements.map((el: any) => extractNodeValue(el));
    }
    
    return undefined;
  }

  // Helper to unwrap type assertions for parsing (satisfies, as, parenthesized)
  function unwrapForParsing(node: any): any {
    if (!node) return null;
    
    if (node.isKind && node.isKind(SyntaxKind.SatisfiesExpression)) {
      return unwrapForParsing(node.getExpression());
    }
    if (node.isKind && node.isKind(SyntaxKind.AsExpression)) {
      return unwrapForParsing(node.getExpression());
    }
    if (node.isKind && node.isKind(SyntaxKind.ParenthesizedExpression)) {
      return unwrapForParsing(node.getExpression());
    }
    
    return node;
  }

  // Helper to find a variable declaration by name in the source file
  function findVariableDeclaration(sourceFile: any, varName: string): any {
    const variableStatements = sourceFile.getStatements().filter(
      (s: any) => s.isKind(SyntaxKind.VariableStatement)
    );
    
    for (const stmt of variableStatements) {
      const declarations = stmt.getDeclarationList()?.getDeclarations() || [];
      for (const decl of declarations) {
        if (decl.getName() === varName) {
          return decl;
        }
      }
    }
    return null;
  }

  // Get root config object for parsing (handles factory-wrapped exports with satisfies)
  // Also handles named exports like: export const siteConfig = {...}
  // And handles: export default siteConfig (reference to a variable)
  function getRootConfigForParsing(sourceFile: any): ObjectLiteralExpression | null {
    // First try: export default {...} or export default factory(...) or export default variableName
    const exportDefault = sourceFile.getStatements().find(
      (s: any) => s.isKind(SyntaxKind.ExportAssignment)
    );
    
    if (exportDefault) {
      let exportExpr = unwrapForParsing(exportDefault.getExpression());
      
      // Handle plain object export: export default { ... }
      if (exportExpr?.isKind(SyntaxKind.ObjectLiteralExpression)) {
        return exportExpr as ObjectLiteralExpression;
      }
      
      // Handle export default variableName (reference to a variable)
      if (exportExpr?.isKind(SyntaxKind.Identifier)) {
        const varName = exportExpr.getText();
        const varDecl = findVariableDeclaration(sourceFile, varName);
        if (varDecl) {
          let initializer = varDecl.getInitializer();
          initializer = unwrapForParsing(initializer);
          if (initializer?.isKind(SyntaxKind.ObjectLiteralExpression)) {
            return initializer as ObjectLiteralExpression;
          }
        }
      }
      
      // Handle factory-wrapped export: export default defineSiteConfig(...)
      if (exportExpr?.isKind(SyntaxKind.CallExpression)) {
        const args = exportExpr.getArguments();
        for (const arg of args) {
          const unwrappedArg = unwrapForParsing(arg);
          
          // Direct object argument: factory({ ... })
          if (unwrappedArg?.isKind(SyntaxKind.ObjectLiteralExpression)) {
            return unwrappedArg as ObjectLiteralExpression;
          }
          
          // Arrow function argument: factory(() => ({ ... })) or factory(() => ({ ... }) satisfies Type)
          if (unwrappedArg?.isKind(SyntaxKind.ArrowFunction)) {
            let body = unwrappedArg.getBody();
            body = unwrapForParsing(body);
            
            if (body?.isKind(SyntaxKind.ObjectLiteralExpression)) {
              return body as ObjectLiteralExpression;
            }
            
            // Block body with return statement
            if (body?.isKind(SyntaxKind.Block)) {
              const returnStmt = body.getStatements().find(
                (s: any) => s.isKind(SyntaxKind.ReturnStatement)
              );
              if (returnStmt) {
                const returnExpr = unwrapForParsing(returnStmt.getExpression());
                if (returnExpr?.isKind(SyntaxKind.ObjectLiteralExpression)) {
                  return returnExpr as ObjectLiteralExpression;
                }
              }
            }
          }
        }
      }
    }
    
    // Second try: Named exports like "export const siteConfig = {...}" or "export const settings = {...}"
    // Common config variable names used in Astro templates
    const configNames = ['siteConfig', 'config', 'settings', 'siteSettings'];
    
    const variableStatements = sourceFile.getStatements().filter(
      (s: any) => s.isKind(SyntaxKind.VariableStatement)
    );
    
    for (const stmt of variableStatements) {
      // Check if it's exported
      const hasExportKeyword = stmt.getModifiers()?.some(
        (m: any) => m.isKind(SyntaxKind.ExportKeyword)
      );
      
      if (!hasExportKeyword) continue;
      
      const declarations = stmt.getDeclarationList()?.getDeclarations() || [];
      for (const decl of declarations) {
        const name = decl.getName();
        
        // Check if this is a known config variable name
        if (configNames.includes(name)) {
          let initializer = decl.getInitializer();
          initializer = unwrapForParsing(initializer);
          
          if (initializer?.isKind(SyntaxKind.ObjectLiteralExpression)) {
            return initializer as ObjectLiteralExpression;
          }
        }
      }
    }
    
    // Third try: Find any exported variable that is an object literal with designTokens or siteSettings properties
    for (const stmt of variableStatements) {
      const hasExportKeyword = stmt.getModifiers()?.some(
        (m: any) => m.isKind(SyntaxKind.ExportKeyword)
      );
      
      if (!hasExportKeyword) continue;
      
      const declarations = stmt.getDeclarationList()?.getDeclarations() || [];
      for (const decl of declarations) {
        let initializer = decl.getInitializer();
        initializer = unwrapForParsing(initializer);
        
        if (initializer?.isKind(SyntaxKind.ObjectLiteralExpression)) {
          const objLiteral = initializer as ObjectLiteralExpression;
          // Check if it has designTokens or siteSettings property
          const hasConfig = objLiteral.getProperties().some(
            (p: any) => p.isKind(SyntaxKind.PropertyAssignment) && 
              ['designTokens', 'siteSettings'].includes(p.getName())
          );
          if (hasConfig) {
            return objLiteral;
          }
        }
      }
    }
    
    return null;
  }

  // AST-based parsing of siteSettings.ts using ts-morph
  function parseSiteSettingsTS(content: string): any {
    try {
      const project = new Project({ useInMemoryFileSystem: true });
      const sourceFile = project.createSourceFile('temp.ts', content);
      
      const rootObj = getRootConfigForParsing(sourceFile);
      if (!rootObj) {
        console.error("Could not find root config object in siteSettings.ts");
        return null;
      }
      
      // Extract designTokens.colors
      const designTokensProp = findProperty(rootObj, 'designTokens');
      let colors: Record<string, any> = { text: {} };
      
      if (designTokensProp) {
        const designTokensObj = designTokensProp.getInitializer();
        if (designTokensObj?.isKind(SyntaxKind.ObjectLiteralExpression)) {
          const colorsProp = findProperty(designTokensObj as ObjectLiteralExpression, 'colors');
          if (colorsProp) {
            const colorsValue = extractNodeValue(colorsProp.getInitializer());
            if (colorsValue && typeof colorsValue === 'object') {
              colors = colorsValue;
            }
          }
        }
      }
      
      // Extract siteSettings
      const siteSettingsProp = findProperty(rootObj, 'siteSettings');
      let siteSettings: Record<string, any> = {
        logo: {},
        seo: {},
        social: {},
        contact: {},
        features: {}
      };
      
      if (siteSettingsProp) {
        const siteSettingsValue = extractNodeValue(siteSettingsProp.getInitializer());
        if (siteSettingsValue && typeof siteSettingsValue === 'object') {
          siteSettings = { ...siteSettings, ...siteSettingsValue };
        }
      }
      
      return {
        designTokens: {
          colors
        },
        siteSettings
      };
    } catch (error) {
      console.error("Error parsing siteSettings.ts:", error);
      return null;
    }
  }

  // AST-based TypeScript config updater using ts-morph
  // This provides safe, targeted updates without corrupting unrelated values
  
  // Helper to find a property in an object literal by name
  function findProperty(obj: ObjectLiteralExpression, name: string): PropertyAssignment | undefined {
    return obj.getProperties().find(
      p => p.isKind(SyntaxKind.PropertyAssignment) && p.getName() === name
    ) as PropertyAssignment | undefined;
  }
  
  // Helper to update a string value in a property, preserving original quote style
  function updateStringProperty(prop: PropertyAssignment, newValue: string): void {
    const initializer = prop.getInitializer();
    if (initializer?.isKind(SyntaxKind.StringLiteral)) {
      const originalText = initializer.getText();
      const quoteChar = originalText.startsWith('"') ? '"' : "'";
      const escapeChar = quoteChar === '"' ? '\\"' : "\\'";
      const escapedValue = newValue.replace(new RegExp(quoteChar, 'g'), escapeChar);
      initializer.replaceWithText(`${quoteChar}${escapedValue}${quoteChar}`);
    }
  }
  
  // Helper to update a boolean value in a property
  function updateBooleanProperty(prop: PropertyAssignment, newValue: boolean): void {
    const initializer = prop.getInitializer();
    if (initializer?.isKind(SyntaxKind.TrueKeyword) || initializer?.isKind(SyntaxKind.FalseKeyword)) {
      initializer.replaceWithText(String(newValue));
    }
  }
  
  // Helper to recursively update properties in an object, handling nested objects
  function updateNestedProperties(obj: ObjectLiteralExpression, updates: Record<string, any>): void {
    for (const [key, value] of Object.entries(updates)) {
      const prop = findProperty(obj, key);
      if (!prop) continue;
      
      if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
        // Handle nested object recursively
        const nestedObj = prop.getInitializer();
        if (nestedObj?.isKind(SyntaxKind.ObjectLiteralExpression)) {
          updateNestedProperties(nestedObj as ObjectLiteralExpression, value);
        }
      } else if (typeof value === 'string') {
        updateStringProperty(prop, value);
      } else if (typeof value === 'boolean') {
        updateBooleanProperty(prop, value);
      }
    }
  }
  
  // Helper to unwrap type assertions (satisfies, as) to get the underlying expression
  function unwrapTypeAssertions(node: any): any {
    if (!node) return null;
    
    // Handle: expr satisfies Type
    if (node.isKind && node.isKind(SyntaxKind.SatisfiesExpression)) {
      return unwrapTypeAssertions(node.getExpression());
    }
    
    // Handle: expr as Type
    if (node.isKind && node.isKind(SyntaxKind.AsExpression)) {
      return unwrapTypeAssertions(node.getExpression());
    }
    
    // Handle: (expr) parenthesized
    if (node.isKind && node.isKind(SyntaxKind.ParenthesizedExpression)) {
      return unwrapTypeAssertions(node.getExpression());
    }
    
    return node;
  }
  
  // Helper to extract the root config object from various export patterns
  // Handles: export default { ... }, export default factory(() => ({ ... })), 
  // export default factory(() => ({ ... }) satisfies Type), etc.
  // Helper to find a variable declaration by name (for update functions)
  function findVarDeclaration(sourceFile: any, varName: string): any {
    const variableStatements = sourceFile.getStatements().filter(
      (s: any) => s.isKind(SyntaxKind.VariableStatement)
    );
    
    for (const stmt of variableStatements) {
      const declarations = stmt.getDeclarationList()?.getDeclarations() || [];
      for (const decl of declarations) {
        if (decl.getName() === varName) {
          return decl;
        }
      }
    }
    return null;
  }

  function getRootConfigObject(sourceFile: any): ObjectLiteralExpression | null {
    // First try: export default {...} or export default factory(...) or export default variableName
    const exportDefault = sourceFile.getStatements().find(
      (s: any) => s.isKind(SyntaxKind.ExportAssignment)
    );
    
    if (exportDefault) {
      let exportExpr = unwrapTypeAssertions(exportDefault.getExpression());
      
      // Handle plain object export: export default { ... }
      if (exportExpr?.isKind(SyntaxKind.ObjectLiteralExpression)) {
        return exportExpr as ObjectLiteralExpression;
      }
      
      // Handle export default variableName (reference to a variable)
      if (exportExpr?.isKind(SyntaxKind.Identifier)) {
        const varName = exportExpr.getText();
        const varDecl = findVarDeclaration(sourceFile, varName);
        if (varDecl) {
          let initializer = varDecl.getInitializer();
          initializer = unwrapTypeAssertions(initializer);
          if (initializer?.isKind(SyntaxKind.ObjectLiteralExpression)) {
            return initializer as ObjectLiteralExpression;
          }
        }
      }
      
      // Handle factory-wrapped export: export default defineSiteConfig(() => ({ ... }))
      // or: export default factory({ ... })
      if (exportExpr?.isKind(SyntaxKind.CallExpression)) {
        const args = exportExpr.getArguments();
        for (const arg of args) {
          const unwrappedArg = unwrapTypeAssertions(arg);
          
          // Direct object argument: factory({ ... })
          if (unwrappedArg?.isKind(SyntaxKind.ObjectLiteralExpression)) {
            return unwrappedArg as ObjectLiteralExpression;
          }
          
          // Arrow function argument: factory(() => ({ ... }))
          // or: factory(() => ({ ... }) satisfies Type)
          if (unwrappedArg?.isKind(SyntaxKind.ArrowFunction)) {
            // Get the arrow function body and unwrap any type assertions
            let body = unwrappedArg.getBody();
            body = unwrapTypeAssertions(body);
            
            if (body?.isKind(SyntaxKind.ObjectLiteralExpression)) {
              return body as ObjectLiteralExpression;
            }
            
            // Also check if body is a block with a return statement
            if (body?.isKind(SyntaxKind.Block)) {
              const returnStmt = body.getStatements().find(
                (s: any) => s.isKind(SyntaxKind.ReturnStatement)
              );
              if (returnStmt) {
                const returnExpr = unwrapTypeAssertions(returnStmt.getExpression());
                if (returnExpr?.isKind(SyntaxKind.ObjectLiteralExpression)) {
                  return returnExpr as ObjectLiteralExpression;
                }
              }
            }
          }
        }
      }
    }
    
    // Second try: Named exports like "export const siteConfig = {...}"
    const configNames = ['siteConfig', 'config', 'settings', 'siteSettings'];
    
    const variableStatements = sourceFile.getStatements().filter(
      (s: any) => s.isKind(SyntaxKind.VariableStatement)
    );
    
    for (const stmt of variableStatements) {
      const hasExportKeyword = stmt.getModifiers()?.some(
        (m: any) => m.isKind(SyntaxKind.ExportKeyword)
      );
      
      if (!hasExportKeyword) continue;
      
      const declarations = stmt.getDeclarationList()?.getDeclarations() || [];
      for (const decl of declarations) {
        const name = decl.getName();
        
        if (configNames.includes(name)) {
          let initializer = decl.getInitializer();
          initializer = unwrapTypeAssertions(initializer);
          
          if (initializer?.isKind(SyntaxKind.ObjectLiteralExpression)) {
            return initializer as ObjectLiteralExpression;
          }
        }
      }
    }
    
    // Third try: Find any exported variable with designTokens or siteSettings properties
    for (const stmt of variableStatements) {
      const hasExportKeyword = stmt.getModifiers()?.some(
        (m: any) => m.isKind(SyntaxKind.ExportKeyword)
      );
      
      if (!hasExportKeyword) continue;
      
      const declarations = stmt.getDeclarationList()?.getDeclarations() || [];
      for (const decl of declarations) {
        let initializer = decl.getInitializer();
        initializer = unwrapTypeAssertions(initializer);
        
        if (initializer?.isKind(SyntaxKind.ObjectLiteralExpression)) {
          const objLiteral = initializer as ObjectLiteralExpression;
          const hasConfig = objLiteral.getProperties().some(
            (p: any) => p.isKind(SyntaxKind.PropertyAssignment) && 
              ['designTokens', 'siteSettings'].includes(p.getName())
          );
          if (hasConfig) {
            return objLiteral;
          }
        }
      }
    }
    
    return null;
  }
  
  // Helper function to update color values in siteSettings.ts content using AST
  function updateDesignTokensInTS(content: string, colors: Record<string, any>): string {
    try {
      const project = new Project({ useInMemoryFileSystem: true });
      const sourceFile = project.createSourceFile('temp.ts', content);
      
      // Get the root config object (handles both plain and factory-wrapped exports)
      const rootObj = getRootConfigObject(sourceFile);
      if (!rootObj) return content;
      
      // Navigate to designTokens.colors
      const designTokensProp = findProperty(rootObj, 'designTokens');
      if (!designTokensProp) return content;
      
      const designTokensObj = designTokensProp.getInitializer();
      if (!designTokensObj?.isKind(SyntaxKind.ObjectLiteralExpression)) return content;
      
      const colorsProp = findProperty(designTokensObj as ObjectLiteralExpression, 'colors');
      if (!colorsProp) return content;
      
      const colorsObj = colorsProp.getInitializer();
      if (!colorsObj?.isKind(SyntaxKind.ObjectLiteralExpression)) return content;
      
      const colorsLiteral = colorsObj as ObjectLiteralExpression;
      
      // Update colors using recursive helper (handles nested text colors)
      updateNestedProperties(colorsLiteral, colors);
      
      return sourceFile.getFullText();
    } catch (error) {
      console.error('Error in updateDesignTokensInTS:', error);
      return content; // Return original on error
    }
  }

  // Helper function to update site settings in siteSettings.ts content using AST
  function updateSiteSettingsInTS(content: string, settings: Record<string, any>): string {
    try {
      const project = new Project({ useInMemoryFileSystem: true });
      const sourceFile = project.createSourceFile('temp.ts', content);
      
      // Get the root config object (handles both plain and factory-wrapped exports)
      const rootObj = getRootConfigObject(sourceFile);
      if (!rootObj) return content;
      
      // Navigate to siteSettings
      const siteSettingsProp = findProperty(rootObj, 'siteSettings');
      if (!siteSettingsProp) return content;
      
      const siteSettingsObj = siteSettingsProp.getInitializer();
      if (!siteSettingsObj?.isKind(SyntaxKind.ObjectLiteralExpression)) return content;
      
      const siteSettingsLiteral = siteSettingsObj as ObjectLiteralExpression;
      
      // Update all settings using recursive helper (handles any nested objects)
      updateNestedProperties(siteSettingsLiteral, settings);
      
      return sourceFile.getFullText();
    } catch (error) {
      console.error('Error in updateSiteSettingsInTS:', error);
      return content; // Return original on error
    }
  }

  // Get site settings from siteSettings.ts (new template format)
  app.get("/api/site-settings", requireAuth, async (req, res) => {
    try {
      const repo = await storage.getRepository();
      if (!repo) {
        return res.json({ success: false, error: "No repository connected" });
      }

      const octokit = await getGitHubClient();
      const filePath = "src/config/siteSettings.ts";

      try {
        const { data } = await octokit.repos.getContent({
          owner: repo.owner,
          repo: repo.name,
          path: filePath,
          ref: repo.activeBranch,
        });

        if (!Array.isArray(data) && "content" in data) {
          const content = Buffer.from(data.content, "base64").toString("utf-8");
          const parsed = parseSiteSettingsTS(content);
          
          if (parsed) {
            res.json({ 
              success: true, 
              data: parsed,
              source: filePath,
              templateType: "egpress-v1"
            });
          } else {
            res.json({ 
              success: false, 
              error: "Could not parse siteSettings.ts",
              rawContent: content.substring(0, 1000) // For debugging
            });
          }
        } else {
          res.json({ success: false, error: "Invalid file response" });
        }
      } catch (err: any) {
        // File doesn't exist - not an egpress-v1 template
        if (err.status === 404) {
          res.json({ 
            success: false, 
            error: "siteSettings.ts not found - this may not be an egpress-v1 template",
            templateType: "unknown"
          });
        } else {
          throw err;
        }
      }
    } catch (error: any) {
      console.error("Get site settings error:", error);
      res.json({ success: false, error: error.message || "Failed to get site settings" });
    }
  });

  // Update site settings in siteSettings.ts (new template format)
  app.put("/api/site-settings", requireAuth, async (req, res) => {
    try {
      const repo = await storage.getRepository();
      if (!repo) {
        return res.json({ success: false, error: "No repository connected" });
      }

      const { designTokens, siteSettings, commitMessage } = req.body;
      const octokit = await getGitHubClient();
      const filePath = "src/config/siteSettings.ts";

      // Get current file content
      const { data } = await octokit.repos.getContent({
        owner: repo.owner,
        repo: repo.name,
        path: filePath,
        ref: repo.activeBranch,
      });

      if (Array.isArray(data) || !("content" in data)) {
        return res.json({ success: false, error: "Invalid file response" });
      }

      let content = Buffer.from(data.content, "base64").toString("utf-8");
      const originalContent = content;

      // Update design tokens (colors)
      if (designTokens?.colors) {
        content = updateDesignTokensInTS(content, designTokens.colors);
      }

      // Update site settings
      if (siteSettings) {
        content = updateSiteSettingsInTS(content, siteSettings);
      }

      // Only commit if content changed
      if (content !== originalContent) {
        await octokit.repos.createOrUpdateFileContents({
          owner: repo.owner,
          repo: repo.name,
          path: filePath,
          message: commitMessage || "Update site settings",
          content: Buffer.from(content).toString("base64"),
          sha: data.sha,
          branch: repo.activeBranch,
        });

        res.json({ 
          success: true, 
          message: "Site settings updated successfully",
          filePath
        });
      } else {
        res.json({ 
          success: true, 
          message: "No changes detected",
          filePath
        });
      }
    } catch (error: any) {
      console.error("Update site settings error:", error);
      res.json({ success: false, error: error.message || "Failed to update site settings" });
    }
  });

  // Detect template type (legacy vs egpress-v1)
  app.get("/api/template-type", requireAuth, async (req, res) => {
    try {
      const repo = await storage.getRepository();
      if (!repo) {
        return res.json({ success: false, error: "No repository connected" });
      }

      const octokit = await getGitHubClient();
      
      // Check for siteSettings.ts (egpress-v1)
      try {
        await octokit.repos.getContent({
          owner: repo.owner,
          repo: repo.name,
          path: "src/config/siteSettings.ts",
          ref: repo.activeBranch,
        });
        return res.json({ 
          success: true, 
          templateType: "egpress-v1",
          configFile: "src/config/siteSettings.ts"
        });
      } catch {
        // File doesn't exist
      }

      // Check for theme.json (legacy)
      try {
        await octokit.repos.getContent({
          owner: repo.owner,
          repo: repo.name,
          path: "src/config/theme.json",
          ref: repo.activeBranch,
        });
        return res.json({ 
          success: true, 
          templateType: "legacy",
          configFile: "src/config/theme.json"
        });
      } catch {
        // File doesn't exist
      }

      res.json({ 
        success: true, 
        templateType: "unknown",
        configFile: null
      });
    } catch (error: any) {
      console.error("Detect template type error:", error);
      res.json({ success: false, error: error.message });
    }
  });

  // Get AdSense config
  app.get("/api/adsense", async (req, res) => {
    try {
      const config = await storage.getAdsenseConfig();
      res.json({ success: true, data: config || defaultAdsenseConfig });
    } catch (error) {
      res.json({ success: false, error: "Failed to get AdSense config" });
    }
  });

  // Update AdSense config
  app.put("/api/adsense", async (req, res) => {
    try {
      const repo = await storage.getRepository();
      if (!repo) {
        return res.json({ success: false, error: "No repository connected" });
      }

      const parseResult = adsenseConfigSchema.safeParse(req.body);
      if (!parseResult.success) {
        return res.json({ success: false, error: parseResult.error.message });
      }
      const config = parseResult.data;
      const configContent = JSON.stringify(config, null, 2);
      const path = "src/config/adsense.json";

      const octokit = await getGitHubClient();

      let sha: string | undefined;
      try {
        const { data: currentFile } = await octokit.repos.getContent({
          owner: repo.owner,
          repo: repo.name,
          path,
          ref: repo.activeBranch,
        });
        sha = Array.isArray(currentFile) ? undefined : currentFile.sha;
      } catch {
        // File doesn't exist yet
      }

      await octokit.repos.createOrUpdateFileContents({
        owner: repo.owner,
        repo: repo.name,
        path,
        message: req.body.commitMessage || "Update AdSense configuration",
        content: Buffer.from(configContent).toString("base64"),
        sha,
        branch: repo.activeBranch,
      });

      await storage.setAdsenseConfig(config);
      res.json({ success: true, data: config });
    } catch (error: any) {
      console.error("Update AdSense config error:", error);
      res.json({ success: false, error: error.message || "Failed to update AdSense config" });
    }
  });

  // Get static pages (non-blog pages like About, Contact, etc.)
  app.get("/api/pages", async (req, res) => {
    try {
      const repo = await storage.getRepository();
      if (!repo) {
        return res.json({ success: true, data: [] });
      }

      const pages = await storage.getStaticPages();
      res.json({ success: true, data: pages });
    } catch (error) {
      res.json({ success: false, error: "Failed to get pages" });
    }
  });

  // Clone repository to new repo - FAST version using Git Data API
  app.post("/api/clone-repo", async (req, res) => {
    try {
      const { sourceRepo, newRepoName, description } = req.body;

      if (!newRepoName) {
        return res.json({ success: false, error: "New repository name is required" });
      }

      if (!sourceRepo) {
        return res.json({ success: false, error: "Source repository is required" });
      }

      const octokit = await getGitHubClient();
      const user = await getAuthenticatedUser();
      const [sourceOwner, sourceRepoName] = sourceRepo.split("/");

      // Check if repo already exists
      try {
        await octokit.repos.get({
          owner: user.login,
          repo: newRepoName,
        });
        return res.json({ success: false, error: `Repository "${newRepoName}" already exists. Please choose a different name.` });
      } catch (e: any) {
        if (e.status !== 404) {
          throw e;
        }
      }

      // Get source repo info
      const { data: sourceRepoData } = await octokit.repos.get({
        owner: sourceOwner,
        repo: sourceRepoName,
      });
      const defaultBranch = sourceRepoData.default_branch || "main";

      // Get source tree with all files
      const { data: sourceTree } = await octokit.git.getTree({
        owner: sourceOwner,
        repo: sourceRepoName,
        tree_sha: defaultBranch,
        recursive: "true",
      });

      // Create repository with auto_init to have an initial commit (required for Git Data API)
      const { data: newRepo } = await octokit.repos.createForAuthenticatedUser({
        name: newRepoName,
        description: description || `Astro blog created from ${sourceRepo}`,
        auto_init: true,
        private: false,
      });

      console.log(`Created repo: ${newRepo.full_name}`);
      
      // Wait for GitHub to initialize the repo with initial commit
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Get the new repo's default branch
      const { data: newRepoInfo } = await octokit.repos.get({
        owner: user.login,
        repo: newRepoName,
      });
      const newRepoBranch = newRepoInfo.default_branch || "main";

      // Get the initial commit ref
      const { data: refData } = await octokit.git.getRef({
        owner: user.login,
        repo: newRepoName,
        ref: `heads/${newRepoBranch}`,
      });
      const baseCommitSha = refData.object.sha;

      // Filter only blob (file) items from source tree
      const blobItems = sourceTree.tree.filter(item => item.type === "blob" && item.sha && item.path);
      console.log(`Found ${blobItems.length} blobs in source tree`);
      
      if (blobItems.length === 0) {
        return res.json({ success: false, error: "Source repository has no files to copy" });
      }

      // Fetch all blobs in parallel batches for speed
      const BATCH_SIZE = 10;
      const newTreeItems: Array<{ path: string; mode: string; type: "blob"; sha: string }> = [];
      
      console.log(`Starting to copy ${blobItems.length} files from ${sourceRepo} to ${newRepoName}`);
      
      for (let i = 0; i < blobItems.length; i += BATCH_SIZE) {
        const batch = blobItems.slice(i, i + BATCH_SIZE);
        console.log(`Processing batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(blobItems.length / BATCH_SIZE)}`);
        
        const blobPromises = batch.map(async (item) => {
          try {
            // Get blob content from source
            const { data: blob } = await octokit.git.getBlob({
              owner: sourceOwner,
              repo: sourceRepoName,
              file_sha: item.sha!,
            });
            
            // Create blob in new repo
            const { data: newBlob } = await octokit.git.createBlob({
              owner: user.login,
              repo: newRepoName,
              content: blob.content,
              encoding: blob.encoding as "base64" | "utf-8",
            });
            
            return {
              path: item.path!,
              mode: item.mode as "100644" | "100755" | "040000" | "160000" | "120000",
              type: "blob" as const,
              sha: newBlob.sha,
            };
          } catch (e: any) {
            console.error(`Failed to copy ${item.path}: ${e.message}`);
            return null;
          }
        });
        
        const results = await Promise.all(blobPromises);
        const successfulResults = results.filter((r): r is NonNullable<typeof r> => r !== null);
        newTreeItems.push(...successfulResults);
        console.log(`Batch complete: ${successfulResults.length}/${batch.length} files copied`);
      }
      
      console.log(`Total files copied: ${newTreeItems.length}/${blobItems.length}`);

      if (newTreeItems.length === 0) {
        return res.json({ success: false, error: "No files could be copied from source repository" });
      }

      // Create tree with all files at once (using base commit as parent tree)
      const { data: newTree } = await octokit.git.createTree({
        owner: user.login,
        repo: newRepoName,
        tree: newTreeItems,
        base_tree: baseCommitSha,
      });

      // Create commit with the new tree
      const { data: newCommit } = await octokit.git.createCommit({
        owner: user.login,
        repo: newRepoName,
        message: `Initial commit - cloned from ${sourceRepo}`,
        tree: newTree.sha,
        parents: [baseCommitSha],
      });

      // Update the branch ref to point to the new commit
      await octokit.git.updateRef({
        owner: user.login,
        repo: newRepoName,
        ref: `heads/${newRepoBranch}`,
        sha: newCommit.sha,
        force: true,
      });

      console.log(`Clone completed: ${newTreeItems.length} files copied`);

      res.json({ 
        success: true, 
        data: {
          name: newRepo.name,
          fullName: newRepo.full_name,
          url: newRepo.html_url,
          fileCount: newTreeItems.length,
        }
      });
    } catch (error: any) {
      console.error("Clone repo error:", error);
      res.json({ success: false, error: error.message || "Failed to clone repository" });
    }
  });

  // AI Generate blog post
  app.post("/api/ai/generate", async (req, res) => {
    try {
      const { topic, keywords, tone, length, apiKey } = req.body;

      if (!topic) {
        return res.json({ success: false, error: "Topic is required" });
      }

      if (!apiKey) {
        return res.json({ success: false, error: "Gemini API key is required" });
      }

      const result = await generateBlogPost(apiKey, topic, keywords || [], tone || "professional", length || "medium");

      res.json({ success: true, data: result });
    } catch (error: any) {
      console.error("AI generate error:", error);
      res.json({ success: false, error: error.message || "Failed to generate content" });
    }
  });

  // Check if Gemini API key is valid and optionally save it
  app.post("/api/ai/validate-key", async (req, res) => {
    try {
      const { apiKey, save } = req.body;

      if (!apiKey) {
        return res.json({ success: false, error: "API key is required" });
      }

      // Try a simple request to validate the key
      await generateBlogPost(apiKey, "Test", [], "casual", "short");
      
      // Save the key if requested
      if (save) {
        await storage.setGeminiApiKey(apiKey);
        
        // Persist to Supabase if user is authenticated (using username for OAuth compatibility)
        if (req.session.githubToken) {
          await updateGeminiKey(req.session.githubToken, apiKey, req.session.githubUsername);
        }
      }
      
      res.json({ success: true, data: { valid: true } });
    } catch (error: any) {
      res.json({ success: false, error: "Invalid API key" });
    }
  });

  // Get saved Gemini API key status (protected) - does NOT return the actual key
  app.get("/api/ai/key", requireAuth, async (req, res) => {
    try {
      const key = await storage.getGeminiApiKey();
      res.json({ success: true, data: { hasKey: !!key } });
    } catch (error) {
      res.json({ success: false, error: "Failed to get API key" });
    }
  });

  // Save Gemini API key (protected)
  app.post("/api/ai/key", requireAuth, async (req, res) => {
    try {
      const { apiKey } = req.body;
      
      if (!apiKey) {
        return res.json({ success: false, error: "API key is required" });
      }
      
      await storage.setGeminiApiKey(apiKey);
      
      // Persist to Supabase (using username for OAuth compatibility)
      const supabaseResult = await updateGeminiKey(req.session.githubToken!, apiKey, req.session.githubUsername);
      if (!supabaseResult) {
        console.warn("Failed to persist Gemini key to Supabase");
      }
      
      res.json({ success: true });
    } catch (error) {
      res.json({ success: false, error: "Failed to save API key" });
    }
  });

  // Clear Gemini API key (protected)
  app.delete("/api/ai/key", requireAuth, async (req, res) => {
    try {
      await storage.setGeminiApiKey(null);
      
      // Clear from Supabase (using username for OAuth compatibility)
      const supabaseResult = await updateGeminiKey(req.session.githubToken!, "", req.session.githubUsername);
      if (!supabaseResult) {
        console.warn("Failed to clear Gemini key from Supabase");
      }
      
      res.json({ success: true });
    } catch (error) {
      res.json({ success: false, error: "Failed to clear API key" });
    }
  });

  // ==================== GOOGLE SEARCH CONSOLE ====================

  // Get Search Console config
  app.get("/api/search-console/config", async (req, res) => {
    try {
      const config = await storage.getSearchConsoleConfig();
      res.json({
        success: true,
        data: config ? {
          siteUrl: config.siteUrl,
          hasCredentials: !!config.serviceAccountJson,
        } : null,
      });
    } catch (error) {
      res.json({ success: false, error: "Failed to get Search Console config" });
    }
  });

  // Save Search Console credentials (protected)
  app.post("/api/search-console/credentials", requireAuth, async (req, res) => {
    try {
      const { serviceAccountJson } = req.body;

      if (!serviceAccountJson) {
        return res.json({ success: false, error: "Service account JSON is required" });
      }

      // Validate JSON format
      let parsed;
      try {
        parsed = JSON.parse(serviceAccountJson);
        if (!parsed.type || !parsed.private_key || !parsed.client_email) {
          return res.json({ success: false, error: "Invalid service account JSON format" });
        }
      } catch {
        return res.json({ success: false, error: "Invalid JSON format" });
      }

      await storage.setSearchConsoleConfig({
        siteUrl: "",
        serviceAccountJson,
        clientEmail: parsed.client_email,
        privateKey: parsed.private_key,
      });

      // Persist to Supabase (repository-based, encrypted)
      const repo = await storage.getRepository();
      if (repo) {
        const supabaseResult = await updateRepositorySearchConsole(
          repo.fullName,
          serviceAccountJson,
          ""
        );
        if (!supabaseResult) {
          console.warn("Failed to persist Search Console config to Supabase");
        }
      } else {
        // Fallback to legacy user-based storage (using username for OAuth compatibility)
        const supabaseResult = await updateSearchConsoleConfig(
          req.session.githubToken!,
          parsed.client_email,
          parsed.private_key,
          "",
          req.session.githubUsername
        );
        if (!supabaseResult) {
          console.warn("Failed to persist Search Console config to Supabase (legacy)");
        }
      }

      res.json({ success: true });
    } catch (error: any) {
      console.error("Save Search Console credentials error:", error);
      res.json({ success: false, error: error.message || "Failed to save credentials" });
    }
  });

  // Clear Search Console credentials (protected)
  app.delete("/api/search-console/credentials", requireAuth, async (req, res) => {
    try {
      await storage.setSearchConsoleConfig(null);
      await storage.setIndexingStatus([]);
      
      // Clear from Supabase
      const repo = await storage.getRepository();
      if (repo) {
        const supabaseResult = await clearRepositorySearchConsole(repo.fullName);
        if (!supabaseResult) {
          console.warn("Failed to clear Search Console config from Supabase");
        }
      } else {
        // Fallback to legacy (using username for OAuth compatibility)
        const supabaseResult = await clearSearchConsoleConfig(req.session.githubToken!, req.session.githubUsername);
        if (!supabaseResult) {
          console.warn("Failed to clear Search Console config from Supabase (legacy)");
        }
      }
      
      res.json({ success: true });
    } catch (error) {
      res.json({ success: false, error: "Failed to clear credentials" });
    }
  });

  // Get indexing status
  app.get("/api/search-console/status", async (req, res) => {
    try {
      const status = await storage.getIndexingStatus();
      res.json({ success: true, data: status });
    } catch (error) {
      res.json({ success: false, error: "Failed to get indexing status" });
    }
  });

  // Submit URLs for indexing using Google Indexing API
  app.post("/api/search-console/submit", async (req, res) => {
    try {
      const config = await storage.getSearchConsoleConfig();
      if (!config || !config.serviceAccountJson) {
        return res.json({ success: false, error: "Search Console not configured" });
      }

      if (!config.siteUrl) {
        return res.json({ success: false, error: "No site selected. Please select a site first." });
      }

      const { urls } = req.body;
      if (!urls || !Array.isArray(urls) || urls.length === 0) {
        return res.json({ success: false, error: "URLs are required" });
      }

      // Parse service account JSON
      let serviceAccount;
      try {
        serviceAccount = JSON.parse(config.serviceAccountJson);
      } catch {
        return res.json({ success: false, error: "Invalid service account JSON" });
      }

      // Validate URLs - must be strings starting with http(s)
      const validUrls: string[] = [];
      const siteHost = new URL(config.siteUrl).hostname;
      
      for (const url of urls) {
        if (typeof url === "string" && (url.startsWith("http://") || url.startsWith("https://"))) {
          try {
            const urlHost = new URL(url).hostname;
            if (urlHost === siteHost || urlHost.endsWith(`.${siteHost}`)) {
              validUrls.push(url);
            }
          } catch {
            // Invalid URL format, skip
          }
        }
      }

      if (validUrls.length === 0) {
        return res.json({ success: false, error: "No valid URLs provided. URLs must belong to your configured site." });
      }

      // Setup Google Indexing API with service account
      const { google } = await import("googleapis");
      const auth = new google.auth.JWT({
        email: serviceAccount.client_email,
        key: serviceAccount.private_key,
        scopes: ["https://www.googleapis.com/auth/indexing"],
      });

      const indexing = google.indexing({ version: "v3", auth });

      let submitted = 0;
      const errors: string[] = [];
      const results: { url: string; status: string; message: string }[] = [];

      // Submit each URL to Google Indexing API
      for (const url of validUrls) {
        try {
          const response = await indexing.urlNotifications.publish({
            requestBody: {
              url: url,
              type: "URL_UPDATED",
            },
          });

          await storage.updateIndexingStatus(url, {
            status: "submitted",
            lastSubmitted: new Date().toISOString(),
            message: `Submitted successfully. Notification time: ${response.data.urlNotificationMetadata?.latestUpdate?.notifyTime || 'N/A'}`,
          });
          
          results.push({ url, status: "success", message: "Submitted to Google Indexing API" });
          submitted++;
        } catch (error: any) {
          const errorMessage = error.response?.data?.error?.message || error.message || "Failed to submit";
          errors.push(`${url}: ${errorMessage}`);
          
          await storage.updateIndexingStatus(url, {
            status: "error",
            lastSubmitted: new Date().toISOString(),
            message: errorMessage,
          });
          
          results.push({ url, status: "error", message: errorMessage });
        }
      }

      res.json({
        success: true,
        submitted,
        total: validUrls.length,
        errors: errors.length > 0 ? errors : undefined,
        results,
      });
    } catch (error: any) {
      console.error("Submit URLs error:", error);
      res.json({ success: false, error: error.message || "Failed to submit URLs" });
    }
  });

  // Submit sitemap to Google Search Console
  app.post("/api/search-console/submit-sitemap", async (req, res) => {
    try {
      const config = await storage.getSearchConsoleConfig();
      if (!config || !config.serviceAccountJson) {
        return res.json({ success: false, error: "Search Console not configured" });
      }

      if (!config.siteUrl) {
        return res.json({ success: false, error: "No site selected. Please select a site first." });
      }

      const { sitemapUrl } = req.body;
      if (!sitemapUrl) {
        return res.json({ success: false, error: "Sitemap URL is required" });
      }

      // Parse service account JSON
      let serviceAccount;
      try {
        serviceAccount = JSON.parse(config.serviceAccountJson);
      } catch {
        return res.json({ success: false, error: "Invalid service account JSON" });
      }

      // Setup Google Search Console API
      const { google } = await import("googleapis");
      const auth = new google.auth.JWT({
        email: serviceAccount.client_email,
        key: serviceAccount.private_key,
        scopes: ["https://www.googleapis.com/auth/webmasters"],
      });

      const searchconsole = google.searchconsole({ version: "v1", auth });

      try {
        // Submit sitemap using webmasters API (v3)
        const webmasters = google.webmasters({ version: "v3", auth });
        await webmasters.sitemaps.submit({
          siteUrl: config.siteUrl,
          feedpath: sitemapUrl,
        });

        res.json({ 
          success: true, 
          message: `Sitemap ${sitemapUrl} submitted successfully to ${config.siteUrl}` 
        });
      } catch (apiError: any) {
        console.error("Sitemap submission error:", apiError);
        const errorMessage = apiError.response?.data?.error?.message || apiError.message || "Failed to submit sitemap";
        res.json({ success: false, error: errorMessage });
      }
    } catch (error: any) {
      console.error("Submit sitemap error:", error);
      res.json({ success: false, error: error.message || "Failed to submit sitemap" });
    }
  });

  // Get sitemaps from Google Search Console
  app.get("/api/search-console/sitemaps", async (req, res) => {
    try {
      const config = await storage.getSearchConsoleConfig();
      if (!config || !config.serviceAccountJson) {
        return res.json({ success: false, error: "Search Console not configured" });
      }

      if (!config.siteUrl) {
        return res.json({ success: false, error: "No site selected" });
      }

      // Parse service account JSON
      let serviceAccount;
      try {
        serviceAccount = JSON.parse(config.serviceAccountJson);
      } catch {
        return res.json({ success: false, error: "Invalid service account JSON" });
      }

      const { google } = await import("googleapis");
      const auth = new google.auth.JWT({
        email: serviceAccount.client_email,
        key: serviceAccount.private_key,
        scopes: ["https://www.googleapis.com/auth/webmasters.readonly"],
      });

      const webmasters = google.webmasters({ version: "v3", auth });
      
      try {
        const response = await webmasters.sitemaps.list({
          siteUrl: config.siteUrl,
        });

        const sitemaps = (response.data.sitemap || []).map((sm: any) => ({
          path: sm.path,
          lastSubmitted: sm.lastSubmitted,
          isPending: sm.isPending,
          isSitemapsIndex: sm.isSitemapsIndex,
          lastDownloaded: sm.lastDownloaded,
          warnings: sm.warnings,
          errors: sm.errors,
        }));

        res.json({ success: true, data: sitemaps });
      } catch (apiError: any) {
        console.error("Get sitemaps error:", apiError);
        res.json({ success: false, error: apiError.message || "Failed to get sitemaps" });
      }
    } catch (error: any) {
      console.error("Get sitemaps error:", error);
      res.json({ success: false, error: error.message || "Failed to get sitemaps" });
    }
  });

  // Get URL inspection data
  app.post("/api/search-console/inspect-url", async (req, res) => {
    try {
      const config = await storage.getSearchConsoleConfig();
      if (!config || !config.serviceAccountJson) {
        return res.json({ success: false, error: "Search Console not configured" });
      }

      if (!config.siteUrl) {
        return res.json({ success: false, error: "No site selected" });
      }

      const { inspectionUrl } = req.body;
      if (!inspectionUrl) {
        return res.json({ success: false, error: "URL is required" });
      }

      // Parse service account JSON
      let serviceAccount;
      try {
        serviceAccount = JSON.parse(config.serviceAccountJson);
      } catch {
        return res.json({ success: false, error: "Invalid service account JSON" });
      }

      const { google } = await import("googleapis");
      const auth = new google.auth.JWT({
        email: serviceAccount.client_email,
        key: serviceAccount.private_key,
        scopes: ["https://www.googleapis.com/auth/webmasters.readonly"],
      });

      const searchconsole = google.searchconsole({ version: "v1", auth });
      
      try {
        const response = await searchconsole.urlInspection.index.inspect({
          requestBody: {
            inspectionUrl: inspectionUrl,
            siteUrl: config.siteUrl,
          },
        });

        res.json({ 
          success: true, 
          data: response.data.inspectionResult 
        });
      } catch (apiError: any) {
        console.error("URL inspection error:", apiError);
        res.json({ success: false, error: apiError.message || "Failed to inspect URL" });
      }
    } catch (error: any) {
      console.error("Inspect URL error:", error);
      res.json({ success: false, error: error.message || "Failed to inspect URL" });
    }
  });

  // ============== VERCEL INTEGRATION ==============

  // Get Vercel configuration status
  app.get("/api/vercel/config", async (_req, res) => {
    try {
      const config = await storage.getVercelConfig();
      const project = await storage.getVercelProject();
      res.json({
        success: true,
        data: {
          hasToken: !!config?.token,
          username: config?.username,
          teamId: config?.teamId,
          project: project,
        },
      });
    } catch (error: any) {
      res.json({ success: false, error: error.message });
    }
  });

  // Save Vercel token (protected)
  app.post("/api/vercel/token", requireAuth, async (req, res) => {
    try {
      const { token, teamId } = req.body;
      if (!token) {
        return res.json({ success: false, error: "Token is required" });
      }

      // Validate token by fetching user info
      const { VercelService } = await import("./vercel");
      const vercel = new VercelService(token, teamId);
      
      try {
        const user = await vercel.validateToken();
        await storage.setVercelConfig({
          token,
          teamId,
          username: user.username,
        });
        
        // Persist to Supabase (using username for OAuth compatibility)
        const supabaseResult = await updateVercelConfig(req.session.githubToken!, token, teamId, undefined, req.session.githubUsername);
        if (!supabaseResult) {
          console.warn("Failed to persist Vercel config to Supabase");
        }
        
        res.json({
          success: true,
          data: { username: user.username, email: user.email },
        });
      } catch (validationError: any) {
        res.json({ success: false, error: "Invalid Vercel token: " + validationError.message });
      }
    } catch (error: any) {
      res.json({ success: false, error: error.message });
    }
  });

  // Clear Vercel token (protected)
  app.delete("/api/vercel/token", requireAuth, async (req, res) => {
    try {
      await storage.setVercelConfig(null);
      await storage.setVercelProject(null);
      await storage.setVercelDeployments([]);
      await storage.setVercelDomains([]);
      
      // Clear from Supabase (using username for OAuth compatibility)
      const supabaseResult = await clearVercelConfig(req.session.githubToken!, req.session.githubUsername);
      if (!supabaseResult) {
        console.warn("Failed to clear Vercel config from Supabase");
      }
      
      res.json({ success: true });
    } catch (error: any) {
      res.json({ success: false, error: error.message });
    }
  });

  // List Vercel projects
  app.get("/api/vercel/projects", async (_req, res) => {
    try {
      const config = await storage.getVercelConfig();
      if (!config?.token) {
        return res.json({ success: false, error: "Vercel not connected" });
      }

      const { VercelService } = await import("./vercel");
      const vercel = new VercelService(config.token, config.teamId);
      const projects = await vercel.listProjects();
      res.json({ success: true, data: projects });
    } catch (error: any) {
      res.json({ success: false, error: error.message });
    }
  });

  // Link or create Vercel project for current repository
  app.post("/api/vercel/project/link", async (req, res) => {
    try {
      const config = await storage.getVercelConfig();
      if (!config?.token) {
        return res.json({ success: false, error: "Vercel not connected" });
      }

      const repo = await storage.getRepository();
      if (!repo) {
        return res.json({ success: false, error: "No repository connected" });
      }

      const { projectId, createNew, projectName } = req.body;

      const { VercelService } = await import("./vercel");
      const vercel = new VercelService(config.token, config.teamId);

      let project;
      if (createNew) {
        const name = projectName || repo.name;
        project = await vercel.createProject(name, {
          owner: repo.owner,
          repo: repo.name,
        });
      } else if (projectId) {
        project = await vercel.getProject(projectId);
        if (!project) {
          return res.json({ success: false, error: "Project not found" });
        }
      } else {
        return res.json({ success: false, error: "Either projectId or createNew is required" });
      }

      await storage.setVercelProject(project);
      
      // Fetch initial deployments and domains
      const deployments = await vercel.getDeployments(project.id);
      await storage.setVercelDeployments(deployments);
      
      const domains = await vercel.getDomains(project.id);
      await storage.setVercelDomains(domains);

      res.json({ success: true, data: project });
    } catch (error: any) {
      res.json({ success: false, error: error.message });
    }
  });

  // Unlink Vercel project
  app.post("/api/vercel/project/unlink", async (_req, res) => {
    try {
      await storage.setVercelProject(null);
      await storage.setVercelDeployments([]);
      await storage.setVercelDomains([]);
      res.json({ success: true });
    } catch (error: any) {
      res.json({ success: false, error: error.message });
    }
  });

  // Get deployments
  app.get("/api/vercel/deployments", async (_req, res) => {
    try {
      const config = await storage.getVercelConfig();
      const project = await storage.getVercelProject();
      
      if (!config?.token || !project) {
        const cached = await storage.getVercelDeployments();
        return res.json({ success: true, data: cached });
      }

      const { VercelService } = await import("./vercel");
      const vercel = new VercelService(config.token, config.teamId);
      const deployments = await vercel.getDeployments(project.id);
      await storage.setVercelDeployments(deployments);
      
      res.json({ success: true, data: deployments });
    } catch (error: any) {
      const cached = await storage.getVercelDeployments();
      res.json({ success: true, data: cached, warning: error.message });
    }
  });

  // Trigger new deployment by pushing to GitHub (triggers Vercel webhook)
  app.post("/api/vercel/deployments", async (_req, res) => {
    try {
      const config = await storage.getVercelConfig();
      const project = await storage.getVercelProject();
      const repo = await storage.getRepository();
      
      if (!config?.token) {
        return res.json({ success: false, error: "Vercel not connected" });
      }
      if (!project) {
        return res.json({ success: false, error: "No Vercel project linked" });
      }
      if (!repo) {
        return res.json({ success: false, error: "No repository connected" });
      }

      // Push an empty commit to trigger Vercel deployment via webhook
      const octokit = await getGitHubClient();
      const branch = repo.activeBranch || "main";
      
      // Get the latest commit SHA
      const { data: refData } = await octokit.git.getRef({
        owner: repo.owner,
        repo: repo.name,
        ref: `heads/${branch}`,
      });
      const latestCommitSha = refData.object.sha;
      
      // Get the tree from latest commit
      const { data: commitData } = await octokit.git.getCommit({
        owner: repo.owner,
        repo: repo.name,
        commit_sha: latestCommitSha,
      });
      
      // Create a new commit with the same tree (empty commit to trigger deploy)
      const { data: newCommit } = await octokit.git.createCommit({
        owner: repo.owner,
        repo: repo.name,
        message: `Deploy to Vercel - ${new Date().toISOString()}`,
        tree: commitData.tree.sha,
        parents: [latestCommitSha],
      });
      
      // Update the branch reference to the new commit
      await octokit.git.updateRef({
        owner: repo.owner,
        repo: repo.name,
        ref: `heads/${branch}`,
        sha: newCommit.sha,
      });
      
      console.log(`Pushed deploy commit to ${repo.fullName}:${branch}`);
      
      // Wait a moment for Vercel to pick up the webhook
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Refresh deployments list
      const { VercelService } = await import("./vercel");
      const vercel = new VercelService(config.token, config.teamId);
      const deployments = await vercel.getDeployments(project.id);
      await storage.setVercelDeployments(deployments);
      
      // Return the latest deployment if available
      const latestDeployment = deployments[0] || {
        id: newCommit.sha,
        url: "",
        state: "QUEUED",
        createdAt: Date.now(),
        source: "git",
      };
      
      res.json({ success: true, data: latestDeployment });
    } catch (error: any) {
      console.error("Deploy error:", error);
      res.json({ success: false, error: error.message || "Failed to trigger deployment" });
    }
  });

  // Get domains
  app.get("/api/vercel/domains", async (_req, res) => {
    try {
      const config = await storage.getVercelConfig();
      const project = await storage.getVercelProject();
      
      if (!config?.token || !project) {
        const cached = await storage.getVercelDomains();
        return res.json({ success: true, data: cached });
      }

      const { VercelService } = await import("./vercel");
      const vercel = new VercelService(config.token, config.teamId);
      const domains = await vercel.getDomains(project.id);
      await storage.setVercelDomains(domains);
      
      res.json({ success: true, data: domains });
    } catch (error: any) {
      const cached = await storage.getVercelDomains();
      res.json({ success: true, data: cached, warning: error.message });
    }
  });

  // Add domain
  app.post("/api/vercel/domains", async (req, res) => {
    try {
      const config = await storage.getVercelConfig();
      const project = await storage.getVercelProject();
      
      if (!config?.token) {
        return res.json({ success: false, error: "Vercel not connected" });
      }
      if (!project) {
        return res.json({ success: false, error: "No Vercel project linked" });
      }

      const { domain } = req.body;
      if (!domain || typeof domain !== "string") {
        return res.json({ success: false, error: "Domain is required" });
      }

      const { VercelService } = await import("./vercel");
      const vercel = new VercelService(config.token, config.teamId);
      
      const newDomain = await vercel.addDomain(project.id, domain.toLowerCase().trim());
      
      // Refresh domains list
      const domains = await vercel.getDomains(project.id);
      await storage.setVercelDomains(domains);
      
      res.json({ success: true, data: newDomain });
    } catch (error: any) {
      res.json({ success: false, error: error.message });
    }
  });

  // Remove domain
  app.delete("/api/vercel/domains/:domain", async (req, res) => {
    try {
      const config = await storage.getVercelConfig();
      const project = await storage.getVercelProject();
      
      if (!config?.token) {
        return res.json({ success: false, error: "Vercel not connected" });
      }
      if (!project) {
        return res.json({ success: false, error: "No Vercel project linked" });
      }

      const { domain } = req.params;

      const { VercelService } = await import("./vercel");
      const vercel = new VercelService(config.token, config.teamId);
      
      await vercel.removeDomain(project.id, domain);
      
      // Refresh domains list
      const domains = await vercel.getDomains(project.id);
      await storage.setVercelDomains(domains);
      
      res.json({ success: true });
    } catch (error: any) {
      res.json({ success: false, error: error.message });
    }
  });

  // Verify domain
  app.post("/api/vercel/domains/:domain/verify", async (req, res) => {
    try {
      const config = await storage.getVercelConfig();
      const project = await storage.getVercelProject();
      
      if (!config?.token) {
        return res.json({ success: false, error: "Vercel not connected" });
      }
      if (!project) {
        return res.json({ success: false, error: "No Vercel project linked" });
      }

      const { domain } = req.params;

      const { VercelService } = await import("./vercel");
      const vercel = new VercelService(config.token, config.teamId);
      
      const verifiedDomain = await vercel.verifyDomain(project.id, domain);
      
      // Refresh domains list
      const domains = await vercel.getDomains(project.id);
      await storage.setVercelDomains(domains);
      
      res.json({ success: true, data: verifiedDomain });
    } catch (error: any) {
      res.json({ success: false, error: error.message });
    }
  });

  // Auto-link Vercel project based on connected repository
  app.post("/api/vercel/auto-link", requireAuth, async (req, res) => {
    try {
      const config = await storage.getVercelConfig();
      if (!config?.token) {
        return res.json({ success: false, error: "Vercel not connected. Please add your Vercel token first." });
      }

      const repo = await storage.getRepository();
      if (!repo) {
        return res.json({ success: false, error: "No repository connected" });
      }

      const { VercelService } = await import("./vercel");
      const vercel = new VercelService(config.token, config.teamId);
      
      // Auto-link or create project
      const result = await vercel.autoLinkProject(repo.owner, repo.name);
      
      // Save project to storage
      await storage.setVercelProject(result.project);
      
      // Save to Supabase with repository identifier
      const repoFullName = `${repo.owner}/${repo.name}`;
      await updateRepositoryVercel(
        repoFullName,
        config.token,
        config.teamId,
        result.project.id,
        result.project.name
      );
      
      // Fetch deployments and domains
      const deployments = await vercel.getDeployments(result.project.id);
      await storage.setVercelDeployments(deployments);
      
      const domains = await vercel.getDomains(result.project.id);
      await storage.setVercelDomains(domains);

      res.json({ 
        success: true, 
        data: {
          project: result.project,
          isNew: result.isNew,
          message: result.message,
        },
      });
    } catch (error: any) {
      res.json({ success: false, error: error.message });
    }
  });

  // ==================== GOOGLE SEARCH CONSOLE SERVICE ACCOUNT ====================

  // List sites from Google Search Console service account
  app.get("/api/search-console/sites", async (_req, res) => {
    try {
      const config = await storage.getSearchConsoleConfig();
      if (!config?.serviceAccountJson) {
        return res.json({ success: false, error: "Search Console service account not configured" });
      }

      // Parse service account JSON
      let serviceAccount;
      try {
        serviceAccount = JSON.parse(config.serviceAccountJson);
      } catch {
        return res.json({ success: false, error: "Invalid service account JSON" });
      }

      // Use Google Search Console API to list sites
      const { google } = await import("googleapis");
      const auth = new google.auth.JWT({
        email: serviceAccount.client_email,
        key: serviceAccount.private_key,
        scopes: ["https://www.googleapis.com/auth/webmasters.readonly"],
      });

      const searchconsole = google.searchconsole({ version: "v1", auth });
      
      try {
        const response = await searchconsole.sites.list();
        const sites = (response.data.siteEntry || []).map((site: any) => ({
          siteUrl: site.siteUrl,
          permissionLevel: site.permissionLevel,
        }));
        
        res.json({ success: true, data: sites });
      } catch (apiError: any) {
        console.error("Search Console API error:", apiError);
        res.json({ 
          success: false, 
          error: apiError.message || "Failed to fetch sites from Google Search Console" 
        });
      }
    } catch (error: any) {
      console.error("List sites error:", error);
      res.json({ success: false, error: error.message || "Failed to list sites" });
    }
  });

  // Select site from Google Search Console
  app.post("/api/search-console/select-site", requireAuth, async (req, res) => {
    try {
      const { siteUrl } = req.body;
      if (!siteUrl) {
        return res.json({ success: false, error: "Site URL is required" });
      }

      const config = await storage.getSearchConsoleConfig();
      if (!config?.serviceAccountJson) {
        return res.json({ success: false, error: "Search Console not configured" });
      }

      // Update storage with selected site
      await storage.setSearchConsoleConfig({
        ...config,
        siteUrl,
      });

      // Update Supabase with repository identifier
      const repo = await storage.getRepository();
      if (repo) {
        const repoFullName = `${repo.owner}/${repo.name}`;
        await updateRepositorySearchConsole(repoFullName, config.serviceAccountJson, siteUrl);
      }

      res.json({ success: true });
    } catch (error: any) {
      res.json({ success: false, error: error.message });
    }
  });

  // ==================== SITEMAP GENERATION ====================

  // Generate sitemap.xml
  app.get("/api/sitemap.xml", async (_req, res) => {
    try {
      const repo = await storage.getRepository();
      const posts = await storage.getPosts();
      const config = await storage.getSearchConsoleConfig();
      
      if (!repo) {
        return res.status(404).send("No repository connected");
      }

      // Determine base URL from Search Console config or Vercel domain
      let baseUrl = config?.siteUrl || "";
      
      if (!baseUrl) {
        const vercelProject = await storage.getVercelProject();
        if (vercelProject?.productionUrl) {
          baseUrl = `https://${vercelProject.productionUrl}`;
        } else {
          const domains = await storage.getVercelDomains();
          const verifiedDomain = domains.find(d => d.verified && d.configured);
          if (verifiedDomain) {
            baseUrl = `https://${verifiedDomain.name}`;
          }
        }
      }

      if (!baseUrl) {
        return res.status(400).json({ 
          success: false, 
          error: "No base URL configured. Please set up a domain in Vercel or configure Search Console." 
        });
      }

      // Ensure baseUrl doesn't have trailing slash
      baseUrl = baseUrl.replace(/\/$/, "");

      // Build sitemap XML
      const urls: { loc: string; lastmod?: string; priority: string; changefreq: string }[] = [];

      // Add homepage
      urls.push({
        loc: baseUrl,
        lastmod: new Date().toISOString().split("T")[0],
        priority: "1.0",
        changefreq: "daily",
      });

      // Add blog index
      urls.push({
        loc: `${baseUrl}/blog`,
        lastmod: new Date().toISOString().split("T")[0],
        priority: "0.9",
        changefreq: "daily",
      });

      // Add blog posts
      for (const post of posts) {
        if (!post.draft) {
          urls.push({
            loc: `${baseUrl}/blog/${post.slug}`,
            lastmod: post.pubDate?.split("T")[0] || new Date().toISOString().split("T")[0],
            priority: "0.8",
            changefreq: "weekly",
          });
        }
      }

      // Add static pages
      const staticPages = await storage.getStaticPages();
      for (const page of staticPages) {
        const pageName = page.name.toLowerCase();
        if (pageName !== "index" && pageName !== "404" && pageName !== "500") {
          urls.push({
            loc: `${baseUrl}/${pageName}`,
            lastmod: new Date().toISOString().split("T")[0],
            priority: "0.6",
            changefreq: "monthly",
          });
        }
      }

      // Generate XML
      const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map(url => `  <url>
    <loc>${url.loc}</loc>
    <lastmod>${url.lastmod}</lastmod>
    <changefreq>${url.changefreq}</changefreq>
    <priority>${url.priority}</priority>
  </url>`).join("\n")}
</urlset>`;

      res.set("Content-Type", "application/xml");
      res.send(xml);
    } catch (error: any) {
      console.error("Sitemap generation error:", error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // Save sitemap to repository
  app.post("/api/sitemap/save", requireAuth, async (req, res) => {
    try {
      const repo = await storage.getRepository();
      if (!repo) {
        return res.json({ success: false, error: "No repository connected" });
      }

      // Generate sitemap content
      const posts = await storage.getPosts();
      const config = await storage.getSearchConsoleConfig();
      
      let baseUrl = config?.siteUrl || "";
      
      if (!baseUrl) {
        const vercelProject = await storage.getVercelProject();
        if (vercelProject?.productionUrl) {
          baseUrl = `https://${vercelProject.productionUrl}`;
        } else {
          const domains = await storage.getVercelDomains();
          const verifiedDomain = domains.find(d => d.verified && d.configured);
          if (verifiedDomain) {
            baseUrl = `https://${verifiedDomain.name}`;
          }
        }
      }

      if (!baseUrl) {
        return res.json({ 
          success: false, 
          error: "No base URL configured. Please set up a domain first." 
        });
      }

      baseUrl = baseUrl.replace(/\/$/, "");

      const urls: { loc: string; lastmod?: string; priority: string; changefreq: string }[] = [];

      urls.push({
        loc: baseUrl,
        lastmod: new Date().toISOString().split("T")[0],
        priority: "1.0",
        changefreq: "daily",
      });

      urls.push({
        loc: `${baseUrl}/blog`,
        lastmod: new Date().toISOString().split("T")[0],
        priority: "0.9",
        changefreq: "daily",
      });

      for (const post of posts) {
        if (!post.draft) {
          urls.push({
            loc: `${baseUrl}/blog/${post.slug}`,
            lastmod: post.pubDate?.split("T")[0] || new Date().toISOString().split("T")[0],
            priority: "0.8",
            changefreq: "weekly",
          });
        }
      }

      const staticPages = await storage.getStaticPages();
      for (const page of staticPages) {
        const pageName = page.name.toLowerCase();
        if (pageName !== "index" && pageName !== "404" && pageName !== "500") {
          urls.push({
            loc: `${baseUrl}/${pageName}`,
            lastmod: new Date().toISOString().split("T")[0],
            priority: "0.6",
            changefreq: "monthly",
          });
        }
      }

      const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map(url => `  <url>
    <loc>${url.loc}</loc>
    <lastmod>${url.lastmod}</lastmod>
    <changefreq>${url.changefreq}</changefreq>
    <priority>${url.priority}</priority>
  </url>`).join("\n")}
</urlset>`;

      // Commit sitemap to repository
      const octokit = await getGitHubClient();
      
      // Check if sitemap exists
      let sha: string | undefined;
      try {
        const { data } = await octokit.repos.getContent({
          owner: repo.owner,
          repo: repo.name,
          path: "public/sitemap.xml",
          ref: repo.activeBranch,
        });
        if (!Array.isArray(data) && "sha" in data) {
          sha = data.sha;
        }
      } catch {
        // File doesn't exist, will create new
      }

      // Create or update file
      await octokit.repos.createOrUpdateFileContents({
        owner: repo.owner,
        repo: repo.name,
        path: "public/sitemap.xml",
        message: "Update sitemap.xml",
        content: Buffer.from(xml).toString("base64"),
        branch: repo.activeBranch,
        sha,
      });

      res.json({ success: true, message: "Sitemap saved to repository" });
    } catch (error: any) {
      console.error("Save sitemap error:", error);
      res.json({ success: false, error: error.message });
    }
  });

  // Auto-generate sitemap and submit to Google Search Console
  app.post("/api/sitemap/auto-generate", requireAuth, async (req, res) => {
    try {
      const { domain } = req.body;
      
      if (!domain || typeof domain !== "string" || !domain.trim()) {
        return res.json({ success: false, error: "Please enter a domain URL" });
      }

      const repo = await storage.getRepository();
      if (!repo) {
        return res.json({ success: false, error: "No repository connected" });
      }

      const posts = await storage.getPosts();
      const octokit = await getGitHubClient();
      const config = await storage.getSearchConsoleConfig();

      // Build sitemap XML using provided domain
      const baseUrl = domain.trim().replace(/\/$/, "");
      const urls: { loc: string; lastmod: string; priority: string; changefreq: string }[] = [];

      // Add homepage
      urls.push({
        loc: baseUrl,
        lastmod: new Date().toISOString().split("T")[0],
        priority: "1.0",
        changefreq: "daily",
      });

      // Add blog index
      urls.push({
        loc: `${baseUrl}/blog`,
        lastmod: new Date().toISOString().split("T")[0],
        priority: "0.9",
        changefreq: "daily",
      });

      // Add blog posts
      for (const post of posts) {
        if (!post.draft) {
          urls.push({
            loc: `${baseUrl}/blog/${post.slug}`,
            lastmod: post.pubDate?.split("T")[0] || new Date().toISOString().split("T")[0],
            priority: "0.8",
            changefreq: "weekly",
          });
        }
      }

      // Add static pages
      const staticPages = await storage.getStaticPages();
      for (const page of staticPages) {
        const pageName = page.name.toLowerCase();
        if (pageName !== "index" && pageName !== "404" && pageName !== "500") {
          urls.push({
            loc: `${baseUrl}/${pageName}`,
            lastmod: new Date().toISOString().split("T")[0],
            priority: "0.6",
            changefreq: "monthly",
          });
        }
      }

      const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map(url => `  <url>
    <loc>${url.loc}</loc>
    <lastmod>${url.lastmod}</lastmod>
    <changefreq>${url.changefreq}</changefreq>
    <priority>${url.priority}</priority>
  </url>`).join("\n")}
</urlset>`;

      // Check if sitemap exists
      let sha: string | undefined;
      try {
        const { data } = await octokit.repos.getContent({
          owner: repo.owner,
          repo: repo.name,
          path: "public/sitemap.xml",
          ref: repo.activeBranch,
        });
        if (!Array.isArray(data) && "sha" in data) {
          sha = data.sha;
        }
      } catch {
        // File doesn't exist, will create new
      }

      // Create or update file in repo
      await octokit.repos.createOrUpdateFileContents({
        owner: repo.owner,
        repo: repo.name,
        path: "public/sitemap.xml",
        message: "Auto-generate sitemap.xml",
        content: Buffer.from(xml).toString("base64"),
        branch: repo.activeBranch,
        sha,
      });

      // Submit sitemap to Google Search Console
      let googleSubmitSuccess = false;
      let googleError = "";
      
      if (config.serviceAccountJson) {
        try {
          const serviceAccount = JSON.parse(config.serviceAccountJson);
          const { google } = await import("googleapis");
          const auth = new google.auth.JWT({
            email: serviceAccount.client_email,
            key: serviceAccount.private_key,
            scopes: ["https://www.googleapis.com/auth/webmasters"],
          });

          const searchconsole = google.searchconsole({ version: "v1", auth });
          const sitemapUrl = `${baseUrl}/sitemap.xml`;
          
          // Use the provided domain for GSC submission
          // This requires the domain to be verified in GSC
          await searchconsole.sitemaps.submit({
            siteUrl: baseUrl.endsWith("/") ? baseUrl : baseUrl + "/",
            feedpath: sitemapUrl,
          });
          
          googleSubmitSuccess = true;
        } catch (apiError: any) {
          console.error("Google Search Console submit error:", apiError);
          googleError = apiError.message || "Failed to submit to Google";
        }
      }

      res.json({ 
        success: true, 
        message: googleSubmitSuccess 
          ? "Sitemap generated, saved to repo, and submitted to Google!" 
          : `Sitemap saved to repo. ${googleError ? `Google submit failed: ${googleError}` : "Google submit skipped (no credentials)."}`,
        repoSaved: true,
        googleSubmitted: googleSubmitSuccess,
        urlCount: urls.length,
      });
    } catch (error: any) {
      console.error("Auto-generate sitemap error:", error);
      res.json({ success: false, error: error.message });
    }
  });

  // ==================== DOMAIN VERIFICATION ====================

  // Get verification token for a domain
  app.post("/api/search-console/verify-domain", requireAuth, async (req, res) => {
    try {
      const { siteUrl, method } = req.body;
      
      if (!siteUrl) {
        return res.json({ success: false, error: "Site URL is required" });
      }

      const config = await storage.getSearchConsoleConfig();
      if (!config?.serviceAccountJson) {
        return res.json({ success: false, error: "Search Console credentials not configured" });
      }

      const serviceAccount = JSON.parse(config.serviceAccountJson);
      const { google } = await import("googleapis");
      const auth = new google.auth.JWT({
        email: serviceAccount.client_email,
        key: serviceAccount.private_key,
        scopes: ["https://www.googleapis.com/auth/siteverification"],
      });

      const siteVerification = google.siteVerification({ version: "v1", auth });

      // Get verification token
      const verificationMethod = method || "FILE"; // FILE or META or DNS_TXT
      const tokenResponse = await siteVerification.webResource.getToken({
        requestBody: {
          site: {
            type: "SITE",
            identifier: siteUrl,
          },
          verificationMethod: verificationMethod,
        },
      });

      res.json({ 
        success: true, 
        token: tokenResponse.data.token,
        method: verificationMethod,
        instructions: verificationMethod === "FILE" 
          ? `Create a file at ${siteUrl}/${tokenResponse.data.token} with content: google-site-verification: ${tokenResponse.data.token}`
          : verificationMethod === "META"
          ? `Add this meta tag to your homepage: <meta name="google-site-verification" content="${tokenResponse.data.token}" />`
          : `Add this DNS TXT record: ${tokenResponse.data.token}`,
      });
    } catch (error: any) {
      console.error("Get verification token error:", error);
      res.json({ success: false, error: error.message });
    }
  });

  // Verify domain and add to Search Console
  app.post("/api/search-console/add-site", requireAuth, async (req, res) => {
    try {
      const { siteUrl } = req.body;
      
      if (!siteUrl) {
        return res.json({ success: false, error: "Site URL is required" });
      }

      const config = await storage.getSearchConsoleConfig();
      if (!config?.serviceAccountJson) {
        return res.json({ success: false, error: "Search Console credentials not configured" });
      }

      const serviceAccount = JSON.parse(config.serviceAccountJson);
      const { google } = await import("googleapis");
      const auth = new google.auth.JWT({
        email: serviceAccount.client_email,
        key: serviceAccount.private_key,
        scopes: [
          "https://www.googleapis.com/auth/siteverification",
          "https://www.googleapis.com/auth/webmasters",
        ],
      });

      const siteVerification = google.siteVerification({ version: "v1", auth });

      // Try to verify the site
      try {
        await siteVerification.webResource.insert({
          verificationMethod: "FILE",
          requestBody: {
            site: {
              type: "SITE",
              identifier: siteUrl,
            },
          },
        });
      } catch (verifyError: any) {
        // If verification fails, return detailed error
        if (verifyError.message?.includes("not verified")) {
          return res.json({ 
            success: false, 
            error: "Site not verified. Please add the verification file first.",
            needsVerification: true,
          });
        }
        throw verifyError;
      }

      // Add site to Search Console
      const searchconsole = google.searchconsole({ version: "v1", auth });
      try {
        await searchconsole.sites.add({
          siteUrl: siteUrl,
        });
      } catch (addError: any) {
        // Site might already exist
        if (!addError.message?.includes("already exists")) {
          throw addError;
        }
      }

      res.json({ 
        success: true, 
        message: "Site verified and added to Search Console!",
      });
    } catch (error: any) {
      console.error("Add site error:", error);
      res.json({ success: false, error: error.message });
    }
  });

  // Commit verification file to repo
  app.post("/api/search-console/commit-verification", requireAuth, async (req, res) => {
    try {
      const { token, siteUrl } = req.body;
      
      if (!token) {
        return res.json({ success: false, error: "Verification token is required" });
      }

      const repo = await storage.getRepository();
      if (!repo) {
        return res.json({ success: false, error: "No repository connected" });
      }

      const octokit = await getGitHubClient();

      // Create verification file in public folder
      const filePath = `public/${token}`;
      const fileContent = `google-site-verification: ${token}`;

      // Check if file exists
      let sha: string | undefined;
      try {
        const { data } = await octokit.repos.getContent({
          owner: repo.owner,
          repo: repo.name,
          path: filePath,
          ref: repo.activeBranch,
        });
        if (!Array.isArray(data) && "sha" in data) {
          sha = data.sha;
        }
      } catch {
        // File doesn't exist, will create new
      }

      // Create or update verification file
      await octokit.repos.createOrUpdateFileContents({
        owner: repo.owner,
        repo: repo.name,
        path: filePath,
        message: "Add Google site verification file",
        content: Buffer.from(fileContent).toString("base64"),
        branch: repo.activeBranch,
        sha,
      });

      res.json({ 
        success: true, 
        message: "Verification file committed to repository. Deploy your site and then click 'Verify Site'.",
        filePath,
      });
    } catch (error: any) {
      console.error("Commit verification file error:", error);
      res.json({ success: false, error: error.message });
    }
  });

  return httpServer;
}

// Helper function to sync repository data
async function syncRepositoryData(owner: string, repo: string, branch: string) {
  const octokit = await getGitHubClient();

  // Get file tree
  const { data: tree } = await octokit.git.getTree({
    owner,
    repo,
    tree_sha: branch,
    recursive: "true",
  });

  const fileTree = buildFileTree(
    tree.tree
      .filter(item => item.path && item.type)
      .map(item => ({ path: item.path!, type: item.type! }))
  );
  await storage.setFileTree(fileTree);

  // Get blog posts
  const blogPosts: Post[] = [];
  const blogFiles = tree.tree.filter(
    item => item.path?.startsWith("src/content/blog/") && 
            (item.path.endsWith(".md") || item.path.endsWith(".mdx"))
  );

  for (const file of blogFiles) {
    try {
      const { data } = await octokit.repos.getContent({
        owner,
        repo,
        path: file.path!,
        ref: branch,
      });

      if (!Array.isArray(data) && "content" in data) {
        const content = Buffer.from(data.content, "base64").toString("utf-8");
        const post = parsePost(file.path!, content);
        if (post) {
          blogPosts.push(post);
        }
      }
    } catch (error) {
      console.error(`Failed to fetch post: ${file.path}`, error);
    }
  }

  await storage.setPosts(blogPosts);

  // Try to get theme config
  try {
    const { data } = await octokit.repos.getContent({
      owner,
      repo,
      path: "src/config/theme.json",
      ref: branch,
    });

    if (!Array.isArray(data) && "content" in data) {
      const content = Buffer.from(data.content, "base64").toString("utf-8");
      const theme = JSON.parse(content) as ThemeSettings;
      await storage.setTheme(theme);
    }
  } catch {
    // Theme config doesn't exist, use defaults
  }

  // Try to get site config
  try {
    const { data } = await octokit.repos.getContent({
      owner,
      repo,
      path: "src/config/site.json",
      ref: branch,
    });

    if (!Array.isArray(data) && "content" in data) {
      const content = Buffer.from(data.content, "base64").toString("utf-8");
      const config = JSON.parse(content) as SiteConfig;
      await storage.setSiteConfig(config);
    }
  } catch {
    // Site config doesn't exist, use defaults
  }

  // Try to get adsense config
  try {
    const { data } = await octokit.repos.getContent({
      owner,
      repo,
      path: "src/config/adsense.json",
      ref: branch,
    });

    if (!Array.isArray(data) && "content" in data) {
      const content = Buffer.from(data.content, "base64").toString("utf-8");
      const config = JSON.parse(content) as AdsenseConfig;
      await storage.setAdsenseConfig(config);
    }
  } catch {
    // AdSense config doesn't exist, use defaults
  }

  // Get static pages from src/pages directory
  const pageFiles = tree.tree.filter(
    item => item.path?.startsWith("src/pages/") && 
            item.path.endsWith(".astro") && 
            !item.path.includes("[") // Skip dynamic routes
  );

  const staticPages: StaticPage[] = pageFiles.map(file => {
    const path = file.path!;
    const name = path.split("/").pop()!.replace(".astro", "");
    return {
      path,
      name,
      title: name.replace(/-/g, " ").replace(/\b\w/g, l => l.toUpperCase()),
      description: "",
    };
  });

  await storage.setStaticPages(staticPages);
}

// Helper function to fetch all branches from the repository
async function fetchBranches(owner: string, repo: string) {
  const octokit = await getGitHubClient();
  const repository = await storage.getRepository();
  
  if (!repository) return;
  
  const { data: branches } = await octokit.repos.listBranches({
    owner,
    repo,
    per_page: 100,
  });
  
  const branchInfos: BranchInfo[] = branches.map(branch => {
    const isTemplate = branch.name === repository.defaultBranch;
    const domain = branch.name.startsWith("site-") 
      ? branch.name.replace(/^site-/, "").replace(/-/g, ".")
      : undefined;
    
    return {
      name: branch.name,
      domain,
      isTemplate,
      lastCommit: branch.commit.sha,
    };
  });
  
  await storage.setBranches(branchInfos);
}
