import { useEffect, useRef, useState, useCallback } from 'react'
import { MousePointer, Loader2, Eye, X, Plus, GripVertical, MessageSquare, Chrome } from 'lucide-react'
import { useChromeExtension } from './useChromeExtension'
import {
  DndContext, closestCenter, PointerSensor,
  useSensor, useSensors, type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext, verticalListSortingStrategy,
  useSortable, arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { ScrapingTemplate, FieldSelector } from './types'
import { STANDARD_FIELDS } from './types'
import { fetchSourceHtml } from './fetchSourceHtml'
import { OVERLAY_SCRIPT } from './overlayScript'
import { toast } from 'sonner'

interface Props {
  template: ScrapingTemplate
  onChange: (t: ScrapingTemplate) => void
}

interface CaptureMessage {
  type: 'pim-capture'
  selectors: string[]
  attr: string | null
  tag: string
  text: string
}

/**
 * Builder visuel : charge la page source dans un iframe `srcdoc` (contourne
 * X-Frame-Options) + injecte un overlay de capture. Quand l'utilisateur
 * clique un élément, on reçoit postMessage avec le sélecteur et on lui
 * demande à quel champ l'assigner.
 */
export function VisualTemplateBuilder({ template, onChange }: Props) {
  const iframeRef = useRef<HTMLIFrameElement>(null)
  // Pré-remplir avec la dernière URL testée du template (chargée depuis Firestore).
  const [sourceUrl, setSourceUrl] = useState(template.lastTestUrl ?? '')
  const [rewrittenHtml, setRewrittenHtml] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [captureMode, setCaptureMode] = useState<'off' | 'single' | 'multiple'>('off')
  const [pendingCapture, setPendingCapture] = useState<CaptureMessage | null>(null)
  // Index du champ dont le selector est actuellement prévisualisé (surbrillance
  // persistante dans l'iframe). null = rien de sélectionné.
  const [selectedFieldIdx, setSelectedFieldIdx] = useState<number | null>(null)
  const [showAllTags, setShowAllTags] = useState(true)

  const ext = useChromeExtension()

  // Quand on change de template dans la liste, re-synchroniser l'URL source
  // et vider l'iframe pour forcer un rechargement avec la bonne page.
  // Auto-charge l'iframe si le template a une lastTestUrl persistée.
  useEffect(() => {
    const url = template.lastTestUrl ?? ''
    setSourceUrl(url)
    setRewrittenHtml(null)
    setCaptureMode('off')
    setPendingCapture(null)
    setSelectedFieldIdx(null)
    if (url) {
      // Auto-load : fetch + injection en tâche de fond dès l'ouverture du template.
      ;(async () => {
        setLoading(true)
        try {
          const html = await fetchSourceHtml(url)
          if (html) setRewrittenHtml(rewriteHtmlForIframe(html, url))
        } catch { /* silencieux — l'utilisateur peut cliquer Charger manuellement */ }
        finally { setLoading(false) }
      })()
    }
     
  }, [template.id])

  const sendToIframe = (message: unknown) => {
    iframeRef.current?.contentWindow?.postMessage(message, '*')
  }

  const syncTags = useCallback(() => {
    const tags = template.fields
      .map((f) => ({ selector: f.strategies[0]?.expression ?? '', label: f.field }))
      .filter((t) => t.selector)
    iframeRef.current?.contentWindow?.postMessage({ type: 'pim-set-persistent-tags', tags }, '*')
   
  }, [template.fields])

  // Listen for postMessage from the iframe
  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      const msg = e.data as { type?: string } | null
      if (!msg || typeof msg !== 'object') return
      if (msg.type === 'pim-ready') {
        if (showAllTags) syncTags()
      }
      if (msg.type === 'pim-capture') {
        setPendingCapture(msg as unknown as CaptureMessage)
      }
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [showAllTags, syncTags])

  // Re-envoyer les tags persistants dès que les fields changent ou que l'iframe
  // est prête (pim-ready déclenche déjà un render initial).
  useEffect(() => {
    if (!rewrittenHtml) return
    if (showAllTags) {
      syncTags()
    } else {
      sendToIframe({ type: 'pim-clear-persistent-tags' })
    }
  }, [rewrittenHtml, template.fields, showAllTags, syncTags])

  useEffect(() => {
    if (!ext.tabOpen) return
    if (showAllTags) {
      ext.syncTags(template.fields
        .map((f) => ({ selector: f.strategies[0]?.expression ?? '', label: f.field }))
        .filter((t) => t.selector))
    } else {
      ext.syncTags([])
    }
    ext.setMode(captureMode)
  }, [ext, ext.tabOpen, template.fields, showAllTags, captureMode])

  useEffect(() => {
    if (!ext.lastCapture) return
    setPendingCapture({
      type: 'pim-capture',
      selectors: ext.lastCapture.selectors,
      attr: ext.lastCapture.attr,
      tag: ext.lastCapture.tag,
      text: ext.lastCapture.text,
    })
  }, [ext.lastCapture])

  const load = async () => {
    if (!sourceUrl) { toast.error('Entre une URL'); return }
    setLoading(true)
    try {
      const html = await fetchSourceHtml(sourceUrl)
      if (!html) { toast.error('Impossible de charger la page (CORS, site SPA ?)'); return }
      // Rewriter les paths relatifs en absolus (css/js/img) et injecter le script overlay
      const rewritten = rewriteHtmlForIframe(html, sourceUrl)
      setRewrittenHtml(rewritten)
      setCaptureMode('off')
      // Persister l'URL dans le template pour auto-reload la prochaine fois.
      if (sourceUrl !== template.lastTestUrl) {
        onChange({ ...template, lastTestUrl: sourceUrl, updatedAt: Date.now() })
      }
    } finally {
      setLoading(false)
    }
  }

  const toggleMode = (mode: 'off' | 'single' | 'multiple') => {
    setCaptureMode(mode)
    sendToIframe({ type: 'pim-set-mode', mode })
    if (ext.tabOpen) ext.setMode(mode)
  }

  const toggleFieldPreview = (idx: number) => {
    if (selectedFieldIdx === idx) {
      sendToIframe({ type: 'pim-set-active-selector', selector: null })
      if (ext.tabOpen) ext.setActiveSelector(null)
      setSelectedFieldIdx(null)
      return
    }
    const sel = template.fields[idx]?.strategies[0]?.expression ?? ''
    if (!sel) return
    sendToIframe({ type: 'pim-set-active-selector', selector: sel })
    if (ext.tabOpen) ext.setActiveSelector(sel)
    setSelectedFieldIdx(idx)
  }

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }))
  const fieldIds = template.fields.map((_, i) => `f-${i}`)
  const handleDragEnd = (e: DragEndEvent) => {
    const { active, over } = e
    if (!over || active.id === over.id) return
    const oldIdx = fieldIds.indexOf(active.id as string)
    const newIdx = fieldIds.indexOf(over.id as string)
    if (oldIdx < 0 || newIdx < 0) return
    onChange({ ...template, fields: arrayMove(template.fields, oldIdx, newIdx), updatedAt: Date.now() })
    if (selectedFieldIdx === oldIdx) setSelectedFieldIdx(newIdx)
    else if (selectedFieldIdx !== null) {
      if (oldIdx < selectedFieldIdx && newIdx >= selectedFieldIdx) setSelectedFieldIdx(selectedFieldIdx - 1)
      else if (oldIdx > selectedFieldIdx && newIdx <= selectedFieldIdx) setSelectedFieldIdx(selectedFieldIdx + 1)
    }
  }

  const assignTo = (fieldName: string, multiple: boolean, selectorIdx: number) => {
    if (!pendingCapture) return
    const name = fieldName.trim()
    if (!name) return
    // Respecter le selector CHOISI dans la modale : on le place en tête, les
    // autres candidats deviennent des fallbacks. Sans ce reorder, le premier
    // selector (chemin complet) masquait le choix de l'utilisateur (ex: h2.chapo).
    const ordered = [
      pendingCapture.selectors[selectorIdx] ?? pendingCapture.selectors[0],
      ...pendingCapture.selectors.filter((_, i) => i !== selectorIdx),
    ].filter(Boolean)
    const strategies = ordered.map((expr) => ({
      kind: 'css' as const,
      expression: expr,
      attr: pendingCapture.attr ?? undefined,
    }))
    // Merger avec un champ existant ou en créer un nouveau
    const existing = template.fields.find((f) => f.field === name)
    const transform = pendingCapture.attr === 'src' || pendingCapture.attr === 'href' ? 'absolutize-url' as const : undefined
    const newField: FieldSelector = existing
      ? { ...existing, strategies, multiple: existing.multiple || multiple }
      : { field: name, strategies, multiple, transform }
    const fields = existing
      ? template.fields.map((f) => f.field === name ? newField : f)
      : [...template.fields, newField]
    onChange({ ...template, fields, updatedAt: Date.now() })
    setPendingCapture(null)
    toast.success(`Mappé à "${name}" (${multiple ? 'liste' : 'unique'})`)
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Bloc sticky : état du template + toolbar + notice.
          Empilé sous la barre d'actions de TemplateEditor (top ≈ 52px). */}
      <div className="sticky top-[52px] z-20 bg-[#1a1a1a] pt-2 pb-3 -mx-4 px-4 flex flex-col gap-3 border-b border-white/[0.04]">
      {/* État actuel du template — visible DÈS l'ouverture, avant l'iframe */}
      <div className="p-3 bg-black/40 border border-white/10 rounded-lg">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[11px] font-semibold text-white/70 uppercase tracking-wider">
            Champs capturés ({template.fields.length})
            {template.specGroups.length > 0 && ` · ${template.specGroups.length} groupe(s) de specs`}
          </span>
          {template.fields.length > 0 && (
            <button
              onClick={() => onChange({ ...template, fields: [], specGroups: [], updatedAt: Date.now() })}
              className="text-[10px] text-red-400/70 hover:text-red-400"
            >Tout effacer</button>
          )}
        </div>
        {template.fields.length === 0 ? (
          <div className="text-[11px] text-white/40 italic">
            Aucun champ — charge une URL ci-dessous, active la capture, et clique sur les éléments de la page.
          </div>
        ) : (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={fieldIds} strategy={verticalListSortingStrategy}>
              <div className="space-y-1">
                {template.fields.map((f, i) => (
                  <SortableFieldRow
                    key={fieldIds[i]}
                    id={fieldIds[i]}
                    field={f}
                    isSelected={selectedFieldIdx === i}
                    onTogglePreview={() => toggleFieldPreview(i)}
                    onRemove={() => onChange({ ...template, fields: template.fields.filter((_, j) => j !== i), updatedAt: Date.now() })}
                    onUpdatePrompt={(prompt) => {
                      const next = [...template.fields]
                      next[i] = { ...next[i], prompt }
                      onChange({ ...template, fields: next, updatedAt: Date.now() })
                    }}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        )}
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-2 p-3 bg-black/40 border border-white/10 rounded-lg">
        <input
          className="flex-1 px-3 py-2 bg-black/40 border border-white/10 rounded text-white/90 text-sm"
          placeholder="https://fr.milwaukeetool.eu/..."
          value={sourceUrl}
          onChange={(e) => setSourceUrl(e.target.value)}
        />
        {ext.isAvailable && (
          <button
            onClick={() => {
              if (!sourceUrl) { toast.error('Entre une URL'); return }
              ext.openAndCapture(sourceUrl, template.fields
                .map((f) => ({ selector: f.strategies[0]?.expression ?? '', label: f.field }))
                .filter((t) => t.selector))
              if (sourceUrl !== template.lastTestUrl) {
                onChange({ ...template, lastTestUrl: sourceUrl, updatedAt: Date.now() })
              }
              setCaptureMode('single')
            }}
            className="px-3 py-2 rounded bg-emerald-500/20 text-emerald-200 hover:bg-emerald-500/30 border border-emerald-400/40 text-xs inline-flex items-center gap-2"
            title="Ouvrir l'URL dans un onglet Chrome et activer la capture"
          >
            <Chrome className="w-3.5 h-3.5" />
            Ouvrir dans Chrome & tagger
          </button>
        )}
        <button
          onClick={load}
          disabled={loading}
          className="px-3 py-2 rounded bg-indigo-500/20 text-indigo-200 hover:bg-indigo-500/30 border border-indigo-400/30 text-xs inline-flex items-center gap-2"
        >
          {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Eye className="w-3.5 h-3.5" />}
          Charger
        </button>
        {rewrittenHtml && (
          <>
            <div className="h-6 w-px bg-white/10" />
            <button
              onClick={() => toggleMode(captureMode === 'off' ? 'single' : 'off')}
              className={`px-3 py-2 rounded text-xs inline-flex items-center gap-2 border ${
                captureMode !== 'off'
                  ? 'bg-emerald-500/20 text-emerald-200 border-emerald-400/40'
                  : 'bg-white/5 text-white/60 border-white/10 hover:bg-white/10'
              }`}
            >
              <MousePointer className="w-3.5 h-3.5" />
              {captureMode === 'off' ? 'Activer capture (double-clic)' : 'Arrêter capture'}
            </button>
            <div className="h-6 w-px bg-white/10" />
            <button
              onClick={() => setShowAllTags((s) => !s)}
              title={showAllTags ? 'Masquer les surbrillances' : 'Afficher les surbrillances'}
              className={`px-3 py-2 rounded text-xs inline-flex items-center gap-2 border ${
                showAllTags
                  ? 'bg-white/5 text-white/80 border-white/10 hover:bg-white/10'
                  : 'bg-white/[0.02] text-white/40 border-white/5 hover:bg-white/5'
              }`}
            >
              <Eye className="w-3.5 h-3.5" />
              {showAllTags ? 'Masquer tags' : 'Afficher tags'}
            </button>
          </>
        )}
      </div>

      {ext.tabOpen && (
        <div className="px-3 py-2 bg-emerald-500/[0.08] border border-emerald-400/20 rounded text-[10px] text-emerald-200/80 flex items-center justify-between">
          <span>
            <b>Onglet Chrome actif</b> — double-clique sur la page source pour capturer. Les surbrillances suivent tes fields.
          </span>
          <button
            onClick={() => ext.closeCaptureTab()}
            className="text-emerald-200/70 hover:text-emerald-200 underline"
          >
            Fermer l'onglet
          </button>
        </div>
      )}

      {/* Limitations notice */}
      {rewrittenHtml && (
        <div className="px-3 py-2 bg-amber-500/[0.08] border border-amber-400/20 rounded text-[10px] text-amber-200/80">
          <b>Rendu dégradé attendu</b> — les polices custom et icônes webfont ne chargent pas
          (CORS sur <code className="text-amber-100">@font-face</code>). <b>Double-clic</b> pour capturer un élément,
          <b> simple-clic</b> pour naviguer (accordéons, onglets).
        </div>
      )}
      </div>

      {/* Iframe */}
      <div className="relative bg-black/40 border border-white/10 rounded-lg overflow-hidden" style={{ minHeight: 500 }}>
        {rewrittenHtml ? (
          <iframe
            ref={iframeRef}
            sandbox="allow-same-origin allow-scripts allow-forms"
            srcDoc={rewrittenHtml}
            title="Source preview"
            className="w-full border-0"
            style={{ height: '70vh', background: '#fff' }}
          />
        ) : (
          <div className="h-[500px] flex items-center justify-center text-white/40 text-sm">
            Saisis une URL et clique sur Charger pour afficher la page source
          </div>
        )}
      </div>

      {/* Modal de mappage après un clic */}
      {pendingCapture && (
        <AssignmentModal
          capture={pendingCapture}
          onAssign={assignTo}
          onPreview={(sel) => sendToIframe({ type: 'pim-set-active-selector', selector: sel })}
          onClose={() => setPendingCapture(null)}
        />
      )}

    </div>
  )
}

function SortableFieldRow({
  id, field, isSelected, onTogglePreview, onRemove, onUpdatePrompt,
}: {
  id: string
  field: FieldSelector
  isSelected: boolean
  onTogglePreview: () => void
  onRemove: () => void
  onUpdatePrompt: (prompt: string | undefined) => void
}) {
  const [promptOpen, setPromptOpen] = useState(false)
  const [draft, setDraft] = useState(field.prompt ?? '')
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id })
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }
  const hasPrompt = !!field.prompt
  const togglePrompt = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    setPromptOpen((o) => !o)
    if (!promptOpen) setTimeout(() => textareaRef.current?.focus(), 50)
  }, [promptOpen])
  const commitPrompt = useCallback(() => {
    const trimmed = draft.trim()
    onUpdatePrompt(trimmed || undefined)
  }, [draft, onUpdatePrompt])
  return (
    <div ref={setNodeRef} style={style} className="flex flex-col">
      <div
        onClick={onTogglePreview}
        title={isSelected ? 'Clique pour désélectionner' : 'Clique pour surligner le bloc dans la page'}
        className={`group flex items-center gap-2 p-1.5 border rounded text-[11px] cursor-pointer transition-colors ${
          isSelected
            ? 'bg-emerald-500/15 border-emerald-400/50'
            : 'bg-white/[0.03] hover:bg-emerald-500/[0.08] hover:border-emerald-400/30 border-transparent'
        } ${promptOpen ? 'rounded-b-none' : ''}`}
      >
        <button
          {...attributes}
          {...listeners}
          onClick={(e) => e.stopPropagation()}
          className="text-white/20 hover:text-white/50 cursor-grab active:cursor-grabbing shrink-0"
          aria-label="Déplacer"
        >
          <GripVertical className="w-3 h-3" />
        </button>
        <div className="flex-1 min-w-0">
          <span className={isSelected ? 'text-emerald-300 font-semibold' : 'text-indigo-300 font-semibold'}>{field.field}</span>
          {field.multiple && <span className="ml-1 px-1 py-0.5 text-[9px] bg-white/10 rounded">liste</span>}
          <code className={`ml-2 font-mono truncate ${isSelected ? 'text-emerald-200/90' : 'text-white/50 group-hover:text-emerald-300/80'}`}>{field.strategies[0]?.expression}</code>
          {field.strategies[0]?.attr && <span className="ml-1 text-white/40">[{field.strategies[0].attr}]</span>}
        </div>
        <button
          onClick={togglePrompt}
          className={`shrink-0 transition-colors ${hasPrompt ? 'text-amber-400/70 hover:text-amber-300' : 'text-white/20 hover:text-white/50'}`}
          title={hasPrompt ? 'Instructions de scraping (modifier)' : 'Ajouter des instructions de scraping'}
        >
          <MessageSquare className="w-3 h-3" />
        </button>
        <Eye className={`w-3 h-3 shrink-0 ${isSelected ? 'text-emerald-300' : 'text-white/25 group-hover:text-emerald-300'}`} />
        <button
          onClick={(e) => { e.stopPropagation(); onRemove() }}
          className="text-red-400/60 hover:text-red-400 shrink-0"
          title="Supprimer ce champ"
        ><X className="w-3 h-3" /></button>
      </div>
      {promptOpen && (
        <div className="bg-black/30 border border-t-0 border-white/10 rounded-b px-2 py-2" onClick={(e) => e.stopPropagation()}>
          <textarea
            ref={textareaRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commitPrompt}
            onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); commitPrompt(); setPromptOpen(false) } }}
            placeholder="Instructions de scraping pour ce champ (ex: « Retirer le heading, ne garder que les paragraphes. », « Ignorer les prix. », « Traduire en français. »)"
            rows={2}
            className="w-full bg-black/40 border border-white/10 rounded px-2 py-1.5 text-[11px] text-white/80 placeholder:text-white/25 resize-y outline-none focus:border-amber-400/40"
          />
          <div className="flex items-center justify-between mt-1">
            <span className="text-[9px] text-white/25">⌘+Entrée pour valider</span>
            <div className="flex items-center gap-2">
              {draft.trim() !== (field.prompt ?? '') && (
                <span className="text-[9px] text-amber-400/60">non sauvé</span>
              )}
              {draft.trim() && (
                <button
                  onClick={() => { setDraft(''); onUpdatePrompt(undefined) }}
                  className="text-[9px] text-red-400/60 hover:text-red-400"
                >Effacer</button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function AssignmentModal({
  capture, onAssign, onPreview, onClose,
}: {
  capture: CaptureMessage
  onAssign: (field: string, multiple: boolean, selectorIdx: number) => void
  onPreview: (sel: string) => void
  onClose: () => void
}) {
  const [customField, setCustomField] = useState('')
  const [multiple, setMultiple] = useState(false)
  const [selectorIdx, setSelectorIdx] = useState(0)
  const submitCustom = () => {
    const name = customField.trim()
    if (!name) return
    onAssign(name, multiple, selectorIdx)
  }

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="bg-[#1a1a1a] border border-white/10 rounded-lg p-4 max-w-xl w-full">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-white/90">Élément capturé</h3>
          <button onClick={onClose} className="text-white/40 hover:text-white/80"><X className="w-4 h-4" /></button>
        </div>
        <div className="mb-3 p-2 bg-black/40 rounded text-[11px]">
          <div className="text-white/50">Tag : <span className="text-white/90 font-mono">{capture.tag}</span></div>
          {capture.text && <div className="text-white/50 mt-1">Texte : <span className="text-white/80">"{capture.text}"</span></div>}
          {capture.attr && <div className="text-white/50 mt-1">Attribut capturé : <span className="text-white/90 font-mono">{capture.attr}</span></div>}
        </div>

        <label className="text-[11px] text-white/50 block mb-1">Sélecteur (choisis le plus simple/stable) :</label>
        <div className="flex flex-col gap-1 mb-3">
          {capture.selectors.map((s, i) => (
            <button
              key={i}
              onClick={() => { setSelectorIdx(i); onPreview(s) }}
              className={`text-left px-2 py-1.5 rounded font-mono text-[11px] border transition-colors ${
                selectorIdx === i
                  ? 'bg-indigo-500/15 border-indigo-400/40 text-indigo-200'
                  : 'bg-black/40 border-white/10 text-white/70 hover:bg-white/5'
              }`}
            >
              {s}
            </button>
          ))}
        </div>

        <label className="text-[11px] text-white/50 flex items-center gap-2 mb-3">
          <input type="checkbox" checked={multiple} onChange={(e) => setMultiple(e.target.checked)} />
          Capturer plusieurs éléments (liste — pour images, specs, variantes)
        </label>

        <label className="text-[11px] text-white/50 block mb-1">Assigner à un champ :</label>
        <div className="grid grid-cols-3 gap-1.5 mb-2">
          {STANDARD_FIELDS.map((f) => (
            <button
              key={f.field}
              onClick={() => onAssign(f.field, multiple || f.multiple, selectorIdx)}
              className="px-2 py-1.5 rounded bg-indigo-500/10 text-indigo-200 hover:bg-indigo-500/20 border border-indigo-400/20 text-[11px]"
            >
              {f.label}
            </button>
          ))}
        </div>
        <div className="flex gap-1.5">
          <input
            className="flex-1 px-2 py-1.5 bg-black/40 border border-white/10 rounded text-white/90 text-[11px]"
            placeholder="Ou nom de champ personnalisé"
            value={customField}
            onChange={(e) => setCustomField(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); submitCustom() } }}
          />
          <button
            onClick={submitCustom}
            disabled={!customField.trim()}
            className="px-3 py-1.5 rounded bg-emerald-500/20 text-emerald-200 hover:bg-emerald-500/30 border border-emerald-400/30 text-[11px] disabled:opacity-50 inline-flex items-center gap-1"
          >
            <Plus className="w-3 h-3" /> Assigner
          </button>
        </div>
      </div>
    </div>
  )
}

/**
 * Prépare le HTML pour l'iframe srcdoc :
 *  1. Injecte <base href> pour résoudre les URLs relatives (css, js, img, font).
 *  2. Garde les scripts externes (nécessaires pour webfonts, icon fonts, lazy images).
 *     L'iframe est sandboxée → pas de risque pour le reste de l'app.
 *  3. Retire les redirects meta-refresh (navigation auto gênante).
 *  4. Retire les handlers de navigation (target="_top", onclick nav).
 *  5. Injecte notre script overlay de capture EN DERNIER (après que les
 *     scripts de la page aient tourné).
 */
function rewriteHtmlForIframe(html: string, baseUrl: string): string {
  let out = html
  // Injecter <base> — les CSS/JS/images/fonts chargent en absolu.
  if (!/<base\s/i.test(out)) {
    out = out.replace(/<head[^>]*>/i, (m) => `${m}\n<base href="${baseUrl}">`)
  }
  // Retirer meta-refresh (redirections automatiques).
  out = out.replace(/<meta\s+http-equiv=["']?refresh[^>]*>/gi, '')
  // Retirer les Content-Security-Policy qui bloqueraient les scripts/styles.
  out = out.replace(/<meta\s+http-equiv=["']?Content-Security-Policy["']?[^>]*>/gi, '')
  // Neutraliser target="_top" et les liens qui navigueraient hors iframe.
  out = out.replace(/target=["']_top["']/gi, 'target="_self"')
  // Désactiver les formulaires (submit → navigation).
  out = out.replace(/<form([^>]*)>/gi, (_m, attrs) => `<form${attrs} onsubmit="return false">`)
  // Retirer crossorigin="anonymous" sur les link CSS : le strict CORS bloque
  // certaines stylesheets servies sans ACAO. On charge sans CORS — les fonts
  // cross-origin ne chargeront pas (@font-face a besoin de CORS explicite),
  // mais la structure + couleurs + tailles sont correctes pour la capture.
  out = out.replace(/(<link[^>]*)\scrossorigin=["'][^"']*["']/gi, '$1')
  // Overlay capture : injecté en fin de body pour s'exécuter APRÈS les
  // scripts de la page (qui installent les webfonts, etc.).
  const injection = `<script>${OVERLAY_SCRIPT}</script>`
  if (/<\/body>/i.test(out)) {
    out = out.replace(/<\/body>/i, `${injection}</body>`)
  } else {
    out += injection
  }
  return out
}
