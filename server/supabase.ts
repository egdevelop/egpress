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

function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

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
