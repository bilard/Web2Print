// Le seuil d'une tuile : franchi, ou non. PUR.
//
// ⚠⚠ Trois issues, jamais deux : franchi, non franchi, et INDÉCIDABLE. Une tuile sans
// chiffre (source vide, mesure absente) n'est pas « sous le seuil » — la dire calme
// laisserait croire qu'on surveille quelque chose alors qu'on ne mesure rien.
//
// ⚠ Sur un visuel groupé, c'est le pire cas qui décide : un seul concurrent au-dessus du
// seuil doit allumer la tuile. Ne regarder que la première ligne ferait dépendre l'alerte de
// l'ordre de tri.
import type { AggregateResult } from './aggregate'

export interface AlertRule {
  op: 'gt' | 'lt'
  value: number
}

export interface AlertState {
  breached: boolean
  /** La valeur qui a décidé — celle à montrer à côté du seuil. `null` si rien de mesurable. */
  value: number | null
  /** Aucun chiffre exploitable : on ne conclut pas. */
  undecided: boolean
}

const CALM: AlertState = { breached: false, value: null, undecided: true }

export function evaluateAlert(result: AggregateResult | null, rule?: AlertRule): AlertState {
  if (!rule || !result) return CALM
  const measure = result.columns.find((c) => c.role === 'measure')
  if (!measure) return CALM
  const values = result.rows
    .map((r) => r[measure.key])
    .filter((v): v is number => typeof v === 'number' && Number.isFinite(v))
  if (values.length === 0) return CALM
  // Le pire cas selon le sens : le plus haut pour « au-dessus », le plus bas pour « en dessous ».
  const worst = rule.op === 'gt' ? Math.max(...values) : Math.min(...values)
  const breached = rule.op === 'gt' ? worst > rule.value : worst < rule.value
  return { breached, value: worst, undecided: false }
}
