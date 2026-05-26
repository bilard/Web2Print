// src/features/telegram/InboxItemLogs.tsx
// Section repliable des logs de traitement d'un message Telegram (accumulés par le worker).
import { useState } from 'react'
import { ChevronRight, ChevronDown } from 'lucide-react'
import type { InboxLogEntry } from './useTelegramInbox'

const LEVEL_DOT: Record<InboxLogEntry['level'], string> = {
  info: 'bg-neutral-500',
  warn: 'bg-amber-400',
  error: 'bg-red-400',
}

const LEVEL_TEXT: Record<InboxLogEntry['level'], string> = {
  info: 'text-neutral-300',
  warn: 'text-amber-300/90',
  error: 'text-red-300/90',
}

function fmtTime(ts: number): string {
  return new Date(ts).toLocaleTimeString('fr-FR', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

export function InboxItemLogs({
  logs,
  defaultOpen = false,
}: {
  logs: InboxLogEntry[]
  defaultOpen?: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)
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
        <ul className="mt-1 space-y-0.5 rounded-md border border-white/[0.06] bg-black/30 px-2 py-1.5 max-h-48 overflow-y-auto">
          {logs.map((l, i) => (
            <li key={i} className="flex items-start gap-1.5 text-[10px] leading-snug">
              <span className={`mt-1 w-1.5 h-1.5 rounded-full shrink-0 ${LEVEL_DOT[l.level]}`} />
              <span className="text-neutral-600 tabular-nums shrink-0">{fmtTime(l.ts)}</span>
              <span className={`break-words ${LEVEL_TEXT[l.level]}`}>{l.msg}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
