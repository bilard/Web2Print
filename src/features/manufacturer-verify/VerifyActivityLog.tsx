import { useEffect, useRef } from 'react'

/** Journal d'activité auto-scrollé du flux « Vérifier chez le Fabricant »
 *  (recherche → candidats → scrape → alignement → comparaison). */
export function VerifyActivityLog({ logs }: { logs: string[] }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => { if (ref.current) ref.current.scrollTop = ref.current.scrollHeight }, [logs])
  if (logs.length === 0) return null
  return (
    <div className="shrink-0 border-t border-white/[0.06] bg-black/50">
      <div className="px-4 pt-1.5 text-[9px] font-semibold uppercase tracking-wider text-white/30">Activité</div>
      <div ref={ref} className="max-h-24 overflow-y-auto px-4 pb-2 pt-1 flex flex-col gap-0.5 font-mono text-[10.5px] leading-relaxed text-white/45">
        {logs.map((l, i) => (
          <div key={i} className="flex gap-1.5">
            <span className="text-indigo-400/50 shrink-0">›</span><span className="min-w-0 break-words">{l}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
