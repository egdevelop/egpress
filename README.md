# EG Press

A self-hosted, web-based CMS for managing Astro blog templates with GitHub integration.

## Features

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

## Tech Stack

- **Frontend**: React, Tailwind CSS, Shadcn UI, Wouter
- **Backend**: Express.js, Octokit (GitHub API)
- **Editor**: Monaco Editor, React Markdown
- **State**: TanStack Query
- **Validation**: Zod

## Quick Start (Development)

```bash
# Install dependencies
npm install

# Run development server
npm run dev
```

The app will be available at `http://localhost:5000`

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `SESSION_SECRET` | Yes | Random string for session security |
| `PORT` | No | Server port (default: 5000) |
| `SUPABASE_URL` | No | Supabase project URL for persistent storage |
| `SUPABASE_ANON_KEY` | No | Supabase anon key |

## Deploy to Coolify

### Prerequisites
- Coolify installed on your VPS ([installation guide](https://coolify.io/docs/installation))
- This repository pushed to GitHub

### Steps

1. **Login to Coolify Dashboard**

2. **Create New Resource**
   - Click "New Resource" → "Application"
   - Select "Docker" as build pack

3. **Connect Repository**
   - Choose GitHub as source
   - Select your `egdevelop/egpress` repository
   - Branch: `main`

4. **Configure Build Settings**
   - Build Pack: `Dockerfile`
   - Port: `5000`

5. **Set Environment Variables**
   ```
   SESSION_SECRET=<generate-a-random-string>
   NODE_ENV=production
   ```
   
   Optional (for persistent storage):
   ```
   SUPABASE_URL=https://your-project.supabase.co
   SUPABASE_ANON_KEY=your-anon-key
   ```

6. **Deploy**
   - Click "Deploy"
   - Wait for build to complete

### Health Check

The application exposes a health endpoint at `/api/health` for monitoring.

## Deploy to Railway

[![Deploy on Railway](https://railway.app/button.svg)](https://railway.app/template)

1. Click the button above or go to Railway
2. Connect your GitHub account
3. Select the `egdevelop/egpress` repository
4. Set environment variables:
   - `SESSION_SECRET`: Generate a random string
5. Deploy!

## Deploy to Render

1. Create a new Web Service
2. Connect your GitHub repository
3. Configure:
   - Build Command: `npm install && npm run build`
   - Start Command: `npm start`
   - Environment: `Node`
4. Add environment variables
5. Deploy

## Supabase Setup (Optional)

For persistent storage of user settings (API keys, tokens):

1. Create a free project at [supabase.com](https://supabase.com)
2. Get your project URL and anon key from Settings > API
3. Run this SQL in Supabase SQL Editor:

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

4. Set `SUPABASE_URL` and `SUPABASE_ANON_KEY` environment variables

## Authentication

The CMS uses GitHub Personal Access Tokens for authentication:

1. Go to [GitHub Settings > Developer Settings > Personal Access Tokens](https://github.com/settings/tokens/new)
2. Generate a new token with `repo` scope
3. Use this token to login to EG Press

## License

MIT
