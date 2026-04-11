import { useState, useMemo, useEffect, useRef } from 'react'
import { ArrowRight, Sparkles, RefreshCw, Download } from 'lucide-react'
import { toast } from 'sonner'
import { useGenerateCart, type CartProgressEvent } from '@/features/briefs/ai/useGenerateCart'
import { useUpdateBrief } from '@/features/briefs/useBriefMutations'
import { computeSubtotal, computeTotal } from '@/features/briefs/cart/cartMath'
import { cartItemsToCsv } from '@/features/briefs/cart/cartCsv'
import { CartTable } from './CartTable'
import { CartSummary } from './CartSummary'
import { CartGenerationLog } from './CartGenerationLog'
import type { Brief, CartItem, CartDiscount } from '@/features/briefs/types'

interface Props {
  brief: Brief
  onAdvance: () => void
}

export function Step3Cart({ brief, onAdvance }: Props) {
  const generate = useGenerateCart()
  const update = useUpdateBrief()
  const [items, setItems] = useState<CartItem[]>(brief.cart?.items ?? [])
  const [discount, setDiscount] = useState<CartDiscount | undefined>(brief.cart?.discount)
  const [logEvents, setLogEvents] = useState<CartProgressEvent[]>([])
  const autoGenStartedRef = useRef(false)

  // resync si Firestore renvoie de nouveaux items après generation
  useEffect(() => {
    setItems(brief.cart?.items ?? [])
    setDiscount(brief.cart?.discount)
  }, [brief.cart?.items, brief.cart?.discount])

  const subtotal = useMemo(() => computeSubtotal(items), [items])
  const total = useMemo(() => computeTotal(items, discount), [items, discount])
  const hasItems = items.length > 0

  // Auto-génération à l'arrivée si panier vide
  useEffect(() => {
    if (!hasItems && !generate.isPending && !autoGenStartedRef.current) {
      autoGenStartedRef.current = true
      handleGenerate()
    }
     
  }, [])

  const handleGenerate = async () => {
    setLogEvents([])
    try {
      const r = await generate.mutateAsync({
        brief,
        onProgress: (e) => setLogEvents((prev) => [...prev, e]),
      })
      toast.success(`${r.items.length} produits générés`)
      if (r.droppedSkus.length > 0) {
        toast.warning(`${r.droppedSkus.length} SKU(s) ignoré(s) car inconnus`)
      }
    } catch (err) {
      setLogEvents((prev) => [
        ...prev,
        { step: 'error', message: (err as Error).message || 'Erreur inconnue' },
      ])
      toast.error((err as Error).message || 'Échec de la génération')
    }
  }

  const handleExportCsv = () => {
    const csv = cartItemsToCsv(items)
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `panier-${brief.id}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleNext = async () => {
    if (!hasItems) {
      toast.error('Le panier est vide')
      return
    }
    try {
      await update.mutateAsync({
        briefId: brief.id,
        patch: {
          'cart.items': items,
          'cart.subtotal': subtotal,
          'cart.discount': discount ?? null,
          'cart.totalEstimate': total,
          status: 'cart_ready',
          currentStep: 4,
        } as never,
      })
      onAdvance()
    } catch (err) {
      toast.error('Erreur lors de la sauvegarde')
      console.error(err)
    }
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Enter' || e.shiftKey || e.ctrlKey || e.metaKey) return
      if (update.isPending || !hasItems) return
      const tag = (e.target as HTMLElement)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return
      e.preventDefault()
      e.stopPropagation()
      handleNext()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
     
  }, [items, discount, update.isPending, hasItems])

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-[14px] font-semibold text-white/80">Panier produits</h2>
              <p className="text-[12px] text-white/40">
                Généré par l'IA à partir du brief et des réponses. Modifiable ligne par ligne.
              </p>
            </div>
            <div className="flex items-center gap-2">
              {hasItems && (
                <button
                  onClick={handleExportCsv}
                  className="flex items-center gap-1.5 text-[12px] text-white/60 hover:text-white px-3 py-1.5 rounded-md hover:bg-white/[0.06]"
                >
                  <Download className="w-3.5 h-3.5" />
                  CSV
                </button>
              )}
              <button
                onClick={handleGenerate}
                disabled={generate.isPending}
                className="flex items-center gap-1.5 text-[12px] text-indigo-300 hover:text-white hover:bg-indigo-500/10 px-3 py-1.5 rounded-md disabled:opacity-50"
              >
                {hasItems ? <RefreshCw className="w-3.5 h-3.5" /> : <Sparkles className="w-3.5 h-3.5" />}
                {generate.isPending ? 'Génération…' : hasItems ? 'Régénérer' : 'Générer le panier'}
              </button>
            </div>
          </div>

          {(generate.isPending || logEvents.length > 0) && (
            <div className="mb-4">
              <CartGenerationLog events={logEvents} isRunning={generate.isPending} />
            </div>
          )}

          {generate.isPending && !hasItems ? null : (
            <div className="grid grid-cols-[1fr_280px] gap-4">
              <CartTable items={items} onChange={setItems} />
              <CartSummary subtotal={subtotal} total={total} discount={discount} onDiscountChange={setDiscount} />
            </div>
          )}

          {brief.cart?.aiReasoning && (
            <p className="mt-6 text-[11px] text-white/40 italic">IA : {brief.cart.aiReasoning}</p>
          )}
        </div>
      </div>
      <div className="border-t border-white/[0.06] bg-[#141414] px-6 py-3 flex justify-end shrink-0">
        <button
          onClick={handleNext}
          disabled={!hasItems || update.isPending}
          className="flex items-center gap-1.5 text-[12px] text-white bg-indigo-500 hover:bg-indigo-600 px-4 py-2 rounded-md disabled:opacity-50"
        >
          Étape suivante
          <ArrowRight className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  )
}
