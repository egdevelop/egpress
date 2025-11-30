# EG Press

## Overview

EG Press is a web-based Content Management System (CMS) designed for managing Astro blog templates (specifically template-egpress-v1) with seamless GitHub integration. It provides a visual interface for users to manage blog content directly from their GitHub repositories, offering features like CRUD operations for posts, theme customization, branding, AdSense management, and static page editing. The system aims to simplify the process of maintaining a blog hosted on GitHub, providing tools for content creation, deployment, and SEO. Key capabilities include AI post generation, Google Search Console integration, Vercel deployment management, and sitemap generation.

## User Preferences

- Dark/light mode toggle available
- Sidebar collapsible for more editing space
- Resizable panels in editor views
- File upload for images (stored in /public/image)

## System Architecture

The system comprises a React-based frontend and an Express.js backend.

**UI/UX Decisions:**
- **Design System:** Utilizes Shadcn UI components, Tailwind CSS for styling.
- **Color Scheme:** Primary color #FF5D01 (Astro Orange) with comprehensive design token customization.
- **Typography:** Inter for UI elements and JetBrains Mono for code.
- **Layout:** Features a split-panel design with a collapsible sidebar and resizable panels for an optimized editing experience.
- **Components:** Card-based design with subtle shadows.
- **Onboarding:** Includes an onboarding wizard and a setup progress dashboard.

**Technical Implementations & Feature Specifications:**
- **Frontend:** Built with React, utilizing Wouter for routing and Monaco Editor for a rich Markdown editing experience with live preview. TanStack Query is used for state management.
- **Backend:** Express.js handles API endpoints and integrates with various external services.
- **GitHub Integration:** Connects to repositories via `owner/repo` format, allowing file tree navigation, direct file editing, and committing changes. Supports GitHub OAuth and Personal Access Tokens for authentication.
- **Content Management:** CRUD operations for blog posts with frontmatter support, tag management, and image upload for hero images.
- **Site Settings (egpress-v1):** Comprehensive configuration matching siteSettings.ts structure:
  - General: siteName, siteTagline, siteDescription, siteUrl
  - Logo: type (text/image), text, image (file upload), favicon (file upload), showText, width, height
  - SEO: 18 fields including defaultTitle, titleTemplate, defaultDescription, defaultImage (file upload), keywords, language, locale, themeColor, robots, twitterHandle, twitterCardType, verification IDs, analytics, author/publisher info
  - Social: 6 platforms (twitter, linkedin, facebook, instagram, github, youtube)
  - Contact: email, phone, address
  - Features: enableSearch, enableCategories, enableTags, enableComments, enableNewsletter, enableRss, postsPerPage, relatedPostsCount
- **Content Defaults:** Navigation management (header/footer nav items), homepage content (heroTitle, heroSubtitle, section titles), blog settings, and categories configuration with color customization.
- **Theme Editor:** Full designTokens configuration:
  - Colors: primary, primaryHover, primaryLight, secondary, accent, background, surface, text (primary/secondary/muted/inverse), border, success, warning, error
  - Typography: fontFamily (sans/serif/mono), fontSize (xs-5xl), fontWeight (normal/medium/semibold/bold), lineHeight (tight/normal/relaxed)
  - Spacing: xs through 3xl
  - Border Radius: none through full
  - Shadows: sm through xl
- **Image Upload:** File upload component that stores images to GitHub /public/image directory, returning paths accessible after build (/image/filename).
- **File Management:** A file browser for navigating and editing repository files with syntax highlighting.
- **AdSense Manager:** Configuration for Google AdSense with multiple ad slot placements.
- **Static Pages Editor:** Edits non-blog pages.
- **AI Post Generation:** Leverages Google Gemini AI for generating blog posts.
- **Google Search Console Integration:** Service account integration for site selection, URL indexing, sitemap submission, and domain verification, with encrypted storage for credentials.
- **Vercel Integration:** Automatic project linking, deployment triggering, and domain management for Vercel-hosted sites.
- **Sitemap Generation:** Automatic `sitemap.xml` generation, commit to repository, and submission to Google.
- **Site Cloner:** Functionality to clone existing repositories to create new blog sites.
- **Persistence (Optional):** Supports Supabase for persistent storage of user and repository settings, including encrypted API keys and service accounts. Without Supabase, settings are in-memory.

**System Design Choices:**
- **API-driven:** A comprehensive set of RESTful API endpoints for all functionalities.
- **Modular:** Clear separation between client and server, with shared types.
- **Security:** Session management with `SESSION_SECRET` and AES-256-GCM encryption for sensitive data when Supabase is used.
- **Validation:** Zod for schema validation.
- **AST-based Config Updates:** Uses ts-morph for safe, targeted updates to siteSettings.ts without corrupting unrelated values.

## Recent Changes (November 2024)

- Updated Site Settings to match new siteSettings.ts structure from template-egpress-v1
- Updated Logo settings with new structure: type (text/image), image upload, favicon upload, showText, width, height
- Added Content Defaults page for navigation, homepage, blog, and categories configuration
- Enhanced Theme page with full designTokens support (typography, spacing, borderRadius, shadows)
- Created ImageUpload component for file uploads to GitHub /public/image directory
- Fixed image preview to use GitHub raw URLs instead of non-existent local paths
- Converted all image inputs (OG image, hero image, etc.) to file upload instead of URL input
- Images are stored in /public/image and accessible at /image/filename after build
- Fixed Gemini API key saving - key is now securely stored and can be reused without re-entering
- Enhanced AI post generation with richer prompts, hero image suggestions, and better structured content
- Updated project favicon to "EG" with orange theme color (#FF5D01)

## External Dependencies

- **GitHub:** For repository management, content storage, and version control. Uses Octokit for API interactions.
- **Google Gemini AI:** For AI-powered blog post generation.
- **Vercel:** For deployment and domain management of blog sites.
- **Google Search Console (and Indexing API):** For SEO, site verification, sitemap submission, and URL indexing.
- **Supabase (Optional):** Used for persistent storage of user settings and repository-specific configurations (API keys, tokens, site configs).