import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Wand2, Loader2, Trash2 } from 'lucide-react'
import { auth } from '@/lib/firebase/config'
import { useRetailPromoStore } from '../retailPromo.store'
import { CURATED_TEMPLATES } from '../templates'
import { listPromoTemplates, deletePromoTemplate, type UserPromoTemplate } from '../promoTemplatesApi'
import { useGeneratePromoPlan } from '../useGeneratePromoPlan'
import { augmentRowsWithPromo } from '../augmentRows'
import { useCreateProject } from '@/features/projects/useCreateProject'
import type { PromoLayout } from '../promoTypes'

export function StepTemplate() {
  const navigate = useNavigate()
  const {
    rawColumns, rawRows, fieldMap, sourceRef,
    setStep, setPendingApply,
  } = useRetailPromoStore()
  const { generate, isLoading: aiLoading } = useGeneratePromoPlan()
  const createProject = useCreateProject()

  const [brief, setBrief] = useState('')
  const [showBrief, setShowBrief] = useState(false)
  const [aiBg, setAiBg] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [userTemplates, setUserTemplates] = useState<UserPromoTemplate[]>([])

  // Mes modèles persistés (users/{uid}/promoTemplates)
  useEffect(() => {
    const uid = auth.currentUser?.uid
    if (uid) void listPromoTemplates(uid).then(setUserTemplates)
  }, [])

  const removeTemplate = async (id: string) => {
    const uid = auth.currentUser?.uid
    if (!uid) return
    await deletePromoTemplate(uid, id)
    setUserTemplates((prev) => prev.filter((t) => t.id !== id))
  }

  // Augment once — reused for both AI sample and the handoff connect
  const augmented = augmentRowsWithPromo(rawColumns, rawRows, fieldMap)

  const handleConfirm = async (layout: PromoLayout) => {
    if (!sourceRef) return
    setConfirming(true)
    setError(null)
    try {
      const project = await createProject.mutateAsync({
        title: `Promo – ${layout.label}`,
        canvasWidth: layout.width,
        canvasHeight: layout.height,
        canvasBg: layout.background,
      })
      // Le fond IA (Nano Banana 2) est généré dans l'éditeur (où un projet est
      // ouvert → l'upload gallery fonctionne). On transmet le brief via le relais.
      setPendingApply({
        projectId: project.id,
        layout,
        sourceRef,
        columns: augmented.columns,
        rows: augmented.rows,
        aiBgBrief: aiBg ? brief : null,
      })
      navigate(`/editor/${project.id}`, { state: { title: `Promo – ${layout.label}` } })
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setConfirming(false)
    }
  }

  const handleAiGenerate = async () => {
    const layout = await generate({
      brief: brief || 'Affiche promo retail lisible',
      width: CURATED_TEMPLATES[0].width,
      height: CURATED_TEMPLATES[0].height,
      sample: augmented.rows[0] as Record<string, unknown>,
    })
    await handleConfirm(layout)
  }

  const isWorking = aiLoading || confirming

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-lg font-semibold text-white">Gabarit</h2>
      <p className="text-sm text-white/60">Choisissez un gabarit curé ou laissez l'IA composer.</p>

      {/* Fond créatif IA (Nano Banana 2) */}
      <label className="flex items-start gap-2.5 p-3 rounded-lg bg-surface border border-white/10 cursor-pointer hover:bg-surface-2 transition-colors">
        <input
          type="checkbox"
          checked={aiBg}
          onChange={(e) => setAiBg(e.target.checked)}
          disabled={isWorking}
          className="mt-0.5 accent-[#6366f1]"
        />
        <span className="min-w-0">
          <span className="block text-sm text-white">Fond créatif IA (Nano Banana 2)</span>
          <span className="block text-[11px] text-white/40">Génère un arrière-plan designé derrière le visuel. Ajoute ~15-30 s.</span>
        </span>
      </label>

      {error && <p className="text-red-400 text-sm">{error}</p>}

      <div className="grid grid-cols-2 gap-3">
        {CURATED_TEMPLATES.map((tpl) => (
          <button
            key={tpl.id}
            onClick={() => void handleConfirm(tpl)}
            disabled={isWorking}
            className="flex flex-col items-center gap-2 p-3 rounded-xl border border-white/10 bg-surface hover:bg-surface-2 transition-colors disabled:opacity-40"
          >
            {/* Miniature proportionnelle */}
            <div
              className="rounded bg-white/10 w-full"
              style={{ aspectRatio: `${tpl.width}/${tpl.height}`, maxHeight: 64 }}
            />
            <span className="text-xs text-white/70">{tpl.label}</span>
            <span className="text-xs text-white/40">
              {tpl.width}×{tpl.height} px
            </span>
          </button>
        ))}
      </div>

      {/* Mes modèles (persistés) */}
      {userTemplates.length > 0 && (
        <div className="flex flex-col gap-2">
          <p className="text-xs font-medium text-white/50 uppercase tracking-wide">Mes modèles</p>
          <div className="grid grid-cols-2 gap-3">
            {userTemplates.map((t) => (
              <div key={t.id} className="relative group">
                <button
                  onClick={() => void handleConfirm(t.layout)}
                  disabled={isWorking}
                  className="w-full flex flex-col items-center gap-2 p-3 rounded-xl border border-[#6366f1]/30 bg-surface hover:bg-surface-2 transition-colors disabled:opacity-40"
                >
                  <div
                    className="rounded bg-[#6366f1]/15 w-full"
                    style={{ aspectRatio: `${t.layout.width}/${t.layout.height}`, maxHeight: 64 }}
                  />
                  <span className="text-xs text-white/70 truncate max-w-full">{t.name}</span>
                  <span className="text-xs text-white/40">{t.layout.width}×{t.layout.height} px</span>
                </button>
                <button
                  onClick={() => void removeTemplate(t.id)}
                  title="Supprimer ce modèle"
                  className="absolute top-1.5 right-1.5 p-1 rounded bg-black/40 text-white/50 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Générer via IA */}
      {!showBrief ? (
        <button
          onClick={() => setShowBrief(true)}
          disabled={isWorking}
          className="flex items-center justify-center gap-2 px-4 py-2 rounded-lg border border-[#6366f1]/40 text-[#6366f1] text-sm hover:bg-[#6366f1]/10 transition-colors disabled:opacity-40"
        >
          <Wand2 className="w-4 h-4" /> Générer (IA)
        </button>
      ) : (
        <div className="flex flex-col gap-2">
          <textarea
            placeholder="Brief créatif (ex: Fond rouge vif, prix dominant, badge -X% en haut à droite)"
            value={brief}
            onChange={(e) => setBrief(e.target.value)}
            rows={3}
            className="px-3 py-2 rounded-lg bg-well border border-white/10 text-white text-sm outline-none focus:border-[#6366f1] resize-none"
          />
          <div className="flex gap-2">
            <button onClick={() => setShowBrief(false)}
              className="px-3 py-1.5 rounded-lg border border-white/10 text-white/60 text-sm hover:text-white transition-colors">
              Annuler
            </button>
            <button onClick={() => void handleAiGenerate()} disabled={isWorking}
              className="flex-1 flex items-center justify-center gap-2 px-3 py-1.5 rounded-lg bg-[#6366f1] text-[#fff] text-sm font-medium disabled:opacity-40 transition-opacity">
              {aiLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />}
              {aiLoading ? 'Génération…' : 'Générer'}
            </button>
          </div>
        </div>
      )}

      {confirming && (
        <div className="flex items-center gap-2 text-white/60 text-sm">
          <Loader2 className="w-4 h-4 animate-spin" /> Création du projet…
        </div>
      )}

      <button onClick={() => setStep('mapping')}
        className="text-sm text-white/50 hover:text-white transition-colors text-left">
        ← Retour au mapping
      </button>
    </div>
  )
}
