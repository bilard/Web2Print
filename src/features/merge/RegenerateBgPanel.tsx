// Re-skin v2 : régénère le FOND verrouillé d'un flyer décomposé (calque
// image-bg-locked) via Nano Banana, en passant le fond actuel comme image de
// référence. Les overlays éditables (textes {{champ}}, images liées) restent
// intacts au-dessus — combiné à la source PIM, on re-skinne visuel ET données.
import { useState } from 'react'
import { FabricImage, Group, type FabricObject } from 'fabric'
import { Sparkles, Loader2 } from 'lucide-react'
import { globalFabricCanvas, globalSnapshot } from '@/features/editor/globalCanvas'
import { syncToStore } from '@/features/editor/useAddObject'
import { useEditorStore } from '@/stores/editor.store'
import { generateImage } from '@/features/briefs/ai/geminiImageClient'
import { notify } from '@/lib/notify'
import { isBgLockedMarker } from '@/features/svg/bgLockMarker'

/** Première FabricImage du sous-arbre (le calque bg est une image, parfois groupée). */
function findImage(root: FabricObject): FabricImage | null {
  if (root instanceof FabricImage) return root
  if (root instanceof Group) {
    for (const child of (root as unknown as { _objects?: FabricObject[] })._objects ?? []) {
      const found = findImage(child)
      if (found) return found
    }
  }
  return null
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(r.result as string)
    r.onerror = () => reject(new Error('Lecture du blob impossible'))
    r.readAsDataURL(blob)
  })
}

export function RegenerateBgPanel() {
  // Re-render quand les objets changent (détection du calque bg après import).
  useEditorStore((s) => s.canvasObjects.length)
  const [prompt, setPrompt] = useState('')
  const [busy, setBusy] = useState(false)

  const canvas = globalFabricCanvas
  const bgRoot = canvas?.getObjects().find(isBgLockedMarker) ?? null
  if (!canvas || !bgRoot) return null

  const regenerate = async () => {
    const img = findImage(bgRoot)
    if (!img) {
      notify.error('Fond IA', 'Aucune image trouvée dans le calque de fond.')
      return
    }
    setBusy(true)
    try {
      // Référence = rendu actuel du fond, plafonné à ~1024 px de large.
      const multiplier = Math.min(1, 1024 / Math.max(1, bgRoot.getScaledWidth()))
      const refDataUrl = bgRoot.toDataURL({ format: 'jpeg', quality: 0.85, multiplier })
      const refBase64 = refDataUrl.split(',')[1] ?? ''

      const fullPrompt = [
        'Redesign the BACKGROUND of this promotional flyer (current background attached as reference).',
        prompt.trim() || 'Modernize it while keeping the same mood and brand colors.',
        'Constraints: keep the same proportions and general layout zones; do NOT render any text, letters, numbers or logos; produce a clean background suitable for overlaying editable text and product photos.',
      ].join('\n')

      const result = await generateImage(
        fullPrompt,
        [{ mimeType: 'image/jpeg', data: refBase64, label: 'current background' }],
        { outputFormat: 'images-only', imageSize: '2K', aspectRatio: 'auto' },
      )

      // Remplace la source en conservant les dimensions affichées du fond.
      const prevW = img.getScaledWidth()
      const prevH = img.getScaledHeight()
      const dataUrl = await blobToDataUrl(result.blob)
      await img.setSrc(dataUrl)
      img.set({
        scaleX: prevW / Math.max(1, img.width ?? prevW),
        scaleY: prevH / Math.max(1, img.height ?? prevH),
      })
      img.setCoords()
      canvas.requestRenderAll()
      syncToStore(canvas)
      globalSnapshot?.()
      notify.success('Fond régénéré (NB2)', 'Le calque de fond a été remplacé — les overlays sont intacts.')
    } catch (err) {
      notify.error('Fond IA échoué', err instanceof Error ? err.message.slice(0, 160) : String(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="p-3 border-t border-white/[0.06] space-y-2">
      <div className="flex items-center gap-1.5 text-xs text-white/70">
        <Sparkles className="w-3.5 h-3.5 text-fuchsia-400" />
        Fond IA (Nano Banana)
      </div>
      <textarea
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        rows={2}
        placeholder="Ex : ambiance été, fond plage ensoleillée, garder le rouge de la marque…"
        className="w-full bg-background border border-neutral-700 rounded-md px-2 py-1.5 text-[12px] text-white placeholder:text-neutral-600 focus:border-fuchsia-500 outline-none resize-y"
      />
      <button
        onClick={() => void regenerate()}
        disabled={busy}
        className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-md bg-fuchsia-600 hover:bg-fuchsia-500 disabled:opacity-50 text-[#fff] text-sm transition-colors"
      >
        {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
        {busy ? 'Génération…' : 'Régénérer le fond'}
      </button>
      <p className="text-[10px] text-white/30 leading-snug">
        Remplace uniquement le calque de fond verrouillé — vos textes et images liés restent
        éditables au-dessus. Nécessite une clé Gemini (Réglages → Connecteurs).
      </p>
    </div>
  )
}
