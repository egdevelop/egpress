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
│   │   │   ├── dashboard.tsx
│   │   │   ├── posts.tsx
│   │   │   ├── post-editor.tsx
│   │   │   ├── file-browser.tsx
│   │   │   ├── theme-customizer.tsx
│   │   │   └── settings.tsx
│   │   ├── App.tsx         # Main app with routing
│   │   └── index.css       # Global styles
├── server/                 # Backend Express server
│   ├── github.ts           # GitHub API integration
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

### Clone Repository
- `POST /api/clone-repo` - Clone current repo to new repository

### GitHub
- `GET /api/github/status` - Check GitHub connection
- `GET /api/github/user` - Get authenticated user

## Design System

- **Primary Color**: #FF5D01 (Astro Orange)
- **Fonts**: Inter (UI), JetBrains Mono (code)
- **Layout**: Split-panel with collapsible sidebar
- **Components**: Card-based design with subtle shadows

## Development

The application runs on port 5000 with:
- Express backend serving API endpoints
- Vite dev server for frontend hot-reload
- GitHub OAuth via Replit integration

## User Preferences

- Dark/light mode toggle available
- Sidebar collapsible for more editing space
- Resizable panels in editor views
