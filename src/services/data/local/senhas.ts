import { normalizar } from '@/lib/format';

/** Senhas do modo local (ficam apenas neste navegador). */
const SENHAS_KEY = 'routeflow:senhas:v2';

export function lerSenhas(): Record<string, string> {
  try {
    const raw = localStorage.getItem(SENHAS_KEY);
    return raw ? (JSON.parse(raw) as Record<string, string>) : {};
  } catch {
    return {};
  }
}

export function definirSenha(email: string, senha: string) {
  const senhas = lerSenhas();
  senhas[normalizar(email)] = senha;
  try {
    localStorage.setItem(SENHAS_KEY, JSON.stringify(senhas));
  } catch {
    /* ignora */
  }
}

export function limparSenhas() {
  try {
    localStorage.removeItem(SENHAS_KEY);
  } catch {
    /* ignora */
  }
}
