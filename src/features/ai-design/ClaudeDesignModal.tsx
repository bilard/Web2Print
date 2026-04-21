import { useEffect } from 'react'
import { X, Loader2, Sparkles } from 'lucide-react'
import { useUIStore } from '@/stores/ui.store'
import { useDesignBrief, useDesignBriefStore } from '@/stores/designBrief.store'
import { useGenerateDesign } from './useGenerateDesign'

// Tab stubs - will be imported from Task 4-7
import { ClaudeDesignBriefTab } from './ClaudeDesignBriefTab'
import { ClaudeDesignStyleTab } from './ClaudeDesignStyleTab'
import { ClaudeDesignOptionsTab } from './ClaudeDesignOptionsTab'
import { ClaudeDesignAdvancedTab } from './ClaudeDesignAdvancedTab'

const TABS = [
  { id: 'brief', label: 'Brief' },
  { id: 'style', label: 'Style' },
  { id: 'options', label: 'Options' },
  { id: 'avance', label: 'Avancé' },
] as const

export function ClaudeDesignModal() {
  const {
    isClaudeDesignModalOpen,
    closeClaudeDesignModal,
    claudeDesignActiveTab,
    setClaudeDesignActiveTab,
  } = useUIStore((s) => ({
    isClaudeDesignModalOpen: s.isClaudeDesignModalOpen,
    closeClaudeDesignModal: s.closeClaudeDesignModal,
    claudeDesignActiveTab: s.claudeDesignActiveTab,
    setClaudeDesignActiveTab: s.setClaudeDesignActiveTab,
  }))

  const brief = useDesignBrief()
  const { state, generate } = useGenerateDesign()

  const isRunning = state.step !== 'idle' && state.step !== 'done' && state.step !== 'error'

  // Close modal on Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isClaudeDesignModalOpen) {
        closeClaudeDesignModal()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isClaudeDesignModalOpen, closeClaudeDesignModal])

  if (!isClaudeDesignModalOpen) return null

  const onGenerate = () => {
    if (!brief.prompt.trim()) return

    const palette = brief.paletteText
      .split(/[\s,]+/)
      .map((c) => c.trim())
      .filter((c) => /^#[0-9a-fA-F]{6}$/.test(c))

    const req = {
      prompt: brief.prompt.trim(),
      formatId: brief.formatId,
      customWidthMm: brief.customWidthMm,
      customHeightMm: brief.customHeightMm,
      style: brief.style,
      includeBleed: brief.includeBleed,
      palette: palette.length > 0 ? palette : undefined,
    }
    generate(req)
    closeClaudeDesignModal()
  }

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/60 z-50"
        onClick={closeClaudeDesignModal}
      />

      {/* Modal */}
      <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 bg-[#1a1a1a] border border-neutral-800 rounded-lg shadow-xl max-h-[85vh] w-[90vw] max-w-[550px] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-800 shrink-0">
          <h2 className="text-lg font-semibold text-white">Claude Design Studio</h2>
          <button
            onClick={closeClaudeDesignModal}
            className="p-1 hover:bg-neutral-800 rounded transition-colors"
            aria-label="Close modal"
          >
            <X className="w-5 h-5 text-neutral-400" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-neutral-800 bg-[#0f0f0f] px-4 shrink-0">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setClaudeDesignActiveTab(tab.id as any)}
              className={`px-4 py-3 text-sm font-medium transition-colors border-b-2 ${
                claudeDesignActiveTab === tab.id
                  ? 'text-indigo-400 border-indigo-500 bg-indigo-500/10'
                  : 'text-neutral-400 border-transparent hover:text-neutral-300'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {claudeDesignActiveTab === 'brief' && <ClaudeDesignBriefTab />}
          {claudeDesignActiveTab === 'style' && <ClaudeDesignStyleTab />}
          {claudeDesignActiveTab === 'options' && <ClaudeDesignOptionsTab />}
          {claudeDesignActiveTab === 'avance' && <ClaudeDesignAdvancedTab />}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-neutral-800 shrink-0 bg-[#0f0f0f]">
          <div className="text-xs text-neutral-500">
            {brief.prompt.trim() ? '✓ Prêt à générer' : '— Écris un brief pour continuer'}
          </div>
          <div className="flex gap-2">
            <button
              onClick={closeClaudeDesignModal}
              className="px-4 py-2 rounded text-neutral-300 bg-neutral-800 hover:bg-neutral-700 text-sm font-medium transition-colors"
            >
              Fermer
            </button>
            <button
              onClick={onGenerate}
              disabled={isRunning || !brief.prompt.trim()}
              className="px-4 py-2 rounded text-white bg-indigo-500 hover:bg-indigo-400 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium transition-colors flex items-center gap-2"
            >
              {isRunning ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Génération…
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  Générer
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </>
  )
}
