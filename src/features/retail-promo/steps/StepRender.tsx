import { useEffect, useMemo, useRef, useState } from 'react'
import html2canvas from 'html2canvas'
import JSZip from 'jszip'
import { httpsCallable } from 'firebase/functions'
import { Download, Package, ChevronLeft, ChevronRight, Loader2, FileCode, Save } from 'lucide-react'
import { toast } from 'sonner'
import { functions } from '@/lib/firebase/config'
import { getRowValue } from '@/features/merge/mergeEngine'
import { isDriveImageRef, extractDriveFileId, resolveDriveImageUrl } from '@/features/dam/driveAssets'
import { useRetailPromoStore } from '../retailPromo.store'
import { extractPromoFields } from '../promoMapping'
import { formatPrice } from '../priceParse'
import type { PromoFields } from '../promoTypes'
import { resolveEffect, type RuleEffect } from '@/features/merge/conditionalRules'
import { savePromo, listPromos } from '../promosApi'
import { uploadPromoImageToDam } from '../damImageUpload'
import { RetailPromoCard, type RetailCardData, type PromoBlockId } from '../RetailPromoCard'
import { PromoTemplateEditor } from '../PromoTemplateEditor'
import { PromoPropertiesPanel } from '../PromoPropertiesPanel'
import { PromoLayersPanel } from '../PromoLayersPanel'
import { PromoImagePanel } from '../PromoImagePanel'
import { buildPromoHtml } from '../buildPromoHtml'

/** Convertit une URL blob:/http en data-URI (HTML autonome) ; data: renvoyé tel quel. */
async function toDataUrl(url?: string): Promise<string | undefined> {
  if (!url || url.startsWith('data:')) return url
  try {
    const blob = await (await fetch(url)).blob()
    return await new Promise((res) => { const fr = new FileReader(); fr.onload = () => res(String(fr.result)); fr.readAsDataURL(blob) })
  } catch { return undefined }
}

const imageProxyFn = httpsCallable<{ url: string }, { data: string; mimeType: string }>(functions, 'imageProxy')
// Cache module : une URL résolue une seule fois (data-URI ou null si échec).
const imgCache = new Map<string, string | null>()

async function resolveImg(url?: string): Promise<string | undefined> {
  if (!url) return undefined
  if (url.startsWith('data:') || url.startsWith('blob:')) return url
  if (imgCache.has(url)) return imgCache.get(url) ?? undefined
  try {
    let resolved: string
    if (isDriveImageRef(url)) {
      // Asset DAM (Google Drive privé) → blob: same-origin, capturable par html2canvas.
      const fileId = extractDriveFileId(url)
      if (!fileId) throw new Error('fileId Drive introuvable')
      resolved = await resolveDriveImageUrl(fileId)
    } else {
      // URL externe http(s) → proxy serveur (contourne CORS) → data-URI.
      const { data } = await imageProxyFn({ url })
      resolved = `data:${data.mimeType};base64,${data.data}`
    }
    imgCache.set(url, resolved)
    return resolved
  } catch {
    imgCache.set(url, null)
    return undefined
  }
}

/** Formate la mécanique promo : ratio 0.28 → « -28% », 28 → « -28% », sinon texte brut. */
function fmtPromoLabel(raw: string): string | undefined {
  const t = raw.trim()
  if (!t) return undefined
  const n = Number(t.replace(',', '.'))
  if (Number.isFinite(n)) {
    if (n > 0 && n < 1) return `-${Math.round(n * 100)}%`
    if (n >= 1 && n < 100) return `-${Math.round(n)}%`
  }
  return t
}

function validText(f: PromoFields): string {
  if (f.validFrom && f.validTo) return `Offre valable du ${f.validFrom} au ${f.validTo}`
  if (f.validTo) return `Offre valable jusqu'au ${f.validTo}`
  return 'Dans la limite des stocks disponibles'
}

function toCardData(f: PromoFields): RetailCardData {
  return {
    name: f.name,
    brand: f.brand || undefined,
    ref: f.ref || undefined,
    category: f.category || undefined,
    description: f.description || undefined,
    priceNow: f.newPrice != null ? formatPrice(f.newPrice, f.currency) : '—',
    priceWas: f.oldPrice != null ? formatPrice(f.oldPrice, f.currency) : undefined,
    unitPrice: f.unitPrice || undefined,
    remiseLabel: fmtPromoLabel(f.promoLabel) || (f.remisePct != null ? `-${f.remisePct}%` : undefined),
    validite: validText(f),
    imageUrl: f.image ?? undefined,
  }
}

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 40) || 'produit'
const PREVIEW_SCALE = 0.78 // échelle d'affichage de la carte dans l'aperçu (n'affecte pas l'export)

async function capture(node: HTMLDivElement): Promise<Blob | null> {
  const canvas = await html2canvas(node, { scale: 2, useCORS: true, backgroundColor: '#ffffff', logging: false })
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b), 'image/png', 1))
}

export function StepRender() {
  const { rawColumns, rawRows, fieldMap, config, sourceRef, imgOverride, setImgOverrideAt, setConfig, setStep, selectedKey, setSelectedKey, setElementStyle } = useRetailPromoStore()
  const cards = rawRows.map((r) => toCardData(extractPromoFields(r, rawColumns, fieldMap)))

  const [index, setIndex] = useState(0)
  const [busy, setBusy] = useState<'one' | 'all' | 'html' | null>(null)
  const [resolvedImg, setResolvedImg] = useState<string | undefined>(undefined)
  const [ficheName, setFicheName] = useState('')
  const [savingFiche, setSavingFiche] = useState(false)
  const [capturing, setCapturing] = useState(false)
  const previewRef = useRef<HTMLDivElement>(null)

  // Désélectionne + aplatit les dégradés-texte avant capture (rendu PNG fidèle), puis restaure.
  const captureSafe = async (node: HTMLDivElement): Promise<Blob | null> => {
    setSelectedKey(null); setCapturing(true)
    await new Promise((r) => requestAnimationFrame(() => setTimeout(r, 60)))
    try { return await capture(node) } finally { setCapturing(false) }
  }

  const safe = cards.length ? Math.min(index, cards.length - 1) : 0

  // Résout l'image affichée (override DAM/Drive prioritaire, sinon image du dataset)
  // → data-URI/blob capturable par html2canvas.
  const srcRef = imgOverride[safe] ?? cards[safe]?.imageUrl
  useEffect(() => {
    let cancelled = false
    setResolvedImg(undefined)
    void resolveImg(srcRef).then((u) => { if (!cancelled) setResolvedImg(u) })
    return () => { cancelled = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [safe, srcRef])

  if (cards.length === 0) {
    return <p className="text-white/60 text-sm">Aucun produit. <button className="text-[#6366f1]" onClick={() => setStep('mapping')}>← Retour</button></p>
  }

  const shownImage = resolvedImg
  const currentData: RetailCardData = { ...cards[safe], imageUrl: shownImage }

  // Règles conditionnelles : effet visuel par bloc pour le produit affiché.
  const effects = useMemo(() => {
    const row = rawRows[safe]; const out: Partial<Record<PromoBlockId, RuleEffect>> = {}
    if (!row || !config.rules) return out
    for (const [id, rules] of Object.entries(config.rules)) {
      if (rules && rules.length) out[id as PromoBlockId] = resolveEffect(rules, row, rawColumns)
    }
    return out
  }, [safe, rawRows, rawColumns, config.rules])

  const saveFiche = async () => {
    const name = (ficheName.trim() || cards[safe]?.name || 'Fiche').slice(0, 80)
    setSavingFiche(true)
    try {
      // Upsert par nom : réenregistrer une fiche du même nom l'écrase (pas de doublon).
      const existing = (await listPromos()).find((p) => p.name === name)
      await savePromo({ name, sourceRef, fieldMap, config, columns: rawColumns, rows: rawRows, imgOverride }, existing?.id)
      setFicheName(name)
      toast.success(existing ? `Fiche « ${name} » mise à jour` : `Fiche « ${name} » enregistrée`)
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Échec de l\'enregistrement') } finally { setSavingFiche(false) }
  }

  const downloadOne = async () => {
    if (!previewRef.current) return
    setBusy('one')
    try {
      const blob = await captureSafe(previewRef.current)
      if (!blob) throw new Error('Capture vide')
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url; a.download = `promo_${slug(cards[safe].name)}.png`
      document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url)
      toast.success('Visuel téléchargé')
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Échec export') } finally { setBusy(null) }
  }

  const downloadAll = async () => {
    if (!previewRef.current) return
    setBusy('all')
    setSelectedKey(null); setCapturing(true)
    try {
      const zip = new JSZip()
      const node = previewRef.current
      for (let i = 0; i < cards.length; i++) {
        setIndex(i)
        const img = await resolveImg(imgOverride[i] ?? cards[i].imageUrl)
        setResolvedImg(img)
        await new Promise((r) => requestAnimationFrame(() => setTimeout(r, 140)))
        const blob = await capture(node)
        if (blob) zip.file(`promo_${String(i + 1).padStart(3, '0')}_${slug(cards[i].name)}.png`, blob)
      }
      const out = await zip.generateAsync({ type: 'blob' })
      const url = URL.createObjectURL(out)
      const a = document.createElement('a')
      a.href = url; a.download = `promos_retail_${cards.length}.zip`
      document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url)
      toast.success(`${cards.length} visuels exportés`)
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Échec export') } finally { setBusy(null); setCapturing(false) }
  }

  const downloadHtml = async () => {
    setBusy('html')
    try {
      const dataUrl = await toDataUrl(shownImage ?? (await resolveImg(cards[safe].imageUrl)))
      const allFields = rawColumns.map((c) => ({
        label: c.label || c.key,
        value: String(getRowValue(rawRows[safe], c.key, rawColumns) ?? ''),
      }))
      const html = buildPromoHtml({ ...cards[safe], imageUrl: dataUrl }, config, allFields, effects)
      const blob = new Blob([html], { type: 'text/html;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url; a.download = `promo_${slug(cards[safe].name)}.html`
      document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url)
      toast.success('HTML téléchargé (éditable)')
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Échec export HTML') } finally { setBusy(null) }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-white">Aperçu & export</h2>
        <button onClick={() => setStep('mapping')} className="text-sm text-white/50 hover:text-white">← Mappage</button>
      </div>

      {/* Panneau d'édition du template (IA / champs / modèles) */}
      <PromoTemplateEditor />

      {/* Enregistrer la fiche (réutilisable depuis « Mes promos ») */}
      <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-surface px-4 py-2.5">
        <span className="text-xs font-semibold uppercase tracking-wide text-white/40">Fiche</span>
        <input value={ficheName} onChange={(e) => setFicheName(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') void saveFiche() }}
          placeholder={`Nom de la fiche… (déf. ${cards[safe]?.name?.slice(0, 24) || 'produit'})`}
          className="w-64 rounded-lg border border-white/10 bg-well px-2.5 py-1.5 text-sm text-white outline-none placeholder:text-white/30 focus:border-[#6366f1]" />
        <button onClick={() => void saveFiche()} disabled={savingFiche}
          className="flex items-center gap-2 rounded-lg bg-[#6366f1] px-3 py-1.5 text-sm font-medium text-[#fff] hover:bg-[#5457e5] disabled:opacity-40">
          {savingFiche ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Enregistrer la fiche
        </button>
        <span className="text-xs text-white/30">{cards.length} produit{cards.length > 1 ? 's' : ''}</span>
      </div>

      {/* Calques + Images (gauche) · Aperçu (centre) · Propriétés (droite) */}
      <div className="flex items-start gap-4">
        <div className="flex shrink-0 flex-col gap-4">
          <PromoLayersPanel />
          <PromoImagePanel currentImage={shownImage} onReplace={(url) => {
            // Upload vers le DAM (Drive) → on ne stocke qu'une réf légère dans la fiche.
            const p = uploadPromoImageToDam(url, cards[safe]?.name || 'image').then((ref) => setImgOverrideAt(safe, ref))
            toast.promise(p, { loading: 'Enregistrement de l\'image dans le DAM…', success: 'Image enregistrée (DAM)', error: (e) => (e instanceof Error ? e.message : 'Échec upload DAM') })
          }} />
        </div>

        <div className="flex min-w-0 flex-1 flex-col gap-4">
          <div className="flex items-center justify-center gap-3 text-xs text-white/40">
            <span>Cliquez un texte pour le styler · glissez les blocs pour les repositionner</span>
            {Object.keys(config.offsets).length > 0 && (
              <button onClick={() => setConfig({ offsets: {} })} className="text-[#6366f1] hover:underline">Réinitialiser les positions</button>
            )}
          </div>
          <div className="flex justify-center bg-well rounded-xl p-4 overflow-auto" style={{ maxHeight: 'calc(100vh - 360px)' }}>
            <div style={{ transform: `scale(${PREVIEW_SCALE})`, transformOrigin: 'top center', height: 842 * PREVIEW_SCALE, width: 595 * PREVIEW_SCALE }}>
              <RetailPromoCard ref={previewRef} data={currentData} config={config} editable effects={effects}
                selectedKey={capturing ? null : selectedKey} onSelect={setSelectedKey} capturing={capturing}
                onMoveBlock={(id, dx, dy) => setConfig({ offsets: { ...config.offsets, [id]: { dx, dy } } })}
                onResizeText={(key, patch) => setElementStyle(key, patch)}
                onScaleBlock={(id, sx, sy, dx, dy) => setConfig({ scales: { ...config.scales, [id]: { sx, sy } }, offsets: { ...config.offsets, [id]: { dx, dy } } })} />
            </div>
          </div>

          {/* Navigation produit */}
          {cards.length > 1 && (
            <div className="flex items-center justify-center gap-4 text-white/70 text-sm">
              <button onClick={() => setIndex((i) => Math.max(0, i - 1))} disabled={safe === 0} className="p-1.5 rounded hover:bg-white/10 disabled:opacity-30"><ChevronLeft className="w-4 h-4" /></button>
              <span>{safe + 1} / {cards.length}</span>
              <button onClick={() => setIndex((i) => Math.min(cards.length - 1, i + 1))} disabled={safe === cards.length - 1} className="p-1.5 rounded hover:bg-white/10 disabled:opacity-30"><ChevronRight className="w-4 h-4" /></button>
            </div>
          )}
        </div>

        <PromoPropertiesPanel />
      </div>

      {/* Actions */}
      <div className="flex gap-2">
        <button onClick={() => void downloadOne()} disabled={!!busy}
          className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-white/[0.06] hover:bg-white/10 border border-white/10 text-white text-sm font-medium disabled:opacity-40">
          {busy === 'one' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />} PNG
        </button>
        <button onClick={() => void downloadHtml()} disabled={!!busy}
          className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-white/[0.06] hover:bg-white/10 border border-white/10 text-white text-sm font-medium disabled:opacity-40">
          {busy === 'html' ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileCode className="w-4 h-4" />} HTML éditable
        </button>
        {cards.length > 1 && (
          <button onClick={() => void downloadAll()} disabled={!!busy}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-[#6366f1] hover:bg-[#5457e5] text-[#fff] text-sm font-medium disabled:opacity-40">
            {busy === 'all' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Package className="w-4 h-4" />} Tout exporter ({cards.length} PNG)
          </button>
        )}
      </div>
    </div>
  )
}
