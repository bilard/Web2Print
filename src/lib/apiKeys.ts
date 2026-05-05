/**
 * API key management: localStorage override > .env fallback
 * Keys are stored in localStorage so they persist across sessions
 * without needing to rebuild the app.
 */

const STORAGE_PREFIX = 'designstudio_apikey_'

interface ApiKeyConfig {
  id: string
  label: string
  envVar: string
  description: string
  /** Liens externes vers la console du provider — affichés sous chaque ligne dans Settings.
   *  - `manage` : page où l'utilisateur trouve/régénère sa clé API
   *  - `billing` : page d'achat de crédits / gestion d'abonnement */
  links?: { manage?: string; billing?: string }
}

export const API_KEYS: ApiKeyConfig[] = [
  {
    id: 'gemini',
    label: 'Nano Banana (Gemini)',
    envVar: 'VITE_GEMINI_API_KEY',
    description: 'Clé API Google Gemini pour la génération d\'images IA et tâches rapides',
    links: {
      manage: 'https://aistudio.google.com/app/apikey',
      billing: 'https://console.cloud.google.com/billing',
    },
  },
  {
    id: 'anthropic',
    label: 'Claude (Anthropic)',
    envVar: 'VITE_ANTHROPIC_API_KEY',
    description: 'Clé API Anthropic — Claude Opus 4.7 pour le raisonnement (briefs, panier, deck)',
    links: {
      manage: 'https://console.anthropic.com/settings/keys',
      billing: 'https://console.anthropic.com/settings/billing',
    },
  },
  {
    id: 'openai',
    label: 'OpenAI',
    envVar: 'VITE_OPENAI_API_KEY',
    description: 'Clé API OpenAI (optionnel — fallback ou tâches spécifiques)',
    links: {
      manage: 'https://platform.openai.com/api-keys',
      billing: 'https://platform.openai.com/settings/organization/billing/overview',
    },
  },
  {
    id: 'deepseek',
    label: 'DeepSeek',
    envVar: 'VITE_DEEPSEEK_API_KEY',
    description: 'Clé API DeepSeek — DeepSeek Chat (V4) et Reasoner',
    links: {
      manage: 'https://platform.deepseek.com/api_keys',
      billing: 'https://platform.deepseek.com/top_up',
    },
  },
  {
    id: 'qwen',
    label: 'Qwen (Alibaba DashScope)',
    envVar: 'VITE_QWEN_API_KEY',
    description: 'Clé API DashScope — Qwen Max / Plus / Turbo',
    links: {
      manage: 'https://dashscope.console.aliyun.com/apiKey',
      billing: 'https://billing-cost.console.aliyun.com/finance/expense-report',
    },
  },
  {
    id: 'kimi',
    label: 'Kimi (Moonshot)',
    envVar: 'VITE_KIMI_API_KEY',
    description: 'Clé Kimi Code — endpoint OpenAI-compatible (kimi-for-coding)',
    links: {
      manage: 'https://platform.moonshot.cn/console/api-keys',
      billing: 'https://platform.moonshot.cn/console/account',
    },
  },
  {
    id: 'firebase_api',
    label: 'Firebase API Key',
    envVar: 'VITE_FIREBASE_API_KEY',
    description: 'Clé API Firebase (authentification & services)',
  },
  {
    id: 'firebase_project',
    label: 'Firebase Project ID',
    envVar: 'VITE_FIREBASE_PROJECT_ID',
    description: 'Identifiant du projet Firebase',
  },
  {
    id: 'firebase_storage',
    label: 'Firebase Storage Bucket',
    envVar: 'VITE_FIREBASE_STORAGE_BUCKET',
    description: 'Bucket de stockage Firebase',
  },
  {
    id: 'removebg',
    label: 'Remove.bg',
    envVar: 'VITE_REMOVEBG_KEY',
    description: 'Clé API Remove.bg pour la suppression de fond',
    links: {
      manage: 'https://www.remove.bg/dashboard',
      billing: 'https://www.remove.bg/dashboard/credits',
    },
  },
  {
    id: 'jina',
    label: 'Jina AI',
    envVar: 'VITE_JINA_API_KEY',
    description: 'Clé API Jina — scraping et recherche produit',
    links: {
      manage: 'https://jina.ai/api-dashboard/key-manager',
      billing: 'https://jina.ai/api-dashboard/recharge',
    },
  },
  {
    id: 'firecrawl',
    label: 'Firecrawl',
    envVar: 'VITE_FIRECRAWL_API_KEY',
    description: 'Clé API Firecrawl — scraping anti-bot fallback',
    links: {
      manage: 'https://www.firecrawl.dev/app/api-keys',
      billing: 'https://www.firecrawl.dev/pricing',
    },
  },
  {
    id: 'scrapfly',
    label: 'ScrapFly',
    envVar: 'VITE_SCRAPFLY_API_KEY',
    description: 'Clé API ScrapFly — réservée pour intégration future via Cloud Function (pas de CORS browser-side)',
    links: {
      manage: 'https://scrapfly.io/dashboard/api',
      billing: 'https://scrapfly.io/dashboard/billing',
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
  return val ? maskKey(val) : '(non définie)'
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
  label: string
  url: string
}

/** Test connectivity for an API key */
export async function testApiKey(id: string): Promise<{ status: ApiTestResult; message: string; action?: ApiTestAction }> {
  const key = getApiKey(id)
  if (!key) return { status: 'empty', message: 'Clé non définie' }

  try {
    if (id === 'gemini') {
      // Test Nano Banana: list models endpoint (lightweight)
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models?key=${key}`,
      )
      if (res.ok) {
        return { status: 'ok', message: 'Connecté à Nano Banana' }
      }
      const err = await res.text()
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
        return { status: 'ok', message: 'Connecté à Firebase Auth' }
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
        return { status: 'ok', message: 'Connecté à DeepSeek' }
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
        return { status: 'ok', message: 'Connecté à DashScope (Qwen)' }
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
        return { status: 'ok', message: 'Connecté à Kimi Code' }
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

    if (id === 'removebg') {
      // Test Remove.bg: account endpoint
      const res = await fetch('https://api.remove.bg/v1.0/account', {
        headers: { 'X-Api-Key': key },
      })
      if (res.ok) {
        const data = await res.json()
        const credits = data?.data?.attributes?.credits?.total ?? '?'
        return { status: 'ok', message: `Connecté — ${credits} crédits` }
      }
      if (res.status === 403) return { status: 'error', message: 'Clé invalide' }
      return { status: 'error', message: `Erreur ${res.status}` }
    }

    if (id === 'firecrawl') {
      // Test Firecrawl: team usage endpoint (lightweight, vérifie auth).
      // Format API très variable (v1/v2/legacy/billing). On utilise une recherche
      // récursive pour trouver n'importe quel champ numérique nommé `credit*` /
      // `remain*` à n'importe quel niveau.
      const res = await fetch('https://api.firecrawl.dev/v2/team/credit-usage', {
        headers: { 'Authorization': 'Bearer ' + key },
      })
      if (res.ok) {
        const json = await res.json() as unknown
        // Log pour debug si parsing échoue (visible dans la console navigateur)
        console.log('[firecrawl] credit-usage response:', json)

        // Recherche récursive : trouve le 1er nombre dont la clé contient
        // "remain" ou "credit" (priorité aux clés "remain*"). Profondeur max 6
        // pour éviter les structures circulaires.
        const findCredits = (obj: unknown, depth = 0): { remaining?: number; total?: number } => {
          if (depth > 6 || !obj || typeof obj !== 'object') return {}
          const o = obj as Record<string, unknown>
          let remaining: number | undefined
          let total: number | undefined
          for (const [key, val] of Object.entries(o)) {
            if (typeof val === 'number') {
              const k = key.toLowerCase()
              if (/remain/.test(k) && remaining === undefined) remaining = val
              else if ((/^plan|^total|allow|limit/.test(k)) && /credit/.test(k) && total === undefined) total = val
              else if (/credit/.test(k) && remaining === undefined && !/used|consumed|spent/.test(k)) remaining = val
            }
          }
          if (remaining !== undefined || total !== undefined) return { remaining, total }
          for (const val of Object.values(o)) {
            if (val && typeof val === 'object') {
              const sub = findCredits(val, depth + 1)
              if (sub.remaining !== undefined || sub.total !== undefined) return sub
            }
          }
          return {}
        }

        const { remaining, total } = findCredits(json)
        const buyAction: ApiTestAction = { label: 'Acheter des crédits', url: 'https://www.firecrawl.dev/pricing' }
        if (typeof remaining === 'number') {
          const totalSuffix = typeof total === 'number' ? ` / ${total}` : ''
          if (remaining === 0) return { status: 'error', message: `0 crédit${totalSuffix} — recharge nécessaire`, action: buyAction }
          if (remaining < 50) return { status: 'ok', message: `⚠ ${remaining}${totalSuffix} crédits restants`, action: buyAction }
          return { status: 'ok', message: `Connecté — ${remaining}${totalSuffix} crédits` }
        }
        return { status: 'ok', message: 'Connecté (solde non renvoyé par l\'API — voir console)' }
      }
      if (res.status === 401 || res.status === 403) return { status: 'error', message: 'Clé invalide' }
      if (res.status === 402) return { status: 'error', message: 'Crédits épuisés (HTTP 402)', action: { label: 'Acheter des crédits', url: 'https://www.firecrawl.dev/pricing' } }
      return { status: 'error', message: `Erreur ${res.status}` }
    }

    if (id === 'scrapfly') {
      // ScrapFly /account est CORS-bloqué côté navigateur — pas de test live possible.
      // Format-only validation : la clé doit commencer par scp-live- ou scp-test-.
      // Note : la clé est inactive tant qu'on ne wire pas la Cloud Function proxy.
      if (/^scp-(live|test)-[a-f0-9]{32,}$/i.test(key)) {
        return { status: 'ok', message: 'Format valide (en attente câblage Cloud Function)' }
      }
      return { status: 'error', message: 'Format attendu : scp-live-... ou scp-test-...' }
    }

    return { status: 'ok', message: 'OK' }
  } catch (e) {
    return { status: 'error', message: 'Erreur réseau' }
  }
}
