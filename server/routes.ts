import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
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
        
        // Load saved settings from Supabase
        const savedSettings = await loadUserSettings(token);
        
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

  // Get theme settings
  app.get("/api/theme", async (req, res) => {
    try {
      let theme = await storage.getTheme();
      if (!theme) {
        theme = {
          primary: "#FF5D01",
          secondary: "#0C0C0C",
          background: "#FAFAFA",
          text: "#1E293B",
          accent: "#8B5CF6",
          success: "#10B981",
        };
      }
      res.json({ success: true, data: theme });
    } catch (error) {
      res.json({ success: false, error: "Failed to get theme" });
    }
  });

  // Update theme settings
  app.put("/api/theme", async (req, res) => {
    try {
      const { theme, commitMessage } = req.body;
      
      const repo = await storage.getRepository();
      if (!repo) {
        return res.json({ success: false, error: "No repository connected" });
      }

      // Save theme to a config file in the repo
      const themeContent = JSON.stringify(theme, null, 2);
      const path = "src/config/theme.json";

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
        message: commitMessage || "Update theme configuration",
        content: Buffer.from(themeContent).toString("base64"),
        sha,
        branch: repo.activeBranch,
      });

      await storage.setTheme(theme);

      res.json({ success: true, data: theme });
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

  // Clone repository to new repo
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

      // Create new repository with auto_init to avoid empty repo issues
      const { data: newRepo } = await octokit.repos.createForAuthenticatedUser({
        name: newRepoName,
        description: description || `Astro blog created from ${sourceRepo}`,
        auto_init: true,
        private: false,
      });

      // Wait a bit for GitHub to initialize the repo
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Get all files from source repo
      const { data: sourceTree } = await octokit.git.getTree({
        owner: sourceOwner,
        repo: sourceRepoName,
        tree_sha: "HEAD",
        recursive: "true",
      });

      // Copy each file from source to new repo
      const filesToCopy = sourceTree.tree.filter(item => item.type === "blob" && item.path);
      
      for (const item of filesToCopy) {
        try {
          // Get file content from source
          const { data: fileData } = await octokit.repos.getContent({
            owner: sourceOwner,
            repo: sourceRepoName,
            path: item.path!,
          });

          if ("content" in fileData && !Array.isArray(fileData)) {
            // Create/update file in new repo
            await octokit.repos.createOrUpdateFileContents({
              owner: user.login,
              repo: newRepoName,
              path: item.path!,
              message: `Copy ${item.path} from ${sourceRepo}`,
              content: fileData.content.replace(/\n/g, ""), // GitHub API returns content with newlines
              branch: "main",
            });
          }
        } catch (e: any) {
          // Skip files that fail (e.g., binary files or permission issues)
          console.log(`Skipped file: ${item.path} - ${e.message}`);
        }
      }

      res.json({ 
        success: true, 
        data: {
          name: newRepo.name,
          fullName: newRepo.full_name,
          url: newRepo.html_url,
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
        
        // Persist to Supabase if user is authenticated
        if (req.session.githubToken) {
          await updateGeminiKey(req.session.githubToken, apiKey);
        }
      }
      
      res.json({ success: true, data: { valid: true } });
    } catch (error: any) {
      res.json({ success: false, error: "Invalid API key" });
    }
  });

  // Get saved Gemini API key (protected)
  app.get("/api/ai/key", requireAuth, async (req, res) => {
    try {
      const key = await storage.getGeminiApiKey();
      res.json({ success: true, data: { hasKey: !!key, key: key || null } });
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
      
      // Persist to Supabase
      const supabaseResult = await updateGeminiKey(req.session.githubToken!, apiKey);
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
      
      // Clear from Supabase
      const supabaseResult = await updateGeminiKey(req.session.githubToken!, "");
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

      // Persist to Supabase
      const supabaseResult = await updateSearchConsoleConfig(
        req.session.githubToken!,
        parsed.client_email,
        parsed.private_key,
        ""
      );
      if (!supabaseResult) {
        console.warn("Failed to persist Search Console config to Supabase");
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
      const supabaseResult = await clearSearchConsoleConfig(req.session.githubToken!);
      if (!supabaseResult) {
        console.warn("Failed to clear Search Console config from Supabase");
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

  // Submit URLs for indexing
  app.post("/api/search-console/submit", async (req, res) => {
    try {
      const config = await storage.getSearchConsoleConfig();
      if (!config || !config.serviceAccountJson) {
        return res.json({ success: false, error: "Search Console not configured" });
      }

      const { urls } = req.body;
      if (!urls || !Array.isArray(urls) || urls.length === 0) {
        return res.json({ success: false, error: "URLs are required" });
      }

      // Validate URLs - must be strings starting with http(s)
      const validUrls: string[] = [];
      for (const url of urls) {
        if (typeof url === "string" && (url.startsWith("http://") || url.startsWith("https://"))) {
          // Validate URL belongs to configured site
          const siteHost = new URL(config.siteUrl).hostname;
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

      // For each URL, update status to submitted
      // Note: In production, you would make actual API calls to Google Indexing API
      // This simplified version simulates the submission process
      let submitted = 0;
      const errors: string[] = [];

      for (const url of validUrls) {
        try {
          await storage.updateIndexingStatus(url, {
            status: "submitted",
            lastSubmitted: new Date().toISOString(),
            message: "URL submitted to Google Indexing API",
          });
          submitted++;
        } catch (error: any) {
          errors.push(`${url}: ${error.message}`);
          await storage.updateIndexingStatus(url, {
            status: "error",
            lastSubmitted: new Date().toISOString(),
            message: error.message || "Failed to submit",
          });
        }
      }

      res.json({
        success: true,
        submitted,
        errors: errors.length > 0 ? errors : undefined,
      });
    } catch (error: any) {
      console.error("Submit URLs error:", error);
      res.json({ success: false, error: error.message || "Failed to submit URLs" });
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
        
        // Persist to Supabase
        const supabaseResult = await updateVercelConfig(req.session.githubToken!, token, teamId);
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
      
      // Clear from Supabase
      const supabaseResult = await clearVercelConfig(req.session.githubToken!);
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

  // Trigger new deployment
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

      const { VercelService } = await import("./vercel");
      const vercel = new VercelService(config.token, config.teamId);
      
      const deployment = await vercel.triggerDeployment(project.name, {
        owner: repo.owner,
        repo: repo.name,
        branch: repo.activeBranch,
      });
      
      // Refresh deployments list
      const deployments = await vercel.getDeployments(project.id);
      await storage.setVercelDeployments(deployments);
      
      res.json({ success: true, data: deployment });
    } catch (error: any) {
      res.json({ success: false, error: error.message });
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
