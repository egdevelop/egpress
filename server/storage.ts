import type { Repository, Post, ThemeSettings, FileTreeItem, PageContent, SiteConfig, AdsenseConfig, StaticPage, BranchInfo, VercelConfig, VercelProject, VercelDeployment, VercelDomain, DraftQueue, DraftChange, SmartDeploySettings } from "@shared/schema";
import { randomUUID } from "crypto";

export interface SearchConsoleConfig {
  siteUrl: string;
  serviceAccountJson?: string;
  clientEmail?: string;
  privateKey?: string;
}

export interface IndexingStatus {
  url: string;
  status: "pending" | "submitted" | "indexed" | "error";
  lastSubmitted?: string;
  message?: string;
}

export interface IStorage {
  // Repository
  getRepository(): Promise<Repository | null>;
  setRepository(repo: Repository): Promise<void>;
  clearRepository(): Promise<void>;
  
  // Branch management
  setActiveBranch(branch: string): Promise<void>;
  getBranches(): Promise<BranchInfo[]>;
  setBranches(branches: BranchInfo[]): Promise<void>;

  // Posts (cached from GitHub)
  getPosts(): Promise<Post[]>;
  getPost(slug: string): Promise<Post | undefined>;
  setPosts(posts: Post[]): Promise<void>;

  // Theme settings (cached from GitHub)
  getTheme(): Promise<ThemeSettings | null>;
  setTheme(theme: ThemeSettings): Promise<void>;

  // File tree (cached from GitHub)
  getFileTree(): Promise<FileTreeItem[]>;
  setFileTree(files: FileTreeItem[]): Promise<void>;

  // File content (cached from GitHub)
  getFileContent(path: string): Promise<string | undefined>;
  setFileContent(path: string, content: string): Promise<void>;
  clearFileContents(): Promise<void>;

  // Site config (branding)
  getSiteConfig(): Promise<SiteConfig | null>;
  setSiteConfig(config: SiteConfig): Promise<void>;

  // AdSense config
  getAdsenseConfig(): Promise<AdsenseConfig | null>;
  setAdsenseConfig(config: AdsenseConfig): Promise<void>;

  // Static pages
  getStaticPages(): Promise<StaticPage[]>;
  setStaticPages(pages: StaticPage[]): Promise<void>;

  // Search Console
  getSearchConsoleConfig(): Promise<SearchConsoleConfig | null>;
  setSearchConsoleConfig(config: SearchConsoleConfig | null): Promise<void>;
  getIndexingStatus(): Promise<IndexingStatus[]>;
  setIndexingStatus(status: IndexingStatus[]): Promise<void>;
  updateIndexingStatus(url: string, status: Partial<IndexingStatus>): Promise<void>;

  // Vercel
  getVercelConfig(): Promise<VercelConfig | null>;
  setVercelConfig(config: VercelConfig | null): Promise<void>;
  getVercelProject(): Promise<VercelProject | null>;
  setVercelProject(project: VercelProject | null): Promise<void>;
  getVercelDeployments(): Promise<VercelDeployment[]>;
  setVercelDeployments(deployments: VercelDeployment[]): Promise<void>;
  getVercelDomains(): Promise<VercelDomain[]>;
  setVercelDomains(domains: VercelDomain[]): Promise<void>;

  // Gemini
  getGeminiApiKey(): Promise<string | null>;
  setGeminiApiKey(key: string | null): Promise<void>;

  // Smart Deploy Draft Queue
  getDraftQueue(): Promise<DraftQueue | null>;
  setDraftQueue(queue: DraftQueue | null): Promise<void>;
  addDraftChange(change: DraftChange): Promise<void>;
  removeDraftChange(changeId: string): Promise<void>;
  clearDraftQueue(): Promise<void>;
  getSmartDeploySettings(): Promise<SmartDeploySettings>;
  setSmartDeploySettings(settings: SmartDeploySettings): Promise<void>;
}

export class MemStorage implements IStorage {
  private repository: Repository | null = null;
  private branches: BranchInfo[] = [];
  private posts: Map<string, Post> = new Map();
  private theme: ThemeSettings | null = null;
  private fileTree: FileTreeItem[] = [];
  private fileContents: Map<string, string> = new Map();
  private siteConfig: SiteConfig | null = null;
  private adsenseConfig: AdsenseConfig | null = null;
  private staticPages: StaticPage[] = [];
  private searchConsoleConfig: SearchConsoleConfig | null = null;
  private indexingStatus: IndexingStatus[] = [];
  private vercelConfig: VercelConfig | null = null;
  private vercelProject: VercelProject | null = null;
  private vercelDeployments: VercelDeployment[] = [];
  private vercelDomains: VercelDomain[] = [];
  private geminiApiKey: string | null = null;
  private draftQueue: DraftQueue | null = null;
  private smartDeploySettings: SmartDeploySettings = { enabled: true, autoQueueChanges: true };

  async getRepository(): Promise<Repository | null> {
    return this.repository;
  }

  async setRepository(repo: Repository): Promise<void> {
    this.repository = repo;
  }

  async clearRepository(): Promise<void> {
    this.repository = null;
    this.branches = [];
    this.posts.clear();
    this.theme = null;
    this.fileTree = [];
    this.fileContents.clear();
    this.siteConfig = null;
    this.adsenseConfig = null;
    this.staticPages = [];
    this.searchConsoleConfig = null;
    this.indexingStatus = [];
    this.vercelConfig = null;
    this.vercelProject = null;
    this.vercelDeployments = [];
    this.vercelDomains = [];
  }
  
  async setActiveBranch(branch: string): Promise<void> {
    if (this.repository) {
      this.repository = { ...this.repository, activeBranch: branch };
      // Clear cached content when switching branches
      this.posts.clear();
      this.theme = null;
      this.fileTree = [];
      this.fileContents.clear();
      this.siteConfig = null;
      this.adsenseConfig = null;
      this.staticPages = [];
    }
  }
  
  async getBranches(): Promise<BranchInfo[]> {
    return this.branches;
  }
  
  async setBranches(branches: BranchInfo[]): Promise<void> {
    this.branches = branches;
  }
  
  async clearFileContents(): Promise<void> {
    this.fileContents.clear();
  }

  async getPosts(): Promise<Post[]> {
    return Array.from(this.posts.values());
  }

  async getPost(slug: string): Promise<Post | undefined> {
    return this.posts.get(slug);
  }

  async setPosts(posts: Post[]): Promise<void> {
    this.posts.clear();
    for (const post of posts) {
      this.posts.set(post.slug, post);
    }
  }

  async getTheme(): Promise<ThemeSettings | null> {
    return this.theme;
  }

  async setTheme(theme: ThemeSettings): Promise<void> {
    this.theme = theme;
  }

  async getFileTree(): Promise<FileTreeItem[]> {
    return this.fileTree;
  }

  async setFileTree(files: FileTreeItem[]): Promise<void> {
    this.fileTree = files;
  }

  async getFileContent(path: string): Promise<string | undefined> {
    return this.fileContents.get(path);
  }

  async setFileContent(path: string, content: string): Promise<void> {
    this.fileContents.set(path, content);
  }

  async getSiteConfig(): Promise<SiteConfig | null> {
    return this.siteConfig;
  }

  async setSiteConfig(config: SiteConfig): Promise<void> {
    this.siteConfig = config;
  }

  async getAdsenseConfig(): Promise<AdsenseConfig | null> {
    return this.adsenseConfig;
  }

  async setAdsenseConfig(config: AdsenseConfig): Promise<void> {
    this.adsenseConfig = config;
  }

  async getStaticPages(): Promise<StaticPage[]> {
    return this.staticPages;
  }

  async setStaticPages(pages: StaticPage[]): Promise<void> {
    this.staticPages = pages;
  }

  async getSearchConsoleConfig(): Promise<SearchConsoleConfig | null> {
    return this.searchConsoleConfig;
  }

  async setSearchConsoleConfig(config: SearchConsoleConfig | null): Promise<void> {
    this.searchConsoleConfig = config;
  }

  async getIndexingStatus(): Promise<IndexingStatus[]> {
    return this.indexingStatus;
  }

  async setIndexingStatus(status: IndexingStatus[]): Promise<void> {
    this.indexingStatus = status;
  }

  async updateIndexingStatus(url: string, updates: Partial<IndexingStatus>): Promise<void> {
    const existing = this.indexingStatus.find(s => s.url === url);
    if (existing) {
      Object.assign(existing, updates);
    } else {
      this.indexingStatus.push({
        url,
        status: "pending",
        ...updates,
      } as IndexingStatus);
    }
  }

  async getVercelConfig(): Promise<VercelConfig | null> {
    return this.vercelConfig;
  }

  async setVercelConfig(config: VercelConfig | null): Promise<void> {
    this.vercelConfig = config;
  }

  async getVercelProject(): Promise<VercelProject | null> {
    return this.vercelProject;
  }

  async setVercelProject(project: VercelProject | null): Promise<void> {
    this.vercelProject = project;
  }

  async getVercelDeployments(): Promise<VercelDeployment[]> {
    return this.vercelDeployments;
  }

  async setVercelDeployments(deployments: VercelDeployment[]): Promise<void> {
    this.vercelDeployments = deployments;
  }

  async getVercelDomains(): Promise<VercelDomain[]> {
    return this.vercelDomains;
  }

  async setVercelDomains(domains: VercelDomain[]): Promise<void> {
    this.vercelDomains = domains;
  }

  async getGeminiApiKey(): Promise<string | null> {
    return this.geminiApiKey;
  }

  async setGeminiApiKey(key: string | null): Promise<void> {
    this.geminiApiKey = key;
  }

  async getDraftQueue(): Promise<DraftQueue | null> {
    return this.draftQueue;
  }

  async setDraftQueue(queue: DraftQueue | null): Promise<void> {
    this.draftQueue = queue;
  }

  async addDraftChange(change: DraftChange): Promise<void> {
    const repo = await this.getRepository();
    if (!repo) return;
    
    const now = new Date().toISOString();
    
    if (!this.draftQueue) {
      this.draftQueue = {
        repositoryId: repo.id,
        changes: [],
        createdAt: now,
        updatedAt: now,
      };
    }
    
    // Check if there's already a change for this path - replace it
    const existingIndex = this.draftQueue.changes.findIndex(c => c.path === change.path);
    if (existingIndex >= 0) {
      this.draftQueue.changes[existingIndex] = change;
    } else {
      this.draftQueue.changes.push(change);
    }
    this.draftQueue.updatedAt = now;
  }

  async removeDraftChange(changeId: string): Promise<void> {
    if (!this.draftQueue) return;
    this.draftQueue.changes = this.draftQueue.changes.filter(c => c.id !== changeId);
    this.draftQueue.updatedAt = new Date().toISOString();
    
    // Clear queue if empty
    if (this.draftQueue.changes.length === 0) {
      this.draftQueue = null;
    }
  }

  async clearDraftQueue(): Promise<void> {
    this.draftQueue = null;
  }

  async getSmartDeploySettings(): Promise<SmartDeploySettings> {
    return this.smartDeploySettings;
  }

  async setSmartDeploySettings(settings: SmartDeploySettings): Promise<void> {
    this.smartDeploySettings = settings;
  }
}

export const storage = new MemStorage();
