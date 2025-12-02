import { createClient } from '@supabase/supabase-js';
import crypto from 'node:crypto';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.warn('Supabase credentials not configured. Settings will not be persisted.');
}

export const supabase = supabaseUrl && supabaseKey 
  ? createClient(supabaseUrl, supabaseKey)
  : null;

// ==================== ENCRYPTION HELPERS ====================
const ENCRYPTION_KEY = process.env.SESSION_SECRET;

if (!ENCRYPTION_KEY) {
  console.warn('SESSION_SECRET not set. Encryption for sensitive data will be disabled.');
}

function deriveKey(secret: string): Buffer {
  return crypto.scryptSync(secret, 'egpress-salt', 32);
}

export function encrypt(text: string): string {
  if (!ENCRYPTION_KEY) {
    throw new Error('Cannot encrypt - SESSION_SECRET not configured. Sensitive data storage requires encryption.');
  }
  
  try {
    const key = deriveKey(ENCRYPTION_KEY);
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
    const authTag = cipher.getAuthTag();
    return `ENC:${iv.toString('base64')}:${authTag.toString('base64')}:${encrypted.toString('base64')}`;
  } catch (err) {
    console.error('Encryption error:', err);
    throw new Error('Failed to encrypt sensitive data');
  }
}

export function decrypt(encryptedText: string): string {
  if (!encryptedText.startsWith('ENC:')) {
    return encryptedText;
  }
  
  if (!ENCRYPTION_KEY) {
    console.error('Cannot decrypt - SESSION_SECRET not configured');
    throw new Error('Decryption failed - encryption key not available');
  }
  
  try {
    const parts = encryptedText.substring(4).split(':');
    if (parts.length !== 3) {
      throw new Error('Invalid encrypted format');
    }
    
    const key = deriveKey(ENCRYPTION_KEY);
    const iv = Buffer.from(parts[0], 'base64');
    const authTag = Buffer.from(parts[1], 'base64');
    const encrypted = Buffer.from(parts[2], 'base64');
    
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(authTag);
    const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
    return decrypted.toString('utf8');
  } catch (err) {
    console.error('Decryption error:', err);
    throw new Error('Failed to decrypt sensitive data');
  }
}

function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

// ==================== TYPE DEFINITIONS ====================

// User-level settings (keyed by github_username)
// These credentials are the SAME across all repositories
export interface UserSettings {
  id?: number;
  github_username: string;
  github_token_hash: string;
  // User-level credentials (same for all repos)
  gemini_api_key?: string;
  vercel_token?: string;
  search_console_service_account?: string; // Encrypted full JSON
  // Timestamps
  created_at?: string;
  updated_at?: string;
}

// Repository-level settings (keyed by full_name = owner/repo)
// These are specific to each repository
export interface RepositorySettings {
  id?: number;
  full_name: string; // owner/repo format - matches Supabase column name
  github_username: string;
  // Vercel project linking (which project is linked to this repo)
  vercel_project_id?: string;
  vercel_team_id?: string;
  vercel_project_name?: string;
  // Google Search Console site (which site is linked to this repo)
  search_console_site_url?: string;
  // Indexing status for URLs (stored as JSON)
  indexing_status?: string; // JSON string of IndexingStatusEntry[]
  // AdSense (per-repo configuration)
  adsense_publisher_id?: string;
  adsense_slots?: Record<string, string>;
  // Timestamps
  created_at?: string;
  updated_at?: string;
}

export interface IndexingStatusEntry {
  url: string;
  status: "pending" | "submitted" | "indexed" | "error";
  lastSubmitted?: string;
  message?: string;
}

// ==================== USER SETTINGS (User-Level Credentials) ====================

export async function getUserSettings(githubUsername: string): Promise<UserSettings | null> {
  if (!supabase) return null;
  
  try {
    const { data, error } = await supabase
      .from('user_settings')
      .select('*')
      .eq('github_username', githubUsername)
      .single();
    
    if (error) {
      if (error.code === 'PGRST116') {
        return null; // Not found
      }
      console.error('Error loading user settings:', error);
      return null;
    }
    
    const settings = data as UserSettings;
    
    // Decrypt sensitive fields
    if (settings.search_console_service_account) {
      try {
        settings.search_console_service_account = decrypt(settings.search_console_service_account);
      } catch (e) {
        console.warn('Failed to decrypt search_console_service_account');
        settings.search_console_service_account = undefined;
      }
    }
    
    return settings;
  } catch (err) {
    console.error('Supabase load error:', err);
    return null;
  }
}

export async function saveUserSettings(
  githubUsername: string,
  githubToken: string,
  settings: Partial<Omit<UserSettings, 'id' | 'github_username' | 'github_token_hash' | 'created_at' | 'updated_at'>>
): Promise<boolean> {
  if (!supabase) return false;
  
  const tokenHash = hashToken(githubToken);
  
  try {
    const { error } = await supabase
      .from('user_settings')
      .upsert({
        github_username: githubUsername,
        github_token_hash: tokenHash,
        ...settings,
        updated_at: new Date().toISOString(),
      }, {
        onConflict: 'github_username',
      });
    
    if (error) {
      console.error('Error saving user settings:', error);
      return false;
    }
    
    return true;
  } catch (err) {
    console.error('Supabase save error:', err);
    return false;
  }
}

export async function updateUserGeminiKey(githubUsername: string, geminiKey: string): Promise<boolean> {
  if (!supabase) return false;
  
  try {
    // Use upsert to handle both create and update
    const { error } = await supabase
      .from('user_settings')
      .upsert({
        github_username: githubUsername,
        gemini_api_key: geminiKey || null,
        updated_at: new Date().toISOString(),
      }, {
        onConflict: 'github_username',
      });
    
    if (error) {
      console.error('Error updating Gemini key:', error);
      return false;
    }
    
    return true;
  } catch (err) {
    console.error('Supabase update error:', err);
    return false;
  }
}

export async function updateUserVercelToken(githubUsername: string, vercelToken: string): Promise<boolean> {
  if (!supabase) return false;
  
  try {
    const { error } = await supabase
      .from('user_settings')
      .upsert({
        github_username: githubUsername,
        vercel_token: vercelToken || null,
        updated_at: new Date().toISOString(),
      }, {
        onConflict: 'github_username',
      });
    
    if (error) {
      console.error('Error updating Vercel token:', error);
      return false;
    }
    
    return true;
  } catch (err) {
    console.error('Supabase update error:', err);
    return false;
  }
}

export async function updateUserSearchConsoleCredentials(
  githubUsername: string,
  serviceAccountJson: string
): Promise<boolean> {
  if (!supabase) return false;
  
  try {
    // Encrypt the service account JSON before storing
    const encryptedJson = serviceAccountJson ? encrypt(serviceAccountJson) : null;
    
    const { error } = await supabase
      .from('user_settings')
      .upsert({
        github_username: githubUsername,
        search_console_service_account: encryptedJson,
        updated_at: new Date().toISOString(),
      }, {
        onConflict: 'github_username',
      });
    
    if (error) {
      console.error('Error updating Search Console credentials:', error);
      return false;
    }
    
    return true;
  } catch (err) {
    console.error('Supabase update error:', err);
    return false;
  }
}

export async function clearUserSearchConsoleCredentials(githubUsername: string): Promise<boolean> {
  if (!supabase) return false;
  
  try {
    const { error } = await supabase
      .from('user_settings')
      .update({
        search_console_service_account: null,
        updated_at: new Date().toISOString(),
      })
      .eq('github_username', githubUsername);
    
    if (error) {
      console.error('Error clearing Search Console credentials:', error);
      return false;
    }
    
    return true;
  } catch (err) {
    console.error('Supabase update error:', err);
    return false;
  }
}

export async function clearUserVercelToken(githubUsername: string): Promise<boolean> {
  if (!supabase) return false;
  
  try {
    const { error } = await supabase
      .from('user_settings')
      .update({
        vercel_token: null,
        updated_at: new Date().toISOString(),
      })
      .eq('github_username', githubUsername);
    
    if (error) {
      console.error('Error clearing Vercel token:', error);
      return false;
    }
    
    return true;
  } catch (err) {
    console.error('Supabase update error:', err);
    return false;
  }
}

// ==================== REPOSITORY SETTINGS (Per-Repo Linking) ====================

export async function getRepositorySettings(fullName: string): Promise<RepositorySettings | null> {
  if (!supabase) return null;
  
  try {
    const { data, error } = await supabase
      .from('repository_settings')
      .select('*')
      .eq('full_name', fullName)
      .single();
    
    if (error) {
      if (error.code === 'PGRST116') {
        return null; // Not found
      }
      console.error('Error loading repository settings:', error);
      return null;
    }
    
    return data as RepositorySettings;
  } catch (err) {
    console.error('Supabase load error:', err);
    return null;
  }
}

export async function saveRepositorySettings(
  fullName: string,
  githubUsername: string,
  settings: Partial<Omit<RepositorySettings, 'id' | 'full_name' | 'github_username' | 'created_at' | 'updated_at'>>
): Promise<boolean> {
  if (!supabase) return false;
  
  try {
    const { error } = await supabase
      .from('repository_settings')
      .upsert({
        full_name: fullName,
        github_username: githubUsername,
        ...settings,
        updated_at: new Date().toISOString(),
      }, {
        onConflict: 'full_name',
      });
    
    if (error) {
      console.error('Error saving repository settings:', error);
      return false;
    }
    
    return true;
  } catch (err) {
    console.error('Supabase save error:', err);
    return false;
  }
}

export async function updateRepositoryVercel(
  fullName: string,
  githubUsername: string,
  projectId?: string,
  teamId?: string,
  projectName?: string
): Promise<boolean> {
  if (!supabase) return false;
  
  try {
    // Use upsert to create row if not exists
    const { error } = await supabase
      .from('repository_settings')
      .upsert({
        full_name: fullName,
        github_username: githubUsername,
        vercel_project_id: projectId || null,
        vercel_team_id: teamId || null,
        vercel_project_name: projectName || null,
        updated_at: new Date().toISOString(),
      }, {
        onConflict: 'full_name',
      });
    
    if (error) {
      console.error('Error updating repository Vercel config:', error);
      return false;
    }
    
    return true;
  } catch (err) {
    console.error('Supabase update error:', err);
    return false;
  }
}

export async function clearRepositoryVercel(fullName: string): Promise<boolean> {
  if (!supabase) return false;
  
  try {
    const { error } = await supabase
      .from('repository_settings')
      .update({
        vercel_project_id: null,
        vercel_team_id: null,
        vercel_project_name: null,
        updated_at: new Date().toISOString(),
      })
      .eq('full_name', fullName);
    
    if (error) {
      console.error('Error clearing repository Vercel config:', error);
      return false;
    }
    
    return true;
  } catch (err) {
    console.error('Supabase update error:', err);
    return false;
  }
}

export async function updateRepositorySiteUrl(
  fullName: string,
  githubUsername: string,
  siteUrl: string
): Promise<boolean> {
  if (!supabase) return false;
  
  try {
    // Use upsert to create row if not exists
    const { error } = await supabase
      .from('repository_settings')
      .upsert({
        full_name: fullName,
        github_username: githubUsername,
        search_console_site_url: siteUrl || null,
        updated_at: new Date().toISOString(),
      }, {
        onConflict: 'full_name',
      });
    
    if (error) {
      console.error('Error updating repository site URL:', error);
      return false;
    }
    
    return true;
  } catch (err) {
    console.error('Supabase update error:', err);
    return false;
  }
}

export async function clearRepositorySiteUrl(fullName: string): Promise<boolean> {
  if (!supabase) return false;
  
  try {
    const { error } = await supabase
      .from('repository_settings')
      .update({
        search_console_site_url: null,
        updated_at: new Date().toISOString(),
      })
      .eq('full_name', fullName);
    
    if (error) {
      console.error('Error clearing repository site URL:', error);
      return false;
    }
    
    return true;
  } catch (err) {
    console.error('Supabase update error:', err);
    return false;
  }
}

export async function updateRepositoryAdsense(
  fullName: string,
  githubUsername: string,
  publisherId: string,
  slots: Record<string, string>
): Promise<boolean> {
  if (!supabase) return false;
  
  try {
    const { error } = await supabase
      .from('repository_settings')
      .upsert({
        full_name: fullName,
        github_username: githubUsername,
        adsense_publisher_id: publisherId || null,
        adsense_slots: slots || null,
        updated_at: new Date().toISOString(),
      }, {
        onConflict: 'full_name',
      });
    
    if (error) {
      console.error('Error updating repository AdSense config:', error);
      return false;
    }
    
    return true;
  } catch (err) {
    console.error('Supabase update error:', err);
    return false;
  }
}

// ==================== INDEXING STATUS PERSISTENCE ====================

export async function getIndexingStatusFromSupabase(
  fullName: string
): Promise<IndexingStatusEntry[] | null> {
  if (!supabase) return null;
  
  try {
    const { data, error } = await supabase
      .from('repository_settings')
      .select('indexing_status')
      .eq('full_name', fullName)
      .single();
    
    if (error) {
      if (error.code === 'PGRST116') {
        return []; // Not found, return empty
      }
      console.error('Error loading indexing status:', error);
      return null;
    }
    
    if (data?.indexing_status) {
      try {
        return JSON.parse(data.indexing_status) as IndexingStatusEntry[];
      } catch (e) {
        console.warn('Failed to parse indexing status JSON');
        return [];
      }
    }
    
    return [];
  } catch (err) {
    console.error('Supabase load error:', err);
    return null;
  }
}

export async function saveIndexingStatusToSupabase(
  fullName: string,
  githubUsername: string,
  statuses: IndexingStatusEntry[]
): Promise<boolean> {
  if (!supabase) return false;
  
  try {
    const { error } = await supabase
      .from('repository_settings')
      .upsert({
        full_name: fullName,
        github_username: githubUsername,
        indexing_status: JSON.stringify(statuses),
        updated_at: new Date().toISOString(),
      }, {
        onConflict: 'full_name',
      });
    
    if (error) {
      // If the column doesn't exist, log but don't fail
      if (error.message?.includes('indexing_status')) {
        console.warn('indexing_status column not found in Supabase. Using memory storage.');
        return false;
      }
      console.error('Error saving indexing status:', error);
      return false;
    }
    
    return true;
  } catch (err) {
    console.error('Supabase save error:', err);
    return false;
  }
}

export async function updateSingleIndexingStatus(
  fullName: string,
  githubUsername: string,
  url: string,
  statusUpdate: Partial<IndexingStatusEntry>
): Promise<boolean> {
  if (!supabase) return false;
  
  try {
    // Get existing statuses
    const existing = await getIndexingStatusFromSupabase(fullName);
    if (existing === null) return false;
    
    // Update or add the status
    const index = existing.findIndex(s => s.url === url);
    if (index >= 0) {
      existing[index] = { ...existing[index], ...statusUpdate };
    } else {
      existing.push({
        url,
        status: statusUpdate.status || "pending",
        lastSubmitted: statusUpdate.lastSubmitted,
        message: statusUpdate.message,
      });
    }
    
    // Save back
    return await saveIndexingStatusToSupabase(fullName, githubUsername, existing);
  } catch (err) {
    console.error('Error updating single indexing status:', err);
    return false;
  }
}

export async function deleteRepositorySettings(fullName: string): Promise<boolean> {
  if (!supabase) return false;
  
  try {
    const { error } = await supabase
      .from('repository_settings')
      .delete()
      .eq('full_name', fullName);
    
    if (error) {
      console.error('Error deleting repository settings:', error);
      return false;
    }
    
    return true;
  } catch (err) {
    console.error('Supabase delete error:', err);
    return false;
  }
}

// ==================== LEGACY COMPATIBILITY ====================
// These functions are kept for backward compatibility during migration

export async function loadUserSettings(githubToken: string, username?: string): Promise<UserSettings | null> {
  if (!username) return null;
  return getUserSettings(username);
}

export async function updateGeminiKey(githubToken: string, geminiKey: string, username?: string): Promise<boolean> {
  if (!username) return false;
  return updateUserGeminiKey(username, geminiKey);
}

export async function updateVercelConfig(
  githubToken: string,
  vercelToken: string,
  teamId?: string,
  projectId?: string,
  username?: string
): Promise<boolean> {
  if (!username) return false;
  return updateUserVercelToken(username, vercelToken);
}

export async function updateSearchConsoleConfig(
  githubToken: string,
  clientEmail: string,
  privateKey: string,
  siteUrl: string,
  username?: string
): Promise<boolean> {
  // This is legacy - new code should use updateUserSearchConsoleCredentials
  // and updateRepositorySiteUrl separately
  return false;
}

export async function updateAdsenseConfig(
  githubToken: string,
  publisherId: string,
  slots: Record<string, string>,
  username?: string
): Promise<boolean> {
  // Legacy - AdSense is now per-repository
  return false;
}

export async function clearVercelConfig(githubToken: string, username?: string): Promise<boolean> {
  if (!username) return false;
  return clearUserVercelToken(username);
}

export async function clearSearchConsoleConfig(githubToken: string, username?: string): Promise<boolean> {
  if (!username) return false;
  return clearUserSearchConsoleCredentials(username);
}

export async function deleteUserSettings(githubToken: string): Promise<boolean> {
  if (!supabase) return false;
  
  const tokenHash = hashToken(githubToken);
  
  try {
    const { error } = await supabase
      .from('user_settings')
      .delete()
      .eq('github_token_hash', tokenHash);
    
    if (error) {
      console.error('Error deleting user settings:', error);
      return false;
    }
    
    return true;
  } catch (err) {
    console.error('Supabase delete error:', err);
    return false;
  }
}
