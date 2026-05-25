// src/features/workflows/promptToFlow/PromptToFlowModal.tsx
import { useState } from 'react'
import { Sparkles, Loader2, X } from 'lucide-react'
import type { LLMProviderId } from '@/features/ai/llmRouter'
import { usePromptToFlow } from './usePromptToFlow'
import { PromptToFlowPreview } from './PromptToFlowPreview'

const EXAMPLES = [
  "Importe un CSV, enrichis chaque produit via son URL, puis exporte en PPTX.",
  "Scrape une liste d'URLs produits et sauvegarde le résultat dans le PIM.",
  "Importe un Excel, filtre les lignes en rupture, trie par prix, exporte en PDF.",
]

export function PromptToFlowModal({ onClose }: { onClose: () => void }) {
  const [prompt, setPrompt] = useState('')
  const [provider, setProvider] = useState<'' | LLMProviderId>('')
  const { phase, preview, error, generate, apply, reset } = usePromptToFlow()

  const busy = phase === 'generating'

  const onGenerate = () => {
    if (!prompt.trim() || busy) return
    void generate(prompt.trim(), provider || undefined)
  }

  const onAccept = () => {
    if (apply()) onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        className="w-full max-w-lg rounded-xl border border-neutral-800 bg-[#1a1a1a] p-4 space-y-3"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-sm font-medium text-white">
            <Sparkles className="w-4 h-4 text-indigo-400" /> Générer un workflow (IA)
          </h2>
          <button onClick={onClose} className="p-1 rounded text-white/40 hover:text-white hover:bg-white/5" aria-label="Fermer">
            <X className="w-4 h-4" />
          </button>
        </div>

        {phase !== 'preview' ? (
          <>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Décris ce que le workflow doit faire…"
              rows={4}
              className="w-full rounded-md border border-neutral-700 bg-[#0f0f0f] p-2.5 text-sm text-white outline-none focus:border-indigo-500 resize-none"
            />
            <div className="flex flex-wrap gap-1.5">
              {EXAMPLES.map((ex) => (
                <button
                  key={ex}
                  onClick={() => setPrompt(ex)}
                  className="text-[11px] text-left rounded border border-neutral-700 bg-[#0f0f0f] px-2 py-1 text-white/50 hover:text-white/80 hover:border-neutral-600"
                >
                  {ex}
                </button>
              ))}
            </div>
            {error && <p className="text-[11px] text-red-300">{error}</p>}
            <div className="flex items-center justify-between gap-2">
              <select
                value={provider}
                onChange={(e) => setProvider(e.target.value as '' | LLMProviderId)}
                className="rounded-md border border-neutral-700 bg-[#0f0f0f] px-2 py-1.5 text-xs text-white/70 outline-none"
                aria-label="Modèle"
              >
                <option value="">Modèle auto</option>
                <option value="gemini">Gemini</option>
                <option value="claude">Claude</option>
              </select>
              <button
                onClick={onGenerate}
                disabled={!prompt.trim() || busy}
                className="px-3 py-1.5 rounded bg-indigo-500 hover:bg-indigo-600 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2 text-sm text-white"
              >
                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                {busy ? 'Génération…' : 'Générer'}
              </button>
            </div>
          </>
        ) : (
          <>
            {preview && <PromptToFlowPreview graph={preview} />}
            <div className="flex justify-end gap-2 pt-1">
              <button onClick={reset} className="px-3 py-1.5 rounded text-sm text-white/60 hover:text-white hover:bg-white/5">
                Recommencer
              </button>
              <button onClick={onAccept} className="px-3 py-1.5 rounded bg-indigo-500 hover:bg-indigo-600 text-sm text-white">
                Accepter
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
