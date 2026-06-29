import { useEffect, useState } from 'react'
import { Sparkles, Loader2, Save, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { useRetailPromoStore } from './retailPromo.store'
import { extractPromoFields } from './promoMapping'
import { generatePromoTemplate } from './useGeneratePromoTemplate'
import { listPromoTemplates, savePromoTemplate, deletePromoTemplate, type UserPromoTemplate } from './promoTemplatesApi'
import { FONT_OPTIONS, type PromoTemplateConfig, type PromoColorKey } from './RetailPromoCard'

const TOGGLES: Array<{ key: keyof PromoTemplateConfig; label: string }> = [
  { key: 'showCategory', label: 'Catégorie' },
  { key: 'showDescription', label: 'Description' },
  { key: 'showUnitPrice', label: 'Prix unitaire' },
  { key: 'showBadge', label: 'Badge remise' },
  { key: 'showFooter', label: 'Pied de page' },
]

const COLOR_FIELDS: Array<{ key: PromoColorKey; label: string; fallback: string }> = [
  { key: 'category', label: 'Catégorie', fallback: '#ffffff' },
  { key: 'name', label: 'Nom', fallback: '#ffffff' },
  { key: 'description', label: 'Description', fallback: '#cbd5e1' },
  { key: 'priceNow', label: 'Prix promo', fallback: '#ffffff' },
  { key: 'priceWas', label: 'Prix barré', fallback: '#ffffff' },
  { key: 'footer', label: 'Pied', fallback: '#9ca3af' },
]

/** Panneau d'édition du template : prompt IA + polices + couleurs par donnée + champs (aperçu live). */
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
    if (t) { setConfig(t.config); toast.success(`Modèle « ${t.name} » appliqué`) }
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
      const patch = await generatePromoTemplate(brief.trim(), cats)
      setConfig(patch)
      toast.success('Habillage généré')
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

      {/* Couleurs de fond + polices */}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-white/40">Habillage</span>
        <label className="flex items-center gap-2 text-sm text-white/70">Accent
          <input type="color" value={config.accent} onChange={(e) => setConfig({ accent: e.target.value })} className="h-6 w-8 cursor-pointer rounded border border-white/10 bg-transparent p-0" /></label>
        <label className="flex items-center gap-2 text-sm text-white/70">En-tête
          <input type="color" value={config.headerBg} onChange={(e) => setConfig({ headerBg: e.target.value })} className="h-6 w-8 cursor-pointer rounded border border-white/10 bg-transparent p-0" /></label>
        <label className="flex items-center gap-2 text-sm text-white/70">Police titres
          <select value={config.fontHeading} onChange={(e) => setConfig({ fontHeading: e.target.value })}
            className="rounded border border-white/10 bg-well px-2 py-1 text-sm text-white [&>option]:bg-neutral-900">
            {FONT_OPTIONS.map((f) => <option key={f} value={f}>{f}</option>)}</select></label>
        <label className="flex items-center gap-2 text-sm text-white/70">Police prix
          <select value={config.fontPrice} onChange={(e) => setConfig({ fontPrice: e.target.value })}
            className="rounded border border-white/10 bg-well px-2 py-1 text-sm text-white [&>option]:bg-neutral-900">
            {FONT_OPTIONS.map((f) => <option key={f} value={f}>{f}</option>)}</select></label>
      </div>

      {/* Couleur par donnée */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-white/40">Couleur des textes</span>
        {COLOR_FIELDS.map(({ key, label, fallback }) => (
          <label key={key} className="flex items-center gap-1.5 text-sm text-white/60">
            {label}
            <input type="color" value={config.colors[key] ?? fallback}
              onChange={(e) => setConfig({ colors: { ...config.colors, [key]: e.target.value } })}
              className="h-6 w-7 cursor-pointer rounded border border-white/10 bg-transparent p-0" />
          </label>
        ))}
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
