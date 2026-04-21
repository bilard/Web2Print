import { useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { PrintSettingsPanel } from './PrintSettingsPanel'

export function ClaudeDesignAdvancedTab() {
  const [isExpanded, setIsExpanded] = useState(false)

  return (
    <div className="space-y-3">
      {/* Collapsible header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between p-3 rounded bg-[#0f0f0f] border border-neutral-800 hover:border-neutral-700 transition-colors"
      >
        <span className="text-sm font-medium text-neutral-300">Paramètres avancés</span>
        <ChevronDown
          className={`w-4 h-4 text-neutral-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
        />
      </button>

      {/* Expandable content */}
      {isExpanded && (
        <div className="space-y-4 p-3 rounded bg-[#0f0f0f] border border-neutral-800">
          <PrintSettingsPanel />
          <p className="text-[10px] text-neutral-500">
            Ces paramètres sont avancés. Modifiez-les seulement si vous savez ce que vous faites.
          </p>
        </div>
      )}
    </div>
  )
}
