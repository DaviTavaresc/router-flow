import { cn } from '@/lib/cn';

export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={cn('h-8 w-8', className)} aria-hidden>
      <rect width="32" height="32" rx="8" fill="#2563eb" />
      <path d="M9 22c0-4 3-5 6-5s5-1 5-4-2-4-4-4" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" />
      <circle cx="9" cy="22" r="2.5" fill="#fff" />
      <circle cx="22" cy="9" r="2.5" fill="#93c5fd" />
    </svg>
  );
}

export function Logo({ subtitulo = true, className }: { subtitulo?: boolean; className?: string }) {
  return (
    <div className={cn('flex items-center gap-2.5', className)}>
      <LogoMark />
      <div className="leading-tight">
        <p className="text-[15px] font-semibold tracking-tight text-slate-900 dark:text-white">RouteFlow</p>
        {subtitulo && <p className="text-[11px] text-slate-500 dark:text-slate-400">Gestão inteligente de entregas</p>}
      </div>
    </div>
  );
}
