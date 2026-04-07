import type { CartDiscount } from '@/features/briefs/types'

interface Props {
  subtotal: number
  total: number
  discount: CartDiscount | undefined
  onDiscountChange: (d: CartDiscount | undefined) => void
}

export function CartSummary({ subtotal, total, discount, onDiscountChange }: Props) {
  return (
    <div className="border border-white/[0.06] rounded-md p-4 bg-[#141414] flex flex-col gap-3 text-[12px]">
      <div className="flex justify-between text-white/60">
        <span>Sous-total</span>
        <span>{subtotal.toFixed(2)} €</span>
      </div>

      <div className="flex items-center gap-2">
        <span className="text-white/60 flex-1">Remise globale</span>
        <select
          value={discount?.type ?? ''}
          onChange={(e) => {
            const t = e.target.value
            if (!t) onDiscountChange(undefined)
            else onDiscountChange({ type: t as 'percent' | 'amount', value: discount?.value ?? 0 })
          }}
          className="bg-[#0f0f0f] border border-white/[0.08] rounded px-2 py-1 text-[11px] text-white"
        >
          <option value="">Aucune</option>
          <option value="percent">%</option>
          <option value="amount">€</option>
        </select>
        <input
          type="number"
          min={0}
          value={discount?.value ?? 0}
          disabled={!discount}
          onChange={(e) =>
            discount && onDiscountChange({ ...discount, value: Number(e.target.value) })
          }
          className="bg-[#0f0f0f] border border-white/[0.08] rounded px-2 py-1 w-20 text-right text-[11px] text-white disabled:opacity-40"
        />
      </div>

      <div className="border-t border-white/[0.06] pt-3 flex justify-between text-white font-semibold text-[13px]">
        <span>Total estimé</span>
        <span>{total.toFixed(2)} €</span>
      </div>
    </div>
  )
}
