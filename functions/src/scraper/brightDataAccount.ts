/**
 * Cloud Function: récupère solde et consommation Bright Data en temps réel.
 *
 * Pourquoi un proxy serveur : la clé Bright Data est dans Firebase Secret
 * Manager (jamais browser) et l'API BD ne supporte pas CORS depuis browser.
 *
 * Endpoints interrogés :
 *   - GET https://api.brightdata.com/customer/balance
 *     → { balance, pending_balance } (requiert le scope "Account read")
 *   - GET https://api.brightdata.com/zone/cost?zone=<zone>&from=<YYYY-MM-DD>&to=<YYYY-MM-DD>
 *     → { period: { item: { cost, bw } } } (à sommer sur toutes les périodes)
 *
 * accountStatus dérivé : 'active' si /customer/balance répond OK, sinon null.
 * nextBillingDate non interrogée : pas exposée par l'API publique BD ;
 * heuristique = 1er du mois suivant.
 *
 * Auth : utilisateur Firebase authentifié uniquement.
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https'
import { defineSecret } from 'firebase-functions/params'
import { logger } from 'firebase-functions/v2'
import { getBrightDataToken } from './brightDataToken'

const BRIGHTDATA_API_TOKEN = defineSecret('BRIGHTDATA_API_TOKEN')
const BRIGHTDATA_ZONE = defineSecret('BRIGHTDATA_ZONE')

interface BrightDataAccountStats {
  /** Solde actuel en USD (null si /customer/balance refuse l'accès — token sans scope Account read). */
  balanceUsd: number | null
  /** Montant pending pour le prochain cycle de facturation. */
  pendingBalanceUsd: number | null
  /** Consommation USD ce mois calendaire. */
  consumedThisMonthUsd: number | null
  /** Bande passante consommée ce mois en bytes (informatif). */
  bandwidthThisMonthBytes: number | null
  /** Statut compte ('active' si balance call a réussi, sinon null). */
  accountStatus: string | null
  /** Date de la prochaine facture ISO 8601. Heuristique : 1er du mois suivant. */
  nextBillingDate: string
  /** True si nextBillingDate vient de l'API (toujours false : non exposée par BD). */
  nextBillingDateFromApi: boolean
  /** Marker du mois interrogé (YYYY-MM). */
  month: string
  /** ISO timestamp de la requête. */
  fetchedAt: string
  /** Erreurs par sous-appel pour debugging client. */
  errors: { balance?: string; zoneCost?: string }
  /** Réponse brute /customer/balance quand le call OK mais shape inattendu —
   *  permet de patcher le parser sans accès au Cloud Logging. */
  rawBalanceResponse?: unknown
}

const TIMEOUT_MS = 15_000

async function fetchJson<T>(url: string, token: string): Promise<T> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS)
  try {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
      signal: ctrl.signal,
    })
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      throw new Error(`HTTP ${res.status}: ${body.slice(0, 160)}`)
    }
    return await res.json() as T
  } finally {
    clearTimeout(timer)
  }
}

function isoMonthBounds(): { from: string; to: string; month: string } {
  const now = new Date()
  const y = now.getUTCFullYear()
  const m = now.getUTCMonth()
  const pad = (n: number) => String(n).padStart(2, '0')
  const firstOfMonth = `${y}-${pad(m + 1)}-01`
  const lastOfMonth = new Date(Date.UTC(y, m + 1, 0)).toISOString().slice(0, 10)
  return { from: firstOfMonth, to: lastOfMonth, month: `${y}-${pad(m + 1)}` }
}

/** Cherche récursivement le 1er nombre dont la clé matche une regex (profondeur ≤ 6). */
function findNumber(obj: unknown, keyRegex: RegExp, depth = 0): number | undefined {
  if (depth > 6 || !obj || typeof obj !== 'object') return undefined
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    if (typeof v === 'number' && keyRegex.test(k)) return v
  }
  for (const v of Object.values(obj as Record<string, unknown>)) {
    if (v && typeof v === 'object') {
      const sub = findNumber(v, keyRegex, depth + 1)
      if (sub !== undefined) return sub
    }
  }
  return undefined
}

/** Heuristique : 1er du mois suivant (Bright Data facture mensuellement). */
function nextMonthFirstDay(): string {
  const now = new Date()
  const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1))
  return next.toISOString().slice(0, 10)
}

export const getBrightDataAccount = onCall<undefined, Promise<BrightDataAccountStats>>(
  {
    secrets: [BRIGHTDATA_API_TOKEN, BRIGHTDATA_ZONE],
    timeoutSeconds: 30,
    memory: '256MiB',
    region: 'europe-west1',
  },
  async (req) => {
    if (!req.auth) {
      throw new HttpsError('unauthenticated', 'Authentification Firebase requise')
    }
    const token = await getBrightDataToken(BRIGHTDATA_API_TOKEN.value())
    const zone = BRIGHTDATA_ZONE.value() || 'web_unlocker1'
    if (!token) {
      throw new HttpsError('failed-precondition', 'BRIGHTDATA_API_TOKEN non configuré (ni dans Firestore config/brightdata.apiToken, ni dans Secret Manager)')
    }

    const { from, to, month } = isoMonthBounds()
    const fetchedAt = new Date().toISOString()
    const errors: BrightDataAccountStats['errors'] = {}

    let balanceUsd: number | null = null
    let pendingBalanceUsd: number | null = null
    let consumedThisMonthUsd: number | null = null
    let bandwidthThisMonthBytes: number | null = null
    let rawBalanceResponse: unknown = undefined

    // /customer/balance — shape officiel : { balance: number, pending_balance: number }
    // (cf src/commands/budget.ts dans github.com/brightdata/cli). Requiert le scope
    // "Account read" sur le token API.
    try {
      const data = await fetchJson<Record<string, unknown>>(
        'https://api.brightdata.com/customer/balance',
        token,
      )
      logger.info('[brightdata-account] /customer/balance response', { data })
      const directBalance = typeof data.balance === 'number' ? data.balance : null
      const directPending = typeof data.pending_balance === 'number' ? data.pending_balance : null
      balanceUsd = directBalance ?? findNumber(data, /(^|_)balance$/i) ?? findNumber(data, /total[_]?balance|account[_]?balance|current[_]?balance|funds|wallet|credit|amount/i) ?? null
      pendingBalanceUsd = directPending ?? findNumber(data, /pending[_]?balance|next[_]?billing[_]?amount/i) ?? null
      // Si l'extraction échoue, on remonte le shape brut pour debug visuel
      if (balanceUsd === null) {
        rawBalanceResponse = data
      }
    } catch (e) {
      errors.balance = e instanceof Error ? e.message.slice(0, 160) : String(e)
    }

    // /zone/cost retourne un objet nested { period: { item: { cost, bw } } }
    // qu'il faut SOMMER (cf sum_zone_cost dans la CLI BD).
    const zoneCostUrl = `https://api.brightdata.com/zone/cost?zone=${encodeURIComponent(zone)}&from=${from}&to=${to}`
    try {
      const data = await fetchJson<Record<string, unknown>>(zoneCostUrl, token)
      let totalCost = 0
      let totalBw = 0
      let foundAny = false
      for (const period of Object.values(data)) {
        if (!period || typeof period !== 'object') continue
        for (const item of Object.values(period as Record<string, unknown>)) {
          if (!item || typeof item !== 'object') continue
          const it = item as Record<string, unknown>
          if (typeof it.cost === 'number' && Number.isFinite(it.cost)) {
            totalCost += it.cost
            foundAny = true
          }
          if (typeof it.bw === 'number' && Number.isFinite(it.bw)) {
            totalBw += it.bw
          }
        }
      }
      if (foundAny) {
        consumedThisMonthUsd = totalCost
        bandwidthThisMonthBytes = totalBw
      } else {
        const cost = findNumber(data, /^cost$/i)
        if (typeof cost === 'number') consumedThisMonthUsd = cost
      }
    } catch (e) {
      errors.zoneCost = e instanceof Error ? e.message.slice(0, 160) : String(e)
    }

    // Statut compte : dérivé du succès de /customer/balance (BD n'expose pas
    // d'endpoint statut public).
    const accountStatus = errors.balance ? null : 'active'

    // Date prochaine facture : non exposée par l'API publique BD,
    // heuristique = 1er du mois suivant (BD facture mensuellement).
    const nextBillingDate = nextMonthFirstDay()

    logger.info('[brightdata-account] fetched', {
      balanceUsd, pendingBalanceUsd, consumedThisMonthUsd, accountStatus, nextBillingDate, errors,
    })

    return {
      balanceUsd,
      pendingBalanceUsd,
      consumedThisMonthUsd,
      bandwidthThisMonthBytes,
      accountStatus,
      nextBillingDate,
      nextBillingDateFromApi: false,
      month,
      fetchedAt,
      errors,
      ...(rawBalanceResponse !== undefined ? { rawBalanceResponse } : {}),
    }
  },
)
