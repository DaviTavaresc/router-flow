import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { LocalStore } from './local/localStore';
import type { DataStore } from './store';
import { SupabaseStore } from './supabaseStore';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
export const SUPABASE_URL = url;
export const SUPABASE_ANON_KEY = key;

export const supabase: SupabaseClient | null =
  import.meta.env.VITE_DATA_SOURCE === 'supabase' && url && key
    ? createClient(url, key, { auth: { persistSession: true, autoRefreshToken: true } })
    : null;

export const MODO_DEMO = !supabase;

export const localStore: LocalStore | null = MODO_DEMO ? new LocalStore() : null;

export const store: DataStore = supabase ? new SupabaseStore(supabase) : localStore!;

export { AppError } from './store';
export type { DataStore } from './store';
