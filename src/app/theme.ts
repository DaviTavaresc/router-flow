import { useCallback, useEffect, useState } from 'react';

type Tema = 'light' | 'dark';
const KEY = 'routeflow:theme';

function temaAtual(): Tema {
  return document.documentElement.classList.contains('dark') ? 'dark' : 'light';
}

export function useTheme() {
  const [tema, setTema] = useState<Tema>(temaAtual);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', tema === 'dark');
    document.documentElement.style.colorScheme = tema;
  }, [tema]);

  const definir = useCallback((t: Tema) => {
    setTema(t);
    try {
      localStorage.setItem(KEY, t);
    } catch {
      /* ignora */
    }
    window.dispatchEvent(new CustomEvent('routeflow:theme', { detail: t }));
  }, []);

  // Sincroniza múltiplos componentes que usam o hook
  useEffect(() => {
    const h = (e: Event) => setTema((e as CustomEvent<Tema>).detail);
    window.addEventListener('routeflow:theme', h);
    return () => window.removeEventListener('routeflow:theme', h);
  }, []);

  return { tema, definir, alternar: () => definir(tema === 'dark' ? 'light' : 'dark') };
}
