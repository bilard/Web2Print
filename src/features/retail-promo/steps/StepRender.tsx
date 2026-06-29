import { useEffect, useRef, useState } from 'react'
import html2canvas from 'html2canvas'
import JSZip from 'jszip'
import { httpsCallable } from 'firebase/functions'
import { Download, Package, ChevronLeft, ChevronRight, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { functions } from '@/lib/firebase/config'
import { useRetailPromoStore } from '../retailPromo.store'
import { extractPromoFields } from '../promoMapping'
import { formatPrice } from '../priceParse'
import type { PromoFields } from '../promoTypes'
import { RetailPromoCard, type RetailCardData } from '../RetailPromoCard'

const imageProxyFn = httpsCallable<{ url: string }, { data: string; mimeType: string }>(functions, 'imageProxy')
// Cache module : une URL résolue une seule fois (data-URI ou null si échec).
const imgCache = new Map<string, string | null>()

async function resolveImg(url?: string): Promise<string | undefined> {
  if (!url) return undefined
  if (url.startsWith('data:')) return url
  if (imgCache.has(url)) return imgCache.get(url) ?? undefined
  try {
    const { data } = await imageProxyFn({ url })
    const dataUrl = `data:${data.mimeType};base64,${data.data}`
    imgCache.set(url, dataUrl)
    return dataUrl
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

async function capture(node: HTMLDivElement): Promise<Blob | null> {
  const canvas = await html2canvas(node, { scale: 2, useCORS: true, backgroundColor: '#ffffff', logging: false })
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b), 'image/png', 1))
}

export function StepRender() {
  const { rawColumns, rawRows, fieldMap, setStep } = useRetailPromoStore()
  const cards = rawRows.map((r) => toCardData(extractPromoFields(r, rawColumns, fieldMap)))

  const [index, setIndex] = useState(0)
  const [busy, setBusy] = useState<'one' | 'all' | null>(null)
  const [resolvedImg, setResolvedImg] = useState<string | undefined>(undefined)
  const previewRef = useRef<HTMLDivElement>(null)

  const safe = cards.length ? Math.min(index, cards.length - 1) : 0

  // Résout l'image du produit affiché (proxy serveur → data-URI capturable).
  useEffect(() => {
    let cancelled = false
    setResolvedImg(undefined)
    void resolveImg(cards[safe]?.imageUrl).then((u) => { if (!cancelled) setResolvedImg(u) })
    return () => { cancelled = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [safe, cards[safe]?.imageUrl])

  if (cards.length === 0) {
    return <p className="text-white/60 text-sm">Aucun produit. <button className="text-[#6366f1]" onClick={() => setStep('mapping')}>← Retour</button></p>
  }

  const currentData: RetailCardData = { ...cards[safe], imageUrl: resolvedImg }

  const downloadOne = async () => {
    if (!previewRef.current) return
    setBusy('one')
    try {
      const blob = await capture(previewRef.current)
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
    try {
      const zip = new JSZip()
      const node = previewRef.current
      for (let i = 0; i < cards.length; i++) {
        setIndex(i)
        const img = await resolveImg(cards[i].imageUrl)
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
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Échec export') } finally { setBusy(null) }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-white">Aperçu & export</h2>
        <button onClick={() => setStep('mapping')} className="text-sm text-white/50 hover:text-white">← Mappage</button>
      </div>

      {/* Aperçu du card (échelle réduite) */}
      <div className="flex justify-center bg-well rounded-xl p-6 overflow-hidden">
        <div style={{ transform: 'scale(0.55)', transformOrigin: 'top center', height: 842 * 0.55 }}>
          <RetailPromoCard ref={previewRef} data={currentData} />
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

      {/* Actions */}
      <div className="flex gap-2">
        <button onClick={() => void downloadOne()} disabled={!!busy}
          className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-white/[0.06] hover:bg-white/10 border border-white/10 text-white text-sm font-medium disabled:opacity-40">
          {busy === 'one' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />} Télécharger ce visuel (PNG)
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
