import { localStore, supabase, SUPABASE_ANON_KEY, SUPABASE_URL } from '../data';
import { DemoAuthService } from './demoAuth';
import { SupabaseAuthService } from './supabaseAuth';
import type { AuthService } from './types';

export const auth: AuthService = supabase
  ? new SupabaseAuthService(supabase, SUPABASE_URL!, SUPABASE_ANON_KEY!)
  : new DemoAuthService(localStore!);
export { ConfirmacaoEmailPendente } from './supabaseAuth';
export type { Sessao, NovoUsuario, ConfiguracaoInicial } from './types';
