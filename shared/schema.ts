import { z } from "zod";

// Repository connection schema
export const repositorySchema = z.object({
  id: z.string(),
  owner: z.string(),
  name: z.string(),
  fullName: z.string(),
  defaultBranch: z.string(),
  connected: z.boolean(),
  lastSynced: z.string().optional(),
});

export type Repository = z.infer<typeof repositorySchema>;

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
  tags: z.array(z.string()).optional(),
  draft: z.boolean().optional(),
  content: z.string(),
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

// AdSense configuration schema
export const adsenseConfigSchema = z.object({
  enabled: z.boolean().default(false),
  publisherId: z.string().default(""),
  autoAdsEnabled: z.boolean().default(false),
  slots: z.object({
    header: z.string().optional(),
    sidebar: z.string().optional(),
    inArticle: z.string().optional(),
    footer: z.string().optional(),
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

// AI generation request schema
export const aiGenerateSchema = z.object({
  topic: z.string().min(1, "Topic is required"),
  keywords: z.array(z.string()).optional(),
  tone: z.enum(["professional", "casual", "technical", "creative"]).default("professional"),
  length: z.enum(["short", "medium", "long"]).default("medium"),
});

export type AIGenerateRequest = z.infer<typeof aiGenerateSchema>;
