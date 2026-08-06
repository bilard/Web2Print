import { debugLog } from '@/lib/debugLog'
import { parseFirecrawlCredits, FIRECRAWL_LOW_CREDITS } from '@/lib/firecrawlCredits'
import { listBrowserActWorkflows } from '@/features/scraping/core/browserAct'

/**
 * API key management: localStorage override > .env fallback
 * Keys are stored in localStorage so they persist across sessions
 * without needing to rebuild the app.
 */

import { t, type TranslationKey } from '@/lib/i18n'

const STORAGE_PREFIX = 'designstudio_apikey_'

interface ApiKeyConfig {
  id: string
  /** ⚠️ CLÉS de traduction, pas du texte : ce registre alimente Réglages ET
   *  l'assistant d'onboarding, tous deux traduits. */
  labelKey: TranslationKey
  envVar: string
  descriptionKey: TranslationKey
  /** Liens externes vers la console du provider — affichés sous chaque ligne dans Settings.
   *  - `manage` : page où l'utilisateur trouve/régénère sa clé API
   *  - `billing` : page d'achat de crédits / gestion d'abonnement */
  links?: { manage?: string; billing?: string }
}

export const API_KEYS: ApiKeyConfig[] = [
  {
    id: 'gemini',
    labelKey: 'apikeys.gemini.label',
    envVar: 'VITE_GEMINI_API_KEY',
    descriptionKey: 'apikeys.gemini.desc',
    links: {
      manage: 'https://aistudio.google.com/app/apikey',
      billing: 'https://console.cloud.google.com/billing',
    },
  },
  {
    id: 'anthropic',
    labelKey: 'apikeys.anthropic.label',
    envVar: 'VITE_ANTHROPIC_API_KEY',
    descriptionKey: 'apikeys.anthropic.desc',
    links: {
      manage: 'https://console.anthropic.com/settings/keys',
      billing: 'https://console.anthropic.com/settings/billing',
    },
  },
  {
    id: 'openai',
    labelKey: 'apikeys.openai.label',
    envVar: 'VITE_OPENAI_API_KEY',
    descriptionKey: 'apikeys.openai.desc',
    links: {
      manage: 'https://platform.openai.com/api-keys',
      billing: 'https://platform.openai.com/settings/organization/billing/overview',
    },
  },
  {
    id: 'deepseek',
    labelKey: 'apikeys.deepseek.label',
    envVar: 'VITE_DEEPSEEK_API_KEY',
    descriptionKey: 'apikeys.deepseek.desc',
    links: {
      manage: 'https://platform.deepseek.com/api_keys',
      billing: 'https://platform.deepseek.com/top_up',
    },
  },
  {
    id: 'qwen',
    labelKey: 'apikeys.qwen.label',
    envVar: 'VITE_QWEN_API_KEY',
    descriptionKey: 'apikeys.qwen.desc',
    links: {
      manage: 'https://dashscope.console.aliyun.com/apiKey',
      billing: 'https://billing-cost.console.aliyun.com/finance/expense-report',
    },
  },
  {
    id: 'kimi',
    labelKey: 'apikeys.kimi.label',
    envVar: 'VITE_KIMI_API_KEY',
    descriptionKey: 'apikeys.kimi.desc',
    links: {
      manage: 'https://platform.moonshot.cn/console/api-keys',
      billing: 'https://platform.moonshot.cn/console/account',
    },
  },
  {
    id: 'glm',
    labelKey: 'apikeys.glm.label',
    envVar: 'VITE_GLM_API_KEY',
    descriptionKey: 'apikeys.glm.desc',
    links: {
      manage: 'https://z.ai/manage-apikey/apikey-list',
      billing: 'https://z.ai/manage-apikey/apikey-list',
    },
  },
  {
    id: 'openrouter',
    labelKey: 'apikeys.openrouter.label',
    envVar: 'VITE_OPENROUTER_API_KEY',
    descriptionKey: 'apikeys.openrouter.desc',
    links: {
      manage: 'https://openrouter.ai/settings/keys',
      billing: 'https://openrouter.ai/credits',
    },
  },
  {
    id: 'firebase_api',
    labelKey: 'apikeys.firebaseApi.label',
    envVar: 'VITE_FIREBASE_API_KEY',
    descriptionKey: 'apikeys.firebaseApi.desc',
  },
  {
    id: 'firebase_project',
    labelKey: 'apikeys.firebaseProject.label',
    envVar: 'VITE_FIREBASE_PROJECT_ID',
    descriptionKey: 'apikeys.firebaseProject.desc',
  },
  {
    id: 'firebase_storage',
    labelKey: 'apikeys.firebaseStorage.label',
    envVar: 'VITE_FIREBASE_STORAGE_BUCKET',
    descriptionKey: 'apikeys.firebaseStorage.desc',
  },
  {
    id: 'google_vision',
    labelKey: 'apikeys.googleVision.label',
    envVar: 'VITE_GOOGLE_VISION_API_KEY',
    descriptionKey: 'apikeys.googleVision.desc',
    links: {
      manage: 'https://console.cloud.google.com/apis/credentials',
      billing: 'https://console.cloud.google.com/billing',
    },
  },
  {
    id: 'removebg',
    labelKey: 'apikeys.removebg.label',
    envVar: 'VITE_REMOVEBG_KEY',
    descriptionKey: 'apikeys.removebg.desc',
    links: {
      manage: 'https://www.remove.bg/dashboard',
      billing: 'https://www.remove.bg/pricing',
    },
  },
  {
    id: 'jina',
    labelKey: 'apikeys.jina.label',
    envVar: 'VITE_JINA_API_KEY',
    descriptionKey: 'apikeys.jina.desc',
    links: {
      manage: 'https://jina.ai/api-dashboard/key-manager',
      billing: 'https://jina.ai/api-dashboard',
    },
  },
  {
    id: 'firecrawl',
    labelKey: 'apikeys.firecrawl.label',
    envVar: 'VITE_FIRECRAWL_API_KEY',
    descriptionKey: 'apikeys.firecrawl.desc',
    links: {
      manage: 'https://www.firecrawl.dev/app/api-keys',
      billing: 'https://www.firecrawl.dev/app/t/LsorYp6HkrX/usage',
    },
  },
  {
    id: 'browseract',
    labelKey: 'apikeys.browseract.label',
    envVar: 'VITE_BROWSERACT_API_KEY',
    descriptionKey: 'apikeys.browseract.desc',
    links: {
      manage: 'https://www.browseract.com/dashboard',
      billing: 'https://www.browseract.com/pricing',
    },
  },
  {
    id: 'scrapfly',
    labelKey: 'apikeys.scrapfly.label',
    envVar: 'VITE_SCRAPFLY_API_KEY',
    descriptionKey: 'apikeys.scrapfly.desc',
    links: {
      manage: 'https://scrapfly.io/dashboard/api',
      billing: 'https://scrapfly.io/dashboard/billing',
    },
  },
  {
    id: 'higgsfield',
    labelKey: 'apikeys.higgsfield.label',
    envVar: 'VITE_HIGGSFIELD_API_KEY',
    descriptionKey: 'apikeys.higgsfield.desc',
    links: {
      manage: 'https://cloud.higgsfield.ai/api-keys',
      billing: 'https://cloud.higgsfield.ai/credits',
    },
  },
]

/** Get an API key value: localStorage override, then env fallback */
export function getApiKey(id: string): string {
  const stored = localStorage.getItem(`${STORAGE_PREFIX}${id}`)
  if (stored) return stored

  const config = API_KEYS.find((k) => k.id === id)
  if (!config) return ''

  return (import.meta.env[config.envVar] as string) ?? ''
}

/** Save an API key override to localStorage AND notify Firestore sync (if active) */
export function setApiKey(id: string, value: string) {
  if (value.trim()) {
    localStorage.setItem(`${STORAGE_PREFIX}${id}`, value.trim())
  } else {
    localStorage.removeItem(`${STORAGE_PREFIX}${id}`)
  }
  // Notifie le sync hook (`useApiKeysSync`) qu'une clé a changé → push Firestore debouncé.
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('apikeys:updated', { detail: { id } }))
  }
}

/** Check if a key is using localStorage override vs env default */
export function isApiKeyOverridden(id: string): boolean {
  return localStorage.getItem(`${STORAGE_PREFIX}${id}`) !== null
}

/** Reset a key to use the env default */
export function resetApiKey(id: string) {
  localStorage.removeItem(`${STORAGE_PREFIX}${id}`)
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('apikeys:updated', { detail: { id } }))
  }
}

/** Récupère les liens externes (gestion clé / facturation) du provider. */
export function getApiKeyLinks(id: string): { manage?: string; billing?: string } | undefined {
  return API_KEYS.find((k) => k.id === id)?.links
}

/** Get the env default for display (masked) */
export function getEnvDefault(id: string): string {
  const config = API_KEYS.find((k) => k.id === id)
  if (!config) return ''
  const val = (import.meta.env[config.envVar] as string) ?? ''
  return val ? maskKey(val) : t('apitest.notSet')
}

/** Mask a key: show first 8 + last 4 chars */
function maskKey(key: string): string {
  if (key.length <= 12) return '••••••••'
  return key.slice(0, 8) + '••••' + key.slice(-4)
}

export type ApiTestResult = 'ok' | 'error' | 'empty'

/** URL d'action proposée à l'utilisateur (ex: page de recharge en cas de
 *  crédits épuisés). Le SettingsPanel affiche un bouton externe quand fourni. */
export interface ApiTestAction {
  labelKey: TranslationKey
  url: string
}

/** Test connectivity for an API key */
export async function testApiKey(id: string): Promise<{ status: ApiTestResult; message: string; action?: ApiTestAction }> {
  const key = getApiKey(id)
  if (!key) return { status: 'empty', message: t('apitest.undefined') }

  try {
    if (id === 'gemini') {
      // Test Image IA: list models endpoint (lightweight)
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models?key=${key}`,
      )
      if (res.ok) {
        return { status: 'ok', message: t('apitest.connected.gemini') }
      }
      if (res.status === 401 || res.status === 403) {
        return { status: 'error', message: 'Clé invalide ou non autorisée' }
      }
      return { status: 'error', message: `Erreur ${res.status}` }
    }

    if (id === 'firebase_api') {
      // Test Firebase: check identitytoolkit endpoint
      const res = await fetch(
        `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${key}`,
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' },
      )
      // 400 = "MISSING_ID_TOKEN" is expected (means the key works)
      if (res.ok || res.status === 400) {
        return { status: 'ok', message: t('apitest.connected.firebase') }
      }
      return { status: 'error', message: 'Clé invalide' }
    }

    if (id === 'firebase_project') {
      // Just validate format
      if (/^[a-z0-9-]+$/.test(key)) {
        return { status: 'ok', message: `Projet : ${key}` }
      }
      return { status: 'error', message: 'Format invalide' }
    }

    if (id === 'firebase_storage') {
      if (key.includes('.')) {
        return { status: 'ok', message: `Bucket : ${key}` }
      }
      return { status: 'error', message: 'Format invalide' }
    }

    if (id === 'deepseek') {
      // Test DeepSeek: list models endpoint (OpenAI-compatible)
      const res = await fetch('https://api.deepseek.com/v1/models', {
        headers: { Authorization: `Bearer ${key}` },
      })
      if (res.ok) {
        return { status: 'ok', message: t('apitest.connected.deepseek') }
      }
      if (res.status === 401 || res.status === 403) {
        return { status: 'error', message: 'Clé invalide ou non autorisée' }
      }
      return { status: 'error', message: `Erreur ${res.status}` }
    }

    if (id === 'qwen') {
      // Test Qwen via DashScope OpenAI-compatible endpoint
      const res = await fetch(
        'https://dashscope-intl.aliyuncs.com/compatible-mode/v1/models',
        { headers: { Authorization: `Bearer ${key}` } },
      )
      if (res.ok) {
        return { status: 'ok', message: t('apitest.connected.qwen') }
      }
      if (res.status === 401 || res.status === 403) {
        return { status: 'error', message: 'Clé invalide ou non autorisée' }
      }
      return { status: 'error', message: `Erreur ${res.status}` }
    }

    if (id === 'openrouter') {
      // OpenRouter : /api/v1/auth/key renvoie le solde restant + la limite.
      // Le format est { data: { label, usage, limit, limit_remaining, ... } }.
      const res = await fetch('https://openrouter.ai/api/v1/auth/key', {
        headers: { Authorization: `Bearer ${key}` },
      })
      if (res.ok) {
        const json = await res.json() as { data?: { limit?: number; limit_remaining?: number; usage?: number } }
        const remaining = json.data?.limit_remaining
        const limit = json.data?.limit
        const usage = json.data?.usage
        const buyAction: ApiTestAction = { labelKey: 'apikeys.buyCredits', url: 'https://openrouter.ai/credits' }
        if (typeof remaining === 'number') {
          const totalSuffix = typeof limit === 'number' ? ` / $${limit}` : ''
          if (remaining <= 0) return { status: 'error', message: t('apitest.credits.exhausted', { suffix: totalSuffix }), action: buyAction }
          if (remaining < 0.5) return { status: 'ok', message: `⚠ $${remaining.toFixed(2)}${totalSuffix} restants`, action: buyAction }
          return { status: 'ok', message: t('apitest.credits.remaining', { remaining: remaining.toFixed(2), suffix: totalSuffix }) }
        }
        if (typeof usage === 'number') return { status: 'ok', message: t('apitest.usage', { usage: usage.toFixed(4) }) }
        return { status: 'ok', message: t('apitest.connected.openrouter') }
      }
      if (res.status === 401 || res.status === 403) {
        return { status: 'error', message: 'Clé invalide ou non autorisée' }
      }
      return { status: 'error', message: `Erreur ${res.status}` }
    }

    if (id === 'kimi') {
      // Kimi Code — endpoint OpenAI-compatible. Pas de /models documenté,
      // donc on tape un completion minimal pour valider la clé.
      const res = await fetch('https://api.kimi.com/coding/v1/models', {
        headers: { Authorization: `Bearer ${key}` },
      })
      if (res.ok) {
        return { status: 'ok', message: t('apitest.connected.kimi') }
      }
      if (res.status === 401 || res.status === 403) {
        return { status: 'error', message: 'Clé invalide ou non autorisée' }
      }
      // 404 sur /models = endpoint inexistant mais clé probablement valide
      if (res.status === 404) {
        return { status: 'ok', message: 'Clé acceptée (modèle fixe : kimi-for-coding)' }
      }
      return { status: 'error', message: `Erreur ${res.status}` }
    }

    if (id === 'glm') {
      // GLM (Z.ai) — endpoint OpenAI-compatible. On liste les modèles pour valider
      // la clé ; 404 = endpoint absent mais clé probablement valide (comme Kimi).
      const res = await fetch('https://api.z.ai/api/paas/v4/models', {
        headers: { Authorization: `Bearer ${key}` },
      })
      if (res.ok) {
        return { status: 'ok', message: t('apitest.connected.glm') }
      }
      if (res.status === 401 || res.status === 403) {
        return { status: 'error', message: 'Clé invalide ou non autorisée' }
      }
      if (res.status === 404) {
        return { status: 'ok', message: 'Clé acceptée (endpoint /models indisponible)' }
      }
      return { status: 'error', message: `Erreur ${res.status}` }
    }

    if (id === 'google_vision') {
      // Test Vision : annotate avec une requête vide — 200 si la clé est valide,
      // 400 INVALID_ARGUMENT compte aussi (la clé a passé l'auth), 403 = invalide.
      const res = await fetch(`https://vision.googleapis.com/v1/images:annotate?key=${key}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requests: [] }),
      })
      if (res.ok || res.status === 400) {
        return { status: 'ok', message: t('apitest.connected.vision') }
      }
      if (res.status === 401 || res.status === 403) {
        return { status: 'error', message: 'Clé invalide ou API Vision non activée sur le projet GCP' }
      }
      return { status: 'error', message: `Erreur ${res.status}` }
    }

    if (id === 'removebg') {
      // Test Remove.bg: account endpoint
      const res = await fetch('https://api.remove.bg/v1.0/account', {
        headers: { 'X-Api-Key': key },
      })
      if (res.ok) {
        const data = await res.json()
        const credits = data?.data?.attributes?.credits?.total ?? '?'
        return { status: 'ok', message: t('apitest.credits.count', { credits }) }
      }
      if (res.status === 403) return { status: 'error', message: 'Clé invalide' }
      return { status: 'error', message: `Erreur ${res.status}` }
    }

    if (id === 'firecrawl') {
      // Test Firecrawl: team usage endpoint (lightweight, vérifie auth). Le parsing du
      // solde est partagé avec la carte de consommation du panneau live
      // (`parseFirecrawlCredits`) — deux lectures divergentes de la même réponse
      // afficheraient deux soldes contradictoires.
      const res = await fetch('https://api.firecrawl.dev/v2/team/credit-usage', {
        headers: { 'Authorization': 'Bearer ' + key },
      })
      if (res.ok) {
        const json = await res.json() as unknown
        // Log pour debug si parsing échoue (visible dans la console navigateur)
        debugLog('[firecrawl] credit-usage response:', json)

        const { remaining, total } = parseFirecrawlCredits(json)
        const buyAction: ApiTestAction = { labelKey: 'apikeys.buyCredits', url: 'https://www.firecrawl.dev/pricing' }
        if (typeof remaining === 'number') {
          const totalSuffix = typeof total === 'number' ? ` / ${total}` : ''
          if (remaining === 0) return { status: 'error', message: t('apitest.credits.zero', { suffix: totalSuffix }), action: buyAction }
          if (remaining < FIRECRAWL_LOW_CREDITS) return { status: 'ok', message: `⚠ ${t('apitest.credits.left', { remaining, suffix: totalSuffix })}`, action: buyAction }
          return { status: 'ok', message: t('apitest.credits.left', { remaining, suffix: totalSuffix }) }
        }
        return { status: 'ok', message: t('apitest.credits.noBalance') }
      }
      if (res.status === 401 || res.status === 403) return { status: 'error', message: 'Clé invalide' }
      if (res.status === 402) return { status: 'error', message: t('apitest.credits.http402'), action: { labelKey: 'apikeys.buyCredits', url: 'https://www.firecrawl.dev/pricing' } }
      return { status: 'error', message: `Erreur ${res.status}` }
    }

    if (id === 'browseract') {
      // Ping authentifié : lister les bots du compte. Distingue les trois cas qui comptent
      // — clé refusée, compte sans bot (rien à exécuter), compte utilisable.
      const workflows = await listBrowserActWorkflows(key, 100)
      if (workflows == null) return { status: 'error', message: 'Clé refusée par api.browseract.com' }
      if (workflows.length === 0) {
        return {
          status: 'error',
          message: t('apitest.noBot'),
          action: { labelKey: 'apitest.createBot', url: 'https://www.browseract.com/dashboard' },
        }
      }
      // Le NOM ne suffit pas : c'est l'ID que réclament la carte de site et le node.
      const named = workflows.slice(0, 3).map((w) => `${w.name} (${w.id})`).join(' · ')
      return { status: 'ok', message: t('apitest.bots', { count: workflows.length, names: named, more: workflows.length > 3 ? ' …' : '' }) }
    }

    if (id === 'scrapfly') {
      // ScrapFly /account est CORS-bloqué côté navigateur — pas de test live possible.
      // Format-only validation : la clé doit commencer par scp-live- ou scp-test-.
      // Note : la clé est inactive tant qu'on ne wire pas la Cloud Function proxy.
      if (/^scp-(live|test)-[a-f0-9]{32,}$/i.test(key)) {
        return { status: 'ok', message: t('apitest.formatValid.cf') }
      }
      return { status: 'error', message: 'Format attendu : scp-live-... ou scp-test-...' }
    }

    if (id === 'higgsfield') {
      // Higgsfield : SDK server-side only (clé refusée côté navigateur). Pas de test
      // live possible ici → validation de format « KEY_ID:KEY_SECRET ».
      if (/^[^\s:]+:[^\s:]+$/.test(key.trim())) {
        return { status: 'ok', message: t('apitest.formatValid.higgsfield') }
      }
      return { status: 'error', message: 'Format attendu : KEY_ID:KEY_SECRET' }
    }

    return { status: 'ok', message: 'OK' }
  } catch {
    return { status: 'error', message: t('apitest.networkError') }
  }
}
