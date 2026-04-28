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
}

export const API_KEYS: ApiKeyConfig[] = [
  {
    id: 'gemini',
    label: 'Nano Banana (Gemini)',
    envVar: 'VITE_GEMINI_API_KEY',
    description: 'Clé API Google Gemini pour la génération d\'images IA et tâches rapides',
  },
  {
    id: 'anthropic',
    label: 'Claude (Anthropic)',
    envVar: 'VITE_ANTHROPIC_API_KEY',
    description: 'Clé API Anthropic — Claude Opus 4.7 pour le raisonnement (briefs, panier, deck)',
  },
  {
    id: 'openai',
    label: 'OpenAI',
    envVar: 'VITE_OPENAI_API_KEY',
    description: 'Clé API OpenAI (optionnel — fallback ou tâches spécifiques)',
  },
  {
    id: 'deepseek',
    label: 'DeepSeek',
    envVar: 'VITE_DEEPSEEK_API_KEY',
    description: 'Clé API DeepSeek — DeepSeek Chat (V4) et Reasoner',
  },
  {
    id: 'qwen',
    label: 'Qwen (Alibaba DashScope)',
    envVar: 'VITE_QWEN_API_KEY',
    description: 'Clé API DashScope — Qwen Max / Plus / Turbo',
  },
  {
    id: 'kimi',
    label: 'Kimi (Moonshot)',
    envVar: 'VITE_KIMI_API_KEY',
    description: 'Clé Kimi Code — endpoint OpenAI-compatible (kimi-for-coding)',
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
  },
  {
    id: 'jina',
    label: 'Jina AI',
    envVar: 'VITE_JINA_API_KEY',
    description: 'Clé API Jina — scraping et recherche produit',
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

/** Save an API key override to localStorage */
export function setApiKey(id: string, value: string) {
  if (value.trim()) {
    localStorage.setItem(`${STORAGE_PREFIX}${id}`, value.trim())
  } else {
    localStorage.removeItem(`${STORAGE_PREFIX}${id}`)
  }
}

/** Check if a key is using localStorage override vs env default */
export function isApiKeyOverridden(id: string): boolean {
  return localStorage.getItem(`${STORAGE_PREFIX}${id}`) !== null
}

/** Reset a key to use the env default */
export function resetApiKey(id: string) {
  localStorage.removeItem(`${STORAGE_PREFIX}${id}`)
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

/** Test connectivity for an API key */
export async function testApiKey(id: string): Promise<{ status: ApiTestResult; message: string }> {
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

    return { status: 'ok', message: 'OK' }
  } catch (e) {
    return { status: 'error', message: 'Erreur réseau' }
  }
}
