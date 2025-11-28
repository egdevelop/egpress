import type { Repository, Post, ThemeSettings, FileTreeItem, PageContent, SiteConfig, AdsenseConfig, StaticPage, BranchInfo } from "@shared/schema";
import { randomUUID } from "crypto";

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
}

export const storage = new MemStorage();
