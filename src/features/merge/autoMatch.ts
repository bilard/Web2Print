// src/features/merge/autoMatch.ts
// Auto-matching sémantique du re-skin : propose automatiquement les liaisons
// {{champ}} sur les Textbox d'un design décomposé — prix (motif monétaire,
// plus grande taille), titre (plus grande taille restante), description
// (texte le plus long). Heuristiques génériques, aucun dictionnaire par marque.
import { Textbox } from 'fabric'
import type { Canvas } from 'fabric'
import { syncToStore } from '@/features/editor/useAddObject'
import { collectObjectsDeep } from './deepObjects'

export interface MatchableText {
  id: string
  text: string
  fontSize: number
}

export interface ColumnLike {
  key: string
  label: string
}

export interface MatchAssignment {
  id: string
  columnKey: string
  role: 'price' | 'title' | 'description'
}

const PRICE_RX = /(\d{1,5}[.,]\d{1,2}\s*€)|(€\s*\d{1,5})|(^\d{1,5}[.,]\d{2}$)|(^\d{1,5}\s*€)/

const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')

const COLUMN_KEYS: Record<MatchAssignment['role'], string[]> = {
  price: ['price', 'prix', 'ai_price', 'tarif', 'prix_ttc', 'pu'],
  title: ['name', 'nom', 'title', 'titre', 'ai_name', 'libelle', 'designation', 'produit', 'label'],
  description: ['description', 'ai_description', 'desc'],
}

function findColumn(columns: ColumnLike[], role: MatchAssignment['role']): ColumnLike | null {
  for (const k of COLUMN_KEYS[role]) {
    const col = columns.find((c) => norm(c.key) === k || norm(c.label) === k)
    if (col) return col
  }
  return null
}

/** Cœur pur : choisit (prix, titre, description) parmi les textes du canvas. */
export function computeAutoMatch(texts: MatchableText[], columns: ColumnLike[]): MatchAssignment[] {
  const out: MatchAssignment[] = []
  const used = new Set<string>()
  const candidates = texts.filter((t) => t.text.trim().length > 0)

  const priceCol = findColumn(columns, 'price')
  if (priceCol) {
    const prices = candidates.filter((t) => PRICE_RX.test(t.text.trim()))
    const best = prices.sort((a, b) => b.fontSize - a.fontSize)[0]
    if (best) {
      out.push({ id: best.id, columnKey: priceCol.key, role: 'price' })
      used.add(best.id)
    }
  }

  const titleCol = findColumn(columns, 'title')
  if (titleCol) {
    const titles = candidates.filter(
      (t) => !used.has(t.id) && t.text.trim().length >= 3 && !PRICE_RX.test(t.text.trim()),
    )
    const best = titles.sort((a, b) => b.fontSize - a.fontSize)[0]
    if (best) {
      out.push({ id: best.id, columnKey: titleCol.key, role: 'title' })
      used.add(best.id)
    }
  }

  const descCol = findColumn(columns, 'description')
  if (descCol) {
    const descs = candidates.filter((t) => !used.has(t.id) && t.text.trim().length >= 40)
    const best = descs.sort((a, b) => b.text.length - a.text.length)[0]
    if (best) out.push({ id: best.id, columnKey: descCol.key, role: 'description' })
  }

  return out
}

/**
 * Applique l'auto-matching sur le canvas : chaque Textbox retenu devient un
 * template `{{champ}}` (même mécanique que l'insertion manuelle de tag).
 * Retourne les assignations réalisées (vide si rien de reconnaissable).
 */
export function applyAutoMatch(canvas: Canvas, columns: ColumnLike[]): MatchAssignment[] {
  // Traversée profonde : les champs peuvent vivre dans un Group (blocs PDF→SVG).
  const boxes = collectObjectsDeep(canvas.getObjects())
    .filter((o): o is Textbox => o instanceof Textbox && !o.data?.isGrid && !o.data?.isPageBg)
  // Garantit un data.id pour retrouver l'objet.
  boxes.forEach((b, i) => {
    if (!b.data) b.data = {}
    if (!b.data.id) b.data.id = `txt_auto_${Date.now()}_${i}`
  })
  const texts: MatchableText[] = boxes.map((b) => ({
    id: b.data!.id as string,
    // templateText déjà posé = déjà lié → on l'exclut en le vidant.
    text: b.data?.templateText ? '' : (b.text ?? ''),
    fontSize: (b.fontSize ?? 16) * (b.scaleY ?? 1),
  }))
  const assignments = computeAutoMatch(texts, columns)
  for (const a of assignments) {
    const box = boxes.find((b) => b.data?.id === a.id)
    if (!box) continue
    const tag = `{{${a.columnKey}}}`
    box.data!.templateText = tag
    delete box.data!.templateStyles
    box.set('text', tag)
    ;(box as Textbox & { dirty: boolean }).dirty = true
    box.setCoords()
  }
  if (assignments.length > 0) {
    canvas.requestRenderAll()
    syncToStore(canvas)
  }
  return assignments
}
