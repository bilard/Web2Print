import { useEffect, useState } from 'react'
import { Sparkles, Loader2, Save, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { useRetailPromoStore } from './retailPromo.store'
import { extractPromoFields } from './promoMapping'
import { RULE_SYNTHETIC_COLUMNS, augmentRowForRules } from './promoRuleFields'
import { generatePromoTemplate } from './useGeneratePromoTemplate'
import { listPromoTemplates, savePromoTemplate, deletePromoTemplate, type UserPromoTemplate } from './promoTemplatesApi'
import { PromoLayoutPicker } from './PromoLayoutPicker'
import type { PromoTemplateConfig } from './RetailPromoCard'

const TOGGLES: Array<{ key: keyof PromoTemplateConfig; label: string }> = [
  { key: 'showCategory', label: 'Catégorie' },
  { key: 'showDescription', label: 'Description' },
  { key: 'showUnitPrice', label: 'Prix unitaire' },
  { key: 'showBadge', label: 'Badge remise' },
  { key: 'showFooter', label: 'Pied de page' },
]

/** Barre d'édition du template : prompt IA + champs affichés + modèles enregistrés (couleurs/typo → panneau droit). */
export function PromoTemplateEditor() {
  const { config, setConfig, rawColumns, rawRows, fieldMap } = useRetailPromoStore()
  const [brief, setBrief] = useState('')
  const [busy, setBusy] = useState(false)
  const [templates, setTemplates] = useState<UserPromoTemplate[]>([])
  const [tplName, setTplName] = useState('')
  const [savingTpl, setSavingTpl] = useState(false)

  useEffect(() => { void listPromoTemplates().then(setTemplates) }, [])

  const saveTemplate = async () => {
    const name = tplName.trim()
    if (!name) return
    setSavingTpl(true)
    try {
      await savePromoTemplate(name, config)
      setTemplates(await listPromoTemplates())
      setTplName('')
      toast.success('Modèle enregistré')
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Échec enregistrement') } finally { setSavingTpl(false) }
  }

  const applyTemplate = (id: string) => {
    const t = templates.find((x) => x.id === id)
    // Normalise les dictionnaires : un ancien modèle sans ces clés ne doit pas conserver l'état de la session.
    if (t) { setConfig({ ...t.config, layout: t.config.layout ?? 'classique', styles: t.config.styles ?? {}, colors: t.config.colors ?? {}, scales: t.config.scales ?? {}, blockFills: t.config.blockFills ?? {} }); toast.success(`Modèle « ${t.name} » appliqué`) }
  }

  const removeTemplate = async (id: string) => {
    await deletePromoTemplate(id)
    setTemplates(await listPromoTemplates())
  }

  const generate = async () => {
    if (!brief.trim()) return
    setBusy(true)
    try {
      const cats = Array.from(
        new Set(rawRows.slice(0, 60).map((r) => extractPromoFields(r, rawColumns, fieldMap).category).filter(Boolean)),
      )
      // Échantillons par colonne (synthétiques « Remise (%) »… + colonnes source) pour que
      // l'IA cible le bon champ et respecte le format des valeurs dans les conditions.
      const sampleRows = rawRows.slice(0, 40).map((r) => augmentRowForRules(r, rawColumns, fieldMap))
      const columns = [...RULE_SYNTHETIC_COLUMNS, ...rawColumns].map((c) => ({
        label: c.label || c.key,
        samples: Array.from(new Set(sampleRows.map((r) => String((r as Record<string, unknown>)[c.key] ?? '').trim()).filter(Boolean))).slice(0, 3),
      }))
      const { style, rules, layout, adjustments } = await generatePromoTemplate(brief.trim(), { categories: cats as string[], columns })
      const patch: Partial<PromoTemplateConfig> = {}
      // Habillage : réinitialise les surcharges par élément (sinon styles[key].fill masque les couleurs IA).
      if (style) Object.assign(patch, style, { styles: {}, blockFills: {} })
      if (layout) patch.layout = layout
      // Nouveau design (mise en page ou habillage) → efface les déplacements/échelles obsolètes, puis applique les ajustements IA.
      if (style || layout) { patch.offsets = adjustments?.offsets ?? {}; patch.scales = adjustments?.scales ?? {} }
      else if (adjustments) { patch.offsets = adjustments.offsets; patch.scales = adjustments.scales }
      if (adjustments?.hidden) patch.hidden = { ...config.hidden, ...adjustments.hidden }
      if (rules) patch.rules = { ...config.rules, ...rules }
      setConfig(patch)
      const done = [layout && 'mise en page', style && 'habillage', rules && 'règle(s)'].filter(Boolean).join(' + ')
      toast.success(done ? `Généré : ${done}` : 'Aucune modification suggérée')
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Échec génération IA') } finally { setBusy(false) }
  }

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-white/10 bg-surface px-4 py-3">
      {/* Prompt IA */}
      <div className="flex items-center gap-2">
        <input
          value={brief} onChange={(e) => setBrief(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') void generate() }}
          placeholder="Décris le style voulu (ex : soldes flashy rouge & jaune, gros prix, police condensée)…"
          className="flex-1 rounded-lg border border-white/10 bg-well px-3 py-2 text-sm text-white outline-none placeholder:text-white/30 focus:border-[#6366f1]"
        />
        <button onClick={() => void generate()} disabled={busy || !brief.trim()}
          className="flex shrink-0 items-center gap-2 rounded-lg bg-[#6366f1] px-3 py-2 text-sm font-medium text-[#fff] hover:bg-[#5457e5] disabled:opacity-40">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />} Générer (IA)
        </button>
      </div>

      {/* Champs affichés */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-white/40">Champs</span>
        {TOGGLES.map(({ key, label }) => (
          <label key={key} className="flex items-center gap-1.5 text-sm text-white/70">
            <input type="checkbox" checked={config[key] as boolean} onChange={(e) => setConfig({ [key]: e.target.checked })} className="accent-[#6366f1]" />
            {label}
          </label>
        ))}
      </div>

      {/* Mise en page (structure) */}
      <PromoLayoutPicker />

      {/* Modèles enregistrés */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-white/5 pt-3">
        <span className="text-xs font-semibold uppercase tracking-wide text-white/40">Modèles</span>
        <input
          value={tplName} onChange={(e) => setTplName(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') void saveTemplate() }}
          placeholder="Nom du modèle…"
          className="w-44 rounded-lg border border-white/10 bg-well px-2.5 py-1.5 text-sm text-white outline-none placeholder:text-white/30 focus:border-[#6366f1]"
        />
        <button onClick={() => void saveTemplate()} disabled={savingTpl || !tplName.trim()}
          className="flex items-center gap-1.5 rounded-lg bg-white/[0.06] px-3 py-1.5 text-sm font-medium text-white hover:bg-white/10 disabled:opacity-40">
          {savingTpl ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Enregistrer
        </button>
        {templates.length > 0 && (
          <>
            <span className="h-4 w-px bg-white/10" />
            <select defaultValue="" onChange={(e) => { if (e.target.value) { applyTemplate(e.target.value); e.target.value = '' } }}
              className="rounded-lg border border-white/10 bg-well px-2 py-1.5 text-sm text-white [&>option]:bg-neutral-900">
              <option value="">Appliquer un modèle…</option>
              {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
            {templates.map((t) => (
              <button key={t.id} onClick={() => void removeTemplate(t.id)} title={`Supprimer « ${t.name} »`}
                className="flex items-center gap-1 rounded bg-white/[0.04] px-2 py-1 text-xs text-white/50 hover:bg-red-500/15 hover:text-red-400">
                <Trash2 className="h-3 w-3" />{t.name}
              </button>
            ))}
          </>
        )}
      </div>
    </div>
  )
}
