import { useEffect, useMemo, useRef, useState } from 'react'
import html2canvas from 'html2canvas'
import JSZip from 'jszip'
import { httpsCallable } from 'firebase/functions'
import { Download, Package, ChevronLeft, ChevronRight, ChevronDown, Loader2, FileCode, Save, Sparkles, RefreshCw } from 'lucide-react'
import { updateSourceCell } from '@/features/merge/updateSourceCell'
import { isPimSource, loadPimMergeData, pimProjectIdFromSource } from '@/features/merge/pimSource'
import { loadExcelMergeData } from '@/features/merge/excelSource'
import { toast } from 'sonner'
import { functions } from '@/lib/firebase/config'
import { getRowValue } from '@/features/merge/mergeEngine'
import { imageChainCandidates, isDriveImageRef, extractDriveFileId, resolveDriveImageUrl } from '@/features/dam/driveAssets'
import { useRetailPromoStore } from '../retailPromo.store'
import { extractPromoFields } from '../promoMapping'
import { toCardData } from '../promoCardData'
import { resolveEffect, type RuleEffect } from '@/features/merge/conditionalRules'
import { RULE_SYNTHETIC_COLUMNS, augmentRowForRules } from '../promoRuleFields'
import { savePromo, listPromos } from '../promosApi'
import { uploadPromoImageToDam } from '../damImageUpload'
import { RetailPromoCard } from '../RetailPromoCard'
import { type RetailCardData, type PromoBlockId } from '../promoCardTypes'
import { PromoTemplateEditor } from '../PromoTemplateEditor'
import { PromoPropertiesPanel } from '../PromoPropertiesPanel'
import { PromoLayersPanel } from '../PromoLayersPanel'
import { PromoImagePanel } from '../PromoImagePanel'
import { buildPromoHtml } from '../buildPromoHtml'
import { t } from '@/lib/i18n'

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
// ⚠ AUCUN CACHE : un visuel régénéré garde la même URL — le cache servait
// l'ancienne image. Seuls les ÉCHECS sont mémorisés (pas de martèlement).
const failedOnce = new Set<string>()

/** Essaie chaque candidat de la chaîne (« détourée | originale ») — repli naturel. */
async function resolveImg(value?: string): Promise<string | undefined> {
  if (!value) return undefined
  for (const candidate of imageChainCandidates(value)) {
    const resolved = await resolveOneImg(candidate)
    if (resolved) return resolved
  }
  return undefined
}

async function resolveOneImg(url: string): Promise<string | undefined> {
  if (url.startsWith('data:') || url.startsWith('blob:')) return url
  if (failedOnce.has(url)) return undefined
  try {
    let resolved: string
    if (isDriveImageRef(url)) {
      // Asset DAM (Google Drive privé) → blob: same-origin, capturable par html2canvas.
      const fileId = extractDriveFileId(url)
      if (!fileId) throw new Error(t('err.notFound.driveFileId'))
      resolved = await resolveDriveImageUrl(fileId)
    } else {
      // URL externe http(s) → proxy serveur (contourne CORS) → data-URI.
      const { data } = await imageProxyFn({ url })
      resolved = `data:${data.mimeType};base64,${data.data}`
    }
    return resolved
  } catch {
    failedOnce.add(url)
    return undefined
  }
}

const slug =(s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 40) || 'produit'
const PREVIEW_SCALE = 0.95 // échelle d'affichage de la carte dans l'aperçu (n'affecte pas l'export)

async function capture(node: HTMLDivElement): Promise<Blob | null> {
  const canvas = await html2canvas(node, { scale: 2, useCORS: true, backgroundColor: '#ffffff', logging: false })
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b), 'image/png', 1))
}

// Vignette JPEG réduite (data-URL léger) pour la liste « Mes promos ».
async function captureThumb(node: HTMLDivElement): Promise<string | undefined> {
  try {
    const canvas = await html2canvas(node, { scale: 0.34, useCORS: true, backgroundColor: '#ffffff', logging: false })
    return canvas.toDataURL('image/jpeg', 0.72)
  } catch { return undefined }
}

export function StepRender() {
  const { rawColumns, rawRows, fieldMap, customFields, config, sourceRef, setSource, currentIndex, setCurrentIndex, imgOverride, setImgOverrideAt, textOverride, setTextOverrideAt, setConfig, setStep, selectedKey, setSelectedKey, setElementStyle } = useRetailPromoStore()
  const euroSep = { now: config.styles?.priceNow?.euroSep, was: config.styles?.priceWas?.euroSep }
  const cards = rawRows.map((r) => toCardData(extractPromoFields(r, rawColumns, fieldMap, customFields), euroSep, customFields))

  const index = currentIndex, setIndex = setCurrentIndex
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
  const hasRealSource = !!sourceRef && !sourceRef.excelDocId?.startsWith('saved_')

  /** Propage l'image de la fiche (override DAM) vers la CELLULE de la source → tous les canaux. */
  const applyImageToSource = async () => {
    const ref = imgOverride[safe]
    const imgCol = fieldMap.image
    const row = rawRows[safe]
    if (!ref || !imgCol || !row || !sourceRef) return
    await updateSourceCell(sourceRef, row._id, imgCol, ref)
    // Reflète immédiatement dans la copie locale (et l'instantané de la fiche).
    setSource(sourceRef, rawColumns, rawRows.map((r, i) => (i === safe ? { ...r, [imgCol]: ref } : r)))
  }

  /** Recharge textes/prix/images depuis la source partagée (PIM ou dataset). */
  const refreshFromSource = async () => {
    if (!sourceRef || !hasRealSource) return
    const { columns, rows } = isPimSource(sourceRef)
      ? await loadPimMergeData(pimProjectIdFromSource(sourceRef))
      : await loadExcelMergeData(sourceRef.excelDocId, sourceRef.sheetIndex)
    setSource(sourceRef, columns, rows)
  }

  // Résout l'image affichée (override DAM/Drive prioritaire, sinon image du dataset)
  // → data-URI/blob capturable par html2canvas.
  const srcRef = imgOverride[safe] ?? cards[safe]?.imageUrl
  useEffect(() => {
    let cancelled = false
    setResolvedImg(undefined)
    void resolveImg(srcRef)
      // Override (ex. fichier Drive supprimé) irrésoluble → image d'origine du produit.
      .then((u) => u ?? (imgOverride[safe] ? resolveImg(cards[safe]?.imageUrl) : undefined))
      .then((u) => { if (!cancelled) setResolvedImg(u) })
    return () => { cancelled = true }
  }, [safe, srcRef])

  if (cards.length === 0) {
    return <p className="text-white/60 text-sm">{t('rp.aucunProduit')} <button className="text-[#6366f1]" onClick={() => setStep('mapping')}>{t('rp.retour2')}</button></p>
  }

  const shownImage = resolvedImg
  const tov = textOverride[safe] ?? {}
  const currentData: RetailCardData = {
    ...cards[safe], imageUrl: shownImage,
    name: tov.name ?? cards[safe].name,
    category: tov.category ?? cards[safe].category,
    description: tov.description ?? cards[safe].description,
    validite: tov.footer ?? cards[safe].validite,
    priceLabel: tov.priceLabel ?? cards[safe].priceLabel,
    // Marque éditée = remplace le « marque · réf » calculé (réf masquée).
    ...(tov.brand ? { brand: tov.brand, ref: undefined } : null),
  }

  // Règles conditionnelles : effet visuel par bloc pour le produit affiché.
  // Évalue sur une ligne ENRICHIE (remise/prix calculés) + colonnes synthétiques.
  const effects = useMemo(() => {
    const row = rawRows[safe]; const out: Partial<Record<PromoBlockId, RuleEffect>> = {}
    if (!row || !config.rules) return out
    const augRow = augmentRowForRules(row, rawColumns, fieldMap)
    const augCols = [...RULE_SYNTHETIC_COLUMNS, ...rawColumns]
    for (const [id, rules] of Object.entries(config.rules)) {
      if (rules && rules.length) out[id as PromoBlockId] = resolveEffect(rules, augRow, augCols)
    }
    return out
  }, [safe, rawRows, rawColumns, fieldMap, config.rules])

  const saveFiche = async () => {
    const name = (ficheName.trim() || cards[safe]?.name || 'Fiche').slice(0, 80)
    setSavingFiche(true)
    try {
      // Vignette du visuel courant (sélection masquée via capturing).
      let thumbnail: string | undefined
      if (previewRef.current) {
        setSelectedKey(null); setCapturing(true)
        await new Promise((r) => requestAnimationFrame(() => setTimeout(r, 60)))
        thumbnail = await captureThumb(previewRef.current)
        setCapturing(false)
      }
      // Upsert par nom : réenregistrer une fiche du même nom l'écrase (pas de doublon).
      const existing = (await listPromos()).find((p) => p.name === name)
      await savePromo({ name, sourceRef, fieldMap, customFields, config, columns: rawColumns, rows: rawRows, imgOverride, textOverride, thumbnail }, existing?.id)
      setFicheName(name)
      toast.success(t(existing ? 'tst.rp.ficheUpdated' : 'tst.rp.ficheSaved', { name }))
    } catch (e) { toast.error(e instanceof Error ? e.message : t('tst.saveError')) } finally { setSavingFiche(false) }
  }

  const downloadOne = async () => {
    if (!previewRef.current) return
    setBusy('one')
    try {
      const blob = await captureSafe(previewRef.current)
      if (!blob) throw new Error(t('err.rp.emptyCapture'))
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url; a.download = `promo_${slug(cards[safe].name)}.png`
      document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url)
      toast.success(t('tst.rp.visualDownloaded'))
    } catch (e) { toast.error(e instanceof Error ? e.message : t('tst.rp.exportFailed')) } finally { setBusy(null) }
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
      toast.success(t('tst.rp.visualsExported', { count: cards.length }))
    } catch (e) { toast.error(e instanceof Error ? e.message : t('tst.rp.exportFailed')) } finally { setBusy(null); setCapturing(false) }
  }

  const downloadHtml = async () => {
    setBusy('html')
    try {
      const dataUrl = await toDataUrl(shownImage ?? (await resolveImg(cards[safe].imageUrl)))
      const allFields = rawColumns.map((c) => ({
        label: c.label || c.key,
        value: String(getRowValue(rawRows[safe], c.key, rawColumns) ?? ''),
      }))
      const html = buildPromoHtml({ ...currentData, imageUrl: dataUrl }, config, allFields, effects)
      const blob = new Blob([html], { type: 'text/html;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url; a.download = `promo_${slug(cards[safe].name)}.html`
      document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url)
      toast.success(t('tst.rp.htmlDownloaded'))
    } catch (e) { toast.error(e instanceof Error ? e.message : t('tst.rp.htmlExportFailed')) } finally { setBusy(null) }
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Titre + enregistrement de la fiche sur une seule ligne */}
      <div className="flex items-center gap-2">
        <h2 className="shrink-0 text-lg font-semibold text-white">{t('rp.render.title')}</h2>
        <span className="mx-1 h-5 w-px shrink-0 bg-white/10" />
        <input value={ficheName} onChange={(e) => setFicheName(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') void saveFiche() }}
          placeholder={t('rp.render.namePlaceholder', { name: cards[safe]?.name?.slice(0, 24) || 'produit' })}
          className="w-56 rounded-lg border border-white/10 bg-well px-2.5 py-1.5 text-sm text-white outline-none placeholder:text-white/30 focus:border-[#6366f1]" />
        <button onClick={() => void saveFiche()} disabled={savingFiche}
          className="flex shrink-0 items-center gap-2 rounded-lg bg-[#6366f1] px-3 py-1.5 text-sm font-medium text-[#fff] hover:bg-[#5457e5] disabled:opacity-40">
          {savingFiche ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} {t('rp.render.saveCard')}
        </button>
        {sourceRef?.fileName && <span className="truncate text-xs text-white/40" title={sourceRef.fileName}>📄 {sourceRef.fileName}</span>}
        {hasRealSource && (
          <button
            onClick={() => toast.promise(refreshFromSource(), { loading: t('tst.rp.refreshing'), success: t('tst.rp.refreshed'), error: (e) => (e instanceof Error ? e.message : t('tst.rp.refreshFailed')) })}
            className="shrink-0 p-1.5 rounded-lg text-white/50 hover:text-white hover:bg-white/10" title={t('rp.actualiserDepuisLaSource')}>
            <RefreshCw className="h-4 w-4" />
          </button>
        )}
        <span className="shrink-0 text-xs text-white/30">{cards.length} {t('rp.produit')}{cards.length > 1 ? 's' : ''}</span>
        <button onClick={() => setStep('mapping')} className="ml-auto shrink-0 text-sm text-white/50 hover:text-white">← Mappage</button>
      </div>

      {/* Gabarit, IA & modèles — replié par défaut pour laisser la place à la carte */}
      <details className="group rounded-xl border border-white/10 bg-surface">
        <summary className="flex cursor-pointer select-none items-center gap-2 px-4 py-2 text-sm text-white/70 hover:text-white [&::-webkit-details-marker]:hidden">
          <Sparkles className="h-4 w-4 text-[#6366f1]" /> {t('rp.gabaritIaModeles')}
          <span className="text-xs text-white/30">{t('rp.render.styleHint')}</span>
          <ChevronDown className="ml-auto h-4 w-4 transition-transform group-open:rotate-180" />
        </summary>
        <div className="border-t border-white/5">
          <PromoTemplateEditor />
        </div>
      </details>

      {/* Calques + Images (gauche) · Aperçu (centre) · Propriétés (droite) */}
      <div className="flex items-start gap-4">
        <div className="sticky top-2 flex max-h-[calc(100vh-96px)] shrink-0 flex-col gap-4 self-start">
          <PromoLayersPanel />
          <PromoImagePanel currentImage={shownImage} onReplace={(url) => {
            // Upload vers le DAM (Drive) → on ne stocke qu'une réf légère dans la fiche.
            const p = uploadPromoImageToDam(url, cards[safe]?.name || 'image').then((ref) => setImgOverrideAt(safe, ref))
            toast.promise(p, { loading: t('tst.rp.savingImage'), success: t('tst.rp.imageSaved'), error: (e) => (e instanceof Error ? e.message : t('tst.rp.imageUploadFailed')) })
          }}
            canApplyToSource={hasRealSource && !!imgOverride[safe] && !!fieldMap.image}
            onApplyToSource={() => toast.promise(applyImageToSource(), { loading: t('tst.rp.writingSource'), success: t('tst.rp.imagePropagated'), error: (e) => (e instanceof Error ? e.message : t('tst.rp.writeFailed')) })} />
        </div>

        <div className="flex min-w-0 flex-1 flex-col gap-4">
          <div className="flex items-center justify-center gap-3 text-xs text-white/40">
            <span>{t('rp.render.canvasHint')}</span>
            {Object.keys(config.offsets).length > 0 && (
              <button onClick={() => setConfig({ offsets: {} })} className="text-[#6366f1] hover:underline">{t('rp.render.resetPositions')}</button>
            )}
          </div>
          {/* Pointerdown sur le FOND (cible exacte, pas les éléments ni leurs poignées :
              un `click` post-drag se synthétise sur l'ancêtre commun et casserait le resize) → désélection */}
          <div className="flex justify-center bg-well rounded-xl p-3 overflow-auto" style={{ maxHeight: 'calc(100vh - 150px)' }}
            onPointerDown={(e) => { if (e.target === e.currentTarget) setSelectedKey(null) }}>
            <div style={{ transform: `scale(${PREVIEW_SCALE})`, transformOrigin: 'top center', height: 842 * PREVIEW_SCALE, width: 595 * PREVIEW_SCALE }}>
              <RetailPromoCard ref={previewRef} data={currentData} config={config} editable effects={effects}
                selectedKey={capturing ? null : selectedKey} onSelect={setSelectedKey} capturing={capturing}
                onMoveBlock={(id, dx, dy) => setConfig({ offsets: { ...config.offsets, [id]: { dx, dy } } })}
                onResizeText={(key, patch) => setElementStyle(key, patch)}
                onScaleBlock={(id, sx, sy, dx, dy) => setConfig({ scales: { ...config.scales, [id]: { sx, sy } }, offsets: { ...config.offsets, [id]: { dx, dy } } })}
                onEditText={(key, value) => setTextOverrideAt(safe, key, value)} />
            </div>
          </div>

          {/* Navigation produit */}
          {cards.length > 1 && (
            <div className="flex items-center justify-center gap-4 text-white/70 text-sm">
              <button onClick={() => setIndex(Math.max(0, safe - 1))} disabled={safe === 0} className="p-1.5 rounded hover:bg-white/10 disabled:opacity-30"><ChevronLeft className="w-4 h-4" /></button>
              <span>{safe + 1} / {cards.length}</span>
              <button onClick={() => setIndex(Math.min(cards.length - 1, safe + 1))} disabled={safe === cards.length - 1} className="p-1.5 rounded hover:bg-white/10 disabled:opacity-30"><ChevronRight className="w-4 h-4" /></button>
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
          {busy === 'html' ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileCode className="w-4 h-4" />} {t('rp.render.editableHtml')}
        </button>
        {cards.length > 1 && (
          <button onClick={() => void downloadAll()} disabled={!!busy}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-[#6366f1] hover:bg-[#5457e5] text-[#fff] text-sm font-medium disabled:opacity-40">
            {busy === 'all' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Package className="w-4 h-4" />} {t('rp.render.exportAll', { count: cards.length })}
          </button>
        )}
      </div>
    </div>
  )
}
