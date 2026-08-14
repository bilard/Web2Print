// Consommation LLM des runs SERVEUR (cron, exécutions planifiées), écrite au même endroit
// et dans la même forme que celle du navigateur : `aiUsage/{uid}_{YYYY-MM}`.
//
// ⚠⚠ Raison d'être : le moteur LLM du cron n'écrivait RIEN. Tout ce que consommait une
// exécution planifiée était invisible — absent du bloc « Coûts des modèles » du Suivi,
// absent de l'écran Finances, et absent du plafond mensuel que `llmProxy` fait respecter
// (`users/{uid}.aiSettings.monthlyBudgetUsd` comparé à ce même document). Un budget qui
// ignore la moitié de la dépense n'est pas un budget.
//
// ⚠ La forme du document est celle du client (`src/features/stats/aiUsageTracking.ts`) :
// `total.costUsd`, `byProvider.<p>.{tokensIn,tokensOut,costUsd}` et
// `byProvider.<p>.byModel.<id>.{…}`, tous en `increment`. Deux écrivains — le navigateur et
// le cron — sur le même document : l'incrément est ce qui rend la concurrence sûre.
import { getFirestore, FieldValue } from 'firebase-admin/firestore'
import { pricingOf, costOf } from './modelPricing'

/** Providers tels que le CLIENT les range. Le serveur connaît un alias `anthropic` pour le
 *  même fournisseur : écrire sous ce nom créerait une neuvième colonne que l'écran
 *  n'affiche pas — la dépense disparaîtrait une seconde fois. */
const PROVIDER_ALIASES: Record<string, string> = { anthropic: 'claude' }

const CLIENT_PROVIDERS = new Set([
  'claude', 'gemini', 'openai', 'deepseek', 'qwen', 'kimi', 'glm', 'openrouter',
])

/** Nom de provider écrit en base : celui du client, jamais un alias serveur. */
export function normalizeProvider(provider: string): string | null {
  const p = PROVIDER_ALIASES[provider] ?? provider
  return CLIENT_PROVIDERS.has(p) ? p : null
}

/** Mois du document de consommation (UTC — même clé que le client). */
export function usageMonth(now: Date): string {
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`
}

export interface ServerUsage {
  uid: string
  provider: string
  model: string
  tokensIn: number
  tokensOut: number
  /** Injectable pour les tests ; par défaut l'heure courante. */
  now?: Date
}

/**
 * Le document d'incréments, tel qu'il part chez Firestore. Séparé de l'écriture pour être
 * VÉRIFIABLE : c'est la forme — les noms de champs et surtout les clés de modèle — qui doit
 * coïncider avec ce qu'écrit le navigateur, et une erreur là-dessus ne casse rien, elle
 * dédouble simplement les lignes en silence.
 */
export function buildUsageUpdate(
  provider: string, model: string, tokensIn: number, tokensOut: number, costUsd: number,
): Record<string, unknown> {
  // ⚠⚠ L'identifiant part BRUT, points compris. Un objet imbriqué passé à `set()` écrit des
  // CLÉS DE MAP, pas des chemins de champ : le point n'y est pas un séparateur, et le
  // client écrit déjà `gemini-3.1-pro-preview` tel quel (vérifié en base). L'échapper
  // créerait une seconde entrée pour le même modèle — `gemini-3_1-pro-preview` —, que le
  // catalogue ne reconnaîtrait pas et que l'écran afficherait « tarif inconnu ».
  const modelKey = model || 'inconnu'
  return {
    total: { costUsd: FieldValue.increment(costUsd) },
    byProvider: {
      [provider]: {
        tokensIn: FieldValue.increment(tokensIn),
        tokensOut: FieldValue.increment(tokensOut),
        costUsd: FieldValue.increment(costUsd),
        byModel: {
          [modelKey]: {
            tokensIn: FieldValue.increment(tokensIn),
            tokensOut: FieldValue.increment(tokensOut),
            costUsd: FieldValue.increment(costUsd),
          },
        },
      },
    },
  }
}

/**
 * Ajoute une consommation au compteur mensuel. Ne jette JAMAIS : un run ne doit pas
 * échouer parce que sa comptabilité n'a pas pu s'écrire — la dépense a déjà eu lieu, et
 * perdre le travail par-dessus serait payer deux fois.
 *
 * Un modèle sans tarif connu écrit ses TOKENS avec un coût nul : c'est exactement ce que
 * fait le client, et l'écran de suivi sait dénoncer ce cas plutôt que de le lire comme une
 * gratuité. Le silence, lui, ne se rattrape pas.
 */
export async function recordServerAiUsage(u: ServerUsage): Promise<void> {
  const provider = normalizeProvider(u.provider)
  if (!provider || !u.uid) return
  if (u.tokensIn <= 0 && u.tokensOut <= 0) return
  const pricing = pricingOf(u.model)
  const cost = pricing ? costOf(u.tokensIn, u.tokensOut, pricing) : 0
  const month = usageMonth(u.now ?? new Date())
  try {
    await getFirestore()
      .doc(`aiUsage/${u.uid}_${month}`)
      .set(buildUsageUpdate(provider, u.model, u.tokensIn, u.tokensOut, cost), { merge: true })
  } catch (e) {
    console.warn('[aiUsage] écriture du compteur impossible :', e instanceof Error ? e.message.slice(0, 200) : e)
  }
}
