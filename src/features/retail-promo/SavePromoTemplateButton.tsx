import { useEffect, useState } from 'react'
import { Bookmark, Loader2, Check } from 'lucide-react'
import { toast } from 'sonner'
import { globalFabricCanvas } from '@/features/editor/CanvasContainer'
import { useEditorStore } from '@/stores/editor.store'
import { useUIStore } from '@/stores/ui.store'
import { auth } from '@/lib/firebase/config'
import { deriveLayoutFromCanvas, canvasHasPromoBlocks } from './deriveLayoutFromCanvas'
import { savePromoTemplate } from './promoTemplatesApi'

/**
 * Bouton flottant « Enregistrer comme modèle » — visible uniquement quand le
 * canvas contient des blocs promo (= projet promo). Dérive un PromoLayout
 * réutilisable depuis le canvas et le persiste sous users/{uid}/promoTemplates.
 */
export function SavePromoTemplateButton() {
  const canvasObjects = useEditorStore((s) => s.canvasObjects)
  const [isPromo, setIsPromo] = useState(false)
  const [naming, setNaming] = useState(false)
  const [name, setName] = useState('')
  const [saving, setSaving] = useState(false)

  // Re-vérifie la présence de blocs promo à chaque changement du canvas.
  useEffect(() => {
    setIsPromo(!!globalFabricCanvas && canvasHasPromoBlocks(globalFabricCanvas))
  }, [canvasObjects])

  if (!isPromo) return null

  const save = async () => {
    const canvas = globalFabricCanvas
    const uid = auth.currentUser?.uid
    if (!canvas || !uid) return
    setSaving(true)
    try {
      const { canvasWidth, canvasHeight, canvasBg } = useUIStore.getState()
      const ts = Date.now()
      const layout = deriveLayoutFromCanvas(canvas, {
        id: `tpl_${ts}`,
        label: name.trim() || 'Mon modèle',
        width: canvasWidth,
        height: canvasHeight,
        background: canvasBg || '#ffffff',
      })
      await savePromoTemplate(uid, {
        id: layout.id,
        name: layout.label,
        layout,
        createdAt: ts,
        updatedAt: ts,
      })
      toast.success(`Modèle « ${layout.label} » enregistré`)
      setNaming(false)
      setName('')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Échec de l\'enregistrement du modèle')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="absolute bottom-4 left-4 z-20">
      {naming ? (
        <div className="flex items-center gap-2 bg-surface-2 border border-white/10 rounded-lg p-2 shadow-xl">
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') void save(); if (e.key === 'Escape') setNaming(false) }}
            placeholder="Nom du modèle"
            className="bg-well border border-white/10 rounded px-2 py-1 text-sm text-white outline-none focus:border-[#6366f1] w-44"
          />
          <button
            onClick={() => void save()}
            disabled={saving}
            className="flex items-center gap-1 px-2.5 py-1 rounded bg-[#6366f1] text-[#fff] text-sm font-medium disabled:opacity-50"
          >
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
            Enregistrer
          </button>
          <button onClick={() => setNaming(false)} className="text-white/50 hover:text-white text-sm px-1">Annuler</button>
        </div>
      ) : (
        <button
          onClick={() => setNaming(true)}
          className="flex items-center gap-2 px-3 py-2 rounded-lg bg-surface-2 border border-white/10 text-white/80 hover:text-white hover:border-[#6366f1]/50 text-sm shadow-xl transition-colors"
          title="Enregistrer cette mise en page comme modèle promo réutilisable"
        >
          <Bookmark className="w-4 h-4 text-[#6366f1]" /> Enregistrer comme modèle
        </button>
      )}
    </div>
  )
}
