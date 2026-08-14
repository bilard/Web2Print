/**
 * Cloud Function : solde de crédit OpenAI, en direct.
 *
 * ⚠ Pourquoi côté serveur : les endpoints de FACTURATION d'OpenAI (contrairement à
 * `/v1/chat/completions`) ne répondent pas aux requêtes du navigateur — pas d'en-tête CORS.
 * La clé de l'utilisateur vit de toute façon en Firestore (`users/{uid}.apiKeys.overrides`),
 * comme pour `listModels` et `llmProxy`.
 *
 * ⚠⚠ OpenAI n'expose PAS de « solde » par une clé de projet ordinaire, contrairement à
 * DeepSeek ou OpenRouter. Deux portes, essayées dans cet ordre :
 *
 *   1. `GET /v1/dashboard/billing/credit_grants` → `total_available`. Historiquement
 *      accessible par clé API, aujourd'hui souvent réservé à une clé de SESSION : c'est
 *      pourquoi l'échec est une réponse normale, pas une erreur de la Function.
 *   2. `GET /v1/organization/costs` (clé ADMIN `sk-admin-…`) → la dépense du mois. Ce n'est
 *      pas le solde, mais c'est le chiffre d'OpenAI lui-même, et il vaut mieux que notre
 *      estimation interne.
 *
 * Quand les deux refusent, on renvoie `null` et la RAISON. Un écran qui dit « indisponible »
 * est honnête ; un écran qui affiche un budget saisi à la main en le faisant passer pour un
 * solde ne l'est pas.
 */
import { onCall, HttpsError } from 'firebase-functions/v2/https'
import * as logger from 'firebase-functions/logger'
import { getUserApiKey } from '../workflow/apiKeys'

export interface OpenAiBalance {
  /** Crédit restant en USD, `null` si l'API ne le donne pas à cette clé. */
  balanceUsd: number | null
  /** Crédit accordé / consommé, quand `credit_grants` répond. */
  grantedUsd: number | null
  usedUsd: number | null
  /** Dépense du mois calendaire selon OpenAI (clé admin seulement). */
  spentThisMonthUsd: number | null
  /** D'où vient le chiffre — ou `null` si aucune porte ne s'est ouverte. */
  source: 'credit_grants' | 'costs' | null
  /** Message d'OpenAI pour chaque tentative refusée : c'est lui qui dit quoi faire. */
  errors: { creditGrants?: string; costs?: string }
  fetchedAt: string
}

const TIMEOUT_MS = 15_000

async function getJson(url: string, key: string): Promise<{ ok: boolean; status: number; body: unknown; text: string }> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS)
  try {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${key}` }, signal: ctrl.signal })
    const text = await res.text()
    let body: unknown = null
    try { body = JSON.parse(text) } catch { /* réponse non JSON : le texte suffit au message */ }
    return { ok: res.ok, status: res.status, body, text }
  } finally {
    clearTimeout(timer)
  }
}

/** Message court et ACTIONNABLE tiré de la réponse d'OpenAI. */
function errorOf(r: { status: number; body: unknown; text: string }): string {
  const msg = (r.body as { error?: { message?: string } } | null)?.error?.message
  return `HTTP ${r.status} — ${(msg ?? r.text).slice(0, 200)}`
}

/** Début du mois calendaire courant, en secondes epoch (l'API Costs raisonne en UTC, comme
 *  le compteur `aiUsage/{uid}_{YYYY-MM}` — les deux mois coïncident donc). */
function monthStartEpochSec(now = new Date()): number {
  return Math.floor(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1) / 1000)
}

/** Somme des montants d'une réponse `/v1/organization/costs` (buckets → results → amount). */
export function sumCosts(body: unknown): number | null {
  const data = (body as { data?: { results?: { amount?: { value?: number } }[] }[] } | null)?.data
  if (!Array.isArray(data)) return null
  let total = 0
  for (const bucket of data) {
    for (const r of bucket.results ?? []) {
      if (typeof r.amount?.value === 'number') total += r.amount.value
    }
  }
  return total
}

export const getOpenAiBalance = onCall<undefined, Promise<OpenAiBalance>>(
  { timeoutSeconds: 30, memory: '256MiB', region: 'europe-west1' },
  async (req) => {
    if (!req.auth) throw new HttpsError('unauthenticated', 'Authentification Firebase requise')
    const key = await getUserApiKey(req.auth.uid, 'openai')
    if (!key) {
      throw new HttpsError('failed-precondition', 'Clé OpenAI absente du profil — Réglages → IA.')
    }

    const out: OpenAiBalance = {
      balanceUsd: null, grantedUsd: null, usedUsd: null, spentThisMonthUsd: null,
      source: null, errors: {}, fetchedAt: new Date().toISOString(),
    }

    try {
      const r = await getJson('https://api.openai.com/v1/dashboard/billing/credit_grants', key)
      if (r.ok) {
        const b = r.body as { total_available?: number; total_granted?: number; total_used?: number } | null
        if (typeof b?.total_available === 'number') {
          out.balanceUsd = b.total_available
          out.grantedUsd = typeof b.total_granted === 'number' ? b.total_granted : null
          out.usedUsd = typeof b.total_used === 'number' ? b.total_used : null
          out.source = 'credit_grants'
        } else {
          out.errors.creditGrants = `réponse sans total_available : ${r.text.slice(0, 160)}`
        }
      } else {
        out.errors.creditGrants = errorOf(r)
      }
    } catch (e) {
      out.errors.creditGrants = e instanceof Error ? e.message.slice(0, 200) : String(e)
    }

    // La dépense du mois se lit même quand le solde répond : les deux chiffres ne disent pas
    // la même chose, et celui d'OpenAI vaut mieux que notre estimation interne.
    try {
      const url = `https://api.openai.com/v1/organization/costs?start_time=${monthStartEpochSec()}&limit=31`
      const r = await getJson(url, key)
      if (r.ok) {
        const total = sumCosts(r.body)
        if (total !== null) {
          out.spentThisMonthUsd = total
          out.source ??= 'costs'
        } else {
          out.errors.costs = `réponse inattendue : ${r.text.slice(0, 160)}`
        }
      } else {
        out.errors.costs = errorOf(r)
      }
    } catch (e) {
      out.errors.costs = e instanceof Error ? e.message.slice(0, 200) : String(e)
    }

    if (out.source === null) {
      logger.info('[getOpenAiBalance] aucune porte ouverte', { uid: req.auth.uid, errors: out.errors })
    }
    return out
  },
)
