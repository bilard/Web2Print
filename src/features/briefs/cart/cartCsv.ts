import type { CartItem } from '@/features/briefs/types'

const HEADER = ['SKU', 'Nom', 'Quantité', 'Prix unitaire', 'Prix appliqué', 'Total ligne']

function escape(field: string | number): string {
  const s = String(field)
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`
  }
  return s
}

function fmt(n: number | undefined): string {
  return (n ?? 0).toFixed(2)
}

export function cartItemsToCsv(items: CartItem[]): string {
  const lines: string[] = [HEADER.join(',')]
  for (const it of items) {
    const applied = it.unitPriceOverride ?? it.unitPrice ?? 0
    const lineTotal = applied * it.quantity
    lines.push(
      [
        escape(it.sku),
        escape(it.name),
        escape(it.quantity),
        fmt(it.unitPrice),
        fmt(applied),
        fmt(lineTotal),
      ].join(','),
    )
  }
  return lines.join('\n')
}
