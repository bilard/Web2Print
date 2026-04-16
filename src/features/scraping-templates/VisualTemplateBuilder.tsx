import { useEffect, useRef, useState } from 'react'
import { MousePointer, Loader2, Eye, X, Plus } from 'lucide-react'
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

  // Quand on change de template dans la liste, re-synchroniser l'URL source
  // et vider l'iframe pour forcer un rechargement avec la bonne page.
  // Auto-charge l'iframe si le template a une lastTestUrl persistée.
  useEffect(() => {
    const url = template.lastTestUrl ?? ''
    setSourceUrl(url)
    setRewrittenHtml(null)
    setCaptureMode('off')
    setPendingCapture(null)
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [template.id])

  // Listen for postMessage from the iframe
  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      const msg = e.data as { type?: string } | null
      if (!msg || typeof msg !== 'object') return
      if (msg.type === 'pim-ready') {
        // iframe prête → on peut activer le mode
      }
      if (msg.type === 'pim-capture') {
        setPendingCapture(msg as unknown as CaptureMessage)
      }
      if (msg.type === 'pim-preview-result') {
        const result = msg as { type: string; count: number; error?: string }
        if (result.error) toast.error(`Selector invalide : ${result.error}`)
        else toast.info(`Selector matche ${result.count} élément(s)`)
      }
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [])

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

  const sendToIframe = (message: unknown) => {
    iframeRef.current?.contentWindow?.postMessage(message, '*')
  }

  const toggleMode = (mode: 'off' | 'single' | 'multiple') => {
    setCaptureMode(mode)
    sendToIframe({ type: 'pim-set-mode', mode })
  }

  const previewSelector = (selector: string) => {
    sendToIframe({ type: 'pim-preview-selector', selector })
  }

  const assignTo = (fieldName: string, multiple: boolean) => {
    if (!pendingCapture) return
    // Pour les images/docs : utiliser la stratégie attr si pertinent
    const strategies = pendingCapture.selectors.map((expr, i) => {
      if (i === 0 && pendingCapture.attr) {
        return { kind: 'css' as const, expression: expr, attr: pendingCapture.attr }
      }
      return { kind: 'css' as const, expression: expr, attr: pendingCapture.attr ?? undefined }
    })
    // Merger avec un champ existant ou en créer un nouveau
    const existing = template.fields.find((f) => f.field === fieldName)
    const transform = pendingCapture.attr === 'src' || pendingCapture.attr === 'href' ? 'absolutize-url' as const : undefined
    const newField: FieldSelector = existing
      ? { ...existing, strategies, multiple: existing.multiple || multiple }
      : { field: fieldName, strategies, multiple, transform }
    const fields = existing
      ? template.fields.map((f) => f.field === fieldName ? newField : f)
      : [...template.fields, newField]
    onChange({ ...template, fields, updatedAt: Date.now() })
    setPendingCapture(null)
    toast.success(`Mappé à "${fieldName}" (${multiple ? 'liste' : 'unique'})`)
  }

  return (
    <div className="flex flex-col gap-3">
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
          <div className="space-y-1">
            {template.fields.map((f, i) => (
              <div key={i} className="flex items-center justify-between gap-2 p-1.5 bg-white/[0.03] rounded text-[11px]">
                <div className="flex-1 min-w-0">
                  <span className="text-indigo-300 font-semibold">{f.field}</span>
                  {f.multiple && <span className="ml-1 px-1 py-0.5 text-[9px] bg-white/10 rounded">liste</span>}
                  <code className="ml-2 text-white/50 font-mono truncate">{f.strategies[0]?.expression}</code>
                  {f.strategies[0]?.attr && <span className="ml-1 text-white/40">[{f.strategies[0].attr}]</span>}
                </div>
                <button
                  onClick={() => previewSelector(f.strategies[0]?.expression ?? '')}
                  className="text-emerald-400 hover:text-emerald-300"
                  title="Prévisualiser dans la page (iframe doit être chargée)"
                ><Eye className="w-3 h-3" /></button>
                <button
                  onClick={() => onChange({ ...template, fields: template.fields.filter((_, j) => j !== i), updatedAt: Date.now() })}
                  className="text-red-400/60 hover:text-red-400"
                ><X className="w-3 h-3" /></button>
              </div>
            ))}
          </div>
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
              {captureMode === 'off' ? 'Activer capture' : 'Arrêter capture'}
            </button>
          </>
        )}
      </div>

      {/* Limitations notice */}
      {rewrittenHtml && (
        <div className="px-3 py-2 bg-amber-500/[0.08] border border-amber-400/20 rounded text-[10px] text-amber-200/80">
          <b>Rendu dégradé attendu</b> — les polices custom et icônes webfont ne chargent pas
          (CORS sur <code className="text-amber-100">@font-face</code>). La structure HTML est correcte pour le pointer-and-click.
          Pour un rendu 100% fidèle, utilise l'extension Chrome (Phase 2).
        </div>
      )}

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
          onPreview={previewSelector}
          onClose={() => setPendingCapture(null)}
        />
      )}

    </div>
  )
}

function AssignmentModal({
  capture, onAssign, onPreview, onClose,
}: {
  capture: CaptureMessage
  onAssign: (field: string, multiple: boolean) => void
  onPreview: (sel: string) => void
  onClose: () => void
}) {
  const [customField, setCustomField] = useState('')
  const [multiple, setMultiple] = useState(false)
  const [selectorIdx, setSelectorIdx] = useState(0)

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
              onClick={() => onAssign(f.field, multiple || f.multiple)}
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
          />
          <button
            onClick={() => customField && onAssign(customField, multiple)}
            disabled={!customField}
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
