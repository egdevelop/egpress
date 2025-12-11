import { z } from "zod";

// Repository connection schema
export const repositorySchema = z.object({
  id: z.string(),
  owner: z.string(),
  name: z.string(),
  fullName: z.string(),
  defaultBranch: z.string(),
  activeBranch: z.string(), // Branch being edited (main = template, others = sites)
  connected: z.boolean(),
  lastSynced: z.string().optional(),
});

export type Repository = z.infer<typeof repositorySchema>;

// Branch/Site info schema
export const branchInfoSchema = z.object({
  name: z.string(),
  domain: z.string().optional(), // Domain name if this is a site branch
  isTemplate: z.boolean(), // True if this is the main/template branch
  lastCommit: z.string().optional(),
});

export type BranchInfo = z.infer<typeof branchInfoSchema>;

export const insertRepositorySchema = repositorySchema.omit({ id: true });
export type InsertRepository = z.infer<typeof insertRepositorySchema>;

// Author schema (can be string or object)
export const authorSchema = z.union([
  z.string(),
  z.object({
    name: z.string(),
    avatar: z.string().optional(),
  }),
]);

export type Author = z.infer<typeof authorSchema>;

// Blog post schema (based on Astro blog template)
export const postSchema = z.object({
  path: z.string(),
  slug: z.string(),
  title: z.string(),
  description: z.string().optional(),
  pubDate: z.string(),
  heroImage: z.string().optional(),
  author: authorSchema.optional(),
  category: z.string().optional(),
  tags: z.array(z.string()).optional(),
  draft: z.boolean().optional(),
  featured: z.boolean().optional(),
  content: z.string(),
  // Store raw frontmatter to preserve original structure
  rawFrontmatter: z.record(z.any()).optional(),
});

export type Post = z.infer<typeof postSchema>;

export const insertPostSchema = postSchema.omit({ path: true }).extend({
  slug: z.string().min(1, "Slug is required"),
  title: z.string().min(1, "Title is required"),
  content: z.string().min(1, "Content is required"),
});
export type InsertPost = z.infer<typeof insertPostSchema>;

// Theme settings schema
export const themeSettingsSchema = z.object({
  primary: z.string().default("#FF5D01"),
  secondary: z.string().default("#0C0C0C"),
  background: z.string().default("#FAFAFA"),
  text: z.string().default("#1E293B"),
  accent: z.string().default("#8B5CF6"),
  success: z.string().default("#10B981"),
});

export type ThemeSettings = z.infer<typeof themeSettingsSchema>;

// File tree item type (defined first to avoid circular reference issues)
export interface FileTreeItem {
  name: string;
  path: string;
  type: "file" | "dir";
  children?: FileTreeItem[];
}

// File tree item schema
export const fileTreeItemSchema: z.ZodType<FileTreeItem> = z.object({
  name: z.string(),
  path: z.string(),
  type: z.enum(["file", "dir"]),
  children: z.lazy(() => z.array(fileTreeItemSchema)).optional(),
});

// GitHub commit schema
export const commitSchema = z.object({
  message: z.string().min(1, "Commit message is required"),
  files: z.array(z.object({
    path: z.string(),
    content: z.string(),
  })),
});

export type CommitData = z.infer<typeof commitSchema>;

// API response types
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

// Page content schema
export const pageContentSchema = z.object({
  path: z.string(),
  content: z.string(),
  name: z.string(),
});

export type PageContent = z.infer<typeof pageContentSchema>;

// Site configuration schema (branding)
export const siteConfigSchema = z.object({
  siteName: z.string().default("My Blog"),
  tagline: z.string().default("A modern blog"),
  description: z.string().default(""),
  logoUrl: z.string().optional(),
  faviconUrl: z.string().optional(),
  socialLinks: z.object({
    twitter: z.string().optional(),
    github: z.string().optional(),
    linkedin: z.string().optional(),
    instagram: z.string().optional(),
    youtube: z.string().optional(),
  }).optional(),
  author: z.object({
    name: z.string().default(""),
    avatar: z.string().optional(),
    bio: z.string().optional(),
  }).optional(),
});

export type SiteConfig = z.infer<typeof siteConfigSchema>;

// Ad slot configuration schema
export const adSlotConfigSchema = z.object({
  slot: z.string().default(""),
  format: z.string().default("auto"),
  layout: z.string().optional(),
  responsive: z.boolean().default(true),
});

export type AdSlotConfig = z.infer<typeof adSlotConfigSchema>;

// AdSense configuration schema
export const adsenseConfigSchema = z.object({
  enabled: z.boolean().default(false),
  publisherId: z.string().default(""),
  autoAdsEnabled: z.boolean().default(false),
  // Header script - injected into <head> tag
  headerScript: z.string().optional(),
  // Ad slot configurations for each placement
  adCodes: z.object({
    header: adSlotConfigSchema.optional(),
    sidebar: adSlotConfigSchema.optional(),
    inArticle: adSlotConfigSchema.optional(),
    footer: adSlotConfigSchema.optional(),
    beforeContent: adSlotConfigSchema.optional(),
    afterContent: adSlotConfigSchema.optional(),
  }).optional(),
});

export type AdsenseConfig = z.infer<typeof adsenseConfigSchema>;

// Static page info schema
export const staticPageSchema = z.object({
  path: z.string(),
  name: z.string(),
  title: z.string(),
  description: z.string().optional(),
});

export type StaticPage = z.infer<typeof staticPageSchema>;

// Editable content block for static pages
export const contentBlockSchema = z.object({
  id: z.string(),
  type: z.enum(["title", "heading", "paragraph", "list", "image", "link"]),
  value: z.string(),
  metadata: z.record(z.string()).optional(), // For additional attributes like href, src, alt
});

export type ContentBlock = z.infer<typeof contentBlockSchema>;

// Static page with parsed editable content
export const editablePageSchema = z.object({
  path: z.string(),
  name: z.string(),
  title: z.string(),
  description: z.string().optional(),
  content: z.array(contentBlockSchema), // Parsed editable content blocks
  rawContent: z.string(), // Original Astro file content for reference
});

export type EditablePage = z.infer<typeof editablePageSchema>;

// AI generation request schema
export const aiGenerateSchema = z.object({
  topic: z.string().min(1, "Topic is required"),
  keywords: z.array(z.string()).optional(),
  tone: z.enum(["professional", "casual", "technical", "creative"]).default("professional"),
  length: z.enum(["short", "medium", "long"]).default("medium"),
});

export type AIGenerateRequest = z.infer<typeof aiGenerateSchema>;

// GitHub repository info (for listing)
export const githubRepoSchema = z.object({
  id: z.string(),
  name: z.string(),
  fullName: z.string(),
  owner: z.string(),
  description: z.string(),
  isPrivate: z.boolean(),
  defaultBranch: z.string(),
  updatedAt: z.string().nullable(),
});

export type GitHubRepo = z.infer<typeof githubRepoSchema>;

// Vercel configuration schema
export const vercelConfigSchema = z.object({
  token: z.string(),
  teamId: z.string().optional(),
  username: z.string().optional(),
});

export type VercelConfig = z.infer<typeof vercelConfigSchema>;

// Vercel project schema
export const vercelProjectSchema = z.object({
  id: z.string(),
  name: z.string(),
  framework: z.string().optional(),
  productionUrl: z.string().optional(),
  createdAt: z.string().optional(),
  gitRepository: z.object({
    type: z.string(),
    repo: z.string(),
  }).optional(),
});

export type VercelProject = z.infer<typeof vercelProjectSchema>;

// Vercel deployment schema
export const vercelDeploymentSchema = z.object({
  id: z.string(),
  url: z.string(),
  state: z.enum(["BUILDING", "ERROR", "INITIALIZING", "QUEUED", "READY", "CANCELED"]),
  createdAt: z.number(),
  buildingAt: z.number().optional(),
  readyAt: z.number().optional(),
  target: z.string().optional(),
  source: z.string().optional(),
  meta: z.object({
    githubCommitRef: z.string().optional(),
    githubCommitMessage: z.string().optional(),
  }).optional(),
});

export type VercelDeployment = z.infer<typeof vercelDeploymentSchema>;

// Vercel DNS record schema
export const vercelDnsRecordSchema = z.object({
  type: z.string(),
  name: z.string(),
  value: z.string(),
});

export type VercelDnsRecord = z.infer<typeof vercelDnsRecordSchema>;

// Vercel domain schema with full verification details
export const vercelDomainSchema = z.object({
  name: z.string(),
  verified: z.boolean(),
  configured: z.boolean().optional(),
  createdAt: z.number().optional(),
  verification: z.array(z.object({
    type: z.string(),
    domain: z.string(),
    value: z.string(),
    reason: z.string(),
  })).optional(),
  verificationRecord: z.object({
    type: z.string(),
    name: z.string(),
    value: z.string(),
  }).optional(),
  txtVerification: z.object({
    name: z.string(),
    value: z.string(),
  }).optional(),
  configuredBy: z.string().nullable().optional(),
  apexName: z.string().optional(),
  gitBranch: z.string().nullable().optional(),
  redirect: z.string().nullable().optional(),
  redirectStatusCode: z.number().nullable().optional(),
  dnsRecords: z.array(vercelDnsRecordSchema).optional(),
});

export type VercelDomain = z.infer<typeof vercelDomainSchema>;

// Vercel credentials form schema (for frontend)
export const vercelCredentialsSchema = z.object({
  token: z.string().min(1, "Vercel token is required"),
  teamId: z.string().optional(),
});

export type VercelCredentials = z.infer<typeof vercelCredentialsSchema>;

// Vercel add domain schema
export const vercelAddDomainSchema = z.object({
  domain: z.string().min(1, "Domain is required"),
});

export type VercelAddDomain = z.infer<typeof vercelAddDomainSchema>;

// Draft change types for Smart Deploy batching
export const draftChangeTypeSchema = z.enum([
  "post_create",
  "post_update", 
  "post_delete",
  "settings_update",
  "theme_update",
  "navigation_update",
  "content_defaults_update",
  "static_page_update",
  "image_upload",
  "image_replace",
  "image_delete",
  "file_update",
]);

export type DraftChangeType = z.infer<typeof draftChangeTypeSchema>;

// File operation for batch commits
export const fileOperationSchema = z.object({
  type: z.enum(["write", "delete"]),
  path: z.string(),
  content: z.string().optional(), // Base64 encoded for binary, plain text for markdown
  encoding: z.enum(["utf-8", "base64"]).default("utf-8"),
});

export type FileOperation = z.infer<typeof fileOperationSchema>;

// Individual draft change item
export const draftChangeSchema = z.object({
  id: z.string(),
  type: draftChangeTypeSchema,
  title: z.string(), // Human-readable description
  path: z.string(), // Primary file path affected (for display)
  content: z.string().optional(), // New content (for simple single-file changes)
  previousContent: z.string().optional(), // Previous content (for showing diff)
  operations: z.array(fileOperationSchema).optional(), // Multiple file operations (write/delete)
  metadata: z.record(z.any()).optional(), // Additional data (e.g., commit message, previousPath for image replace)
  createdAt: z.string(), // ISO timestamp
});

export type DraftChange = z.infer<typeof draftChangeSchema>;

// Draft queue state
export const draftQueueSchema = z.object({
  repositoryId: z.string(),
  changes: z.array(draftChangeSchema),
  baseSha: z.string().optional(), // SHA of the commit these changes are based on
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type DraftQueue = z.infer<typeof draftQueueSchema>;

// Smart Deploy settings
export const smartDeploySettingsSchema = z.object({
  enabled: z.boolean().default(true),
  autoQueueChanges: z.boolean().default(true), // Automatically queue instead of immediate commit
});

export type SmartDeploySettings = z.infer<typeof smartDeploySettingsSchema>;

// SEO Issue type enum
export const seoIssueTypeSchema = z.enum(["error", "warning", "info"]);
export type SEOIssueType = z.infer<typeof seoIssueTypeSchema>;

// SEO Issue category enum
export const seoIssueCategorySchema = z.enum(["meta", "content", "images", "structure", "social"]);
export type SEOIssueCategory = z.infer<typeof seoIssueCategorySchema>;

// SEO Issue schema
export const seoIssueSchema = z.object({
  type: seoIssueTypeSchema,
  category: seoIssueCategorySchema,
  title: z.string(),
  description: z.string(),
  affectedItem: z.string(), // post slug or "site-settings"
  currentValue: z.string().optional(),
  suggestedValue: z.string().optional(),
  autoFixable: z.boolean(),
});

export type SEOIssue = z.infer<typeof seoIssueSchema>;

// SEO Analysis Result schema
export const seoAnalysisResultSchema = z.object({
  score: z.number().min(0).max(100),
  issues: z.array(seoIssueSchema),
  summary: z.object({
    errors: z.number(),
    warnings: z.number(),
    info: z.number(),
  }),
  analyzedPosts: z.number(),
  analyzedAt: z.string(), // ISO timestamp
});

export type SEOAnalysisResult = z.infer<typeof seoAnalysisResultSchema>;

// SEO Fix Request schema
export const seoFixRequestSchema = z.object({
  issueIds: z.array(z.string()).optional(), // if not provided, fix all autoFixable
  generateMissing: z.boolean(), // use AI to generate missing descriptions
});

export type SEOFixRequest = z.infer<typeof seoFixRequestSchema>;
