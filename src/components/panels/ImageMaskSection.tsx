import { useState } from 'react'
import { FabricImage } from 'fabric'
import { HelpCircle } from 'lucide-react'
import {
  enterContentMode,
  exitContentMode,
  isInContentMode,
  fitFrameToContent,
  fillFrameProportionally,
} from '@/features/editor/useImageMask'

interface Props {
  image: FabricImage
}

export function ImageMaskSection({ image }: Props) {
  const [, force] = useState(0)
  const [helpOpen, setHelpOpen] = useState(false)
  const rerender = () => force((n) => n + 1)

  const cp = (image as any).clipPath as
    | { left: number; top: number; width: number; height: number }
    | undefined
  const inContent = isInContentMode(image)

  const setClipField = (field: 'left' | 'top' | 'width' | 'height', v: number) => {
    if (!cp) return
    ;(cp as any).set({ [field]: v })
    ;(image as any).dirty = true
    image.canvas?.requestRenderAll()
    rerender()
  }

  return (
    <div className="flex flex-col gap-2.5">
      {/* Section header */}
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-semibold text-white/40 uppercase tracking-wider">
          Masque
        </span>
        <div className="relative">
          <button
            type="button"
            onClick={() => setHelpOpen((v) => !v)}
            className="rounded p-1 text-white/30 hover:bg-white/5 hover:text-white/70 transition-colors"
            aria-label="Aide raccourcis"
          >
            <HelpCircle className="w-3.5 h-3.5" />
          </button>
          {helpOpen && (
            <div className="absolute right-0 top-7 z-50 w-72 rounded-md border border-white/10 bg-[#1a1a1a] p-3 shadow-xl">
              <button
                onClick={() => setHelpOpen(false)}
                className="absolute right-2 top-2 text-white/30 hover:text-white/60"
                aria-label="Fermer"
              >
                ✕
              </button>
              <p className="mb-2 text-[10px] font-semibold text-[#6366f1] uppercase tracking-wider">
                Raccourcis redimensionnement
              </p>
              <table className="w-full text-[10px]">
                <thead>
                  <tr className="border-b border-white/10 text-white/40">
                    <th className="py-1 text-left">Modificateur</th>
                    <th className="text-left">Cadre</th>
                    <th className="text-left">Image</th>
                    <th className="text-left">Ratio</th>
                  </tr>
                </thead>
                <tbody className="text-white/70">
                  <tr>
                    <td className="py-1">Aucun</td>
                    <td>resize</td>
                    <td>inchangée</td>
                    <td>libre</td>
                  </tr>
                  <tr>
                    <td className="py-1">Shift</td>
                    <td>resize</td>
                    <td>resize</td>
                    <td>proportionnel</td>
                  </tr>
                  <tr>
                    <td className="py-1">Cmd</td>
                    <td>resize</td>
                    <td>resize</td>
                    <td>libre (déforme)</td>
                  </tr>
                  <tr>
                    <td className="py-1">Cmd+Shift</td>
                    <td>resize</td>
                    <td>resize</td>
                    <td>proportionnel</td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Content-mode toggle */}
      <label className="flex items-center justify-between cursor-pointer">
        <span className="text-xs text-white/60">Éditer le contenu</span>
        <button
          type="button"
          role="switch"
          aria-checked={inContent}
          onClick={() => {
            if (inContent) exitContentMode(image)
            else enterContentMode(image)
            rerender()
          }}
          className={`relative w-9 h-5 rounded-full transition-colors ${
            inContent ? 'bg-indigo-500' : 'bg-white/10'
          }`}
        >
          <span
            className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${
              inContent ? 'left-4' : 'left-0.5'
            }`}
          />
        </button>
      </label>

      {/* Fit buttons */}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => {
            fitFrameToContent(image)
            rerender()
          }}
          className="flex-1 py-1.5 text-[10px] bg-white/5 hover:bg-white/10 border border-white/10 hover:border-white/30 rounded-md text-white/40 hover:text-white transition-colors"
        >
          Ajuster cadre
        </button>
        <button
          type="button"
          onClick={() => {
            fillFrameProportionally(image)
            rerender()
          }}
          className="flex-1 py-1.5 text-[10px] bg-white/5 hover:bg-white/10 border border-white/10 hover:border-white/30 rounded-md text-white/40 hover:text-white transition-colors"
        >
          Remplir cadre
        </button>
      </div>

      {/* clipPath geometry inputs */}
      {cp && (
        <div className="grid grid-cols-2 gap-2">
          {(
            [
              { field: 'left', label: 'X' },
              { field: 'top', label: 'Y' },
              { field: 'width', label: 'L' },
              { field: 'height', label: 'H' },
            ] as const
          ).map(({ field, label }) => (
            <div key={field} className="flex flex-col gap-1">
              <span className="text-[10px] text-white/30 uppercase tracking-wider">{label}</span>
              <div className="flex items-center bg-white/5 border border-white/10 rounded-md overflow-hidden focus-within:border-indigo-500/50">
                <input
                  type="number"
                  value={Math.round(cp[field])}
                  onChange={(e) => setClipField(field, Number(e.target.value))}
                  className="w-full bg-transparent px-2 py-1.5 text-xs text-white focus:outline-none"
                />
                <span className="text-[10px] text-white/20 pr-1.5 shrink-0">pt</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
