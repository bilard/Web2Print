import { useEffect, useRef } from 'react'
import {
  Search, Factory, Download, Hash, Link2, GitCompareArrows,
  CheckCircle2, AlertTriangle, Save, ChevronRight,
} from 'lucide-react'
import type { VerifyLogEntry, VerifyLogKind } from './types'
import { t } from '@/lib/i18n'

/** Icône + couleur de texte par nature de log (le journal devient lisible d'un
 *  coup d'œil : recherche, extraction, chiffres, verdict, succès, alerte). */
const KIND_UI: Record<VerifyLogKind, { icon: typeof Search; cls: string }> = {
  search:    { icon: Search,           cls: 'text-sky-400' },
  candidate: { icon: Factory,          cls: 'text-indigo-300' },
  scrape:    { icon: Download,         cls: 'text-cyan-400' },
  metric:    { icon: Hash,             cls: 'text-violet-300' },
  align:     { icon: Link2,            cls: 'text-fuchsia-300' },
  compare:   { icon: GitCompareArrows, cls: 'text-white/80' },
  ok:        { icon: CheckCircle2,     cls: 'text-emerald-400' },
  warn:      { icon: AlertTriangle,    cls: 'text-amber-400' },
  save:      { icon: Save,             cls: 'text-teal-400' },
  info:      { icon: ChevronRight,     cls: 'text-white/45' },
}

/** Colore chaque segment « symbole N libellé » de la synthèse de comparaison. */
function CompareLine({ text }: { text: string }) {
  const seg = (s: string) =>
    s.startsWith('✓') ? 'text-emerald-400' : s.startsWith('+') ? 'text-indigo-300' : s.startsWith('≠') ? 'text-amber-400' : 'text-white/70'
  return (
    <span className="min-w-0 break-words font-semibold">
      {text.split(' · ').map((s, i) => (
        <span key={i}>
          {i > 0 && <span className="text-white/25"> · </span>}
          <span className={seg(s.trim())}>{s.trim()}</span>
        </span>
      ))}
    </span>
  )
}

/** Journal d'activité auto-scrollé du flux « Vérifier chez le Fabricant »
 *  (recherche → candidats → scrape → alignement → comparaison), coloré par étape. */
export function VerifyActivityLog({ logs }: { logs: VerifyLogEntry[] }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => { if (ref.current) ref.current.scrollTop = ref.current.scrollHeight }, [logs])
  if (logs.length === 0) return null
  return (
    <div className="shrink-0 border-t border-white/[0.06] bg-black/50">
      <div className="px-4 pt-1.5 text-[9px] font-semibold uppercase tracking-wider text-white/30">{t('mv.activity')}</div>
      <div ref={ref} className="max-h-28 overflow-y-auto px-4 pb-2 pt-1 flex flex-col gap-0.5 font-mono text-[10.5px] leading-relaxed">
        {logs.map((l, i) => {
          const { icon: Icon, cls } = KIND_UI[l.kind]
          return (
            <div key={i} className={`flex items-start gap-1.5 ${l.sub ? 'pl-4' : ''}`}>
              <Icon className={`w-3 h-3 mt-[1.5px] shrink-0 ${cls}`} />
              {l.kind === 'compare'
                ? <CompareLine text={l.text} />
                : <span className={`min-w-0 break-words ${l.kind === 'ok' || l.kind === 'warn' ? cls : 'text-white/55'}`}>{l.text}</span>}
            </div>
          )
        })}
      </div>
    </div>
  )
}
