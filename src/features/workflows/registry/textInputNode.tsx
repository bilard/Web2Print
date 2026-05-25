// src/features/workflows/registry/textInputNode.tsx
// Node source « Saisie texte » : produit un texte saisi à la main (sans fichier).
// Utile comme entrée d'un workflow : message, prompt, valeur à interpoler en aval.
import { Type } from 'lucide-react'
import { nodeRegistry } from './index'
import type { NodeSpec } from '../types'

interface TextInputConfig {
  text: string
}

interface TextInputConfigUiProps {
  config: TextInputConfig
  onChange: (next: TextInputConfig) => void
}

function TextInputConfigUi({ config, onChange }: TextInputConfigUiProps) {
  return (
    <div className="space-y-2">
      <label className="text-xs text-neutral-400 block">Texte</label>
      <textarea
        value={config.text}
        onChange={(e) => onChange({ ...config, text: e.target.value })}
        rows={5}
        placeholder="Saisis ton texte ici…"
        className="w-full bg-[#0f0f0f] border border-neutral-700 rounded-md px-2 py-1.5 text-[12px] text-white placeholder:text-neutral-600 focus:border-cyan-500 outline-none resize-y font-mono"
      />
      <p className="text-[10px] text-neutral-600 leading-snug">
        Produit ce texte en sortie (port <code className="text-emerald-300/80">text</code>),
        réutilisable en aval via <code className="text-emerald-300/80">{'{{text}}'}</code>.
      </p>
    </div>
  )
}

export const textInputNode: NodeSpec<TextInputConfig, Record<string, never>, { text: string }> = {
  type: 'text-input',
  category: 'import',
  label: 'Saisie texte',
  description:
    "Saisis un texte directement, sans fichier — source pour un message, un prompt ou une valeur à interpoler.",
  icon: Type,
  inputs: [],
  outputs: [{ name: 'text', type: 'any' }],
  configSchema: [],
  defaultConfig: { text: '' },
  runtime: 'client',
  ConfigComponent: TextInputConfigUi,
  run: async (ctx, config) => {
    const text = config.text ?? ''
    if (!text.trim()) ctx.log('warn', 'Le texte saisi est vide.')
    else ctx.log('info', `Texte saisi : ${text.length} caractère(s).`)
    return { text }
  },
}

nodeRegistry.register(textInputNode)
