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

// Blog post schema (based on Astro blog template)
export const postSchema = z.object({
  path: z.string(),
  slug: z.string(),
  title: z.string(),
  description: z.string().optional(),
  pubDate: z.string(),
  heroImage: z.string().optional(),
  author: z.string().optional(),
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

// File tree item schema
export const fileTreeItemSchema = z.object({
  name: z.string(),
  path: z.string(),
  type: z.enum(["file", "dir"]),
  children: z.array(z.lazy(() => fileTreeItemSchema)).optional(),
});

export type FileTreeItem = z.infer<typeof fileTreeItemSchema>;

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
