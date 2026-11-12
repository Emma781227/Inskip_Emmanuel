import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './database.types';
import { readSupabaseConfig, type SupabaseConfigResult } from './supabaseConfig';

export const supabaseConfig: SupabaseConfigResult = readSupabaseConfig(import.meta.env);

/** Client unique, ou null si la configuration est absente/invalide (écran de configuration affiché). */
export const supabase: SupabaseClient<Database> | null = supabaseConfig.ok
  ? createClient<Database>(supabaseConfig.config.url, supabaseConfig.config.publishableKey, {
      auth: { persistSession: true, autoRefreshToken: true },
    })
  : null;
