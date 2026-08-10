// Un lot envoyé au modèle, vérifié, et ce qu'il en reste. Extrait de `TextEnrichScreen`,
// qui portait l'appel, la garde et l'écriture dans une seule boucle — impossible à rejouer.
//
// ⚠ C'est cette possibilité de REJOUER qui compte : depuis que la garde exige l'isopérimètre
// (aucun modèle compatible, aucune référence citée perdue en route), un premier jet est
// souvent refusé pour une omission que le modèle corrige dès qu'on la lui nomme. Sans
// reprise, la fiche restait non traduite et l'appel était payé pour rien.
import { generateJson } from '@/features/ai/llmRouter'
import { findViolations, type Violation } from '@/features/textEnrich/protected'
import { ScreenBatchSchema, screenSchemaForLLM, buildScreenPrompt, type ScreenModes } from './screenPrompt'
import { completeOriginText } from './fullSaleText'
import { opsOf } from './revisionOps'
import type { SourceProduct } from '../catalog/match'
import type { TextRevision } from '../textRevisionsStore'

/** Une fiche prête à partir : le texte soumis est déjà choisi par l'écran (dernier en date,
 *  ou texte d'origine entier quand ce dernier était coupé). */
export interface EnrichUnit {
  product: SourceProduct
  lang: string | null
  revision?: TextRevision
  submit: { name: string; description?: string }
}

export interface BatchOutcome {
  written: TextRevision[]
  /** Ce que la garde a refusé, et pourquoi. Sert au motif affiché ET à la reprise. */
  refusals: Map<string, Violation[]>
  /** Fiches auxquelles le modèle a répondu — les autres sont muettes, pas refusées. */
  answered: Set<string>
}

/**
 * Ce qu'on redit au modèle quand sa réponse a été refusée : les éléments qu'il a laissés
 * tomber, NOMMÉS. Une consigne générale (« n'oublie rien ») ne corrige rien — c'est déjà ce
 * que dit la consigne de forme du premier appel.
 */
export function correctiveFor(units: EnrichUnit[], refusals: Map<string, Violation[]>): string {
  const lines = units
    .map((u) => {
      const lost = (refusals.get(u.product.id) ?? [])
        .filter((v) => v.kind !== 'brand-added')
        .map((v) => `« ${v.token} »`)
    return lost.length > 0 ? `- id=${JSON.stringify(u.product.id)} : ${lost.join(', ')}` : ''
    })
    .filter(Boolean)
  if (lines.length === 0) return ''
  return [
    'REPRISE — ta réponse précédente a été REFUSÉE : elle avait perdu des éléments présents',
    'dans l’original. Recommence ces fiches en les reprenant TOUS, un par un, sans abréger :',
    ...lines,
  ].join('\n')
}

export async function submitBatch(units: EnrichUnit[], opts: {
  instruction: string
  modes: ScreenModes
  maxTokens: number
  /** Horodatage des révisions écrites. Injecté pour que la fonction reste rejouable. */
  at: number
  /** Consigne corrective d'une reprise (cf. `correctiveFor`). */
  corrective?: string
  onProviderFailed?: (e: { provider: string; error: Error }) => void
}): Promise<BatchOutcome> {
  const raw = await generateJson({
    task: 'data.textEnrich',
    prompt: buildScreenPrompt(
      units.map((u) => ({
        id: u.product.id, name: u.submit.name,
        ...(u.submit.description ? { description: u.submit.description } : {}),
        lang: u.lang,
      })),
      opts.instruction, opts.modes, undefined, opts.corrective,
    ),
    schema: ScreenBatchSchema,
    schemaForLLM: screenSchemaForLLM,
    version: 'text-enrich-screen/v2',
    maxTokens: opts.maxTokens,
    // ⚠ Un fournisseur qui tombe et cède la main au suivant doit se VOIR : sans ça, un quota
    // épuisé se manifeste par un écran qui n'avance pas, et on cherche la panne dans le module.
    ...(opts.onProviderFailed ? { onProviderFailed: opts.onProviderFailed } : {}),
  })

  const written: TextRevision[] = []
  const refusals = new Map<string, Violation[]>()
  const answered = new Set<string>()
  const byId = new Map(units.map((u) => [u.product.id, u]))

  for (const r of raw.results) {
    const u = byId.get(r.id)
    // Un identifiant inconnu trahit une liste décalée : on écarte plutôt que de ranger un
    // texte sur le mauvais produit.
    if (!u) continue
    answered.add(u.product.id)
    const name = String(r.name ?? '').trim()
    const description = String(r.description ?? '').trim()
    if (!name) continue

    // Même vérification que le moteur : une réécriture qui perd une référence, une cote, un
    // modèle compatible ou qui abrège une liste est refusée, pas écrite.
    const violations = findViolations(
      `${u.submit.name} ${u.submit.description ?? ''}`,
      `${name} ${description}`,
      { refs: [u.product.ref, u.product.ref2], eans: [u.product.ean] },
    )
    if (violations.length > 0) { refusals.set(u.product.id, violations); continue }

    written.push({
      productId: u.product.id,
      name,
      ...(description ? { description } : {}),
      // ⚠ L'original est le PREMIER connu, jamais la passe précédente : une amélioration
      // posée sur une traduction ne doit pas faire passer la traduction pour le texte
      // d'origine — c'est vers l'allemand que le retour arrière ramène.
      nameSource: u.revision?.nameSource ?? u.product.name,
      // ⚠ Un original COUPÉ cède la place au texte entier retrouvé : c'est vers lui que
      // « Annuler » doit ramener, pas vers le moignon qu'on vient de remplacer.
      ...((d) => (d ? { descriptionSource: d } : {}))(
        completeOriginText(u.product, u.revision)
        ?? u.revision?.descriptionSource ?? u.product.description,
      ),
      ...(r.note ? { note: r.note } : {}),
      // Ce qui a été fait sur cette fiche, CUMULÉ : une amélioration ne doit pas effacer la
      // trace de la traduction qui l'a précédée.
      ops: ((was) => ({
        ...(was.translate || opts.modes.translate ? { translate: true } : {}),
        ...(was.improve || opts.modes.improve ? { improve: true } : {}),
      }))(opsOf(u.revision, u.lang)),
      ...(u.lang ? { lang: u.lang } : {}),
      at: opts.at,
    })
  }

  return { written, refusals, answered }
}
