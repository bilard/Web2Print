// Appel du modèle pour composer le mail de veille, côté NAVIGATEUR.
//
// Tout ce qui décide du contenu — la consigne en tête, les faits transmis, les contraintes
// de rendu, l'acceptation du HTML produit — vit dans `priceWatch/reportCompose.ts`, dupliqué
// côté functions. Ici il ne reste que la mécanique d'appel, qui diffère légitimement entre
// le navigateur (cascade `generateJson`, clés de l'utilisateur connecté) et le cron.
import { z } from 'zod'
import { generateJson } from '@/features/ai/llmRouter'
import { buildComposePrompt, normalizeComposedHtml, withKpiBanner } from '@/features/priceWatch/reportCompose'
import type { StoredReport } from '@/features/priceWatch/reportStore'
import type { PriceEvent } from '@/features/priceWatch/priceEvents'

const schema = z.object({ html: z.string().min(1) })

/** Le format de réponse est annoncé par `generateJson` (SCHEMA_INSTRUCTION_HEADER). */
const schemaForLLM = {
  type: 'object',
  properties: { html: { type: 'string', description: 'Le corps du mail, en HTML' } },
  required: ['html'],
}

/**
 * Compose le corps du mail selon la consigne. Rend `null` si le modèle échoue — l'appelant
 * retombe alors sur le rapport standard : mieux vaut le mail habituel qu'aucun mail.
 */
export async function composeReportHtml(
  report: StoredReport,
  prompt: string,
  moves: PriceEvent[],
  onProvider?: (info: { provider: string; model: string }) => void,
): Promise<string | null> {
  try {
    const out = await generateJson({
      task: 'priceWatch.analysis',
      prompt: buildComposePrompt(report, prompt, moves),
      schema,
      schemaForLLM,
      version: 'pw-report-compose-1',
      // Un corps de mail entièrement en styles inline pèse 20 à 30 Ko, et chaque guillemet
      // de `style="…"` est ré-échappé dans la chaîne JSON : au plafond ordinaire de 8192
      // tokens la réponse se coupe en plein milieu, et une réponse coupée n'est plus du
      // JSON valide — donc un échec MUET, indiscernable d'un modèle injoignable.
      maxTokens: 32_000,
      onProviderUsed: onProvider ? (i) => onProvider({ provider: i.provider, model: i.model }) : undefined,
    })
    // ⚠ Les indices du cockpit, TOUJOURS, quelle que soit la consigne : deux mails de deux
    // semaines doivent se comparer d'un coup d'œil. Ils ne passent pas par le modèle.
    return withKpiBanner(normalizeComposedHtml(out.html), report)
  } catch {
    return null
  }
}
