// GitHub Integration - supports both Replit connector and manual token
import { Octokit } from '@octokit/rest';

let connectionSettings: any;
let manualToken: string | null = null;

// Set manual GitHub token (stored in memory, not persisted)
export function setManualGitHubToken(token: string | null) {
  manualToken = token;
}

// Get current token source
export function getTokenSource(): "manual" | "replit" | null {
  if (manualToken) return "manual";
  if (connectionSettings?.settings?.access_token) return "replit";
  return null;
}

// Clear manual token
export function clearManualToken() {
  manualToken = null;
}

async function getAccessToken(): Promise<string> {
  // Priority 1: Manual token from environment variable
  if (process.env.GITHUB_TOKEN) {
    return process.env.GITHUB_TOKEN;
  }

  // Priority 2: Manual token set via API
  if (manualToken) {
    return manualToken;
  }
  
  // Priority 3: Replit connector
  if (connectionSettings && connectionSettings.settings?.expires_at && 
      new Date(connectionSettings.settings.expires_at).getTime() > Date.now()) {
    return connectionSettings.settings.access_token;
  }
  
  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  const xReplitToken = process.env.REPL_IDENTITY 
    ? 'repl ' + process.env.REPL_IDENTITY 
    : process.env.WEB_REPL_RENEWAL 
    ? 'depl ' + process.env.WEB_REPL_RENEWAL 
    : null;

  if (!xReplitToken) {
    throw new Error('No GitHub token available. Please set GITHUB_TOKEN in Secrets or use the Replit GitHub integration.');
  }

  try {
    const response = await fetch(
      'https://' + hostname + '/api/v2/connection?include_secrets=true&connector_names=github',
      {
        headers: {
          'Accept': 'application/json',
          'X_REPLIT_TOKEN': xReplitToken
        }
      }
    );

    const data = await response.json();
    connectionSettings = data.items?.[0];

    const accessToken = connectionSettings?.settings?.access_token || 
                        connectionSettings?.settings?.oauth?.credentials?.access_token;

    if (!connectionSettings || !accessToken) {
      throw new Error('GitHub not connected. Set GITHUB_TOKEN in Secrets or authorize the GitHub integration.');
    }
    
    return accessToken;
  } catch (error) {
    throw new Error('GitHub not connected. Set GITHUB_TOKEN in Secrets or authorize the GitHub integration.');
  }
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
  source: "manual" | "replit" | "env" | null;
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

    await getAccessToken();
    const user = await getAuthenticatedUser();
    return { connected: true, source: "replit", username: user.login };
  } catch {
    return { connected: false, source: null };
  }
}
