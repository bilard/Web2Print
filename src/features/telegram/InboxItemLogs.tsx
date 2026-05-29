// src/features/telegram/InboxItemLogs.tsx
// Section repliable des logs de traitement d'un message Telegram (accumulés par le worker).
import { useEffect, useState } from 'react'
import { ChevronRight, ChevronDown } from 'lucide-react'
import type { InboxLogEntry, InboxStatus } from './useTelegramInbox'

/**
 * Tonalité d'une ligne de log par sémantique (pas seulement le niveau) pour la lisibilité :
 * rouge = erreur, ambre = avertissement/échec, vert = succès (✓), cyan = connecteur/LLM,
 * indigo = étape du workflow, neutre = reste.
 */
function logTone(entry: InboxLogEntry): { dot: string; text: string } {
  const m = entry.msg
  if (entry.level === 'error' || /❌/.test(m)) return { dot: 'bg-red-400', text: 'text-red-300/90' }
  if (entry.level === 'warn' || /⚠/.test(m)) return { dot: 'bg-amber-400', text: 'text-amber-300/90' }
  if (/\b(échou|aucun|introuvable|vide|impossible|non exécutable)/i.test(m))
    return { dot: 'bg-amber-400', text: 'text-amber-300/90' }
  if (/[✓✅]/.test(m)) return { dot: 'bg-emerald-400', text: 'text-emerald-300/90' }
  if (/connecteur|Jina|Firecrawl|Bright Data|structured data|\bLLM\b/i.test(m))
    return { dot: 'bg-cyan-400', text: 'text-cyan-300/90' }
  if (/^[\s]*[📥⏳🤖🧹]/u.test(m) || /Exécution en cours|reçue|généré|sauvegardé|trouvé|inject/i.test(m))
    return { dot: 'bg-indigo-400', text: 'text-indigo-300/90' }
  return { dot: 'bg-neutral-500', text: 'text-neutral-300' }
}

function fmtTime(ts: number): string {
  return new Date(ts).toLocaleTimeString('fr-FR', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

export function InboxItemLogs({ logs, status }: { logs: InboxLogEntry[]; status: InboxStatus }) {
  const [open, setOpen] = useState(status === 'processing')
  // Ouvre automatiquement dès que le message entre (ou est déjà) en traitement — fiable même si
  // la carte a été montée alors que le message était encore `pending`. Ne se referme pas tout seul :
  // une fois traité, l'utilisateur garde la main (peut replier).
  useEffect(() => {
    if (status === 'processing') setOpen(true)
  }, [status])
  if (logs.length === 0) return null

  return (
    <div className="mt-1.5">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1 text-[10px] text-neutral-500 hover:text-neutral-300"
      >
        {open ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
        Logs de traitement ({logs.length})
      </button>
      {open && (
        <ul className="mt-1 space-y-0.5 rounded-md border border-white/[0.06] bg-black/30 px-2 py-1.5 max-h-[70vh] overflow-y-auto">
          {logs.map((l, i) => {
            const tone = logTone(l)
            return (
              <li key={i} className="flex items-start gap-1.5 text-[10px] leading-snug">
                <span className={`mt-1 w-1.5 h-1.5 rounded-full shrink-0 ${tone.dot}`} />
                <span className="text-neutral-600 tabular-nums shrink-0">{fmtTime(l.ts)}</span>
                <span className={`break-words ${tone.text}`}>{l.msg}</span>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
