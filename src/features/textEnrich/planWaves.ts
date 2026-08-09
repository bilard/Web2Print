// Découpe les plans en VAGUES successives. PUR.
//
// ⚠ Ce module existe pour lever la limite « un même champ ne porte qu'un plan par
// passage ». Elle n'était pas un caprice : les unités de travail sont identifiées par
// `produit::champ` et calculées TOUTES D'AVANCE, si bien que deux plans sur un champ
// produisaient deux unités indiscernables — la réponse du modèle en écrasait une, et le
// second plan repartait du texte d'origine sans jamais voir le travail du premier. On
// payait deux fois pour un seul résultat.
//
// La solution ne change rien au moteur : elle l'appelle PLUSIEURS FOIS. Vague 1 = le
// premier plan de chaque champ, vague 2 = le deuxième, etc. Entre deux vagues, les textes
// révisés remplacent les originaux — la vague suivante travaille donc sur ce que la
// précédente a produit. Traduire puis améliorer un même champ tient dans un seul passage.
import { planPass, type EnrichUnit, type EnrichTarget, type RunPassResult } from './pass'
import type { EnrichPass } from './revision'
import type { FieldPlan } from './fieldPlan'

/**
 * Les plans, rangés en vagues à exécuter dans l'ordre.
 *
 * Un champ qui ne porte qu'un plan n'apparaît que dans la première vague : rien ne
 * l'attend, et une vague ne contient jamais deux plans du même champ — c'est justement ce
 * qui garde la clé `produit::champ` unique à l'intérieur d'une vague.
 */
export function planWaves(plans: FieldPlan[]): FieldPlan[][] {
  const seen = new Map<string, number>()
  const waves: FieldPlan[][] = []
  for (const plan of plans) {
    const depth = seen.get(plan.key) ?? 0
    seen.set(plan.key, depth + 1)
    if (!waves[depth]) waves[depth] = []
    waves[depth].push(plan)
  }
  return waves
}

/**
 * Enchaîne les vagues : chacune est planifiée sur les textes que la précédente a laissés.
 *
 * ⚠ La première vague est planifiée par l'appelant (c'est elle qui sert au chiffrage
 * préalable et à la borne `maxUnits`, annoncés avant de dépenser quoi que ce soit). Les
 * suivantes ne peuvent PAS l'être d'avance : elles portent sur des textes qui n'existent
 * pas encore. On les replanifie donc juste avant de les lancer — c'est tout le mécanisme.
 *
 * ⚠ La borne se consomme d'une vague à l'autre. Sans ça, « au plus 500 » deviendrait 500
 * par vague, et un plan traduire+améliorer paierait le double de ce qui est annoncé.
 */
export async function runWaves(
  waves: FieldPlan[][],
  targets: EnrichTarget[],
  firstUnits: EnrichUnit[],
  baseCounts: EnrichPass['counts'],
  run: (units: EnrichUnit[], counts: EnrichPass['counts'], deadlineAt?: number) => Promise<RunPassResult>,
  opts: { limit?: number; deadlineAt?: number; now?: () => number } = {},
): Promise<RunPassResult> {
  // ⚠⚠ Le TEMPS est PARTAGÉ entre les vagues, il ne revient pas à la première.
  //
  // Sur un catalogue de 200 000 champs, la vague « traduire » ne finit jamais dans un
  // segment : elle était coupée par l'échéance, `cappedBy` faisait abandonner la vague
  // « améliorer », et la mémoire écartait ensuite ces lignes comme faites. L'amélioration
  // n'avait donc AUCUNE chance de tourner un jour — le filtre « Améliorés » restait vide
  // pour toujours, sans que rien ne l'explique. La première vague rend la main aux deux
  // tiers du temps pour que la suivante travaille sur ce qu'elle vient de produire.
  const now = opts.now ?? Date.now
  const share = opts.deadlineAt != null && waves.length > 1
    ? now() + Math.max(0, Math.floor((opts.deadlineAt - now()) * 0.66))
    : opts.deadlineAt
  let result = await run(firstUnits, baseCounts, share)
  let budget = opts.limit == null ? Infinity : Math.max(0, opts.limit - firstUnits.length)
  const productIds = new Set(result.productIds)

  for (const wave of waves.slice(1)) {
    // ⚠ Le plafond de DÉPENSE arrête tout : enchaîner le dépasserait. L'échéance de la
    // vague, elle, n'est pas celle du passage — c'est justement le partage ci-dessus, et
    // s'arrêter là rendrait l'amélioration inatteignable.
    if (result.cappedBy === 'spend') break
    if (result.cappedBy === 'deadline' && opts.deadlineAt != null && now() >= opts.deadlineAt) break
    if (budget <= 0) break
    const next = planPass(targets, wave)
    if (next.units.length === 0) continue
    const taken = next.units.slice(0, budget === Infinity ? undefined : budget)
    budget -= taken.length
    // Les compteurs repartent de ceux déjà cumulés : un passage rend UN bilan, pas un par
    // vague — l'utilisateur a lancé une fois.
    result = await run(taken, result.counts, opts.deadlineAt)
    for (const id of result.productIds) productIds.add(id)
  }
  return { ...result, productIds: [...productIds] }
}
