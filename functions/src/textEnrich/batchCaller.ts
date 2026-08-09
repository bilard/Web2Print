// functions/src/textEnrich/batchCaller.ts
// ⚠ COPIE de src/features/textEnrich/batchCaller.ts (bundles séparés : `functions/` est hermétique,
// `rootDir: "src"`). Toute modification là-bas doit être reportée ici — cf.
// textEnrichParity.test.ts.
// Le chaînon entre le moteur et le modèle : construit le prompt, valide la réponse,
// assemble le texte final. Dépendance INJECTÉE.
//
// ⚠ Agnostique du fournisseur, à dessein. Le navigateur passe par `generateJson` (cascade
// et clés de l'utilisateur connecté), un cron passerait par son propre appel : les deux
// doivent produire EXACTEMENT le même texte, sinon la même fiche sortirait différemment
// selon l'heure. Tout ce qui décide du contenu vit donc ici, et seul l'appel diffère.
import { buildBatchPrompt, mapBatch, finalText, schemaForLLM, type EnrichBatch } from './prompt'
import { unitKey, type EnrichUnit } from './pass'

export interface BatchCallerDeps {
  /** Appelle le modèle et rend l'objet validé contre `schema`. */
  generate: (args: { prompt: string; schema: Record<string, unknown> }) => Promise<unknown>
  /** Demander une justification par texte. Alimente l'écran de comparaison. */
  withNote?: boolean
  /** Reçoit les justifications, pour les stocker à côté des révisions. */
  onNotes?: (notes: Record<string, string>) => void
}

/**
 * Fabrique la fonction que `runPass` appelle pour chaque lot.
 *
 * Le texte rendu est le texte FINAL, gabarit assemblé : le moteur n'a pas à savoir si le
 * modèle a produit la phrase entière ou seulement le discriminant qui lui manquait.
 */
export function makeCallBatch(deps: BatchCallerDeps): (units: EnrichUnit[]) => Promise<Record<string, string>> {
  return async (units) => {
    if (units.length === 0) return {}
    const prompt = buildBatchPrompt(units, { withNote: deps.withNote })
    const raw = await deps.generate({ prompt, schema: schemaForLLM(!!deps.withNote) })

    // On revalide côté client même quand l'appelant annonce un schéma : un modèle rend
    // parfois un objet conforme en apparence dont un `text` manque. Écrire « undefined »
    // dans une fiche produit est pire que ne rien écrire.
    // ⚠ Pas de schéma zod ici : la réponse arrive déjà décodée par `parseLlmJson`. On
    // vérifie donc la FORME — une réponse sans `results` doit échouer bruyamment, pas
    // produire un lot vide qui se confondrait avec « rien à faire ».
    const parsed = raw as EnrichBatch
    if (!Array.isArray(parsed?.results)) throw new Error('Réponse du modèle sans « results ».')
    const { texts, notes } = mapBatch(parsed, units)
    if (deps.withNote && Object.keys(notes).length > 0) deps.onNotes?.(notes)

    const out: Record<string, string> = {}
    for (const unit of units) {
      const produced = texts[unitKey(unit)]
      if (!produced) continue
      const final = finalText(unit, produced)
      // Un gabarit dont un morceau indispensable manque rend une chaîne vide : ne rien
      // écrire vaut mieux qu'un nom amputé.
      if (final) out[unitKey(unit)] = final
    }
    return out
  }
}
