import { useState } from 'react'
import { Plus, Trash2, Play, Save, FlaskConical, Loader2, Download, Upload, MousePointer, Code2, MessageSquare, ChevronDown } from 'lucide-react'
import type { ScrapingTemplate, FieldSelector, GroupSelector, SelectorStrategy } from './types'
import { STANDARD_FIELDS } from './types'
import { applyTemplate, scoreApplyResult } from './engine'
import { fetchSourceHtml } from './fetchSourceHtml'
import { saveTemplateWithVendorSync } from './templatesStore'
import { VisualTemplateBuilder } from './VisualTemplateBuilder'
import { toast } from 'sonner'

interface Props {
  template: ScrapingTemplate
  onChange: (t: ScrapingTemplate) => void
  onSaved?: () => void
}

export function TemplateEditor({ template, onChange, onSaved }: Props) {
  const [tab, setTab] = useState<'visual' | 'advanced'>('visual')
  const [testUrl, setTestUrl] = useState('')
  const [testHtml, setTestHtml] = useState('')
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<ReturnType<typeof applyTemplate> | null>(null)
  const [saving, setSaving] = useState(false)

  const update = (patch: Partial<ScrapingTemplate>) => onChange({ ...template, ...patch, updatedAt: Date.now() })

  const addField = (fieldName = '') => {
    const next: FieldSelector = {
      field: fieldName,
      strategies: [{ kind: 'css', expression: '' }],
      multiple: false,
    }
    update({ fields: [...template.fields, next] })
  }

  const updateField = (idx: number, patch: Partial<FieldSelector>) => {
    const next = template.fields.slice()
    next[idx] = { ...next[idx], ...patch }
    update({ fields: next })
  }

  const removeField = (idx: number) => {
    update({ fields: template.fields.filter((_, i) => i !== idx) })
  }

  const addGroup = () => {
    const next: GroupSelector = {
      field: 'specs-group',
      container: { kind: 'css', expression: '' },
      titleSelector: { kind: 'css', expression: '' },
      rowSelector: { kind: 'css', expression: '' },
      keySelector: { kind: 'css', expression: '' },
      valueSelector: { kind: 'css', expression: '' },
    }
    update({ specGroups: [...template.specGroups, next] })
  }

  const updateGroup = (idx: number, patch: Partial<GroupSelector>) => {
    const next = template.specGroups.slice()
    next[idx] = { ...next[idx], ...patch }
    update({ specGroups: next })
  }

  const removeGroup = (idx: number) => {
    update({ specGroups: template.specGroups.filter((_, i) => i !== idx) })
  }

  const runTest = async () => {
    setTesting(true); setTestResult(null)
    try {
      let html = testHtml
      if (!html && testUrl) {
        toast.info('Téléchargement de la page…')
        const fetched = await fetchSourceHtml(testUrl)
        if (!fetched) { toast.error('Impossible de récupérer le HTML (CORS ?)'); return }
        html = fetched
        setTestHtml(html)
      }
      if (!html) { toast.error('Colle du HTML ou saisis une URL'); return }
      const res = applyTemplate(template, html, testUrl || undefined)
      setTestResult(res)
      const score = scoreApplyResult(res)
      if (score >= 20) toast.success(`Extraction réussie — score ${score}`)
      else if (score >= 10) toast.warning(`Extraction partielle — score ${score}`)
      else toast.error(`Extraction faible — score ${score}`)
    } finally {
      setTesting(false)
    }
  }

  const save = async () => {
    setSaving(true)
    try {
      console.log('[TemplateEditor] saving template', template)
      const { syncedCount } = await saveTemplateWithVendorSync(template)
      if (syncedCount > 0) {
        toast.success(`Template enregistré — prompt fournisseur propagé à ${syncedCount} autre(s) template(s)`)
      } else {
        toast.success('Template enregistré')
      }
      onSaved?.()
    } catch (err) {
      console.error('[TemplateEditor] save failed', err)
      const msg = err instanceof Error ? err.message : String(err)
      if (/permission/i.test(msg) || /insufficient/i.test(msg)) {
        toast.error('Sauvegarde refusée par Firestore — règles manquantes sur la collection "scrapingTemplates". Voir README.')
      } else {
        toast.error('Échec sauvegarde : ' + msg)
      }
    } finally {
      setSaving(false)
    }
  }

  const exportJson = () => {
    const blob = new Blob([JSON.stringify(template, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${template.vendorDomain}.template.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  const importJson = async (file: File) => {
    const txt = await file.text()
    try {
      const parsed = JSON.parse(txt)
      onChange({ ...template, ...parsed, id: template.id, updatedAt: Date.now() })
      toast.success('Template importé')
    } catch {
      toast.error('JSON invalide')
    }
  }

  return (
    <div className="flex flex-col gap-4 p-4 bg-[#1a1a1a] border border-white/10 rounded-lg">
      {/* Barre sticky : onglets à gauche + actions (Importer / Exporter / Enregistrer) à droite.
          Reste accrochée en haut du scroll pour toujours avoir Enregistrer sous la main. */}
      <div className="sticky top-0 z-30 bg-[#1a1a1a] -mx-4 px-4 -mt-4 pt-4 pb-2 border-b border-white/10 flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-1">
          <button
            onClick={() => setTab('visual')}
            className={`px-3 py-2 text-[11px] font-semibold rounded-t inline-flex items-center gap-1.5 ${
              tab === 'visual'
                ? 'bg-indigo-500/15 text-indigo-200 border-b-2 border-indigo-400'
                : 'text-white/50 hover:text-white/80'
            }`}
          >
            <MousePointer className="w-3.5 h-3.5" /> Pointer & cliquer
          </button>
          <button
            onClick={() => setTab('advanced')}
            className={`px-3 py-2 text-[11px] font-semibold rounded-t inline-flex items-center gap-1.5 ${
              tab === 'advanced'
                ? 'bg-indigo-500/15 text-indigo-200 border-b-2 border-indigo-400'
                : 'text-white/50 hover:text-white/80'
            }`}
          >
            <Code2 className="w-3.5 h-3.5" /> Avancé (JSON)
          </button>
        </div>
        <div className="flex gap-2">
          <label className="px-3 py-1.5 rounded bg-white/5 text-white/60 hover:bg-white/10 border border-white/10 text-xs inline-flex items-center gap-1.5 cursor-pointer">
            <Upload className="w-3.5 h-3.5" /> Importer
            <input
              type="file"
              accept="application/json"
              className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) importJson(f) }}
            />
          </label>
          <button
            onClick={exportJson}
            className="px-3 py-1.5 rounded bg-white/5 text-white/60 hover:bg-white/10 border border-white/10 text-xs inline-flex items-center gap-1.5"
          >
            <Download className="w-3.5 h-3.5" /> Exporter JSON
          </button>
          <button
            onClick={save}
            disabled={saving}
            className="px-3 py-1.5 rounded bg-emerald-500/20 text-emerald-200 hover:bg-emerald-500/30 border border-emerald-400/30 text-xs inline-flex items-center gap-1.5 disabled:opacity-50"
          >
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
            Enregistrer
          </button>
        </div>
      </div>

      {/* Meta */}
      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1 text-xs">
          <span className="text-white/50">Nom du template</span>
          <input
            className="px-2 py-1.5 bg-black/40 border border-white/10 rounded text-white/90 text-sm"
            value={template.name}
            onChange={(e) => update({ name: e.target.value })}
          />
        </label>
        <label className="flex flex-col gap-1 text-xs">
          <span className="text-white/50">Domaine fournisseur (ex: fr.milwaukeetool.eu)</span>
          <input
            className="px-2 py-1.5 bg-black/40 border border-white/10 rounded text-white/90 text-sm"
            value={template.vendorDomain}
            onChange={(e) => update({ vendorDomain: e.target.value })}
          />
        </label>
        <label className="col-span-2 flex flex-col gap-1 text-xs">
          <span className="text-white/50">Pattern d'URL (regex, ex: /fr-fr/.*perceuse.*$)</span>
          <input
            className="px-2 py-1.5 bg-black/40 border border-white/10 rounded text-white/90 text-sm font-mono"
            value={template.urlPattern}
            onChange={(e) => update({ urlPattern: e.target.value })}
          />
        </label>
      </div>

      {/* Prompt global — instructions de scraping pour tout le fournisseur */}
      <GlobalPromptSection
        value={template.globalPrompt ?? ''}
        onChange={(v) => update({ globalPrompt: v || undefined })}
      />
      <VendorPromptSection
        value={template.vendorPrompt ?? ''}
        vendorDomain={template.vendorDomain}
        onChange={(v) => update({ vendorPrompt: v || undefined })}
      />

      {/* Mode visuel */}
      {tab === 'visual' && (
        <VisualTemplateBuilder template={template} onChange={onChange} />
      )}

      {/* Mode avancé (JSON) */}
      {tab === 'advanced' && (
      <>
      {/* Champs simples */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <h3 className="text-[11px] font-semibold text-white/70 uppercase tracking-wider">Champs</h3>
          <div className="flex gap-2">
            {STANDARD_FIELDS.slice(0, 6).map((s) => (
              <button
                key={s.field}
                onClick={() => addField(s.field)}
                className="text-[10px] px-2 py-0.5 rounded bg-indigo-500/10 text-indigo-300 hover:bg-indigo-500/20 border border-indigo-400/20"
              >
                + {s.field}
              </button>
            ))}
            <button
              onClick={() => addField('')}
              className="text-[10px] px-2 py-0.5 rounded bg-white/5 text-white/60 hover:bg-white/10 border border-white/10 inline-flex items-center gap-1"
            >
              <Plus className="w-3 h-3" /> Autre
            </button>
          </div>
        </div>
        {template.fields.length === 0 && (
          <div className="text-[11px] text-white/30 italic">Aucun champ — ajoute-en un avec les boutons ci-dessus.</div>
        )}
        {template.fields.map((f, i) => (
          <FieldRow
            key={i}
            field={f}
            onChange={(patch) => updateField(i, patch)}
            onRemove={() => removeField(i)}
          />
        ))}
      </div>

      {/* Groupes de specs */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <h3 className="text-[11px] font-semibold text-white/70 uppercase tracking-wider">Groupes de spécifications</h3>
          <button
            onClick={addGroup}
            className="text-[10px] px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20 border border-emerald-400/20 inline-flex items-center gap-1"
          >
            <Plus className="w-3 h-3" /> Ajouter un groupe
          </button>
        </div>
        {template.specGroups.map((g, i) => (
          <GroupRow key={i} group={g} onChange={(patch) => updateGroup(i, patch)} onRemove={() => removeGroup(i)} />
        ))}
      </div>

      {/* Test */}
      <div className="flex flex-col gap-2 border-t border-white/10 pt-4">
        <h3 className="text-[11px] font-semibold text-white/70 uppercase tracking-wider flex items-center gap-2">
          <FlaskConical className="w-3.5 h-3.5" /> Tester sur une URL
        </h3>
        <div className="flex gap-2">
          <input
            className="flex-1 px-2 py-1.5 bg-black/40 border border-white/10 rounded text-white/90 text-sm"
            placeholder="https://fr.milwaukeetool.eu/..."
            value={testUrl}
            onChange={(e) => setTestUrl(e.target.value)}
          />
          <button
            onClick={runTest}
            disabled={testing}
            className="px-3 py-1.5 rounded bg-indigo-500/20 text-indigo-200 hover:bg-indigo-500/30 border border-indigo-400/30 text-xs inline-flex items-center gap-2 disabled:opacity-50"
          >
            {testing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
            Tester
          </button>
        </div>
        <details className="text-[10px]">
          <summary className="text-white/40 cursor-pointer">Ou coller du HTML directement</summary>
          <textarea
            className="mt-2 w-full h-24 px-2 py-1.5 bg-black/40 border border-white/10 rounded text-white/80 font-mono text-[10px]"
            placeholder="<html>…"
            value={testHtml}
            onChange={(e) => setTestHtml(e.target.value)}
          />
        </details>
        {testResult && (
          <div className="mt-2 p-3 bg-black/40 border border-white/10 rounded">
            <div className="text-[10px] text-white/50 mb-2">Score : <b className="text-white/80">{scoreApplyResult(testResult)}</b></div>
            <pre className="text-[10px] text-white/70 overflow-auto max-h-96">
              {JSON.stringify({ fields: testResult.fields, specGroups: testResult.specGroups, warnings: testResult.warnings }, null, 2)}
            </pre>
          </div>
        )}
      </div>
      </>
      )}

    </div>
  )
}

function FieldRow({ field, onChange, onRemove }: { field: FieldSelector; onChange: (p: Partial<FieldSelector>) => void; onRemove: () => void }) {
  return (
    <div className="flex flex-col gap-1 p-2 bg-black/30 border border-white/5 rounded">
      <div className="flex items-center gap-2">
        <input
          className="w-32 px-2 py-1 bg-black/40 border border-white/10 rounded text-white/90 text-xs"
          placeholder="field"
          value={field.field}
          onChange={(e) => onChange({ field: e.target.value })}
        />
        <select
          className="px-2 py-1 bg-black/40 border border-white/10 rounded text-white/80 text-xs"
          value={field.strategies[0]?.kind ?? 'css'}
          onChange={(e) => onChange({ strategies: [{ ...field.strategies[0], kind: e.target.value as SelectorStrategy['kind'] }] })}
        >
          <option value="css">CSS</option>
          <option value="xpath">XPath</option>
          <option value="attr">Attribut</option>
          <option value="text">Texte (regex)</option>
          <option value="text-with-hierarchy">Texte hiérarchique (Markdown)</option>
        </select>
        <input
          className="flex-1 px-2 py-1 bg-black/40 border border-white/10 rounded text-white/90 text-xs font-mono"
          placeholder="Sélecteur (ex: h1.product-title)"
          value={field.strategies[0]?.expression ?? ''}
          onChange={(e) => onChange({ strategies: [{ ...field.strategies[0], expression: e.target.value }] })}
        />
        <label className="text-[10px] text-white/50 inline-flex items-center gap-1">
          <input
            type="checkbox"
            checked={field.multiple}
            onChange={(e) => onChange({ multiple: e.target.checked })}
          /> liste
        </label>
        <button onClick={onRemove} className="text-red-400/60 hover:text-red-400"><Trash2 className="w-3.5 h-3.5" /></button>
      </div>
      <div className="flex items-center gap-2">
        <input
          className="w-32 px-2 py-1 bg-black/40 border border-white/10 rounded text-white/60 text-[10px]"
          placeholder="attr (src, href…)"
          value={field.strategies[0]?.attr ?? ''}
          onChange={(e) => onChange({ strategies: [{ ...field.strategies[0], attr: e.target.value || undefined }] })}
        />
        <select
          className="px-2 py-1 bg-black/40 border border-white/10 rounded text-white/60 text-[10px]"
          value={field.transform ?? ''}
          onChange={(e) => onChange({ transform: (e.target.value || undefined) as FieldSelector['transform'] })}
        >
          <option value="">pas de transformation</option>
          <option value="trim">trim</option>
          <option value="normalize-whitespace">normalize-whitespace</option>
          <option value="lowercase">lowercase</option>
          <option value="uppercase">uppercase</option>
          <option value="parse-number">parse-number</option>
          <option value="parse-price">parse-price</option>
          <option value="absolutize-url">absolutize-url</option>
          <option value="decode-html">decode-html</option>
        </select>
      </div>
    </div>
  )
}

function GroupRow({ group, onChange, onRemove }: { group: GroupSelector; onChange: (p: Partial<GroupSelector>) => void; onRemove: () => void }) {
  const setSel = (k: keyof GroupSelector, v: string) => {
    const s = (group[k] as unknown as SelectorStrategy) ?? { kind: 'css', expression: '' }
    onChange({ [k]: { ...s, expression: v } } as Partial<GroupSelector>)
  }
  return (
    <div className="grid grid-cols-[1fr_1fr_1fr_1fr_1fr_auto] gap-1 p-2 bg-black/30 border border-white/5 rounded text-[10px]">
      <input className="px-1.5 py-1 bg-black/40 border border-white/10 rounded font-mono" placeholder="container" value={group.container.expression} onChange={(e) => setSel('container', e.target.value)} />
      <input className="px-1.5 py-1 bg-black/40 border border-white/10 rounded font-mono" placeholder="titleSelector" value={group.titleSelector.expression} onChange={(e) => setSel('titleSelector', e.target.value)} />
      <input className="px-1.5 py-1 bg-black/40 border border-white/10 rounded font-mono" placeholder="rowSelector" value={group.rowSelector.expression} onChange={(e) => setSel('rowSelector', e.target.value)} />
      <input className="px-1.5 py-1 bg-black/40 border border-white/10 rounded font-mono" placeholder="keySelector" value={group.keySelector.expression} onChange={(e) => setSel('keySelector', e.target.value)} />
      <input className="px-1.5 py-1 bg-black/40 border border-white/10 rounded font-mono" placeholder="valueSelector" value={group.valueSelector.expression} onChange={(e) => setSel('valueSelector', e.target.value)} />
      <button onClick={onRemove} className="text-red-400/60 hover:text-red-400"><Trash2 className="w-3.5 h-3.5" /></button>
    </div>
  )
}

function GlobalPromptSection({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(!!value)
  const [draft, setDraft] = useState(value)
  const isDirty = draft.trim() !== (value ?? '')
  const commit = () => { onChange(draft.trim()); }
  return (
    <div className="border border-white/10 rounded-lg overflow-hidden">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-2 px-3 py-2 bg-black/30 hover:bg-black/40 transition-colors text-left"
      >
        <MessageSquare className={`w-3.5 h-3.5 shrink-0 ${value ? 'text-amber-400/70' : 'text-white/30'}`} />
        <span className="text-[11px] font-semibold text-white/70 uppercase tracking-wider flex-1">
          Instructions globales de scraping
        </span>
        {value && <span className="text-[9px] text-amber-400/50 mr-1">actif</span>}
        <ChevronDown className={`w-3 h-3 text-white/30 transition-transform ${open ? '' : '-rotate-90'}`} />
      </button>
      {open && (
        <div className="px-3 py-2.5 bg-black/20 border-t border-white/[0.06]">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); commit() } }}
            placeholder={"Prompt global appliqué à tous les produits de ce fournisseur.\nExemples :\n• « Toujours retirer le heading H1 de la description. »\n• « Les specs sont dans les accordéons, pas dans le tableau principal. »\n• « Ignorer les lignes 'CARTON A/B/C' dans les variantes. »"}
            rows={4}
            className="w-full bg-black/40 border border-white/10 rounded px-2.5 py-2 text-[11px] text-white/80 placeholder:text-white/20 resize-y outline-none focus:border-amber-400/40 leading-relaxed"
          />
          <div className="flex items-center justify-between mt-1.5">
            <span className="text-[9px] text-white/25">⌘+Entrée pour valider · sauvé automatiquement au blur</span>
            {isDirty && <span className="text-[9px] text-amber-400/60">non sauvé</span>}
            {value && (
              <button
                onClick={() => { setDraft(''); onChange('') }}
                className="text-[9px] text-red-400/60 hover:text-red-400 ml-2"
              >Effacer</button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function VendorPromptSection({ value, vendorDomain, onChange }: { value: string; vendorDomain: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(!!value)
  const [draft, setDraft] = useState(value)
  const isDirty = draft.trim() !== (value ?? '')
  const commit = () => { onChange(draft.trim()); }
  return (
    <div className="border border-white/10 rounded-lg overflow-hidden">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-2 px-3 py-2 bg-black/30 hover:bg-black/40 transition-colors text-left"
      >
        <MessageSquare className={`w-3.5 h-3.5 shrink-0 ${value ? 'text-sky-400/70' : 'text-white/30'}`} />
        <span className="text-[11px] font-semibold text-white/70 uppercase tracking-wider flex-1">
          Prompt fournisseur — propagé à tous les templates de <code className="text-white/50 normal-case">{vendorDomain || '(aucun domaine)'}</code>
        </span>
        {value && <span className="text-[9px] text-sky-400/50 mr-1">actif</span>}
        <ChevronDown className={`w-3 h-3 text-white/30 transition-transform ${open ? '' : '-rotate-90'}`} />
      </button>
      {open && (
        <div className="px-3 py-2.5 bg-black/20 border-t border-white/[0.06]">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); commit() } }}
            placeholder={"Prompt appliqué à TOUS les templates de ce fournisseur (partagé).\nExemples :\n• « Les prix sont TTC chez ce fournisseur, ne pas convertir. »\n• « Les images produit sont dans /media/catalog/, ignorer les autres. »\n• « La marque est toujours la même : écrire 'Milwaukee'. »"}
            rows={4}
            className="w-full bg-black/40 border border-white/10 rounded px-2.5 py-2 text-[11px] text-white/80 placeholder:text-white/20 resize-y outline-none focus:border-sky-400/40 leading-relaxed"
          />
          <div className="flex items-center justify-between mt-1.5">
            <span className="text-[9px] text-white/25">Propagé aux autres templates au save · ⌘+Entrée pour valider</span>
            {isDirty && <span className="text-[9px] text-sky-400/60">non sauvé</span>}
            {value && (
              <button
                onClick={() => { setDraft(''); onChange('') }}
                className="text-[9px] text-red-400/60 hover:text-red-400 ml-2"
              >Effacer</button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
