# Astro Blog CMS

A web-based Content Management System for managing Astro blog templates with GitHub integration.

## Overview

This CMS provides a visual interface for managing Astro blog content directly from GitHub repositories. It features:

- **CRUD Operations**: Create, read, update, and delete blog posts
- **GitHub Integration**: Connect to any GitHub repository and sync changes
- **Theme Customization**: Customize blog colors with live preview
- **Branding Editor**: Configure site name, logo, favicon, social links, and author info
- **AdSense Manager**: Configure Google AdSense with multiple ad slot placements
- **Static Pages Editor**: Edit non-blog pages like About, Contact, Privacy
- **AI Post Generator**: Generate blog posts using Google Gemini AI
- **Google Search Console**: Submit URLs for indexing and track status
- **Vercel Integration**: Deploy to Vercel, manage domains, and view deployment status
- **Site Cloner**: Clone repositories to create new blog sites
- **File Browser**: Navigate and edit repository files
- **Markdown Editor**: Monaco-based editor with syntax highlighting and preview
- **Split-panel Layout**: Side-by-side editing and preview experience

## Project Structure

```
├── client/                 # Frontend React application
│   ├── src/
│   │   ├── components/     # Reusable UI components
│   │   │   ├── ui/         # Shadcn UI components
│   │   │   ├── app-sidebar.tsx
│   │   │   └── theme-toggle.tsx
│   │   ├── hooks/          # Custom React hooks
│   │   ├── lib/            # Utility functions and context
│   │   │   ├── queryClient.ts
│   │   │   ├── theme-context.tsx
│   │   │   └── utils.ts
│   │   ├── pages/          # Page components
│   │   │   ├── dashboard.tsx      # Overview & stats
│   │   │   ├── posts.tsx          # Blog posts list
│   │   │   ├── post-editor.tsx    # Markdown post editor
│   │   │   ├── file-browser.tsx   # Repository file tree
│   │   │   ├── theme-customizer.tsx # Color customization
│   │   │   ├── branding.tsx       # Site config editor
│   │   │   ├── adsense.tsx        # AdSense configuration
│   │   │   ├── pages-editor.tsx   # Static pages editor
│   │   │   ├── ai-generator.tsx   # AI post generation
│   │   │   ├── search-console.tsx # Google Search Console integration
│   │   │   ├── vercel.tsx         # Vercel deployment integration
│   │   │   ├── clone-site.tsx     # Clone to new repo
│   │   │   └── settings.tsx       # App settings
│   │   ├── App.tsx         # Main app with routing
│   │   └── index.css       # Global styles
├── server/                 # Backend Express server
│   ├── github.ts           # GitHub API integration
│   ├── gemini.ts           # Google Gemini AI integration
│   ├── vercel.ts           # Vercel API integration
│   ├── routes.ts           # API endpoints
│   ├── storage.ts          # In-memory data storage
│   └── index.ts            # Server entry point
├── shared/                 # Shared types and schemas
│   └── schema.ts           # Zod schemas and TypeScript types
└── design_guidelines.md    # UI/UX design specifications
```

## Tech Stack

- **Frontend**: React, Tailwind CSS, Shadcn UI, Wouter (routing)
- **Editor**: Monaco Editor, React Markdown
- **Backend**: Express.js, Octokit (GitHub API)
- **State Management**: TanStack Query
- **Validation**: Zod

## Key Features

### GitHub Integration
- Connect to any GitHub repository using `owner/repo` format
- Automatic syncing of repository content
- Commit changes directly to the repository
- View file tree with GitHub-style navigation

### Post Management
- List all blog posts with filtering and sorting
- Create new posts with frontmatter support
- Edit posts with live markdown preview
- Delete posts (commits deletion to repository)
- Tag management for categorization

### Theme Customization
- Six customizable color options (primary, secondary, background, text, accent, success)
- Live preview of color changes
- Save theme to repository as JSON config

### File Browser
- Navigate repository file structure
- Edit any file directly
- Commit changes with custom messages
- Syntax highlighting for multiple languages

## API Endpoints

### Repository
- `GET /api/repository` - Get connected repository
- `POST /api/repository/connect` - Connect to a repository
- `POST /api/repository/disconnect` - Disconnect from repository
- `POST /api/repository/sync` - Sync repository data

### Posts
- `GET /api/posts` - Get all posts
- `GET /api/posts/:slug` - Get single post
- `POST /api/posts` - Create new post
- `PUT /api/posts/:slug` - Update post
- `DELETE /api/posts/:slug` - Delete post

### Files
- `GET /api/files` - Get file tree
- `GET /api/files/content?path=` - Get file content
- `PUT /api/files/content` - Update file content

### Theme
- `GET /api/theme` - Get theme settings
- `PUT /api/theme` - Update theme settings

### Site Config (Branding)
- `GET /api/site-config` - Get site configuration
- `PUT /api/site-config` - Update site configuration

### AdSense
- `GET /api/adsense` - Get AdSense configuration
- `PUT /api/adsense` - Update AdSense configuration

### Static Pages
- `GET /api/pages` - Get list of static pages

### AI Generation
- `POST /api/ai/generate` - Generate blog post with Gemini AI
- `POST /api/ai/validate-key` - Validate Gemini API key
- `GET /api/ai/key` - Get saved Gemini API key
- `POST /api/ai/key` - Save Gemini API key
- `DELETE /api/ai/key` - Clear Gemini API key

### Authentication
- `GET /api/auth/status` - Check authentication status
- `POST /api/auth/login` - Login with GitHub token
- `POST /api/auth/logout` - Logout and clear session

### Clone Repository
- `POST /api/clone-repo` - Clone source repo to new repository

### GitHub Repositories
- `GET /api/github/repos` - List user's GitHub repositories (paginated)

### GitHub
- `GET /api/github/status` - Check GitHub connection and source
- `GET /api/github/user` - Get authenticated user
- `POST /api/github/token` - Set manual GitHub Personal Access Token
- `POST /api/github/token/clear` - Clear manual token

### Branding (Direct Component Editing)
- `GET /api/branding` - Get branding data from Header.astro and Footer.astro
- `PUT /api/branding` - Update Header.astro and Footer.astro

### Google Search Console
- `GET /api/search-console/config` - Get Search Console configuration
- `POST /api/search-console/credentials` - Save API credentials
- `DELETE /api/search-console/credentials` - Clear credentials
- `GET /api/search-console/status` - Get URL indexing status
- `POST /api/search-console/submit` - Submit URLs for indexing

### Vercel
- `GET /api/vercel/config` - Get Vercel configuration status
- `POST /api/vercel/token` - Save Vercel API token
- `DELETE /api/vercel/token` - Clear Vercel token
- `GET /api/vercel/projects` - List Vercel projects
- `POST /api/vercel/project/link` - Link or create Vercel project
- `POST /api/vercel/project/unlink` - Unlink Vercel project
- `GET /api/vercel/deployments` - Get deployments list
- `POST /api/vercel/deployments` - Trigger new deployment
- `GET /api/vercel/domains` - Get project domains
- `POST /api/vercel/domains` - Add domain
- `DELETE /api/vercel/domains/:domain` - Remove domain
- `POST /api/vercel/domains/:domain/verify` - Verify domain

## Design System

- **Primary Color**: #FF5D01 (Astro Orange)
- **Fonts**: Inter (UI), JetBrains Mono (code)
- **Layout**: Split-panel with collapsible sidebar
- **Components**: Card-based design with subtle shadows

## Development

The application runs on port 5000 with:
- Express backend serving API endpoints
- Vite dev server for frontend hot-reload

### GitHub Authentication Options

The CMS supports two GitHub authentication methods (in priority order):

1. **Environment Variable** - Set `GITHUB_TOKEN` in your environment for persistent authentication (recommended for self-hosting)
2. **Manual Token** - Enter a Personal Access Token in Settings (stored in memory, resets on restart)

For self-hosting, create a GitHub Personal Access Token at https://github.com/settings/tokens/new with `repo` scope.

## Self-Hosting Guide

This CMS is designed to be self-hosted on any server. Here's how to deploy:

### Prerequisites
- Node.js 18+ 
- npm or yarn

### Environment Variables
Set these environment variables for your deployment:

```bash
# Required for session security (generate a random string)
SESSION_SECRET=your_random_secret_here

# Optional: Port (defaults to 5000)
PORT=5000

# Optional: Supabase for persistent settings storage
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key
```

### Supabase Setup (Optional)

For persistent storage of user settings (API keys, tokens), you can configure Supabase:

1. Create a free Supabase project at https://supabase.com
2. Get your project URL and anon key from Settings > API
3. Set the environment variables above
4. Create the `user_settings` table using this SQL:

```sql
CREATE TABLE user_settings (
  id SERIAL PRIMARY KEY,
  github_token_hash VARCHAR(64) UNIQUE NOT NULL,
  github_username VARCHAR(255) NOT NULL,
  gemini_api_key TEXT,
  vercel_token TEXT,
  vercel_team_id VARCHAR(255),
  vercel_project_id VARCHAR(255),
  search_console_client_email TEXT,
  search_console_private_key TEXT,
  search_console_site_url TEXT,
  adsense_publisher_id VARCHAR(255),
  adsense_slots JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_user_settings_token_hash ON user_settings(github_token_hash);
```

**Notes**: 
- Without Supabase, settings are stored in memory and will be lost on restart.
- This CMS is designed for single-user self-hosting. If multiple users authenticate with different GitHub tokens simultaneously, settings may conflict. For multi-user deployments, consider running separate instances.

### Build & Run

```bash
# Install dependencies
npm install

# Build for production
npm run build

# Start production server
npm start
```

### Docker Deployment (Optional)

```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
RUN npm run build
EXPOSE 5000
ENV NODE_ENV=production
CMD ["npm", "start"]
```

### Features Configuration

All features work without external dependencies:
- **GitHub Integration**: Uses GITHUB_TOKEN env var or manual token via Settings
- **Vercel Deployment**: Configure via Vercel API token in the app
- **Google Search Console**: Configure credentials directly in the app
- **AI Post Generation**: Requires Gemini API key (configured in app)

## User Preferences

- Dark/light mode toggle available
- Sidebar collapsible for more editing space
- Resizable panels in editor views
