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
// Require SESSION_SECRET for encryption - fail fast if missing
const ENCRYPTION_KEY = process.env.SESSION_SECRET;

if (!ENCRYPTION_KEY) {
  console.warn('SESSION_SECRET not set. Encryption for sensitive data will be disabled.');
}

function deriveKey(secret: string): Buffer {
  return crypto.scryptSync(secret, 'egpress-salt', 32);
}

export function encrypt(text: string): string {
  // Require encryption key - fail if not configured
  if (!ENCRYPTION_KEY) {
    throw new Error('Cannot encrypt - SESSION_SECRET not configured. Sensitive data storage requires encryption.');
  }
  
  try {
    const key = deriveKey(ENCRYPTION_KEY);
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
    const authTag = cipher.getAuthTag();
    // Format: ENC:iv:authTag:encrypted (all base64)
    return `ENC:${iv.toString('base64')}:${authTag.toString('base64')}:${encrypted.toString('base64')}`;
  } catch (err) {
    console.error('Encryption error:', err);
    throw new Error('Failed to encrypt sensitive data');
  }
}

export function decrypt(encryptedText: string): string {
  // Check if it's an encrypted format (starts with ENC:)
  if (!encryptedText.startsWith('ENC:')) {
    return encryptedText; // Return as-is if not encrypted (legacy data)
  }
  
  if (!ENCRYPTION_KEY) {
    console.error('Cannot decrypt - SESSION_SECRET not configured');
    throw new Error('Decryption failed - encryption key not available');
  }
  
  try {
    const parts = encryptedText.substring(4).split(':'); // Remove 'ENC:' prefix
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

// Legacy user settings (for migration compatibility)
export interface UserSettings {
  github_token_hash: string;
  github_username: string;
  gemini_api_key?: string;
  vercel_token?: string;
  vercel_team_id?: string;
  vercel_project_id?: string;
  search_console_client_email?: string;
  search_console_private_key?: string;
  search_console_site_url?: string;
  adsense_publisher_id?: string;
  adsense_slots?: Record<string, string>;
  created_at?: string;
  updated_at?: string;
}

// New repository-based settings
export interface RepositorySettings {
  id?: number;
  repository: string; // owner/repo format
  github_token_hash: string;
  github_username: string;
  // Vercel settings
  vercel_token?: string;
  vercel_team_id?: string;
  vercel_project_id?: string;
  vercel_project_name?: string;
  // Google Search Console settings (service account)
  search_console_service_account?: string; // Full JSON key
  search_console_site_url?: string;
  // Gemini AI
  gemini_api_key?: string;
  // AdSense
  adsense_publisher_id?: string;
  adsense_slots?: Record<string, string>;
  // Timestamps
  created_at?: string;
  updated_at?: string;
}

function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

// ==================== REPOSITORY-BASED SETTINGS ====================

export async function getRepositorySettings(repository: string): Promise<RepositorySettings | null> {
  if (!supabase) return null;
  
  try {
    const { data, error } = await supabase
      .from('repository_settings')
      .select('*')
      .eq('repository', repository)
      .single();
    
    if (error) {
      if (error.code === 'PGRST116') {
        return null; // Not found
      }
      console.error('Error loading repository settings:', error);
      return null;
    }
    
    const settings = data as RepositorySettings;
    
    // Decrypt sensitive fields
    if (settings.search_console_service_account) {
      settings.search_console_service_account = decrypt(settings.search_console_service_account);
    }
    
    return settings;
  } catch (err) {
    console.error('Supabase load error:', err);
    return null;
  }
}

export async function saveRepositorySettings(
  repository: string, 
  githubToken: string, 
  githubUsername: string,
  settings: Partial<RepositorySettings>
): Promise<boolean> {
  if (!supabase) return false;
  
  const tokenHash = hashToken(githubToken);
  
  try {
    const { error } = await supabase
      .from('repository_settings')
      .upsert({
        repository,
        github_token_hash: tokenHash,
        github_username: githubUsername,
        ...settings,
        updated_at: new Date().toISOString(),
      }, {
        onConflict: 'repository',
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
  repository: string,
  vercelToken: string,
  teamId?: string,
  projectId?: string,
  projectName?: string
): Promise<boolean> {
  if (!supabase) return false;
  
  try {
    const { error } = await supabase
      .from('repository_settings')
      .update({ 
        vercel_token: vercelToken,
        vercel_team_id: teamId || null,
        vercel_project_id: projectId || null,
        vercel_project_name: projectName || null,
        updated_at: new Date().toISOString(),
      })
      .eq('repository', repository);
    
    if (error) {
      console.error('Error updating Vercel config:', error);
      return false;
    }
    
    return true;
  } catch (err) {
    console.error('Supabase update error:', err);
    return false;
  }
}

export async function clearRepositoryVercel(repository: string): Promise<boolean> {
  if (!supabase) return false;
  
  try {
    const { error } = await supabase
      .from('repository_settings')
      .update({ 
        vercel_token: null,
        vercel_team_id: null,
        vercel_project_id: null,
        vercel_project_name: null,
        updated_at: new Date().toISOString(),
      })
      .eq('repository', repository);
    
    if (error) {
      console.error('Error clearing Vercel config:', error);
      return false;
    }
    
    return true;
  } catch (err) {
    console.error('Supabase update error:', err);
    return false;
  }
}

export async function updateRepositorySearchConsole(
  repository: string,
  serviceAccountJson: string,
  siteUrl?: string
): Promise<boolean> {
  if (!supabase) return false;
  
  try {
    // Encrypt the service account JSON before storing
    const encryptedJson = encrypt(serviceAccountJson);
    
    const { error } = await supabase
      .from('repository_settings')
      .update({ 
        search_console_service_account: encryptedJson,
        search_console_site_url: siteUrl || null,
        updated_at: new Date().toISOString(),
      })
      .eq('repository', repository);
    
    if (error) {
      console.error('Error updating Search Console config:', error);
      return false;
    }
    
    return true;
  } catch (err) {
    console.error('Supabase update error:', err);
    return false;
  }
}

export async function clearRepositorySearchConsole(repository: string): Promise<boolean> {
  if (!supabase) return false;
  
  try {
    const { error } = await supabase
      .from('repository_settings')
      .update({ 
        search_console_service_account: null,
        search_console_site_url: null,
        updated_at: new Date().toISOString(),
      })
      .eq('repository', repository);
    
    if (error) {
      console.error('Error clearing Search Console config:', error);
      return false;
    }
    
    return true;
  } catch (err) {
    console.error('Supabase update error:', err);
    return false;
  }
}

export async function updateRepositoryGemini(repository: string, geminiKey: string): Promise<boolean> {
  if (!supabase) return false;
  
  try {
    const { error } = await supabase
      .from('repository_settings')
      .update({ 
        gemini_api_key: geminiKey,
        updated_at: new Date().toISOString(),
      })
      .eq('repository', repository);
    
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

export async function updateRepositoryAdsense(
  repository: string,
  publisherId: string,
  slots: Record<string, string>
): Promise<boolean> {
  if (!supabase) return false;
  
  try {
    const { error } = await supabase
      .from('repository_settings')
      .update({ 
        adsense_publisher_id: publisherId,
        adsense_slots: slots,
        updated_at: new Date().toISOString(),
      })
      .eq('repository', repository);
    
    if (error) {
      console.error('Error updating AdSense config:', error);
      return false;
    }
    
    return true;
  } catch (err) {
    console.error('Supabase update error:', err);
    return false;
  }
}

export async function deleteRepositorySettings(repository: string): Promise<boolean> {
  if (!supabase) return false;
  
  try {
    const { error } = await supabase
      .from('repository_settings')
      .delete()
      .eq('repository', repository);
    
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

// ==================== LEGACY USER SETTINGS (for backward compatibility) ====================

export async function saveUserSettings(githubToken: string, githubUsername: string, settings: Partial<UserSettings>): Promise<boolean> {
  if (!supabase) return false;
  
  const tokenHash = hashToken(githubToken);
  
  try {
    const { error } = await supabase
      .from('user_settings')
      .upsert({
        github_token_hash: tokenHash,
        github_username: githubUsername,
        ...settings,
        updated_at: new Date().toISOString(),
      }, {
        onConflict: 'github_token_hash',
      });
    
    if (error) {
      console.error('Error saving settings to Supabase:', error);
      return false;
    }
    
    return true;
  } catch (err) {
    console.error('Supabase save error:', err);
    return false;
  }
}

export async function loadUserSettings(githubToken: string): Promise<UserSettings | null> {
  if (!supabase) return null;
  
  const tokenHash = hashToken(githubToken);
  
  try {
    const { data, error } = await supabase
      .from('user_settings')
      .select('*')
      .eq('github_token_hash', tokenHash)
      .single();
    
    if (error) {
      if (error.code === 'PGRST116') {
        return null;
      }
      console.error('Error loading settings from Supabase:', error);
      return null;
    }
    
    return data as UserSettings;
  } catch (err) {
    console.error('Supabase load error:', err);
    return null;
  }
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
      console.error('Error deleting settings from Supabase:', error);
      return false;
    }
    
    return true;
  } catch (err) {
    console.error('Supabase delete error:', err);
    return false;
  }
}

// Legacy update functions (kept for backward compatibility)
export async function updateGeminiKey(githubToken: string, geminiKey: string): Promise<boolean> {
  if (!supabase) return false;
  
  const tokenHash = hashToken(githubToken);
  
  try {
    const { error } = await supabase
      .from('user_settings')
      .update({ 
        gemini_api_key: geminiKey,
        updated_at: new Date().toISOString(),
      })
      .eq('github_token_hash', tokenHash);
    
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

export async function updateVercelConfig(githubToken: string, vercelToken: string, teamId?: string, projectId?: string): Promise<boolean> {
  if (!supabase) return false;
  
  const tokenHash = hashToken(githubToken);
  
  try {
    const { error } = await supabase
      .from('user_settings')
      .update({ 
        vercel_token: vercelToken,
        vercel_team_id: teamId || null,
        vercel_project_id: projectId || null,
        updated_at: new Date().toISOString(),
      })
      .eq('github_token_hash', tokenHash);
    
    if (error) {
      console.error('Error updating Vercel config:', error);
      return false;
    }
    
    return true;
  } catch (err) {
    console.error('Supabase update error:', err);
    return false;
  }
}

export async function updateSearchConsoleConfig(
  githubToken: string, 
  clientEmail: string, 
  privateKey: string, 
  siteUrl: string
): Promise<boolean> {
  if (!supabase) return false;
  
  const tokenHash = hashToken(githubToken);
  
  try {
    const { error } = await supabase
      .from('user_settings')
      .update({ 
        search_console_client_email: clientEmail,
        search_console_private_key: privateKey,
        search_console_site_url: siteUrl,
        updated_at: new Date().toISOString(),
      })
      .eq('github_token_hash', tokenHash);
    
    if (error) {
      console.error('Error updating Search Console config:', error);
      return false;
    }
    
    return true;
  } catch (err) {
    console.error('Supabase update error:', err);
    return false;
  }
}

export async function updateAdsenseConfig(
  githubToken: string, 
  publisherId: string,
  slots: Record<string, string>
): Promise<boolean> {
  if (!supabase) return false;
  
  const tokenHash = hashToken(githubToken);
  
  try {
    const { error } = await supabase
      .from('user_settings')
      .update({ 
        adsense_publisher_id: publisherId,
        adsense_slots: slots,
        updated_at: new Date().toISOString(),
      })
      .eq('github_token_hash', tokenHash);
    
    if (error) {
      console.error('Error updating AdSense config:', error);
      return false;
    }
    
    return true;
  } catch (err) {
    console.error('Supabase update error:', err);
    return false;
  }
}

export async function clearVercelConfig(githubToken: string): Promise<boolean> {
  if (!supabase) return false;
  
  const tokenHash = hashToken(githubToken);
  
  try {
    const { error } = await supabase
      .from('user_settings')
      .update({ 
        vercel_token: null,
        vercel_team_id: null,
        vercel_project_id: null,
        updated_at: new Date().toISOString(),
      })
      .eq('github_token_hash', tokenHash);
    
    if (error) {
      console.error('Error clearing Vercel config:', error);
      return false;
    }
    
    return true;
  } catch (err) {
    console.error('Supabase update error:', err);
    return false;
  }
}

export async function clearSearchConsoleConfig(githubToken: string): Promise<boolean> {
  if (!supabase) return false;
  
  const tokenHash = hashToken(githubToken);
  
  try {
    const { error } = await supabase
      .from('user_settings')
      .update({ 
        search_console_client_email: null,
        search_console_private_key: null,
        search_console_site_url: null,
        updated_at: new Date().toISOString(),
      })
      .eq('github_token_hash', tokenHash);
    
    if (error) {
      console.error('Error clearing Search Console config:', error);
      return false;
    }
    
    return true;
  } catch (err) {
    console.error('Supabase update error:', err);
    return false;
  }
}
