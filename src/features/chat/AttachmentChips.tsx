import { X, FileText } from 'lucide-react'
import type { ChatAttachment } from './attachments'

interface AttachmentChipsProps {
  attachments: ChatAttachment[]
  onRemove: (id: string) => void
}

function humanSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} o`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} Ko`
  return `${(bytes / 1024 / 1024).toFixed(1)} Mo`
}

export function AttachmentChips({ attachments, onRemove }: AttachmentChipsProps) {
  if (attachments.length === 0) return null
  return (
    <div className="flex flex-wrap gap-1.5 mb-2">
      {attachments.map((a) => (
        <div
          key={a.id}
          className="group relative flex items-center gap-1.5 bg-white/[0.04] hover:bg-white/[0.06] border border-white/10 rounded-lg pl-1.5 pr-1.5 py-1 max-w-[260px]"
        >
          {a.kind === 'image' && a.dataUri ? (
            <img
              src={a.dataUri}
              alt={a.name}
              className="w-7 h-7 rounded object-cover shrink-0"
            />
          ) : (
            <div className="w-7 h-7 rounded bg-white/[0.06] flex items-center justify-center shrink-0">
              <FileText className="w-3.5 h-3.5 text-white/60" />
            </div>
          )}
          <div className="flex-1 min-w-0">
            <p className="text-[11.5px] text-white/85 truncate">{a.name}</p>
            <p className="text-[9.5px] text-white/35">
              {a.kind === 'image' ? 'Image' : 'Texte'} · {humanSize(a.size)}
            </p>
          </div>
          <button
            type="button"
            onClick={() => onRemove(a.id)}
            title="Retirer"
            className="w-5 h-5 flex items-center justify-center rounded text-white/40 hover:text-rose-300 hover:bg-rose-500/10 transition-colors shrink-0"
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      ))}
    </div>
  )
}
