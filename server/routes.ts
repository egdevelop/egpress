import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import crypto from "crypto";
import multer from "multer";
import { storage, type SearchConsoleConfig, type IndexingStatus } from "./storage";
import { getGitHubClient, getAuthenticatedUser, isGitHubConnected, getGitHubConnectionInfo, setManualGitHubToken, clearManualToken } from "./github";
import { VercelService } from "./vercel";
import { generateBlogPost, generateImage, generateSEOContent } from "./gemini";
import { analyzePageSpeed, generateOptimizationRecommendations, generateAstroOptimizations, type PageSpeedResult, type OptimizationRecommendation } from "./pagespeed";
import { 
  // User-level settings (credentials shared across all repos)
  getUserSettings,
  saveUserSettings,
  updateUserGeminiKey,
  updateUserVercelToken,
  updateUserSearchConsoleCredentials,
  clearUserSearchConsoleCredentials,
  clearUserVercelToken,
  // Repository-level settings (per-repo linking)
  getRepositorySettings,
  saveRepositorySettings,
  updateRepositoryVercel,
  clearRepositoryVercel,
  updateRepositorySiteUrl,
  clearRepositorySiteUrl,
  updateRepositoryAdsense,
  // Indexing status persistence
  getIndexingStatusFromSupabase,
  saveIndexingStatusToSupabase,
  updateSingleIndexingStatus,
  type IndexingStatusEntry,
} from "./supabase";
import matter from "gray-matter";
import yaml from "yaml";
import { Octokit } from "@octokit/rest";
import { google } from "googleapis";
import type { Repository, Post, ThemeSettings, FileTreeItem, PageContent, SiteConfig, AdsenseConfig, StaticPage, BranchInfo, DraftChange } from "@shared/schema";
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

// Helper to check if Smart Deploy is enabled and changes should be queued
// Returns true if Smart Deploy is active and changes should be queued instead of committed
async function isSmartDeployActive(): Promise<boolean> {
  try {
    const settings = await storage.getSmartDeploySettings();
    return settings.enabled === true;
  } catch {
    return false;
  }
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
      featured: data.featured === true,
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
  
  // Handle featured - only include if true
  if (post.featured) {
    frontmatter.featured = true;
  } else {
    delete frontmatter.featured;
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
        
        // Load user-level settings from Supabase
        const userSettings = await getUserSettings(user.login);
        
        // If there are saved settings, restore them to storage
        if (userSettings) {
          if (userSettings.gemini_api_key) {
            await storage.setGeminiApiKey(userSettings.gemini_api_key);
          }
          if (userSettings.vercel_token) {
            await storage.setVercelConfig({
              token: userSettings.vercel_token,
              username: user.login,
            });
          }
          // Load Search Console service account (user-level)
          if (userSettings.search_console_service_account) {
            try {
              const parsed = JSON.parse(userSettings.search_console_service_account);
              await storage.setSearchConsoleConfig({
                serviceAccountJson: userSettings.search_console_service_account,
                clientEmail: parsed.client_email,
                privateKey: parsed.private_key,
                siteUrl: "", // Site URL is per-repo, loaded when connecting to repo
              });
            } catch (e) {
              console.warn("Failed to parse Search Console credentials");
            }
          }
        } else {
          // Create initial user settings record
          await saveUserSettings(user.login, token, {});
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
      
      // Load user-level settings from Supabase
      const userSettings = await getUserSettings(user.login);
      if (userSettings) {
        if (userSettings.gemini_api_key) {
          await storage.setGeminiApiKey(userSettings.gemini_api_key);
        }
        if (userSettings.vercel_token) {
          await storage.setVercelConfig({
            token: userSettings.vercel_token,
            username: user.login,
          });
        }
        // Load Search Console service account (user-level)
        if (userSettings.search_console_service_account) {
          try {
            const parsed = JSON.parse(userSettings.search_console_service_account);
            await storage.setSearchConsoleConfig({
              serviceAccountJson: userSettings.search_console_service_account,
              clientEmail: parsed.client_email,
              privateKey: parsed.private_key,
              siteUrl: "", // Site URL is per-repo, loaded when connecting to repo
            });
          } catch (e) {
            console.warn("Failed to parse Search Console credentials");
          }
        }
      } else {
        // Create initial user settings record
        await saveUserSettings(user.login, accessToken, {});
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

      // Load repository-specific settings from Supabase (per-repo linking data)
      const repoSettings = await getRepositorySettings(repoData.full_name);
      if (repoSettings) {
        // Load Vercel project linking (which project is linked to this repo)
        if (repoSettings.vercel_project_id) {
          await storage.setVercelProject({
            id: repoSettings.vercel_project_id,
            name: repoSettings.vercel_project_name || "",
            framework: "astro",
          });
        }
        // Load Search Console site URL (which site is linked to this repo)
        // The service account credentials come from user_settings (already loaded on login)
        const existingConfig = await storage.getSearchConsoleConfig();
        if (existingConfig && repoSettings.search_console_site_url) {
          await storage.setSearchConsoleConfig({
            ...existingConfig,
            siteUrl: repoSettings.search_console_site_url,
          });
        }
        // Load AdSense config (per-repo)
        if (repoSettings.adsense_publisher_id) {
          await storage.setAdsenseConfig({
            enabled: true,
            publisherId: repoSettings.adsense_publisher_id,
            autoAdsEnabled: false,
            slots: repoSettings.adsense_slots || {},
          });
        }
      } else if (req.session.githubUsername) {
        // Create initial repository settings record
        await saveRepositorySettings(
          repoData.full_name,
          req.session.githubUsername,
          {}
        );
      }

      // Auto-link Vercel project if Vercel is configured
      let vercelAutoLink = null;
      const vercelConfig = await storage.getVercelConfig();
      if (vercelConfig?.token) {
        try {
          const vercel = new VercelService(vercelConfig.token, vercelConfig.teamId);
          const linkResult = await vercel.autoLinkProject(parsed.owner, parsed.repo);
          
          // Save the linked project
          await storage.setVercelProject(linkResult.project);
          
          // Persist project linking to repository_settings
          if (req.session.githubUsername) {
            await updateRepositoryVercel(
              repoData.full_name,
              req.session.githubUsername,
              linkResult.project.id,
              vercelConfig.teamId,
              linkResult.project.name
            );
          }
          
          vercelAutoLink = {
            project: linkResult.project,
            isNew: linkResult.isNew,
            message: linkResult.message,
          };
        } catch (vercelError) {
          console.warn("Auto-link Vercel failed:", vercelError);
        }
      }

      res.json({ 
        success: true, 
        data: repository,
        vercelAutoLink,
      });
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

  // Delete site (GitHub repo + Vercel project)
  app.delete("/api/site", requireAuth, async (req, res) => {
    try {
      const repo = await storage.getRepository();
      if (!repo) {
        return res.json({ success: false, error: "No repository connected" });
      }

      const results = {
        githubDeleted: false,
        vercelDeleted: false,
        errors: [] as string[],
      };

      // Delete GitHub repository
      try {
        const octokit = await getGitHubClient();
        if (octokit) {
          await octokit.repos.delete({
            owner: repo.owner,
            repo: repo.name,
          });
          results.githubDeleted = true;
        }
      } catch (error: any) {
        results.errors.push(`GitHub: ${error.message || "Failed to delete repository"}`);
      }

      // Delete Vercel project if linked
      // First try memory storage, then fall back to Supabase
      let vercelToken: string | null = null;
      let vercelTeamId: string | undefined;
      let vercelProjectId: string | null = null;
      
      // Check memory storage first
      const vercelConfig = await storage.getVercelConfig();
      const vercelProject = await storage.getVercelProject();
      
      if (vercelConfig?.token) {
        vercelToken = vercelConfig.token;
        vercelTeamId = vercelConfig.teamId;
      }
      
      if (vercelProject?.id) {
        vercelProjectId = vercelProject.id;
      }
      
      // If not in memory, try Supabase
      if (!vercelToken || !vercelProjectId) {
        const username = req.session.githubUsername;
        if (username) {
          // Get Vercel token from user settings
          const userSettings = await getUserSettings(username);
          if (userSettings?.vercel_token && !vercelToken) {
            vercelToken = userSettings.vercel_token;
          }
          
          // Get Vercel project ID from repository settings
          const repoSettings = await getRepositorySettings(repo.fullName);
          if (repoSettings?.vercel_project_id && !vercelProjectId) {
            vercelProjectId = repoSettings.vercel_project_id;
            vercelTeamId = repoSettings.vercel_team_id || vercelTeamId;
          }
        }
      }
      
      if (vercelToken && vercelProjectId) {
        try {
          const vercel = new VercelService(vercelToken, vercelTeamId);
          await vercel.deleteProject(vercelProjectId);
          results.vercelDeleted = true;
          await storage.clearVercelProject();
          
          // Also clear from Supabase repository settings
          if (req.session.githubUsername) {
            await clearRepositoryVercel(repo.fullName);
          }
        } catch (error: any) {
          results.errors.push(`Vercel: ${error.message || "Failed to delete project"}`);
        }
      }

      // Clear local repository connection
      await storage.clearRepository();

      if (results.githubDeleted || results.vercelDeleted) {
        res.json({ 
          success: true, 
          data: results,
          message: `Deleted: ${results.githubDeleted ? "GitHub repo" : ""}${results.githubDeleted && results.vercelDeleted ? " and " : ""}${results.vercelDeleted ? "Vercel project" : ""}`
        });
      } else {
        res.json({ 
          success: false, 
          error: results.errors.join("; ") || "Failed to delete site",
          data: results 
        });
      }
    } catch (error: any) {
      res.json({ success: false, error: error.message || "Failed to delete site" });
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

      const { slug, title, description, pubDate, heroImage, author, category, tags, draft, featured, content, commitMessage, queueOnly } = req.body;
      
      const path = `src/content/blog/${slug}.md`;
      const fileContent = generatePostContent({
        slug, title, description, pubDate, heroImage, author, category, tags, draft, featured, content
      });

      // Build new raw frontmatter for the new post
      const newRawFrontmatter: Record<string, any> = { title, pubDate };
      if (description && description.trim()) newRawFrontmatter.description = description;
      if (heroImage && heroImage.trim()) newRawFrontmatter.heroImage = heroImage;
      if (author && author.trim()) newRawFrontmatter.author = author;
      if (category && category.trim()) newRawFrontmatter.category = category;
      if (tags && tags.length > 0) newRawFrontmatter.tags = tags;
      if (draft) newRawFrontmatter.draft = true;
      if (featured) newRawFrontmatter.featured = true;

      const newPost: Post = {
        path, slug, title, 
        description: description || "", 
        pubDate, 
        heroImage: heroImage || "", 
        author: author || undefined,
        category: category || "", 
        tags: tags || [], 
        draft: draft || false,
        featured: featured || false, 
        content,
        rawFrontmatter: newRawFrontmatter,
      };

      // Check if Smart Deploy is active - if so, force queue mode
      const smartDeployActive = await isSmartDeployActive();
      const shouldQueue = queueOnly || smartDeployActive;

      // Check if we should queue instead of commit
      if (shouldQueue) {
        // Add to draft queue instead of committing
        await storage.addDraftChange({
          id: crypto.randomUUID(),
          type: "post_create",
          title: `Create post: ${title}`,
          path,
          content: fileContent,
          metadata: { commitMessage: commitMessage || `Create post: ${title}` },
          createdAt: new Date().toISOString(),
        });

        // Update cache to reflect the pending change
        const posts = await storage.getPosts();
        posts.push(newPost);
        await storage.setPosts(posts);

        const queue = await storage.getDraftQueue();
        res.json({ success: true, data: newPost, queued: true, queueCount: queue?.changes.length || 0 });
      } else {
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

        // Update cache
        const posts = await storage.getPosts();
        posts.push(newPost);
        await storage.setPosts(posts);

        res.json({ success: true, data: newPost });
      }
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

      const { title, description, pubDate, heroImage, author, category, tags, draft, featured, content, commitMessage, queueOnly } = req.body;
      
      // Pass original frontmatter to preserve structure (author as object, custom fields)
      const fileContent = generatePostContent({
        slug: req.params.slug, title, description, pubDate, heroImage, author, category, tags, draft, featured, content
      }, existingPost.rawFrontmatter);

      // Rebuild rawFrontmatter based on what was actually written
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
        featured: featured || false, 
        content,
        rawFrontmatter: updatedRawFrontmatter,
      };

      // Check if Smart Deploy is active - if so, force queue mode
      const smartDeployActive = await isSmartDeployActive();
      const shouldQueue = queueOnly || smartDeployActive;

      // Check if we should queue instead of commit
      if (shouldQueue) {
        // Add to draft queue instead of committing
        await storage.addDraftChange({
          id: crypto.randomUUID(),
          type: "post_update",
          title: `Update post: ${title}`,
          path: existingPost.path,
          content: fileContent,
          metadata: { commitMessage: commitMessage || `Update post: ${title}` },
          createdAt: new Date().toISOString(),
        });

        // Update cache to reflect the pending change
        const posts = await storage.getPosts();
        const postIndex = posts.findIndex(p => p.slug === req.params.slug);
        if (postIndex >= 0) {
          posts[postIndex] = updatedPost;
          await storage.setPosts(posts);
        }

        const queue = await storage.getDraftQueue();
        res.json({ success: true, data: updatedPost, queued: true, queueCount: queue?.changes.length || 0 });
      } else {
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

        // Update cache
        const posts = await storage.getPosts();
        const postIndex = posts.findIndex(p => p.slug === req.params.slug);
        if (postIndex >= 0) {
          posts[postIndex] = updatedPost;
          await storage.setPosts(posts);
        }

        res.json({ success: true, data: updatedPost });
      }
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

      const { queueOnly } = req.query;

      // Check if Smart Deploy is active - if so, force queue mode
      const smartDeployActive = await isSmartDeployActive();
      const shouldQueue = queueOnly === 'true' || smartDeployActive;

      // Check if we should queue instead of commit
      if (shouldQueue) {
        // Add to draft queue instead of committing
        await storage.addDraftChange({
          id: crypto.randomUUID(),
          type: "post_delete",
          title: `Delete post: ${existingPost.title}`,
          path: existingPost.path,
          metadata: { commitMessage: `Delete post: ${existingPost.title}` },
          createdAt: new Date().toISOString(),
        });

        // Update cache to reflect the pending change
        const posts = await storage.getPosts();
        await storage.setPosts(posts.filter(p => p.slug !== req.params.slug));

        const queue = await storage.getDraftQueue();
        res.json({ success: true, queued: true, queueCount: queue?.changes.length || 0 });
      } else {
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
      }
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
      const { path, content, commitMessage, queueOnly } = req.body;
      
      if (!path || typeof content !== "string") {
        return res.json({ success: false, error: "Path and content are required" });
      }

      const repo = await storage.getRepository();
      if (!repo) {
        return res.json({ success: false, error: "No repository connected" });
      }

      // Check if Smart Deploy is active - if so, force queue mode
      const smartDeployActive = await isSmartDeployActive();
      const shouldQueue = queueOnly === true || smartDeployActive;

      // If queue mode, add to draft queue instead of committing
      if (shouldQueue) {
        const filename = path.split("/").pop() || path;
        const isStaticPage = path.startsWith("src/pages/");
        
        const draftChange: DraftChange = {
          id: crypto.randomUUID(),
          type: isStaticPage ? "static_page_update" : "file_update",
          title: `Update ${filename}`,
          path,
          content,
          operations: [
            {
              type: "write",
              path,
              content,
              encoding: "utf-8",
            },
          ],
          createdAt: new Date().toISOString(),
        };
        
        await storage.addDraftChange(draftChange);
        await storage.setFileContent(path, content);
        
        return res.json({ success: true, queued: true });
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

  // ============== IMAGE UPLOAD ==============
  
  // Configure multer for image uploads (memory storage, max 5MB)
  const allowedImageTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml'];
  const allowedExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg'];
  
  const imageUpload = multer({
    storage: multer.memoryStorage(),
    limits: {
      fileSize: 5 * 1024 * 1024, // 5MB max
    },
    fileFilter: (req, file, cb) => {
      const ext = file.originalname.toLowerCase().substring(file.originalname.lastIndexOf('.'));
      if (!allowedImageTypes.includes(file.mimetype) && !allowedExtensions.includes(ext)) {
        return cb(new Error('Only image files are allowed (jpg, jpeg, png, gif, webp, svg)'));
      }
      cb(null, true);
    },
  });

  // Upload image to GitHub repository
  app.post("/api/upload-image", requireAuth, imageUpload.single('file'), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ success: false, error: "No file uploaded" });
      }

      const repo = await storage.getRepository();
      if (!repo) {
        return res.status(400).json({ success: false, error: "No repository connected" });
      }

      const octokit = await getGitHubClient();
      
      // Get original filename and extension
      let originalName = req.file.originalname;
      const extIndex = originalName.lastIndexOf('.');
      const baseName = extIndex > 0 ? originalName.substring(0, extIndex) : originalName;
      const ext = extIndex > 0 ? originalName.substring(extIndex) : '';
      
      // Sanitize filename (remove special characters, spaces -> dashes)
      const sanitizedBaseName = baseName
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '');
      
      let finalFilename = `${sanitizedBaseName}${ext.toLowerCase()}`;
      let filePath = `public/image/${finalFilename}`;
      
      // Check if file exists and add timestamp suffix if needed
      let fileExists = true;
      let attempts = 0;
      while (fileExists && attempts < 10) {
        try {
          await octokit.repos.getContent({
            owner: repo.owner,
            repo: repo.name,
            path: filePath,
            ref: repo.activeBranch,
          });
          // File exists, add timestamp suffix
          const timestamp = Date.now();
          const randomSuffix = crypto.randomBytes(3).toString('hex');
          finalFilename = `${sanitizedBaseName}-${timestamp}-${randomSuffix}${ext.toLowerCase()}`;
          filePath = `public/image/${finalFilename}`;
          attempts++;
        } catch (error: any) {
          if (error.status === 404) {
            // File doesn't exist, we can use this path
            fileExists = false;
          } else {
            throw error;
          }
        }
      }
      
      if (attempts >= 10) {
        return res.status(500).json({ success: false, error: "Could not generate unique filename" });
      }
      
      // Upload file to GitHub
      const fileContent = req.file.buffer.toString('base64');
      const publicPath = `/image/${finalFilename}`;
      
      // Check if Smart Deploy is active - if so, force queue mode
      const smartDeployActive = await isSmartDeployActive();
      
      if (smartDeployActive) {
        // Queue the image upload
        const draftChange: DraftChange = {
          id: crypto.randomUUID(),
          type: "image_upload",
          title: `Upload image: ${finalFilename}`,
          path: filePath,
          content: fileContent,
          operations: [
            {
              type: "write",
              path: filePath,
              content: fileContent,
              encoding: "base64",
            },
          ],
          metadata: {
            publicPath,
            mimeType: req.file.mimetype,
          },
          createdAt: new Date().toISOString(),
        };
        
        await storage.addDraftChange(draftChange);
        
        return res.json({ 
          success: true, 
          path: publicPath,
          fullPath: filePath,
          filename: finalFilename,
          queued: true,
        });
      }
      
      await octokit.repos.createOrUpdateFileContents({
        owner: repo.owner,
        repo: repo.name,
        path: filePath,
        message: `Upload image: ${finalFilename}`,
        content: fileContent,
        branch: repo.activeBranch,
      });
      
      res.json({ 
        success: true, 
        path: publicPath,
        fullPath: filePath,
        filename: finalFilename,
      });
    } catch (error: any) {
      console.error("Image upload error:", error);
      
      // Handle multer errors
      if (error.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ success: false, error: "File size exceeds 5MB limit" });
      }
      
      res.status(500).json({ success: false, error: error.message || "Failed to upload image" });
    }
  });

  // Upload base64 image to GitHub (for AI-generated images)
  // Supports queueOnly mode for Smart Deploy and previousPath for replacing images
  app.post("/api/upload-image-base64", requireAuth, async (req, res) => {
    try {
      const { imageData, mimeType, filename, queueOnly, previousPath, isReplacement: forceReplacement, repoPath } = req.body;
      
      console.log("Upload base64 image request:", {
        hasImageData: !!imageData,
        imageDataLength: imageData?.length,
        mimeType,
        filename,
        queueOnly,
        previousPath,
      });
      
      if (!imageData) {
        return res.status(400).json({ success: false, error: "No image data provided" });
      }

      const repo = await storage.getRepository();
      if (!repo) {
        return res.status(400).json({ success: false, error: "No repository connected" });
      }

      const octokit = await getGitHubClient();
      
      // Determine extension from mimeType
      const extMap: Record<string, string> = {
        'image/png': '.png',
        'image/jpeg': '.jpg',
        'image/jpg': '.jpg',
        'image/gif': '.gif',
        'image/webp': '.webp',
      };
      const ext = extMap[mimeType] || '.png';
      
      let filePath: string;
      let finalFilename: string;
      
      // If repoPath is provided (for optimization), use it directly
      if (repoPath && forceReplacement) {
        // Security: sanitize path to prevent traversal attacks
        const sanitizedPath = repoPath
          .replace(/\.\.\//g, '')
          .replace(/\.\./g, '')
          .replace(/\/\//g, '/')
          .replace(/^\/+/, '')
          .replace(/\\/g, '/');
        
        // Ensure the resolved path is within public/image/
        if (!sanitizedPath.startsWith('public/image/')) {
          return res.status(400).json({ 
            success: false, 
            error: "Invalid image path - must be within public/image directory" 
          });
        }
        
        filePath = sanitizedPath;
        finalFilename = sanitizedPath.split('/').pop() || filename;
      } else if (filename && filename.includes('/')) {
        // Security: sanitize path to prevent traversal attacks
        const sanitizedPath = filename
          .replace(/\.\.\//g, '')         // Remove ../
          .replace(/\.\./g, '')           // Remove remaining ..
          .replace(/\/\//g, '/')          // Remove double slashes
          .replace(/^\/+/, '')            // Remove leading slashes
          .replace(/\\/g, '/');           // Normalize backslashes
        
        // Build the full path and validate it stays within allowed directory
        const normalizedPath = sanitizedPath.startsWith('public/') 
          ? sanitizedPath 
          : `public/${sanitizedPath}`;
        
        // Ensure the resolved path is strictly within public/image/
        if (!normalizedPath.startsWith('public/image/')) {
          return res.status(400).json({ 
            success: false, 
            error: "Invalid image path - must be within public/image directory" 
          });
        }
        
        // Ensure no traversal after the public/image prefix
        const pathAfterPrefix = normalizedPath.substring('public/image/'.length);
        if (pathAfterPrefix.includes('..') || pathAfterPrefix.startsWith('/')) {
          return res.status(400).json({ 
            success: false, 
            error: "Invalid image path - path traversal detected" 
          });
        }
        
        // Use the validated path
        filePath = normalizedPath;
        finalFilename = pathAfterPrefix.split('/').pop() || pathAfterPrefix;
      } else {
        // Generate unique filename for new uploads
        const baseName = filename || `ai-hero-image`;
        const sanitizedBaseName = baseName
          .toLowerCase()
          .replace(/[^a-z0-9]/g, '-')
          .replace(/-+/g, '-')
          .replace(/^-|-$/g, '');
        
        const timestamp = Date.now();
        const randomSuffix = crypto.randomBytes(3).toString('hex');
        finalFilename = `${sanitizedBaseName}-${timestamp}-${randomSuffix}${ext}`;
        filePath = `public/image/${finalFilename}`;
      }
      
      // Remove data URL prefix if present
      let base64Data = imageData;
      if (imageData.includes(',')) {
        base64Data = imageData.split(',')[1];
      }
      
      // Return the public path
      const publicPath = `/image/${finalFilename}`;
      
      // Check if Smart Deploy is active - if so, force queue mode
      const smartDeployActive = await isSmartDeployActive();
      const shouldQueue = queueOnly === true || smartDeployActive;
      
      // If queue mode, add to draft queue instead of committing
      if (shouldQueue) {
        // Determine change type based on whether we're replacing an existing image
        // forceReplacement is used when optimizing existing images (same path replacement)
        const isReplacement = forceReplacement || (previousPath && previousPath !== publicPath);
        const changeType = forceReplacement ? "image_optimize" : (isReplacement ? "image_replace" : "image_upload");
        
        // Build operations array for batch commit
        const operations: Array<{ type: "write" | "delete"; path: string; content?: string; encoding?: "utf-8" | "base64" }> = [];
        
        // If replacing, first delete the old image
        if (isReplacement && previousPath) {
          // Convert public path to repo path (e.g., /image/foo.jpg -> public/image/foo.jpg)
          const previousRepoPath = previousPath.startsWith('/image/') 
            ? `public${previousPath}` 
            : previousPath;
          operations.push({
            type: "delete",
            path: previousRepoPath,
          });
        }
        
        // Add the new image
        operations.push({
          type: "write",
          path: filePath,
          content: base64Data,
          encoding: "base64",
        });
        
        const draftChange: DraftChange = {
          id: crypto.randomUUID(),
          type: changeType as any,
          title: forceReplacement 
            ? `Optimize image: ${finalFilename}` 
            : (isReplacement ? `Replace image: ${finalFilename}` : `Upload image: ${finalFilename}`),
          path: filePath,
          content: base64Data,
          operations,
          metadata: {
            previousPath: previousPath || null,
            publicPath,
            mimeType,
            isOptimization: forceReplacement || false,
          },
          createdAt: new Date().toISOString(),
        };
        
        await storage.addDraftChange(draftChange);
        
        return res.json({ 
          success: true,
          queued: true,
          path: publicPath,
          fullPath: filePath,
          filename: finalFilename,
        });
      }
      
      // Immediate commit mode (default behavior)
      
      // If replacing, delete the old image first
      if (previousPath) {
        const previousRepoPath = previousPath.startsWith('/image/') 
          ? `public${previousPath}` 
          : previousPath;
        try {
          // Get the file SHA to delete it
          const { data: fileData } = await octokit.repos.getContent({
            owner: repo.owner,
            repo: repo.name,
            path: previousRepoPath,
            ref: repo.activeBranch,
          });
          
          if (!Array.isArray(fileData) && fileData.sha) {
            await octokit.repos.deleteFile({
              owner: repo.owner,
              repo: repo.name,
              path: previousRepoPath,
              message: `Delete replaced image: ${previousRepoPath.split('/').pop()}`,
              sha: fileData.sha,
              branch: repo.activeBranch,
            });
            console.log(`Deleted previous image: ${previousRepoPath}`);
          }
        } catch (error: any) {
          // If file doesn't exist, that's fine - just continue
          if (error.status !== 404) {
            console.error("Error deleting previous image:", error);
          }
        }
      }
      
      // Upload file to GitHub
      await octokit.repos.createOrUpdateFileContents({
        owner: repo.owner,
        repo: repo.name,
        path: filePath,
        message: previousPath 
          ? `Replace image: ${finalFilename}` 
          : `Upload AI-generated hero image: ${finalFilename}`,
        content: base64Data,
        branch: repo.activeBranch,
      });
      
      res.json({ 
        success: true, 
        path: publicPath,
        fullPath: filePath,
        filename: finalFilename,
      });
    } catch (error: any) {
      console.error("Base64 image upload error:", error);
      res.status(500).json({ success: false, error: error.message || "Failed to upload image" });
    }
  });

  // List all images in the repository (for bulk optimization)
  app.get("/api/images", requireAuth, async (req, res) => {
    try {
      const repo = await storage.getRepository();
      if (!repo) {
        return res.json({ success: false, error: "No repository connected" });
      }

      const octokit = await getGitHubClient();

      // Get the tree from the repository
      const { data: tree } = await octokit.git.getTree({
        owner: repo.owner,
        repo: repo.name,
        tree_sha: repo.activeBranch,
        recursive: "true",
      });

      // Filter for image files in public/image directory
      const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg'];
      const images = tree.tree
        .filter(item => {
          if (item.type !== 'blob' || !item.path) return false;
          const isInPublicImage = item.path.startsWith('public/image/') || item.path.startsWith('public/images/');
          const hasImageExtension = imageExtensions.some(ext => item.path!.toLowerCase().endsWith(ext));
          return isInPublicImage && hasImageExtension;
        })
        .map(item => ({
          path: item.path!,
          sha: item.sha,
          size: item.size || 0,
          publicPath: item.path!.replace(/^public/, ''),
          name: item.path!.split('/').pop() || '',
        }));

      res.json({ success: true, data: images });
    } catch (error: any) {
      console.error("List images error:", error);
      res.json({ success: false, error: error.message || "Failed to list images" });
    }
  });

  // Comprehensive performance analysis - detect unused assets, large images, etc.
  app.get("/api/performance/analyze", requireAuth, async (req, res) => {
    try {
      const repo = await storage.getRepository();
      if (!repo) {
        return res.json({ success: false, error: "No repository connected" });
      }

      const octokit = await getGitHubClient();

      // Get all images in the repository
      const { data: tree } = await octokit.git.getTree({
        owner: repo.owner,
        repo: repo.name,
        tree_sha: repo.activeBranch,
        recursive: "true",
      });

      const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg'];
      const allImages = tree.tree
        .filter(item => {
          if (item.type !== 'blob' || !item.path) return false;
          const isInPublicImage = item.path.startsWith('public/image/') || item.path.startsWith('public/images/');
          const hasImageExtension = imageExtensions.some(ext => item.path!.toLowerCase().endsWith(ext));
          return isInPublicImage && hasImageExtension;
        })
        .map(item => ({
          path: item.path!,
          sha: item.sha || '',
          size: item.size || 0,
          publicPath: item.path!.replace(/^public/, ''),
          name: item.path!.split('/').pop() || '',
        }));

      // Get all posts to find referenced images
      const posts = await storage.getPosts();
      const referencedImages = new Set<string>();

      // Check heroImage in all posts
      for (const post of posts) {
        if (post.heroImage) {
          // Normalize the path
          const normalizedPath = post.heroImage.startsWith('/') 
            ? post.heroImage 
            : `/${post.heroImage}`;
          referencedImages.add(normalizedPath);
          
          // Also check for markdown content image references
          if (post.content) {
            const imageMatches = post.content.match(/!\[.*?\]\((\/image\/[^)]+)\)/g) || [];
            for (const match of imageMatches) {
              const pathMatch = match.match(/\((\/image\/[^)]+)\)/);
              if (pathMatch) {
                referencedImages.add(pathMatch[1]);
              }
            }
            
            // Also check HTML img tags
            const imgTagMatches = post.content.match(/src=["'](\/image\/[^"']+)["']/g) || [];
            for (const match of imgTagMatches) {
              const pathMatch = match.match(/src=["'](\/image\/[^"']+)["']/);
              if (pathMatch) {
                referencedImages.add(pathMatch[1]);
              }
            }
          }
        }
      }

      // Try to get site settings to check for logo, favicon, ogImage
      try {
        const siteSettingsFile = await octokit.repos.getContent({
          owner: repo.owner,
          repo: repo.name,
          path: "src/config/siteSettings.ts",
          ref: repo.activeBranch,
        });

        if (!Array.isArray(siteSettingsFile.data) && "content" in siteSettingsFile.data) {
          const content = Buffer.from(siteSettingsFile.data.content, "base64").toString("utf-8");
          
          // Find image paths in settings
          const settingsImageMatches = content.match(/["'](\/image\/[^"']+)["']/g) || [];
          for (const match of settingsImageMatches) {
            const pathMatch = match.match(/["'](\/image\/[^"']+)["']/);
            if (pathMatch) {
              referencedImages.add(pathMatch[1]);
            }
          }
        }
      } catch (e) {
        // Settings file not found, continue
      }

      // Categorize images
      const unusedImages: typeof allImages = [];
      const usedImages: typeof allImages = [];
      const largeImages: typeof allImages = [];
      const optimizableImages: typeof allImages = [];

      const LARGE_SIZE_THRESHOLD = 500 * 1024; // 500KB
      const NEEDS_OPTIMIZATION_THRESHOLD = 200 * 1024; // 200KB

      for (const image of allImages) {
        const isUsed = referencedImages.has(image.publicPath) || 
                       referencedImages.has(image.publicPath.replace(/^\//, ''));
        
        if (isUsed) {
          usedImages.push(image);
        } else {
          unusedImages.push(image);
        }

        if (image.size > LARGE_SIZE_THRESHOLD) {
          largeImages.push(image);
        }

        // Check if image needs optimization (large and not SVG)
        if (image.size > NEEDS_OPTIMIZATION_THRESHOLD && !image.name.toLowerCase().endsWith('.svg')) {
          optimizableImages.push(image);
        }
      }

      // Calculate totals
      const totalSize = allImages.reduce((sum, img) => sum + img.size, 0);
      const unusedSize = unusedImages.reduce((sum, img) => sum + img.size, 0);
      const potentialSavings = optimizableImages.reduce((sum, img) => sum + Math.floor(img.size * 0.6), 0); // Estimate 60% savings

      res.json({
        success: true,
        data: {
          summary: {
            totalImages: allImages.length,
            totalSize,
            unusedCount: unusedImages.length,
            unusedSize,
            largeCount: largeImages.length,
            optimizableCount: optimizableImages.length,
            potentialSavings,
          },
          unusedImages,
          usedImages,
          largeImages,
          optimizableImages,
          referencedPaths: Array.from(referencedImages),
        },
      });
    } catch (error: any) {
      console.error("Performance analysis error:", error);
      res.json({ success: false, error: error.message || "Failed to analyze performance" });
    }
  });

  // Delete unused assets (batch delete through Smart Deploy)
  app.post("/api/performance/cleanup", requireAuth, async (req, res) => {
    try {
      const { imagePaths, queueOnly } = req.body;
      
      if (!imagePaths || !Array.isArray(imagePaths) || imagePaths.length === 0) {
        return res.status(400).json({ success: false, error: "No image paths provided" });
      }

      const repo = await storage.getRepository();
      if (!repo) {
        return res.json({ success: false, error: "No repository connected" });
      }

      // Validate all paths are within public/image
      for (const imagePath of imagePaths) {
        const normalizedPath = imagePath.startsWith('public/') ? imagePath : `public${imagePath}`;
        if (!normalizedPath.startsWith('public/image/') && !normalizedPath.startsWith('public/images/')) {
          return res.status(400).json({ 
            success: false, 
            error: `Invalid path: ${imagePath} - must be within public/image directory` 
          });
        }
        // Extra path traversal check
        if (normalizedPath.includes('..')) {
          return res.status(400).json({ 
            success: false, 
            error: `Invalid path: ${imagePath} - path traversal not allowed` 
          });
        }
      }

      // Re-verify these are actually unused by running analysis
      const octokit = await getGitHubClient();
      const posts = await storage.getPosts();
      const referencedImages = new Set<string>();

      // Check heroImage and content in all posts
      for (const post of posts) {
        if (post.heroImage) {
          const normalizedPath = post.heroImage.startsWith('/') 
            ? post.heroImage 
            : `/${post.heroImage}`;
          referencedImages.add(normalizedPath);
          referencedImages.add(normalizedPath.replace(/^\//, ''));
        }
        if (post.content) {
          const imageMatches = post.content.match(/!\[.*?\]\((\/image\/[^)]+)\)/g) || [];
          for (const match of imageMatches) {
            const pathMatch = match.match(/\((\/image\/[^)]+)\)/);
            if (pathMatch) {
              referencedImages.add(pathMatch[1]);
              referencedImages.add(pathMatch[1].replace(/^\//, ''));
            }
          }
          const imgTagMatches = post.content.match(/src=["'](\/image\/[^"']+)["']/g) || [];
          for (const match of imgTagMatches) {
            const pathMatch = match.match(/src=["'](\/image\/[^"']+)["']/);
            if (pathMatch) {
              referencedImages.add(pathMatch[1]);
              referencedImages.add(pathMatch[1].replace(/^\//, ''));
            }
          }
        }
      }

      // Check site settings
      try {
        const siteSettingsFile = await octokit.repos.getContent({
          owner: repo.owner,
          repo: repo.name,
          path: "src/config/siteSettings.ts",
          ref: repo.activeBranch,
        });

        if (!Array.isArray(siteSettingsFile.data) && "content" in siteSettingsFile.data) {
          const content = Buffer.from(siteSettingsFile.data.content, "base64").toString("utf-8");
          const settingsImageMatches = content.match(/["'](\/image\/[^"']+)["']/g) || [];
          for (const match of settingsImageMatches) {
            const pathMatch = match.match(/["'](\/image\/[^"']+)["']/);
            if (pathMatch) {
              referencedImages.add(pathMatch[1]);
              referencedImages.add(pathMatch[1].replace(/^\//, ''));
            }
          }
        }
      } catch (e) {
        // Settings file not found, continue
      }

      // Filter to only actually unused paths
      const verifiedUnusedPaths: string[] = [];
      const stillUsedPaths: string[] = [];
      
      for (const imagePath of imagePaths) {
        const publicPath = imagePath.startsWith('/') ? imagePath : `/${imagePath}`;
        const isUsed = referencedImages.has(publicPath) || 
                       referencedImages.has(publicPath.replace(/^\//, ''));
        
        if (isUsed) {
          stillUsedPaths.push(imagePath);
        } else {
          verifiedUnusedPaths.push(imagePath);
        }
      }

      if (stillUsedPaths.length > 0) {
        console.warn(`Cleanup blocked ${stillUsedPaths.length} paths that are still in use:`, stillUsedPaths);
      }

      if (verifiedUnusedPaths.length === 0) {
        return res.json({
          success: false,
          error: "All requested paths are still in use and cannot be deleted",
          stillUsedPaths,
        });
      }

      if (queueOnly === true) {
        // Add to Smart Deploy queue - use verified paths only
        const operations: Array<{ type: "delete"; path: string }> = verifiedUnusedPaths.map(imagePath => ({
          type: "delete" as const,
          path: imagePath.startsWith('public/') ? imagePath : `public${imagePath}`,
        }));

        const draftChange: DraftChange = {
          id: crypto.randomUUID(),
          type: "image_delete",
          title: `Delete ${verifiedUnusedPaths.length} unused asset${verifiedUnusedPaths.length > 1 ? 's' : ''}`,
          path: operations[0].path,
          operations,
          metadata: {
            deletedPaths: verifiedUnusedPaths,
            count: verifiedUnusedPaths.length,
            blockedPaths: stillUsedPaths.length > 0 ? stillUsedPaths : undefined,
          },
          createdAt: new Date().toISOString(),
        };

        await storage.addDraftChange(draftChange);

        return res.json({
          success: true,
          queued: true,
          deletedCount: verifiedUnusedPaths.length,
          blockedCount: stillUsedPaths.length,
          message: `Queued ${verifiedUnusedPaths.length} asset${verifiedUnusedPaths.length > 1 ? 's' : ''} for deletion${stillUsedPaths.length > 0 ? ` (${stillUsedPaths.length} still in use, skipped)` : ''}`,
        });
      }

      // Direct delete (not queued) - use verified paths only
      let deletedCount = 0;
      const errors: string[] = [];

      for (const imagePath of verifiedUnusedPaths) {
        const repoPath = imagePath.startsWith('public/') ? imagePath : `public${imagePath}`;
        
        try {
          // Get file SHA
          const { data: fileData } = await octokit.repos.getContent({
            owner: repo.owner,
            repo: repo.name,
            path: repoPath,
            ref: repo.activeBranch,
          });

          if (!Array.isArray(fileData) && fileData.sha) {
            await octokit.repos.deleteFile({
              owner: repo.owner,
              repo: repo.name,
              path: repoPath,
              message: `Delete unused asset: ${repoPath.split('/').pop()}`,
              sha: fileData.sha,
              branch: repo.activeBranch,
            });
            deletedCount++;
          }
        } catch (err: any) {
          errors.push(`Failed to delete ${repoPath}: ${err.message}`);
        }
      }

      res.json({
        success: true,
        deletedCount,
        blockedCount: stillUsedPaths.length,
        errors: errors.length > 0 ? errors : undefined,
      });
    } catch (error: any) {
      console.error("Cleanup error:", error);
      res.json({ success: false, error: error.message || "Failed to cleanup assets" });
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
      const { theme, commitMessage, queueOnly } = req.body;
      
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
      let updatedCssContent = "";
      let cssFileSha: string | undefined;
      
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
              cssUpdated = true;
              cssPath = filePath;
              updatedCssContent = cssContent;
              cssFileSha = data.sha;
              console.log(`Generated CSS updates for ${filePath}:`, updatedVars);
              break;
            }
          }
        } catch (err) {
          // Try next file
          console.log(`CSS file not found: ${filePath}`);
        }
      }

      // Check if Smart Deploy is active - if so, force queue mode
      const smartDeployActive = await isSmartDeployActive();
      const shouldQueue = queueOnly === true || smartDeployActive;

      // If queue mode, add to draft queue instead of committing
      if (shouldQueue) {
        if (!cssUpdated) {
          return res.json({ 
            success: false, 
            error: "No CSS file found or no matching variables to update" 
          });
        }

        const draftChange: DraftChange = {
          id: crypto.randomUUID(),
          type: "theme_update",
          title: "Update theme colors",
          path: cssPath,
          content: updatedCssContent,
          operations: [
            {
              type: "write",
              path: cssPath,
              content: updatedCssContent,
              encoding: "utf-8",
            },
          ],
          metadata: {
            updatedVars,
            theme,
          },
          createdAt: new Date().toISOString(),
        };

        await storage.addDraftChange(draftChange);
        await storage.setTheme(theme);

        return res.json({ 
          success: true, 
          queued: true,
          cssPath,
          updatedVars,
        });
      }

      // Immediate commit behavior (default)
      if (cssUpdated && cssFileSha) {
        await octokit.repos.createOrUpdateFileContents({
          owner: repo.owner,
          repo: repo.name,
          path: cssPath,
          message: commitMessage || "Update theme colors",
          content: Buffer.from(updatedCssContent).toString("base64"),
          sha: cssFileSha,
          branch: repo.activeBranch,
        });
        console.log(`Committed CSS variables update to ${cssPath}`);
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

      // Check if Smart Deploy is active - if so, force queue mode
      const smartDeployActive = await isSmartDeployActive();
      const shouldQueue = req.body.queueOnly === true || smartDeployActive;

      if (shouldQueue) {
        const draftChange: DraftChange = {
          id: crypto.randomUUID(),
          type: "settings_update",
          title: "Update site configuration",
          path,
          content: configContent,
          operations: [
            {
              type: "write",
              path,
              content: configContent,
              encoding: "utf-8",
            },
          ],
          createdAt: new Date().toISOString(),
        };

        await storage.addDraftChange(draftChange);
        await storage.setSiteConfig(config);

        return res.json({ success: true, data: config, queued: true });
      }

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

      const { siteName, logoLetter, description, socialLinks, queueOnly } = req.body;
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

      // Prepare updated content
      let updatedHeaderContent = headerContent;
      let updatedFooterContent = footerContent;

      // Update Header.astro content
      if (headerContent && siteName) {
        updatedHeaderContent = headerContent.replace(
          /(<span class="text-xl font-bold[^"]*">)[^<]+(<\/span>)/g,
          `$1${siteName}$2`
        );
        if (logoLetter) {
          updatedHeaderContent = updatedHeaderContent.replace(
            /(<span class="text-white font-bold[^"]*">)[^<]+(<\/span>)/g,
            `$1${logoLetter}$2`
          );
        }
      }

      // Update Footer.astro content
      if (footerContent) {
        updatedFooterContent = footerContent;
        if (siteName) {
          updatedFooterContent = updatedFooterContent.replace(
            /(<span class="text-xl font-bold text-white">)[^<]+(<\/span>)/g,
            `$1${siteName}$2`
          );
          updatedFooterContent = updatedFooterContent.replace(
            /(&copy; \{currentYear\} )[^.]+(\. All rights reserved\.)/g,
            `$1${siteName}$2`
          );
        }
        if (description !== undefined) {
          updatedFooterContent = updatedFooterContent.replace(
            /(<p class="text-sm text-gray-400 mb-4">)\s*[^<]+(<\/p>)/,
            `$1\n          ${description}\n        $2`
          );
        }
        if (socialLinks) {
          if (socialLinks.twitter) {
            updatedFooterContent = updatedFooterContent.replace(
              /(\{\s*href:\s*['"])[^'"]+(['"],\s*label:\s*['"]Twitter['"])/,
              `$1${socialLinks.twitter}$2`
            );
          }
          if (socialLinks.linkedin) {
            updatedFooterContent = updatedFooterContent.replace(
              /(\{\s*href:\s*['"])[^'"]+(['"],\s*label:\s*['"]LinkedIn['"])/,
              `$1${socialLinks.linkedin}$2`
            );
          }
          if (socialLinks.facebook) {
            updatedFooterContent = updatedFooterContent.replace(
              /(\{\s*href:\s*['"])[^'"]+(['"],\s*label:\s*['"]Facebook['"])/,
              `$1${socialLinks.facebook}$2`
            );
          }
        }
      }

      // Check if Smart Deploy is active - if so, force queue mode
      const smartDeployActive = await isSmartDeployActive();
      const shouldQueue = queueOnly === true || smartDeployActive;

      if (shouldQueue) {
        // Build operations array for batch commit
        const operations: Array<{ type: "write" | "delete"; path: string; content?: string; encoding?: "utf-8" | "base64" }> = [];
        
        if (updatedHeaderContent !== headerContent) {
          operations.push({
            type: "write",
            path: "src/components/Header.astro",
            content: updatedHeaderContent,
            encoding: "utf-8",
          });
        }
        if (updatedFooterContent !== footerContent) {
          operations.push({
            type: "write",
            path: "src/components/Footer.astro",
            content: updatedFooterContent,
            encoding: "utf-8",
          });
        }

        if (operations.length > 0) {
          const draftChange: DraftChange = {
            id: crypto.randomUUID(),
            type: "settings_update",
            title: "Update branding",
            path: "src/components/Header.astro",
            content: updatedHeaderContent,
            operations,
            createdAt: new Date().toISOString(),
          };

          await storage.addDraftChange(draftChange);
        }

        return res.json({ success: true, queued: true });
      }

      // Immediate commit mode
      if (updatedHeaderContent !== headerContent) {
        await octokit.repos.createOrUpdateFileContents({
          owner: repo.owner,
          repo: repo.name,
          path: "src/components/Header.astro",
          message: "Update Header branding",
          content: Buffer.from(updatedHeaderContent).toString("base64"),
          sha: headerSha,
          branch: repo.activeBranch,
        });
      }

      if (updatedFooterContent !== footerContent) {
        await octokit.repos.createOrUpdateFileContents({
          owner: repo.owner,
          repo: repo.name,
          path: "src/components/Footer.astro",
          message: "Update Footer branding",
          content: Buffer.from(updatedFooterContent).toString("base64"),
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
      
      // Extract full designTokens (colors, typography, spacing, borderRadius, shadows)
      const designTokensProp = findProperty(rootObj, 'designTokens');
      let designTokens: Record<string, any> = {
        colors: { text: {} },
        typography: {
          fontFamily: {},
          fontSize: {},
          fontWeight: {},
          lineHeight: {}
        },
        spacing: {},
        borderRadius: {},
        shadows: {}
      };
      
      if (designTokensProp) {
        const designTokensObj = designTokensProp.getInitializer();
        if (designTokensObj?.isKind(SyntaxKind.ObjectLiteralExpression)) {
          const designTokensLiteral = designTokensObj as ObjectLiteralExpression;
          
          // Extract colors
          const colorsProp = findProperty(designTokensLiteral, 'colors');
          if (colorsProp) {
            const colorsValue = extractNodeValue(colorsProp.getInitializer());
            if (colorsValue && typeof colorsValue === 'object') {
              designTokens.colors = colorsValue;
            }
          }
          
          // Extract typography
          const typographyProp = findProperty(designTokensLiteral, 'typography');
          if (typographyProp) {
            const typographyValue = extractNodeValue(typographyProp.getInitializer());
            if (typographyValue && typeof typographyValue === 'object') {
              designTokens.typography = typographyValue;
            }
          }
          
          // Extract spacing
          const spacingProp = findProperty(designTokensLiteral, 'spacing');
          if (spacingProp) {
            const spacingValue = extractNodeValue(spacingProp.getInitializer());
            if (spacingValue && typeof spacingValue === 'object') {
              designTokens.spacing = spacingValue;
            }
          }
          
          // Extract borderRadius
          const borderRadiusProp = findProperty(designTokensLiteral, 'borderRadius');
          if (borderRadiusProp) {
            const borderRadiusValue = extractNodeValue(borderRadiusProp.getInitializer());
            if (borderRadiusValue && typeof borderRadiusValue === 'object') {
              designTokens.borderRadius = borderRadiusValue;
            }
          }
          
          // Extract shadows
          const shadowsProp = findProperty(designTokensLiteral, 'shadows');
          if (shadowsProp) {
            const shadowsValue = extractNodeValue(shadowsProp.getInitializer());
            if (shadowsValue && typeof shadowsValue === 'object') {
              designTokens.shadows = shadowsValue;
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
        designTokens,
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
  
  // Helper function to update a number value in a property
  function updateNumberProperty(prop: PropertyAssignment, newValue: number): void {
    const initializer = prop.getInitializer();
    if (initializer?.isKind(SyntaxKind.NumericLiteral) || initializer?.isKind(SyntaxKind.PrefixUnaryExpression)) {
      initializer.replaceWithText(String(newValue));
    }
  }
  
  // Helper to recursively update properties in an object, handling nested objects and numbers
  function updateNestedPropertiesWithNumbers(obj: ObjectLiteralExpression, updates: Record<string, any>): void {
    for (const [key, value] of Object.entries(updates)) {
      const prop = findProperty(obj, key);
      if (!prop) continue;
      
      if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
        // Handle nested object recursively
        const nestedObj = prop.getInitializer();
        if (nestedObj?.isKind(SyntaxKind.ObjectLiteralExpression)) {
          updateNestedPropertiesWithNumbers(nestedObj as ObjectLiteralExpression, value);
        }
      } else if (typeof value === 'string') {
        updateStringProperty(prop, value);
      } else if (typeof value === 'boolean') {
        updateBooleanProperty(prop, value);
      } else if (typeof value === 'number') {
        updateNumberProperty(prop, value);
      }
    }
  }
  
  // Helper function to update all designTokens in siteSettings.ts content using AST
  function updateDesignTokensInTS(content: string, designTokens: Record<string, any>): string {
    try {
      const project = new Project({ useInMemoryFileSystem: true });
      const sourceFile = project.createSourceFile('temp.ts', content);
      
      // Get the root config object (handles both plain and factory-wrapped exports)
      const rootObj = getRootConfigObject(sourceFile);
      if (!rootObj) return content;
      
      // Navigate to designTokens
      const designTokensProp = findProperty(rootObj, 'designTokens');
      if (!designTokensProp) return content;
      
      const designTokensObj = designTokensProp.getInitializer();
      if (!designTokensObj?.isKind(SyntaxKind.ObjectLiteralExpression)) return content;
      
      const designTokensLiteral = designTokensObj as ObjectLiteralExpression;
      
      // Update colors if provided
      if (designTokens.colors) {
        const colorsProp = findProperty(designTokensLiteral, 'colors');
        if (colorsProp) {
          const colorsObj = colorsProp.getInitializer();
          if (colorsObj?.isKind(SyntaxKind.ObjectLiteralExpression)) {
            updateNestedProperties(colorsObj as ObjectLiteralExpression, designTokens.colors);
          }
        }
      }
      
      // Update typography if provided
      if (designTokens.typography) {
        const typographyProp = findProperty(designTokensLiteral, 'typography');
        if (typographyProp) {
          const typographyObj = typographyProp.getInitializer();
          if (typographyObj?.isKind(SyntaxKind.ObjectLiteralExpression)) {
            updateNestedPropertiesWithNumbers(typographyObj as ObjectLiteralExpression, designTokens.typography);
          }
        }
      }
      
      // Update spacing if provided
      if (designTokens.spacing) {
        const spacingProp = findProperty(designTokensLiteral, 'spacing');
        if (spacingProp) {
          const spacingObj = spacingProp.getInitializer();
          if (spacingObj?.isKind(SyntaxKind.ObjectLiteralExpression)) {
            updateNestedProperties(spacingObj as ObjectLiteralExpression, designTokens.spacing);
          }
        }
      }
      
      // Update borderRadius if provided
      if (designTokens.borderRadius) {
        const borderRadiusProp = findProperty(designTokensLiteral, 'borderRadius');
        if (borderRadiusProp) {
          const borderRadiusObj = borderRadiusProp.getInitializer();
          if (borderRadiusObj?.isKind(SyntaxKind.ObjectLiteralExpression)) {
            updateNestedProperties(borderRadiusObj as ObjectLiteralExpression, designTokens.borderRadius);
          }
        }
      }
      
      // Update shadows if provided
      if (designTokens.shadows) {
        const shadowsProp = findProperty(designTokensLiteral, 'shadows');
        if (shadowsProp) {
          const shadowsObj = shadowsProp.getInitializer();
          if (shadowsObj?.isKind(SyntaxKind.ObjectLiteralExpression)) {
            updateNestedProperties(shadowsObj as ObjectLiteralExpression, designTokens.shadows);
          }
        }
      }
      
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

      const { designTokens, siteSettings, commitMessage, queueOnly } = req.body;
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

      // Update design tokens (colors, typography, spacing, borderRadius, shadows)
      if (designTokens) {
        content = updateDesignTokensInTS(content, designTokens);
      }

      // Update site settings
      if (siteSettings) {
        content = updateSiteSettingsInTS(content, siteSettings);
      }

      // Only process if content changed
      if (content !== originalContent) {
        // Check if Smart Deploy is active - if so, force queue mode
        const smartDeployActive = await isSmartDeployActive();
        const shouldQueue = queueOnly === true || smartDeployActive;

        // If queue mode, add to draft queue instead of committing
        if (shouldQueue) {
          const draftChange: DraftChange = {
            id: crypto.randomUUID(),
            type: "settings_update",
            title: "Update site settings",
            path: filePath,
            content: content,
            operations: [
              {
                type: "write",
                path: filePath,
                content: content,
                encoding: "utf-8",
              },
            ],
            metadata: {
              commitMessage: commitMessage || "Update site settings",
              designTokens,
              siteSettings,
            },
            createdAt: new Date().toISOString(),
          };

          await storage.addDraftChange(draftChange);

          return res.json({ 
            success: true, 
            queued: true,
            filePath
          });
        }

        // Immediate commit behavior (default)
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

  // ============== CONTENT DEFAULTS (New Template) ==============
  // For template-egpress-v1 contentDefaults section in siteSettings.ts

  // Parse contentDefaults from siteSettings.ts
  function parseContentDefaultsTS(content: string): any {
    try {
      const project = new Project({ useInMemoryFileSystem: true });
      const sourceFile = project.createSourceFile('temp.ts', content);
      
      const rootObj = getRootConfigForParsing(sourceFile);
      if (!rootObj) {
        console.error("Could not find root config object in siteSettings.ts");
        return null;
      }
      
      // Extract contentDefaults
      const contentDefaultsProp = findProperty(rootObj, 'contentDefaults');
      let contentDefaults: Record<string, any> = {
        navigation: {
          header: [],
          footer: []
        },
        socialLinks: [],
        homepage: {
          heroTitle: "",
          heroSubtitle: "",
          featuredSectionTitle: "",
          latestSectionTitle: ""
        },
        blog: {
          title: "",
          description: "",
          emptyStateMessage: ""
        },
        categories: []
      };
      
      if (contentDefaultsProp) {
        const contentDefaultsValue = extractNodeValue(contentDefaultsProp.getInitializer());
        if (contentDefaultsValue && typeof contentDefaultsValue === 'object') {
          contentDefaults = { ...contentDefaults, ...contentDefaultsValue };
        }
      }
      
      return contentDefaults;
    } catch (error) {
      console.error("Error parsing contentDefaults:", error);
      return null;
    }
  }

  // Helper to convert a value to TypeScript literal string
  function valueToTSLiteral(value: any, indent: string = '    '): string {
    if (value === null || value === undefined) {
      return 'undefined';
    }
    if (typeof value === 'string') {
      const escaped = value.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
      return `'${escaped}'`;
    }
    if (typeof value === 'number') {
      return String(value);
    }
    if (typeof value === 'boolean') {
      return String(value);
    }
    if (Array.isArray(value)) {
      if (value.length === 0) return '[]';
      const items = value.map(item => valueToTSLiteral(item, indent + '  ')).join(',\n' + indent + '  ');
      return `[\n${indent}  ${items}\n${indent}]`;
    }
    if (typeof value === 'object') {
      const entries = Object.entries(value);
      if (entries.length === 0) return '{}';
      const props = entries
        .map(([k, v]) => `${k}: ${valueToTSLiteral(v, indent + '  ')}`)
        .join(',\n' + indent + '  ');
      return `{\n${indent}  ${props}\n${indent}}`;
    }
    return String(value);
  }

  // Update contentDefaults in siteSettings.ts using AST
  function updateContentDefaultsInTS(content: string, contentDefaults: Record<string, any>): string {
    try {
      const project = new Project({ useInMemoryFileSystem: true });
      const sourceFile = project.createSourceFile('temp.ts', content);
      
      const rootObj = getRootConfigObject(sourceFile);
      if (!rootObj) return content;
      
      const contentDefaultsProp = findProperty(rootObj, 'contentDefaults');
      if (!contentDefaultsProp) return content;
      
      const contentDefaultsObj = contentDefaultsProp.getInitializer();
      if (!contentDefaultsObj?.isKind(SyntaxKind.ObjectLiteralExpression)) return content;
      
      const cdLiteral = contentDefaultsObj as ObjectLiteralExpression;
      
      // Update each section of contentDefaults
      for (const [key, value] of Object.entries(contentDefaults)) {
        const prop = findProperty(cdLiteral, key);
        if (!prop) continue;
        
        // For arrays and objects, replace the entire initializer
        if (Array.isArray(value) || (typeof value === 'object' && value !== null)) {
          const newValue = valueToTSLiteral(value, '      ');
          prop.getInitializer()?.replaceWithText(newValue);
        } else if (typeof value === 'string') {
          updateStringProperty(prop, value);
        } else if (typeof value === 'boolean') {
          updateBooleanProperty(prop, value);
        }
      }
      
      return sourceFile.getFullText();
    } catch (error) {
      console.error('Error in updateContentDefaultsInTS:', error);
      return content;
    }
  }

  // Get content defaults from siteSettings.ts
  app.get("/api/content-defaults", requireAuth, async (req, res) => {
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
          const contentDefaults = parseContentDefaultsTS(content);
          
          if (contentDefaults) {
            res.json({ 
              success: true, 
              data: contentDefaults,
              source: filePath
            });
          } else {
            res.json({ 
              success: false, 
              error: "Could not parse contentDefaults from siteSettings.ts"
            });
          }
        } else {
          res.json({ success: false, error: "Invalid file response" });
        }
      } catch (err: any) {
        if (err.status === 404) {
          res.json({ 
            success: false, 
            error: "siteSettings.ts not found - this may not be an egpress-v1 template"
          });
        } else {
          throw err;
        }
      }
    } catch (error: any) {
      console.error("Get content defaults error:", error);
      res.json({ success: false, error: error.message || "Failed to get content defaults" });
    }
  });

  // Update content defaults in siteSettings.ts
  app.put("/api/content-defaults", requireAuth, async (req, res) => {
    try {
      const repo = await storage.getRepository();
      if (!repo) {
        return res.json({ success: false, error: "No repository connected" });
      }

      const { contentDefaults, commitMessage, queueOnly } = req.body;
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

      // Update content defaults
      if (contentDefaults) {
        content = updateContentDefaultsInTS(content, contentDefaults);
      }

      // Only process if content changed
      if (content !== originalContent) {
        // Check if Smart Deploy is active - if so, force queue mode
        const smartDeployActive = await isSmartDeployActive();
        const shouldQueue = queueOnly === true || smartDeployActive;

        // If queue mode, add to draft queue instead of committing
        if (shouldQueue) {
          const draftChange: DraftChange = {
            id: crypto.randomUUID(),
            type: "content_defaults_update",
            title: "Update content defaults",
            path: filePath,
            content: content,
            previousContent: originalContent,
            operations: [{
              type: "write",
              path: filePath,
              content: content,
              encoding: "utf-8",
            }],
            metadata: {
              commitMessage: commitMessage || "Update content defaults",
            },
            createdAt: new Date().toISOString(),
          };

          await storage.addDraftChange(draftChange);

          return res.json({ 
            success: true, 
            queued: true,
            message: "Content defaults changes queued for batch deploy",
            filePath
          });
        }

        // Immediate commit (default behavior)
        await octokit.repos.createOrUpdateFileContents({
          owner: repo.owner,
          repo: repo.name,
          path: filePath,
          message: commitMessage || "Update content defaults",
          content: Buffer.from(content).toString("base64"),
          sha: data.sha,
          branch: repo.activeBranch,
        });

        res.json({ 
          success: true, 
          message: "Content defaults updated successfully",
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
      console.error("Update content defaults error:", error);
      res.json({ success: false, error: error.message || "Failed to update content defaults" });
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

      // Check if Smart Deploy is active - if so, force queue mode
      const smartDeployActive = await isSmartDeployActive();
      const shouldQueue = req.body.queueOnly === true || smartDeployActive;

      if (shouldQueue) {
        const draftChange: DraftChange = {
          id: crypto.randomUUID(),
          type: "settings_update",
          title: "Update AdSense configuration",
          path,
          content: configContent,
          operations: [
            {
              type: "write",
              path,
              content: configContent,
              encoding: "utf-8",
            },
          ],
          createdAt: new Date().toISOString(),
        };

        await storage.addDraftChange(draftChange);
        await storage.setAdsenseConfig(config);

        return res.json({ success: true, data: config, queued: true });
      }

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
      const { topic, keywords, tone, length, language, apiKey, useSavedKey } = req.body;

      if (!topic) {
        return res.json({ success: false, error: "Topic is required" });
      }

      // Determine which API key to use
      let keyToUse = apiKey;
      
      if (!keyToUse && useSavedKey) {
        // Try to get the saved key from storage
        keyToUse = await storage.getGeminiApiKey();
      }
      
      if (!keyToUse) {
        return res.json({ success: false, error: "Gemini API key is required. Please enter a key or save one first." });
      }

      const result = await generateBlogPost(keyToUse, topic, keywords || [], tone || "professional", length || "medium", language || "english");

      res.json({ success: true, data: result });
    } catch (error: any) {
      console.error("AI generate error:", error);
      res.json({ success: false, error: error.message || "Failed to generate content" });
    }
  });

  // AI Generate image
  app.post("/api/ai/generate-image", async (req, res) => {
    try {
      const { prompt, apiKey, useSavedKey } = req.body;

      if (!prompt) {
        return res.json({ success: false, error: "Image prompt is required" });
      }

      // Determine which API key to use
      let keyToUse = apiKey;
      
      if (!keyToUse && useSavedKey) {
        // Try to get the saved key from storage
        keyToUse = await storage.getGeminiApiKey();
      }
      
      if (!keyToUse) {
        return res.json({ success: false, error: "Gemini API key is required. Please enter a key or save one first." });
      }

      const result = await generateImage(keyToUse, prompt);
      
      // Return as data URL for easy display in browser
      const dataUrl = `data:${result.mimeType};base64,${result.imageData}`;

      res.json({ success: true, data: { imageUrl: dataUrl, mimeType: result.mimeType } });
    } catch (error: any) {
      console.error("AI image generate error:", error);
      res.json({ success: false, error: error.message || "Failed to generate image" });
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
        
        // Persist to user_settings if user is authenticated
        if (req.session.githubUsername) {
          await updateUserGeminiKey(req.session.githubUsername, apiKey);
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

  // Save Gemini API key (protected) - saved to user_settings
  app.post("/api/ai/key", requireAuth, async (req, res) => {
    try {
      const { apiKey } = req.body;
      
      if (!apiKey) {
        return res.json({ success: false, error: "API key is required" });
      }
      
      await storage.setGeminiApiKey(apiKey);
      
      // Persist to user_settings (user-level credential)
      if (req.session.githubUsername) {
        const supabaseResult = await updateUserGeminiKey(req.session.githubUsername, apiKey);
        if (!supabaseResult) {
          console.warn("Failed to persist Gemini key to Supabase");
        }
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
      
      // Clear from user_settings
      if (req.session.githubUsername) {
        const supabaseResult = await updateUserGeminiKey(req.session.githubUsername, "");
        if (!supabaseResult) {
          console.warn("Failed to clear Gemini key from Supabase");
        }
      }
      
      res.json({ success: true });
    } catch (error) {
      res.json({ success: false, error: "Failed to clear API key" });
    }
  });

  // ==================== SEO ANALYZER ====================

  // Analyze SEO for all posts and site settings
  app.get("/api/seo/analyze", requireAuth, async (req, res) => {
    try {
      const repo = storage.getRepository();
      if (!repo) {
        return res.json({ success: false, error: "No repository connected" });
      }

      const octokit = getGitHubClient();
      if (!octokit) {
        return res.json({ success: false, error: "GitHub not connected" });
      }

      const issues: Array<{
        id: string;
        type: "error" | "warning" | "info";
        category: "meta" | "content" | "images" | "structure" | "social";
        title: string;
        description: string;
        affectedItem: string;
        currentValue?: string;
        suggestedValue?: string;
        autoFixable: boolean;
      }> = [];

      let issueId = 0;
      const generateId = () => `seo-issue-${++issueId}`;

      // Fetch posts
      let posts: Array<{ path: string; slug: string; title: string; description?: string; heroImage?: string; tags?: string[]; content: string }> = [];
      try {
        const { data: postsDir } = await octokit.repos.getContent({
          owner: repo.owner,
          repo: repo.name,
          path: "src/content/posts",
          ref: repo.activeBranch,
        });

        if (Array.isArray(postsDir)) {
          const mdFiles = postsDir.filter((f: any) => f.name.endsWith(".md") || f.name.endsWith(".mdx"));
          
          for (const file of mdFiles) {
            try {
              const { data: fileData } = await octokit.repos.getContent({
                owner: repo.owner,
                repo: repo.name,
                path: file.path,
                ref: repo.activeBranch,
              });

              if (!Array.isArray(fileData) && fileData.content) {
                const content = Buffer.from(fileData.content, "base64").toString("utf-8");
                const matter = await import("gray-matter");
                const { data: frontmatter, content: body } = matter.default(content);
                
                posts.push({
                  path: file.path,
                  slug: file.name.replace(/\.(md|mdx)$/, ""),
                  title: frontmatter.title || "",
                  description: frontmatter.description,
                  heroImage: frontmatter.heroImage,
                  tags: frontmatter.tags,
                  content: body,
                });
              }
            } catch (e) {
              console.warn(`Failed to read post ${file.path}:`, e);
            }
          }
        }
      } catch (e) {
        console.warn("Failed to fetch posts:", e);
      }

      // Analyze each post
      for (const post of posts) {
        // Check title length (50-60 chars ideal)
        if (!post.title) {
          issues.push({
            id: generateId(),
            type: "error",
            category: "meta",
            title: "Missing title",
            description: "Post has no title. Titles are critical for SEO.",
            affectedItem: post.slug,
            autoFixable: false,
          });
        } else if (post.title.length < 30) {
          issues.push({
            id: generateId(),
            type: "warning",
            category: "meta",
            title: "Title too short",
            description: "Title should be 50-60 characters for optimal SEO. Current length: " + post.title.length,
            affectedItem: post.slug,
            currentValue: post.title,
            autoFixable: true,
          });
        } else if (post.title.length > 70) {
          issues.push({
            id: generateId(),
            type: "warning",
            category: "meta",
            title: "Title too long",
            description: "Title may be truncated in search results. Keep under 60 characters. Current length: " + post.title.length,
            affectedItem: post.slug,
            currentValue: post.title,
            autoFixable: true,
          });
        }

        // Check meta description
        if (!post.description) {
          issues.push({
            id: generateId(),
            type: "error",
            category: "meta",
            title: "Missing meta description",
            description: "Post has no meta description. This is crucial for search engine snippets.",
            affectedItem: post.slug,
            autoFixable: true,
          });
        } else if (post.description.length < 120) {
          issues.push({
            id: generateId(),
            type: "warning",
            category: "meta",
            title: "Meta description too short",
            description: "Description should be 150-160 characters. Current length: " + post.description.length,
            affectedItem: post.slug,
            currentValue: post.description,
            autoFixable: true,
          });
        } else if (post.description.length > 170) {
          issues.push({
            id: generateId(),
            type: "warning",
            category: "meta",
            title: "Meta description too long",
            description: "Description may be truncated. Keep under 160 characters. Current length: " + post.description.length,
            affectedItem: post.slug,
            currentValue: post.description,
            autoFixable: true,
          });
        }

        // Check hero image
        if (!post.heroImage) {
          issues.push({
            id: generateId(),
            type: "warning",
            category: "images",
            title: "Missing hero image",
            description: "Posts with images get more engagement and better social sharing.",
            affectedItem: post.slug,
            autoFixable: false,
          });
        }

        // Check tags
        if (!post.tags || post.tags.length === 0) {
          issues.push({
            id: generateId(),
            type: "warning",
            category: "content",
            title: "No tags",
            description: "Tags help with content organization and SEO.",
            affectedItem: post.slug,
            autoFixable: true,
          });
        } else if (post.tags.length < 3) {
          issues.push({
            id: generateId(),
            type: "info",
            category: "content",
            title: "Few tags",
            description: "Consider adding more tags (4-6 recommended) for better discoverability.",
            affectedItem: post.slug,
            currentValue: post.tags.join(", "),
            autoFixable: true,
          });
        }

        // Check content length
        const wordCount = post.content.split(/\s+/).filter(w => w.length > 0).length;
        if (wordCount < 300) {
          issues.push({
            id: generateId(),
            type: "warning",
            category: "content",
            title: "Content too short",
            description: `Post has only ${wordCount} words. Aim for at least 800-1000 words for better SEO.`,
            affectedItem: post.slug,
            currentValue: `${wordCount} words`,
            autoFixable: false,
          });
        }

        // Check headings structure
        const h1Count = (post.content.match(/^# /gm) || []).length;
        const h2Count = (post.content.match(/^## /gm) || []).length;
        
        if (h2Count === 0 && wordCount > 300) {
          issues.push({
            id: generateId(),
            type: "warning",
            category: "structure",
            title: "No subheadings",
            description: "Use H2 headings (##) to structure your content for better readability and SEO.",
            affectedItem: post.slug,
            autoFixable: false,
          });
        }

        // Check for images without alt text in content
        const imagesInContent = post.content.match(/!\[([^\]]*)\]\([^)]+\)/g) || [];
        const imagesWithoutAlt = imagesInContent.filter(img => img.match(/!\[\]\(/));
        if (imagesWithoutAlt.length > 0) {
          issues.push({
            id: generateId(),
            type: "warning",
            category: "images",
            title: "Images missing alt text",
            description: `${imagesWithoutAlt.length} image(s) in content have no alt text. Alt text is important for accessibility and SEO.`,
            affectedItem: post.slug,
            currentValue: `${imagesWithoutAlt.length} images without alt`,
            autoFixable: false,
          });
        }
      }

      // Fetch and analyze site settings
      try {
        const { data: settingsFile } = await octokit.repos.getContent({
          owner: repo.owner,
          repo: repo.name,
          path: "src/config/siteSettings.ts",
          ref: repo.activeBranch,
        });

        if (!Array.isArray(settingsFile) && settingsFile.content) {
          const settingsContent = Buffer.from(settingsFile.content, "base64").toString("utf-8");

          // Check for default/placeholder values
          if (settingsContent.includes('siteName: "My Blog"') || settingsContent.includes("siteName: 'My Blog'")) {
            issues.push({
              id: generateId(),
              type: "error",
              category: "meta",
              title: "Default site name",
              description: "Site is using the default name 'My Blog'. Update to your actual site name.",
              affectedItem: "site-settings",
              currentValue: "My Blog",
              autoFixable: false,
            });
          }

          // Check site description
          if (!settingsContent.includes("siteDescription:") || settingsContent.includes('siteDescription: ""')) {
            issues.push({
              id: generateId(),
              type: "error",
              category: "meta",
              title: "Missing site description",
              description: "Site description is empty. Add a description for better SEO.",
              affectedItem: "site-settings",
              autoFixable: false,
            });
          }

          // Check OG image
          if (!settingsContent.includes("defaultImage:") || settingsContent.includes('defaultImage: ""')) {
            issues.push({
              id: generateId(),
              type: "warning",
              category: "social",
              title: "Missing default OG image",
              description: "No default Open Graph image set. This affects social media sharing.",
              affectedItem: "site-settings",
              autoFixable: false,
            });
          }

          // Check Twitter handle
          if (!settingsContent.includes("twitterHandle:") || settingsContent.includes('twitterHandle: ""')) {
            issues.push({
              id: generateId(),
              type: "info",
              category: "social",
              title: "Missing Twitter handle",
              description: "Add your Twitter handle for proper attribution in Twitter cards.",
              affectedItem: "site-settings",
              autoFixable: false,
            });
          }
        }
      } catch (e) {
        console.warn("Failed to analyze site settings:", e);
      }

      // Calculate score
      const errorCount = issues.filter(i => i.type === "error").length;
      const warningCount = issues.filter(i => i.type === "warning").length;
      const infoCount = issues.filter(i => i.type === "info").length;
      
      // Score calculation: start at 100, -10 per error, -5 per warning, -1 per info
      let score = 100 - (errorCount * 10) - (warningCount * 5) - (infoCount * 1);
      score = Math.max(0, Math.min(100, score));

      res.json({
        success: true,
        data: {
          score,
          issues,
          summary: {
            errors: errorCount,
            warnings: warningCount,
            info: infoCount,
          },
          analyzedPosts: posts.length,
          analyzedAt: new Date().toISOString(),
        },
      });
    } catch (error: any) {
      console.error("SEO analyze error:", error);
      res.json({ success: false, error: error.message || "Failed to analyze SEO" });
    }
  });

  // SEO Optimize - fix issues using AI
  app.post("/api/seo/optimize", requireAuth, async (req, res) => {
    try {
      const { postSlugs, queueOnly } = req.body;

      if (!postSlugs || !Array.isArray(postSlugs) || postSlugs.length === 0) {
        return res.json({ success: false, error: "No posts specified for optimization" });
      }

      const apiKey = await storage.getGeminiApiKey();
      if (!apiKey) {
        return res.json({ success: false, error: "Gemini API key required for AI optimization. Please set it in AI Settings." });
      }

      const repo = storage.getRepository();
      if (!repo) {
        return res.json({ success: false, error: "No repository connected" });
      }

      const octokit = getGitHubClient();
      if (!octokit) {
        return res.json({ success: false, error: "GitHub not connected" });
      }

      const matter = await import("gray-matter");
      const results: Array<{ slug: string; success: boolean; changes?: string[]; error?: string }> = [];
      const operations: Array<{ type: "write"; path: string; content: string }> = [];

      for (const slug of postSlugs) {
        try {
          const postPath = `src/content/posts/${slug}.md`;
          
          // Fetch the post
          const { data: fileData } = await octokit.repos.getContent({
            owner: repo.owner,
            repo: repo.name,
            path: postPath,
            ref: repo.activeBranch,
          });

          if (Array.isArray(fileData) || !fileData.content) {
            results.push({ slug, success: false, error: "Post not found" });
            continue;
          }

          const content = Buffer.from(fileData.content, "base64").toString("utf-8");
          const { data: frontmatter, content: body } = matter.default(content);
          
          // Generate SEO content using AI
          const seoSuggestion = await generateSEOContent(
            apiKey,
            frontmatter.title || slug,
            body,
            frontmatter.description,
            frontmatter.tags
          );

          const changes: string[] = [];

          // Apply suggestions
          if (!frontmatter.description && seoSuggestion.description) {
            frontmatter.description = seoSuggestion.description;
            changes.push("Added meta description");
          } else if (frontmatter.description && seoSuggestion.description && 
                     (frontmatter.description.length < 120 || frontmatter.description.length > 170)) {
            frontmatter.description = seoSuggestion.description;
            changes.push("Optimized meta description length");
          }

          if ((!frontmatter.tags || frontmatter.tags.length < 3) && seoSuggestion.tags) {
            frontmatter.tags = seoSuggestion.tags;
            changes.push("Added/updated tags");
          }

          if (changes.length > 0) {
            // Rebuild the file
            const newContent = matter.default.stringify(body, frontmatter);

            // Check if Smart Deploy is active - if so, force queue mode
            const smartDeployActive = await isSmartDeployActive();
            const shouldQueue = queueOnly === true || smartDeployActive;

            if (shouldQueue) {
              operations.push({
                type: "write",
                path: postPath,
                content: newContent,
              });
            } else {
              // Direct commit
              await octokit.repos.createOrUpdateFileContents({
                owner: repo.owner,
                repo: repo.name,
                path: postPath,
                message: `SEO optimize: ${slug}`,
                content: Buffer.from(newContent).toString("base64"),
                sha: (fileData as any).sha,
                branch: repo.activeBranch,
              });
            }
          }

          results.push({ slug, success: true, changes });
        } catch (error: any) {
          results.push({ slug, success: false, error: error.message });
        }
      }

      // Check if Smart Deploy is active for final queue decision
      const smartDeployActive = await isSmartDeployActive();
      const shouldQueue = queueOnly === true || smartDeployActive;

      // If should queue, add to Smart Deploy queue
      if (shouldQueue && operations.length > 0) {
        const draftChange: any = {
          id: crypto.randomUUID(),
          type: "post_update",
          title: `SEO optimize ${operations.length} post${operations.length > 1 ? 's' : ''}`,
          path: operations[0].path,
          operations: operations.map(op => ({
            type: "write" as const,
            path: op.path,
            content: op.content,
            encoding: "utf-8" as const,
          })),
          metadata: {
            optimizedPosts: postSlugs,
            count: operations.length,
          },
          createdAt: new Date().toISOString(),
        };

        await storage.addDraftChange(draftChange);
      }

      const optimizedCount = results.filter(r => r.success && r.changes && r.changes.length > 0).length;

      res.json({
        success: true,
        data: {
          results,
          optimizedCount,
          queued: shouldQueue,
        },
      });
    } catch (error: any) {
      console.error("SEO optimize error:", error);
      res.json({ success: false, error: error.message || "Failed to optimize SEO" });
    }
  });

  // ==================== PAGESPEED INSIGHTS ====================

  // Get PageSpeed API config
  app.get("/api/pagespeed/config", async (req, res) => {
    try {
      // Check if Search Console service account is configured (preferred)
      const searchConsoleConfig = await storage.getSearchConsoleConfig();
      const hasServiceAccount = !!(searchConsoleConfig?.serviceAccountJson);
      
      // Also check for standalone API key
      const apiKey = await storage.getPageSpeedApiKey();
      
      res.json({
        success: true,
        data: {
          hasApiKey: !!apiKey,
          hasServiceAccount,
          authMethod: hasServiceAccount ? "service_account" : (apiKey ? "api_key" : "none"),
        },
      });
    } catch (error) {
      res.json({ success: false, error: "Failed to get PageSpeed config" });
    }
  });

  // Save PageSpeed API key (optional - only needed if not using Service Account)
  app.post("/api/pagespeed/config", requireAuth, async (req, res) => {
    try {
      const { apiKey } = req.body;
      await storage.setPageSpeedApiKey(apiKey || "");
      res.json({ success: true });
    } catch (error) {
      res.json({ success: false, error: "Failed to save PageSpeed config" });
    }
  });

  // Analyze URL with PageSpeed Insights
  app.post("/api/pagespeed/analyze", requireAuth, async (req, res) => {
    try {
      const { url, strategy = "mobile" } = req.body;

      if (!url) {
        return res.json({ success: false, error: "URL is required" });
      }

      // Validate URL format
      try {
        new URL(url);
      } catch {
        return res.json({ success: false, error: "Invalid URL format" });
      }

      // Try to use Search Console Service Account first (shared credentials)
      let authOptions: { apiKey?: string; accessToken?: string } = {};
      
      const searchConsoleConfig = await storage.getSearchConsoleConfig();
      if (searchConsoleConfig?.serviceAccountJson) {
        try {
          const serviceAccount = JSON.parse(searchConsoleConfig.serviceAccountJson);
          
          // Create JWT auth and get access token
          const auth = new google.auth.JWT({
            email: serviceAccount.client_email,
            key: serviceAccount.private_key,
            scopes: ["openid"],
          });
          
          const { token } = await auth.getAccessToken();
          if (token) {
            authOptions.accessToken = token;
            console.log("[PageSpeed] Using Service Account authentication");
          }
        } catch (saError: any) {
          console.error("[PageSpeed] Service Account auth failed:", saError.message);
          // Fall back to API key
        }
      }
      
      // Fall back to API key if no Service Account token
      if (!authOptions.accessToken) {
        const apiKey = await storage.getPageSpeedApiKey();
        if (apiKey) {
          authOptions.apiKey = apiKey;
          console.log("[PageSpeed] Using API key authentication");
        } else {
          console.log("[PageSpeed] No authentication configured - using public quota");
        }
      }
      
      const result = await analyzePageSpeed(url, strategy, authOptions);
      const recommendations = generateOptimizationRecommendations(result);

      // Generate a unique snapshot ID and cache the result for validation
      const snapshotId = `ps-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      await storage.setPageSpeedSnapshot({
        id: snapshotId,
        result,
        recommendations,
      });

      res.json({
        success: true,
        data: {
          ...result,
          recommendations,
          snapshotId,
        },
      });
    } catch (error: any) {
      console.error("PageSpeed analyze error:", error);
      res.json({ success: false, error: error.message || "Failed to analyze PageSpeed" });
    }
  });

  // Get cached PageSpeed results
  app.get("/api/pagespeed/results", async (req, res) => {
    try {
      const results = await storage.getPageSpeedResults();
      res.json({ success: true, data: results || [] });
    } catch (error) {
      res.json({ success: false, error: "Failed to get PageSpeed results" });
    }
  });

  // Apply PageSpeed optimizations to repository
  app.post("/api/pagespeed/optimize", requireAuth, async (req, res) => {
    try {
      const { recommendations, snapshotId, queueOnly = true } = req.body;

      if (!recommendations || !Array.isArray(recommendations) || recommendations.length === 0) {
        return res.json({ success: false, error: "No recommendations specified" });
      }

      // Validate snapshot ID exists
      const snapshot = await storage.getPageSpeedSnapshot();
      if (!snapshot) {
        return res.json({ success: false, error: "No PageSpeed analysis found. Please run analysis first." });
      }

      if (snapshotId && snapshot.id !== snapshotId) {
        return res.json({ success: false, error: "Stale analysis. Please run a new PageSpeed analysis." });
      }

      // Validate recommendation IDs against the snapshot
      const validRecommendationIds = new Set(snapshot.recommendations.map((r: any) => r.id));
      const invalidIds = recommendations.filter((r: any) => !validRecommendationIds.has(r.id));
      
      if (invalidIds.length > 0) {
        return res.json({ 
          success: false, 
          error: `Invalid recommendation IDs: ${invalidIds.map((r: any) => r.id).join(", ")}. Please run a new analysis.` 
        });
      }

      // Use only validated recommendations from snapshot
      const validatedRecommendations = snapshot.recommendations.filter((r: any) => 
        recommendations.some((req: any) => req.id === r.id)
      );

      const repo = await storage.getRepository();
      if (!repo) {
        return res.json({ success: false, error: "No repository connected" });
      }

      const octokit = getGitHubClient();
      if (!octokit) {
        return res.json({ success: false, error: "GitHub not connected" });
      }

      const { astroConfig, vercelConfig, layoutChanges } = generateAstroOptimizations(validatedRecommendations);
      const operations: Array<{ type: "write"; path: string; content: string }> = [];
      const appliedOptimizations: string[] = [];

      // Check for existing astro.config.mjs
      try {
        const { data: configData } = await octokit.repos.getContent({
          owner: repo.owner,
          repo: repo.name,
          path: "astro.config.mjs",
          ref: repo.activeBranch,
        });

        if (!Array.isArray(configData) && configData.content) {
          const existingContent = Buffer.from(configData.content, "base64").toString("utf-8");
          
          // For now, we'll add a comment with recommendations
          // Full AST modification would be more complex
          const configComment = `
// PageSpeed Optimization Recommendations (auto-generated)
// Add these settings to improve performance:
// ${JSON.stringify(astroConfig, null, 2).split('\n').join('\n// ')}
`;
          
          if (!existingContent.includes("PageSpeed Optimization")) {
            const newContent = configComment + "\n" + existingContent;
            operations.push({
              type: "write",
              path: "astro.config.mjs",
              content: newContent,
            });
            appliedOptimizations.push("Added performance recommendations to astro.config.mjs");
          }
        }
      } catch {
        // Config doesn't exist, skip
      }

      // Create or update vercel.json with cache headers
      try {
        let existingVercelConfig: any = {};
        let existingSha: string | undefined;

        try {
          const { data: vercelData } = await octokit.repos.getContent({
            owner: repo.owner,
            repo: repo.name,
            path: "vercel.json",
            ref: repo.activeBranch,
          });

          if (!Array.isArray(vercelData) && vercelData.content) {
            existingVercelConfig = JSON.parse(
              Buffer.from(vercelData.content, "base64").toString("utf-8")
            );
            existingSha = (vercelData as any).sha;
          }
        } catch {
          // vercel.json doesn't exist
        }

        // Merge headers
        const mergedHeaders = [
          ...(existingVercelConfig.headers || []),
          ...vercelConfig.headers.filter((h: any) => 
            !existingVercelConfig.headers?.some((eh: any) => eh.source === h.source)
          ),
        ];

        const newVercelConfig = {
          ...existingVercelConfig,
          headers: mergedHeaders,
        };

        operations.push({
          type: "write",
          path: "vercel.json",
          content: JSON.stringify(newVercelConfig, null, 2),
        });
        appliedOptimizations.push("Updated vercel.json with optimized cache headers");
      } catch (error) {
        console.error("Error updating vercel.json:", error);
      }

      // Add preload hints to layout if applicable
      if (layoutChanges.length > 0) {
        try {
          const layoutPaths = [
            "src/layouts/BaseLayout.astro",
            "src/layouts/Layout.astro",
            "src/layouts/Base.astro",
          ];

          for (const layoutPath of layoutPaths) {
            try {
              const { data: layoutData } = await octokit.repos.getContent({
                owner: repo.owner,
                repo: repo.name,
                path: layoutPath,
                ref: repo.activeBranch,
              });

              if (!Array.isArray(layoutData) && layoutData.content) {
                let layoutContent = Buffer.from(layoutData.content, "base64").toString("utf-8");
                
                // Add preload hints before </head>
                const preloadHints = layoutChanges.join("\n    ");
                if (!layoutContent.includes("preload") && layoutContent.includes("</head>")) {
                  layoutContent = layoutContent.replace(
                    "</head>",
                    `    <!-- PageSpeed Optimizations -->\n    ${preloadHints}\n  </head>`
                  );
                  
                  operations.push({
                    type: "write",
                    path: layoutPath,
                    content: layoutContent,
                  });
                  appliedOptimizations.push(`Added preload hints to ${layoutPath}`);
                  break; // Only update one layout file
                }
              }
            } catch {
              // Layout file doesn't exist, try next
              continue;
            }
          }
        } catch (error) {
          console.error("Error updating layout:", error);
        }
      }

      // Check if there are any operations to perform
      if (operations.length === 0) {
        return res.json({
          success: true,
          data: {
            message: "No optimizations needed or already applied",
            appliedOptimizations: [],
          },
        });
      }

      // Check Smart Deploy status
      const smartDeployActive = await isSmartDeployActive();
      const shouldQueue = queueOnly === true || smartDeployActive;

      if (shouldQueue) {
        // Add to Smart Deploy queue
        const draftChange: any = {
          id: crypto.randomUUID(),
          type: "config_update",
          title: `PageSpeed optimizations (${appliedOptimizations.length} changes)`,
          path: operations[0].path,
          operations: operations.map(op => ({
            type: "write" as const,
            path: op.path,
            content: op.content,
            encoding: "utf-8" as const,
          })),
          metadata: {
            optimizationType: "pagespeed",
            changes: appliedOptimizations,
          },
          createdAt: new Date().toISOString(),
        };

        await storage.addDraftChange(draftChange);
      } else {
        // Direct commit
        for (const op of operations) {
          let sha: string | undefined;
          
          try {
            const { data: existingFile } = await octokit.repos.getContent({
              owner: repo.owner,
              repo: repo.name,
              path: op.path,
              ref: repo.activeBranch,
            });
            
            if (!Array.isArray(existingFile)) {
              sha = (existingFile as any).sha;
            }
          } catch {
            // File doesn't exist
          }

          await octokit.repos.createOrUpdateFileContents({
            owner: repo.owner,
            repo: repo.name,
            path: op.path,
            message: `PageSpeed optimization: ${op.path}`,
            content: Buffer.from(op.content).toString("base64"),
            sha,
            branch: repo.activeBranch,
          });
        }
      }

      res.json({
        success: true,
        data: {
          appliedOptimizations,
          queued: shouldQueue,
          operationsCount: operations.length,
        },
      });
    } catch (error: any) {
      console.error("PageSpeed optimize error:", error);
      res.json({ success: false, error: error.message || "Failed to apply optimizations" });
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

  // Save Search Console credentials (protected) - saved to user_settings with encryption
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

      // Store in memory
      await storage.setSearchConsoleConfig({
        siteUrl: "", // Site URL is per-repo, selected separately
        serviceAccountJson,
        clientEmail: parsed.client_email,
        privateKey: parsed.private_key,
      });

      // Persist to user_settings (user-level credential, encrypted)
      if (req.session.githubUsername) {
        const supabaseResult = await updateUserSearchConsoleCredentials(
          req.session.githubUsername,
          serviceAccountJson
        );
        if (!supabaseResult) {
          console.warn("Failed to persist Search Console credentials to Supabase");
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
      
      // Clear from user_settings
      if (req.session.githubUsername) {
        const supabaseResult = await clearUserSearchConsoleCredentials(req.session.githubUsername);
        if (!supabaseResult) {
          console.warn("Failed to clear Search Console credentials from Supabase");
        }
      }
      
      // Also clear the site URL from repository_settings for the current repo
      const repo = await storage.getRepository();
      if (repo) {
        await clearRepositorySiteUrl(repo.fullName);
      }
      
      res.json({ success: true });
    } catch (error) {
      res.json({ success: false, error: "Failed to clear credentials" });
    }
  });

  // Get indexing status (load from Supabase with memory fallback)
  app.get("/api/search-console/status", async (req, res) => {
    try {
      const repo = await storage.getRepository();
      
      // Try to load from Supabase first
      if (repo) {
        const supabaseStatus = await getIndexingStatusFromSupabase(repo.fullName);
        if (supabaseStatus !== null && supabaseStatus.length > 0) {
          // Sync to memory for faster access
          await storage.setIndexingStatus(supabaseStatus);
          res.json({ success: true, data: supabaseStatus });
          return;
        }
      }
      
      // Fallback to memory storage
      const status = await storage.getIndexingStatus();
      res.json({ success: true, data: status });
    } catch (error) {
      res.json({ success: false, error: "Failed to get indexing status" });
    }
  });

  // Submit URLs for indexing using Google Indexing API
  app.post("/api/search-console/submit", requireAuth, async (req, res) => {
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

      // Get repository info for persistence
      const repo = await storage.getRepository();
      const githubUsername = req.session.githubUsername;

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

          const statusUpdate = {
            status: "submitted" as const,
            lastSubmitted: new Date().toISOString(),
            message: `Submitted successfully. Notification time: ${response.data.urlNotificationMetadata?.latestUpdate?.notifyTime || 'N/A'}`,
          };
          
          // Update memory storage
          await storage.updateIndexingStatus(url, statusUpdate);
          
          // Persist to Supabase
          if (repo && githubUsername) {
            await updateSingleIndexingStatus(repo.fullName, githubUsername, url, statusUpdate);
          }
          
          results.push({ url, status: "success", message: "Submitted to Google Indexing API" });
          submitted++;
        } catch (error: any) {
          const errorMessage = error.response?.data?.error?.message || error.message || "Failed to submit";
          errors.push(`${url}: ${errorMessage}`);
          
          const statusUpdate = {
            status: "error" as const,
            lastSubmitted: new Date().toISOString(),
            message: errorMessage,
          };
          
          // Update memory storage
          await storage.updateIndexingStatus(url, statusUpdate);
          
          // Persist to Supabase
          if (repo && githubUsername) {
            await updateSingleIndexingStatus(repo.fullName, githubUsername, url, statusUpdate);
          }
          
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
  app.get("/api/vercel/config", requireAuth, async (req, res) => {
    try {
      let config = await storage.getVercelConfig();
      let project = await storage.getVercelProject();
      
      // If not in memory, try to load from Supabase
      if (!config?.token && req.session.githubUsername) {
        const userSettings = await getUserSettings(req.session.githubUsername);
        if (userSettings?.vercel_token) {
          // Validate and load the token
          try {
            const { VercelService } = await import("./vercel");
            const vercel = new VercelService(userSettings.vercel_token);
            const user = await vercel.validateToken();
            
            config = {
              token: userSettings.vercel_token,
              username: user.username,
            };
            await storage.setVercelConfig(config);
          } catch (tokenError) {
            console.warn("Stored Vercel token is invalid:", tokenError);
          }
        }
      }
      
      // If project not in memory, try to load from repository settings
      if (!project && req.session.githubUsername) {
        const repo = await storage.getRepository();
        if (repo) {
          const repoSettings = await getRepositorySettings(repo.fullName);
          if (repoSettings?.vercel_project_id) {
            project = {
              id: repoSettings.vercel_project_id,
              name: repoSettings.vercel_project_name || "",
              framework: "astro",
            };
            await storage.setVercelProject(project);
          }
        }
      }
      
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
        
        // Persist to user_settings (user-level credential)
        if (req.session.githubUsername) {
          const supabaseResult = await updateUserVercelToken(req.session.githubUsername, token);
          if (!supabaseResult) {
            console.warn("Failed to persist Vercel token to Supabase");
          }
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
      
      // Clear from user_settings
      if (req.session.githubUsername) {
        const supabaseResult = await clearUserVercelToken(req.session.githubUsername);
        if (!supabaseResult) {
          console.warn("Failed to clear Vercel token from Supabase");
        }
      }
      
      // Also clear the project linking from repository_settings for the current repo
      const repo = await storage.getRepository();
      if (repo) {
        await clearRepositoryVercel(repo.fullName);
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
      
      // Save project linking to repository_settings
      if (req.session.githubUsername) {
        await updateRepositoryVercel(
          repo.fullName,
          req.session.githubUsername,
          result.project.id,
          config.teamId,
          result.project.name
        );
      }
      
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

      // Save site URL to repository_settings (per-repo linking)
      const repo = await storage.getRepository();
      if (repo && req.session.githubUsername) {
        await updateRepositorySiteUrl(repo.fullName, req.session.githubUsername, siteUrl);
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

      // Check if Smart Deploy is active - if so, queue the sitemap update
      const smartDeployActive = await isSmartDeployActive();
      
      if (smartDeployActive) {
        const draftChange: DraftChange = {
          id: crypto.randomUUID(),
          type: "settings_update",
          title: "Update sitemap.xml",
          path: "public/sitemap.xml",
          content: xml,
          operations: [
            {
              type: "write",
              path: "public/sitemap.xml",
              content: xml,
              encoding: "utf-8",
            },
          ],
          createdAt: new Date().toISOString(),
        };

        await storage.addDraftChange(draftChange);
        return res.json({ success: true, message: "Sitemap queued for deployment", queued: true });
      }

      // Commit sitemap to repository immediately
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

      // Check if Smart Deploy is active - if so, queue the sitemap update
      const smartDeployActive = await isSmartDeployActive();
      
      if (smartDeployActive) {
        const draftChange: DraftChange = {
          id: crypto.randomUUID(),
          type: "settings_update",
          title: "Auto-generate sitemap.xml",
          path: "public/sitemap.xml",
          content: xml,
          operations: [
            {
              type: "write",
              path: "public/sitemap.xml",
              content: xml,
              encoding: "utf-8",
            },
          ],
          metadata: {
            urlCount: urls.length,
            domain: baseUrl,
          },
          createdAt: new Date().toISOString(),
        };

        await storage.addDraftChange(draftChange);
        
        return res.json({ 
          success: true, 
          message: "Sitemap queued for deployment. Google submission will be available after deploying.",
          queued: true,
          repoSaved: false,
          googleSubmitted: false,
          urlCount: urls.length,
        });
      }

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

  // ============ Smart Deploy Draft Queue ============

  // Get Smart Deploy settings
  app.get("/api/smart-deploy/settings", requireAuth, async (req, res) => {
    try {
      const settings = await storage.getSmartDeploySettings();
      res.json({ success: true, settings });
    } catch (error: any) {
      res.json({ success: false, error: error.message });
    }
  });

  // Update Smart Deploy settings
  app.post("/api/smart-deploy/settings", requireAuth, async (req, res) => {
    try {
      const { enabled, autoQueueChanges } = req.body;
      await storage.setSmartDeploySettings({ 
        enabled: enabled ?? true, 
        autoQueueChanges: autoQueueChanges ?? true 
      });
      res.json({ success: true });
    } catch (error: any) {
      res.json({ success: false, error: error.message });
    }
  });

  // Get draft queue (pending changes)
  app.get("/api/smart-deploy/queue", requireAuth, async (req, res) => {
    try {
      const queue = await storage.getDraftQueue();
      res.json({ success: true, data: queue });
    } catch (error: any) {
      res.json({ success: false, error: error.message });
    }
  });

  // Add a change to the draft queue
  app.post("/api/smart-deploy/queue", requireAuth, async (req, res) => {
    try {
      const { type, title, path, content, previousContent, metadata } = req.body;
      
      const change = {
        id: crypto.randomUUID(),
        type,
        title,
        path,
        content,
        previousContent,
        metadata,
        createdAt: new Date().toISOString(),
      };
      
      await storage.addDraftChange(change);
      const queue = await storage.getDraftQueue();
      res.json({ success: true, change, queueCount: queue?.changes.length || 0 });
    } catch (error: any) {
      res.json({ success: false, error: error.message });
    }
  });

  // Remove a specific change from the queue
  app.delete("/api/smart-deploy/queue/:changeId", requireAuth, async (req, res) => {
    try {
      const { changeId } = req.params;
      await storage.removeDraftChange(changeId);
      const queue = await storage.getDraftQueue();
      res.json({ success: true, queueCount: queue?.changes.length || 0 });
    } catch (error: any) {
      res.json({ success: false, error: error.message });
    }
  });

  // Clear all pending changes
  app.delete("/api/smart-deploy/queue", requireAuth, async (req, res) => {
    try {
      await storage.clearDraftQueue();
      res.json({ success: true });
    } catch (error: any) {
      res.json({ success: false, error: error.message });
    }
  });

  // Deploy all queued changes in a single commit
  app.post("/api/smart-deploy/deploy", requireAuth, async (req, res) => {
    try {
      const repo = await storage.getRepository();
      if (!repo) {
        return res.json({ success: false, error: "No repository connected" });
      }

      const queue = await storage.getDraftQueue();
      if (!queue || queue.changes.length === 0) {
        return res.json({ success: false, error: "No pending changes to deploy" });
      }

      const octokit = await getGitHubClient();
      const { commitMessage } = req.body;
      const message = commitMessage || `Batch update: ${queue.changes.length} change${queue.changes.length > 1 ? 's' : ''}`;

      // Get the current branch reference
      const { data: ref } = await octokit.git.getRef({
        owner: repo.owner,
        repo: repo.name,
        ref: `heads/${repo.activeBranch}`,
      });
      const latestCommitSha = ref.object.sha;

      // Get the tree SHA from the latest commit
      const { data: commit } = await octokit.git.getCommit({
        owner: repo.owner,
        repo: repo.name,
        commit_sha: latestCommitSha,
      });
      const baseTreeSha = commit.tree.sha;

      // Build tree entries for all changes
      const treeEntries: Array<{
        path: string;
        mode: "100644";
        type: "blob";
        content?: string;
        sha?: string | null;
      }> = [];

      // Track processed paths to avoid duplicates
      const processedPaths = new Set<string>();

      // Helper function to create blob for base64 content (images)
      const createBlobForBase64 = async (base64Content: string): Promise<string> => {
        const { data: blob } = await octokit.git.createBlob({
          owner: repo.owner,
          repo: repo.name,
          content: base64Content,
          encoding: "base64",
        });
        return blob.sha;
      };

      for (const change of queue.changes) {
        // Handle new operations array format (for multi-file changes like image replace)
        if (change.operations && change.operations.length > 0) {
          for (const op of change.operations) {
            if (processedPaths.has(op.path)) continue;
            processedPaths.add(op.path);
            
            if (op.type === "delete") {
              treeEntries.push({
                path: op.path,
                mode: "100644",
                type: "blob",
                sha: null,
              });
            } else if (op.type === "write" && op.content) {
              // Check if content is base64 encoded (for images)
              // Also detect by file extension as fallback for existing queue data
              const isImagePath = /\.(png|jpg|jpeg|gif|webp|svg|ico)$/i.test(op.path);
              const isBase64 = op.encoding === "base64" || isImagePath;
              if (isBase64) {
                const blobSha = await createBlobForBase64(op.content);
                treeEntries.push({
                  path: op.path,
                  mode: "100644",
                  type: "blob",
                  sha: blobSha,
                });
              } else {
                treeEntries.push({
                  path: op.path,
                  mode: "100644",
                  type: "blob",
                  content: op.content,
                });
              }
            }
          }
        } 
        // Handle legacy single-file format
        else if (change.type === "post_delete" || change.type === "image_delete") {
          if (!processedPaths.has(change.path)) {
            processedPaths.add(change.path);
            treeEntries.push({
              path: change.path,
              mode: "100644",
              type: "blob",
              sha: null,
            });
          }
        } else if (change.content) {
          if (!processedPaths.has(change.path)) {
            processedPaths.add(change.path);
            // Check if this is an image upload - detect by type, metadata, or file extension
            const isImageType = change.type?.startsWith("image_");
            const hasMimeType = change.metadata?.mimeType;
            const isImagePath = /\.(png|jpg|jpeg|gif|webp|svg|ico)$/i.test(change.path);
            const isBase64 = isImageType || hasMimeType || isImagePath;
            if (isBase64) {
              const blobSha = await createBlobForBase64(change.content);
              treeEntries.push({
                path: change.path,
                mode: "100644",
                type: "blob",
                sha: blobSha,
              });
            } else {
              treeEntries.push({
                path: change.path,
                mode: "100644",
                type: "blob",
                content: change.content,
              });
            }
          }
        }
      }

      if (treeEntries.length === 0) {
        return res.json({ success: false, error: "No valid changes to commit" });
      }

      // Create a new tree with all changes
      const { data: newTree } = await octokit.git.createTree({
        owner: repo.owner,
        repo: repo.name,
        base_tree: baseTreeSha,
        tree: treeEntries as any,
      });

      // Create a new commit
      const { data: newCommit } = await octokit.git.createCommit({
        owner: repo.owner,
        repo: repo.name,
        message,
        tree: newTree.sha,
        parents: [latestCommitSha],
      });

      // Update the branch reference to point to the new commit
      await octokit.git.updateRef({
        owner: repo.owner,
        repo: repo.name,
        ref: `heads/${repo.activeBranch}`,
        sha: newCommit.sha,
      });

      // Clear the queue after successful deploy
      const deployedCount = queue.changes.length;
      await storage.clearDraftQueue();

      // Sync repository data to reflect changes
      await syncRepositoryData(repo.owner, repo.name, repo.activeBranch);

      res.json({ 
        success: true, 
        commitSha: newCommit.sha,
        deployedCount,
        message: `Successfully deployed ${deployedCount} change${deployedCount > 1 ? 's' : ''} in a single commit`,
      });
    } catch (error: any) {
      console.error("Smart deploy error:", error);
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
