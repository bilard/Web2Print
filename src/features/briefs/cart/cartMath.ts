import type { CartItem, CartDiscount } from '@/features/briefs/types'

export function computeSubtotal(items: CartItem[]): number {
  return items.reduce((sum, it) => {
    const price = it.unitPriceOverride ?? it.unitPrice ?? 0
    return sum + price * it.quantity
  }, 0)
}

export function applyDiscount(subtotal: number, discount: CartDiscount | undefined): number {
  if (!discount) return subtotal
  let after = subtotal
  if (discount.type === 'percent') {
    after = subtotal * (1 - discount.value / 100)
  } else {
    after = subtotal - discount.value
  }
  return after < 0 ? 0 : after
}

export function computeTotal(items: CartItem[], discount: CartDiscount | undefined): number {
  return applyDiscount(computeSubtotal(items), discount)
}
