/**
 * Test panel pour le nouveau pipeline image→SVG
 *
 * Usage: Ajouter ce composant dans Claude Design modal pour permettre
 * aux users de tester le nouveau workflow directement.
 */

import { useState } from 'react'
import { useGenerateDesignFromImage } from './useGenerateDesignFromImage'
import type { DesignStyle } from './types'

const STYLES: DesignStyle[] = ['corporate', 'minimaliste', 'bold', 'elegant', 'playful', 'retro']

export function ImageDesignPanel() {
  const [prompt, setPrompt] = useState('Taille-haie Makita 18V professionnel avec batterie')
  const [style, setStyle] = useState<DesignStyle>('bold')
  const [widthMm, setWidthMm] = useState(210)
  const [heightMm, setHeightMm] = useState(297)
  const [palette, setPalette] = useState('')

  const { step, progress, error, generate } = useGenerateDesignFromImage()

  const handleGenerate = async () => {
    try {
      await generate({
        prompt,
        style,
        widthMm,
        heightMm,
        palette: palette ? palette.split(',').map((c) => c.trim()) : undefined,
      })
    } catch (err) {
      console.error('Generation failed:', err)
    }
  }

  const isLoading = step !== 'idle' && step !== 'done' && step !== 'error'

  return (
    <div className="space-y-4 p-4">
      <h2 className="text-lg font-bold text-white">Image-Based Design (v2)</h2>

      {/* Prompt */}
      <div>
        <label className="text-xs uppercase text-neutral-400">Design Brief</label>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          disabled={isLoading}
          className="mt-1 w-full rounded bg-neutral-900 px-3 py-2 text-sm text-neutral-200 placeholder-neutral-600 disabled:opacity-50"
          rows={3}
          placeholder="Décris le design que tu veux générer..."
        />
      </div>

      {/* Style */}
      <div>
        <label className="text-xs uppercase text-neutral-400">Style</label>
        <select
          value={style}
          onChange={(e) => setStyle(e.target.value as DesignStyle)}
          disabled={isLoading}
          className="mt-1 w-full rounded bg-neutral-900 px-3 py-2 text-sm text-neutral-200 disabled:opacity-50"
        >
          {STYLES.map((s) => (
            <option key={s} value={s}>
              {s.charAt(0).toUpperCase() + s.slice(1)}
            </option>
          ))}
        </select>
      </div>

      {/* Dimensions */}
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-xs uppercase text-neutral-400">Width (mm)</label>
          <input
            type="number"
            value={widthMm}
            onChange={(e) => setWidthMm(Number(e.target.value))}
            disabled={isLoading}
            className="mt-1 w-full rounded bg-neutral-900 px-3 py-2 text-sm text-neutral-200 disabled:opacity-50"
          />
        </div>
        <div>
          <label className="text-xs uppercase text-neutral-400">Height (mm)</label>
          <input
            type="number"
            value={heightMm}
            onChange={(e) => setHeightMm(Number(e.target.value))}
            disabled={isLoading}
            className="mt-1 w-full rounded bg-neutral-900 px-3 py-2 text-sm text-neutral-200 disabled:opacity-50"
          />
        </div>
      </div>

      {/* Palette */}
      <div>
        <label className="text-xs uppercase text-neutral-400">Palette (optionnel)</label>
        <input
          type="text"
          value={palette}
          onChange={(e) => setPalette(e.target.value)}
          disabled={isLoading}
          className="mt-1 w-full rounded bg-neutral-900 px-3 py-2 text-sm text-neutral-200 placeholder-neutral-600 disabled:opacity-50"
          placeholder="#FF6B35, #1A1A1A, #FFFFFF"
        />
      </div>

      {/* Status */}
      {progress && (
        <div className="rounded bg-neutral-900 p-3 text-sm text-neutral-300">
          <div className="flex items-center gap-2">
            <div className="h-2 w-2 animate-pulse rounded-full bg-indigo-500" />
            {progress}
          </div>
        </div>
      )}

      {error && (
        <div className="rounded bg-red-900 bg-opacity-20 p-3 text-sm text-red-300">
          <strong>Error:</strong> {error}
        </div>
      )}

      {step === 'done' && (
        <div className="rounded bg-green-900 bg-opacity-20 p-3 text-sm text-green-300">
          ✓ Design généré et chargé dans le canvas !
        </div>
      )}

      {/* Generate Button */}
      <button
        onClick={handleGenerate}
        disabled={isLoading || !prompt.trim()}
        className="w-full rounded bg-indigo-600 px-4 py-2 font-semibold text-white disabled:bg-neutral-700 disabled:text-neutral-500 hover:bg-indigo-700"
      >
        {isLoading ? `Génération... (${step})` : 'Générer Design'}
      </button>

      {/* Info */}
      <div className="rounded bg-neutral-900 p-3 text-xs text-neutral-400">
        <p className="font-semibold">Pipeline:</p>
        <ol className="mt-2 space-y-1">
          <li>1️⃣ Nano Banana génère image</li>
          <li>2️⃣ Claude Vision analyse le design</li>
          <li>3️⃣ SVG éditable généré (100% fidèle)</li>
          <li>4️⃣ Chargé dans le canvas Fabric</li>
        </ol>
      </div>
    </div>
  )
}
