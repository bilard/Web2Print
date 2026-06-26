// src/features/merge/conditionalRules.ts
//
// Règles conditionnelles par objet, façon EasyCatalog (« Nouvelle action ») :
// une condition sur la valeur d'un champ de la ligne courante déclenche une
// action d'affichage ou de transformation (cacher, montrer, couleur, taille…).
//
// Ce module est PUR (aucune dépendance Fabric) et donc testable. Il évalue les
// règles contre une ligne de données et retourne l'EFFET VISUEL combiné, que
// l'applier (applyConditionalRules.ts) écrit sur l'objet Fabric de façon
// réversible. Voir conditionalRules.test.ts.

import { getRowValue } from './mergeEngine'
import type { MergeRow, MergeColumn } from '@/stores/merge.store'

// ── Opérateurs (cf. capture EasyCatalog) ────────────────────────────────────
// Trois familles : chaîne, présence, numérique. EasyCatalog sépare volontairement
// « Est » (égalité chaîne) de « Est égal à » (égalité numérique) — on préserve ça.
export type RuleOperator =
  // chaîne
  | 'contains' | 'notContains' | 'is' | 'isNot'
  | 'startsWith' | 'endsWith' | 'notStartsWith' | 'notEndsWith'
  // présence (pas de valeur)
  | 'isEmpty' | 'isNotEmpty'
  // numérique
  | 'gt' | 'gte' | 'lt' | 'lte' | 'eq' | 'neq'

export const OPERATOR_LABELS: Record<RuleOperator, string> = {
  contains: 'Contient',
  notContains: 'Ne contient pas',
  is: 'Est',
  isNot: "N'est pas",
  startsWith: 'Commence par',
  endsWith: 'Termine par',
  notStartsWith: 'Ne commence pas avec',
  notEndsWith: 'Ne se termine pas avec',
  isEmpty: 'Est vide',
  isNotEmpty: "N'est pas vide",
  gt: 'Est supérieur à',
  gte: 'Au moins',
  lt: 'Est inférieur à',
  lte: 'Pas plus que',
  eq: 'Est égal à',
  neq: "N'est pas égal à",
}

/** Opérateurs sans champ « Valeur » (présence). */
export const VALUELESS_OPERATORS: ReadonlySet<RuleOperator> = new Set(['isEmpty', 'isNotEmpty'])

/** Opérateurs numériques (la valeur est coercée en nombre). */
const NUMERIC_OPERATORS: ReadonlySet<RuleOperator> = new Set(['gt', 'gte', 'lt', 'lte', 'eq', 'neq'])

// ── Actions ─────────────────────────────────────────────────────────────────
// On reprend les actions EasyCatalog applicables sur un canvas libre (Fabric) et
// on ajoute les transformations demandées (taille, couleur, opacité). Les actions
// de flux InDesign (« Conserver avec suivant », reflow) n'ont pas de sens en
// positionnement absolu : volontairement absentes.
export type RuleActionType =
  | 'hide'        // Cacher (= « Supprimer » EC en aperçu : objet non rendu)
  | 'show'        // Montrer
  | 'bringToFront' // Disposition en avant
  | 'sendToBack'  // Mettre à l'arrière
  | 'setColor'    // Changer la couleur (fill)
  | 'setOpacity'  // Changer l'opacité
  | 'scale'       // Changer la taille (facteur)

export const ACTION_LABELS: Record<RuleActionType, string> = {
  hide: 'Cacher',
  show: 'Montrer',
  bringToFront: 'Mettre en avant',
  sendToBack: "Mettre à l'arrière",
  setColor: 'Changer la couleur',
  setOpacity: "Changer l'opacité",
  scale: 'Changer la taille',
}

export interface RuleAction {
  type: RuleActionType
  /** setColor : couleur cible (ex. '#e11d48'). */
  color?: string
  /** setOpacity : 0..1. */
  opacity?: number
  /** scale : facteur multiplicatif (1 = inchangé, 1.5 = +50 %). */
  scale?: number
}

// Valeurs par défaut des paramètres d'action (couleur/opacité/échelle).
export const DEFAULT_RULE_COLOR = '#e11d48'
export const DEFAULT_RULE_OPACITY = 0.5
export const DEFAULT_RULE_SCALE = 1.5

/**
 * Construit une action avec son paramètre par défaut renseigné, en préservant
 * la valeur existante si compatible. Indispensable : une action « nue » (ex.
 * `{ type: 'setColor' }` sans `color`) est ignorée silencieusement par
 * resolveEffect (les guards `if (action.color)` échouent) — l'UI affichait un
 * défaut sans jamais le persister, d'où des règles « qui ne font rien ».
 */
export function actionWithDefaults(type: RuleActionType, prev?: RuleAction): RuleAction {
  switch (type) {
    case 'setColor': return { type, color: prev?.color ?? DEFAULT_RULE_COLOR }
    case 'setOpacity': return { type, opacity: prev?.opacity ?? DEFAULT_RULE_OPACITY }
    case 'scale': return { type, scale: prev?.scale ?? DEFAULT_RULE_SCALE }
    default: return { type }
  }
}

export interface ConditionalRule {
  id: string
  /** Champ de données testé : key OU label de colonne (résolu via getRowValue). */
  field: string
  operator: RuleOperator
  /** Valeur de comparaison (ignorée pour isEmpty/isNotEmpty). */
  value?: string
  action: RuleAction
}

// ── Effet visuel résolu ─────────────────────────────────────────────────────
// Repli de toutes les actions dont la condition matche (dernière gagne par
// propriété). L'applier l'écrit puis restaure la baseline pour les props absentes.
export interface RuleEffect {
  visible?: boolean
  fill?: string
  opacity?: number
  /** Facteur d'échelle cumulé (produit des actions scale qui matchent). */
  scale?: number
  /** Réordonnancement z (dernier gagne). */
  zOrder?: 'front' | 'back'
}

// ── Évaluation ───────────────────────────────────────────────────────────────

/**
 * Coerce une valeur en nombre, tolérante aux formats réels saisis/affichés :
 * devises et symboles (« 100€,00 », « 84,99 DT », « 1 234,56 € »), espaces et
 * séparateurs de milliers. On ne garde que chiffres / séparateurs / signe ; la
 * virgule est le séparateur décimal FR (les points deviennent des milliers).
 * NaN si rien d'exploitable.
 */
function toNumber(v: unknown): number {
  if (typeof v === 'number') return v
  if (v == null) return NaN
  let s = String(v).replace(/[^0-9.,-]/g, '')
  if (s === '' || s === '-' || s === '.' || s === ',') return NaN
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.')
  return Number(s)
}

function asString(v: unknown): string {
  return v == null ? '' : String(v)
}

/**
 * Évalue une condition unique : la valeur de cellule satisfait-elle
 * `operator` vis-à-vis de `ruleValue` ? Comparaisons chaîne insensibles à la
 * casse et au trim ; comparaisons numériques après coercion (NaN ⇒ false).
 */
export function evaluateCondition(
  operator: RuleOperator,
  cellValue: unknown,
  ruleValue: string | undefined,
): boolean {
  // Présence
  const cellStr = asString(cellValue).trim()
  if (operator === 'isEmpty') return cellStr === ''
  if (operator === 'isNotEmpty') return cellStr !== ''

  // Numérique
  if (NUMERIC_OPERATORS.has(operator)) {
    const a = toNumber(cellValue)
    const b = toNumber(ruleValue)
    if (Number.isNaN(a) || Number.isNaN(b)) return false
    switch (operator) {
      case 'gt': return a > b
      case 'gte': return a >= b
      case 'lt': return a < b
      case 'lte': return a <= b
      case 'eq': return a === b
      case 'neq': return a !== b
      default: return false
    }
  }

  // Chaîne (insensible casse + trim)
  const a = cellStr.toLowerCase()
  const b = asString(ruleValue).trim().toLowerCase()
  switch (operator) {
    case 'contains': return a.includes(b)
    case 'notContains': return !a.includes(b)
    case 'is': return a === b
    case 'isNot': return a !== b
    case 'startsWith': return a.startsWith(b)
    case 'endsWith': return a.endsWith(b)
    case 'notStartsWith': return !a.startsWith(b)
    case 'notEndsWith': return !a.endsWith(b)
    default: return false
  }
}

/** Traduit une action déclenchée en patch d'effet visuel. */
function actionToEffect(action: RuleAction, prev: RuleEffect): void {
  switch (action.type) {
    case 'hide': prev.visible = false; break
    case 'show': prev.visible = true; break
    case 'bringToFront': prev.zOrder = 'front'; break
    case 'sendToBack': prev.zOrder = 'back'; break
    case 'setColor': if (action.color) prev.fill = action.color; break
    case 'setOpacity':
      if (typeof action.opacity === 'number') prev.opacity = Math.min(1, Math.max(0, action.opacity))
      break
    case 'scale':
      if (typeof action.scale === 'number' && action.scale > 0) {
        prev.scale = (prev.scale ?? 1) * action.scale
      }
      break
  }
}

/**
 * Évalue toutes les règles d'un objet contre une ligne et retourne l'effet
 * visuel combiné. Les règles sont appliquées dans l'ordre ; pour une même
 * propriété, la dernière règle qui matche l'emporte (sauf `scale`, cumulatif).
 * Retourne un objet vide si aucune règle ne matche.
 */
export function resolveEffect(
  rules: ConditionalRule[] | undefined,
  row: MergeRow,
  columns?: MergeColumn[],
  fieldMap?: Record<string, string>,
): RuleEffect {
  const effect: RuleEffect = {}
  if (!rules || rules.length === 0) return effect
  for (const rule of rules) {
    if (!rule.field) continue
    const cell = getRowValue(row, rule.field, columns, fieldMap)
    if (evaluateCondition(rule.operator, cell, rule.value)) {
      actionToEffect(rule.action, effect)
    }
  }
  return effect
}
