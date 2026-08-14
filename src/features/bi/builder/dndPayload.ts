// Ce que dnd-kit transporte, TYPÉ. `active.data.current` est un sac de propriétés libres :
// sans lecteur unique, chaque composant le recasterait à sa façon, et une faute de frappe
// sur une clé rendrait un glisser silencieusement inerte.
import type { DraggedField, WellId } from './wells'

/** Ce qu'on SAISIT : un champ du volet, ou une puce déjà posée. */
export type BuilderDrag =
  | { kind: 'field'; field: DraggedField }
  | { kind: 'chip'; well: WellId; index: number; label: string }

/** Ce qu'on SURVOLE : une zone, ou une puce (dont on retient la zone). */
export type BuilderDrop =
  | { kind: 'well'; well: WellId }
  | { kind: 'chip'; well: WellId; index: number; label: string }

type Loose = Record<string, unknown> | undefined

export const isWellId = (v: unknown): v is WellId =>
  v === 'axis' || v === 'values' || v === 'legend' || v === 'tooltips' || v === 'visualFilters'

export function readDrag(data: Loose): BuilderDrag | null {
  if (!data) return null
  if (data.kind === 'field' && data.field) return { kind: 'field', field: data.field as DraggedField }
  if (data.kind === 'chip' && isWellId(data.well) && typeof data.index === 'number') {
    return { kind: 'chip', well: data.well, index: data.index, label: String(data.label ?? '') }
  }
  return null
}

export function readDrop(data: Loose): BuilderDrop | null {
  if (!data) return null
  if (!isWellId(data.well)) return null
  if (data.kind === 'well') return { kind: 'well', well: data.well }
  if (data.kind === 'chip' && typeof data.index === 'number') {
    return { kind: 'chip', well: data.well, index: data.index, label: String(data.label ?? '') }
  }
  return null
}
