// GitHub Integration - supports environment variable or manual token for self-hosting
import { Octokit } from '@octokit/rest';

let manualToken: string | null = null;

// Set manual GitHub token (stored in memory, not persisted)
export function setManualGitHubToken(token: string | null) {
  manualToken = token;
}

// Get current token source
export function getTokenSource(): "manual" | "env" | null {
  if (process.env.GITHUB_TOKEN) return "env";
  if (manualToken) return "manual";
  return null;
}

// Clear manual token
export function clearManualToken() {
  manualToken = null;
}

async function getAccessToken(): Promise<string> {
  // Priority 1: Environment variable (for self-hosting)
  if (process.env.GITHUB_TOKEN) {
    return process.env.GITHUB_TOKEN;
  }

  // Priority 2: Manual token set via Settings page
  if (manualToken) {
    return manualToken;
  }
  
  throw new Error('No GitHub token available. Please set GITHUB_TOKEN environment variable or enter a Personal Access Token in Settings.');
}

// Always get a fresh client - tokens expire
export async function getGitHubClient(): Promise<Octokit> {
  const accessToken = await getAccessToken();
  return new Octokit({ auth: accessToken });
}

// Check if GitHub is connected
export async function isGitHubConnected(): Promise<boolean> {
  try {
    await getAccessToken();
    return true;
  } catch {
    return false;
  }
}

// Get authenticated user info
export async function getAuthenticatedUser() {
  const octokit = await getGitHubClient();
  const { data } = await octokit.users.getAuthenticated();
  return data;
}

// Get the source of the current token
export async function getGitHubConnectionInfo(): Promise<{ 
  connected: boolean; 
  source: "manual" | "env" | null;
  username?: string;
}> {
  try {
    if (process.env.GITHUB_TOKEN) {
      const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });
      const { data } = await octokit.users.getAuthenticated();
      return { connected: true, source: "env", username: data.login };
    }
    
    if (manualToken) {
      const octokit = new Octokit({ auth: manualToken });
      const { data } = await octokit.users.getAuthenticated();
      return { connected: true, source: "manual", username: data.login };
    }

    return { connected: false, source: null };
  } catch {
    return { connected: false, source: null };
  }
}
