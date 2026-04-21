import type { DesignStyle } from './types'
import { useDesignBrief, useDesignBriefStore } from '@/stores/designBrief.store'
import { STYLE_THUMBNAILS, STYLE_DESCRIPTIONS } from './styleThumbnails'

const STYLES: Array<{ id: DesignStyle; label: string }> = [
  { id: 'corporate', label: 'Corporate' },
  { id: 'minimaliste', label: 'Minimaliste' },
  { id: 'bold', label: 'Bold' },
  { id: 'elegant', label: 'Élégant' },
  { id: 'playful', label: 'Playful' },
  { id: 'retro', label: 'Rétro' },
]

export function ClaudeDesignStyleTab() {
  const brief = useDesignBrief()
  const setBrief = useDesignBriefStore((s) => s.setBrief)

  return (
    <div className="space-y-3">
      {STYLES.map((style) => (
        <button
          key={style.id}
          onClick={() => setBrief({ style: style.id })}
          className={`w-full flex gap-3 p-3 rounded border-2 transition-colors ${
            brief.style === style.id
              ? 'border-indigo-500 bg-indigo-500/10'
              : 'border-neutral-800 bg-[#0f0f0f] hover:border-neutral-700'
          }`}
        >
          {/* Thumbnail */}
          <div className="w-20 h-16 shrink-0 rounded bg-white border border-neutral-700 overflow-hidden">
            {STYLE_THUMBNAILS[style.id]}
          </div>

          {/* Label & description */}
          <div className="text-left flex-1">
            <div className="font-semibold text-white text-sm">{style.label}</div>
            <div className="text-xs text-neutral-400 mt-1">{STYLE_DESCRIPTIONS[style.id]}</div>
          </div>

          {/* Selection indicator */}
          {brief.style === style.id && (
            <div className="w-5 h-5 rounded-full border-2 border-indigo-500 bg-indigo-500 flex items-center justify-center shrink-0 mt-1">
              <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" />
              </svg>
            </div>
          )}
        </button>
      ))}
    </div>
  )
}
