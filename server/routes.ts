import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { getGitHubClient, getAuthenticatedUser, isGitHubConnected, getGitHubConnectionInfo, setManualGitHubToken, clearManualToken } from "./github";
import { generateBlogPost } from "./gemini";
import matter from "gray-matter";
import type { Repository, Post, ThemeSettings, FileTreeItem, PageContent, SiteConfig, AdsenseConfig, StaticPage, BranchInfo } from "@shared/schema";
import { siteConfigSchema, adsenseConfigSchema } from "@shared/schema";

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
    
    return {
      path,
      slug,
      title: data.title || "Untitled",
      description: data.description || "",
      pubDate: data.pubDate ? new Date(data.pubDate).toISOString() : new Date().toISOString(),
      heroImage: data.heroImage || "",
      author: data.author || "",
      tags: Array.isArray(data.tags) ? data.tags : [],
      draft: data.draft === true,
      content: markdown,
    };
  } catch {
    return null;
  }
}

// Generate frontmatter content for a post
function generatePostContent(post: Omit<Post, "path">): string {
  const frontmatter: Record<string, any> = {
    title: post.title,
    description: post.description || "",
    pubDate: post.pubDate,
  };

  if (post.heroImage) frontmatter.heroImage = post.heroImage;
  if (post.author) frontmatter.author = post.author;
  if (post.tags && post.tags.length > 0) frontmatter.tags = post.tags;
  if (post.draft) frontmatter.draft = true;

  const frontmatterStr = Object.entries(frontmatter)
    .map(([key, value]) => {
      if (Array.isArray(value)) {
        return `${key}:\n${value.map(v => `  - "${v}"`).join("\n")}`;
      }
      if (typeof value === "string") {
        return `${key}: "${value}"`;
      }
      return `${key}: ${value}`;
    })
    .join("\n");

  return `---\n${frontmatterStr}\n---\n\n${post.content}`;
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  
  // Check GitHub connection status
  app.get("/api/github/status", async (req, res) => {
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

      const { slug, title, description, pubDate, heroImage, author, tags, draft, content, commitMessage } = req.body;
      
      const path = `src/content/blog/${slug}.md`;
      const fileContent = generatePostContent({
        slug, title, description, pubDate, heroImage, author, tags, draft, content
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

      const newPost: Post = {
        path, slug, title, description: description || "", 
        pubDate, heroImage: heroImage || "", author: author || "",
        tags: tags || [], draft: draft || false, content
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

      const { title, description, pubDate, heroImage, author, tags, draft, content, commitMessage } = req.body;
      
      const fileContent = generatePostContent({
        slug: req.params.slug, title, description, pubDate, heroImage, author, tags, draft, content
      });

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

      const updatedPost: Post = {
        ...existingPost,
        title, description: description || "", pubDate,
        heroImage: heroImage || "", author: author || "",
        tags: tags || [], draft: draft || false, content
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

  // Check if Gemini API key is valid
  app.post("/api/ai/validate-key", async (req, res) => {
    try {
      const { apiKey } = req.body;

      if (!apiKey) {
        return res.json({ success: false, error: "API key is required" });
      }

      // Try a simple request to validate the key
      const result = await generateBlogPost(apiKey, "Test", [], "casual", "short");
      
      res.json({ success: true, data: { valid: true } });
    } catch (error: any) {
      res.json({ success: false, error: "Invalid API key" });
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
