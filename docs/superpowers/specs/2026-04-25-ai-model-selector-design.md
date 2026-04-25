# Sélecteur de modèle IA + tracking de coûts — Design

**Date :** 2026-04-25
**Statut :** Validé brainstorming, en attente d'un plan d'implémentation

## Problème

Aujourd'hui les modèles LLM consommés par l'app sont codés en dur :
- `src/features/ai/llmRouter.ts` → `DEFAULT_MODEL` ({ claude: 'claude-opus-4-7', gemini: 'gemini-3.1-pro-preview', openai: 'gpt-4o' }) et overrides par tâche dans `TASK_ROUTING`
- L'onglet **IA** des Réglages (`src/components/shared/SettingsPanel.tsx`) n'expose que la clé API par provider — aucun choix de modèle, aucune visibilité sur les coûts

L'utilisateur veut :
1. Voir le modèle utilisé pour chaque provider IA
2. Pouvoir le changer
3. Voir les coûts (tarif par 1M tokens à côté du modèle, et estimation cumulée dans Statistiques)

## Périmètre

**Inclus :**
- Catalogue statique des modèles consommables (texte/JSON) avec pricing officiel
- Sélection persistée d'un modèle par provider (Claude, Gemini, OpenAI)
- Bouton "Rafraîchir" qui interroge `/v1/models` du provider et fusionne avec le catalogue
- Affichage du tarif input/output par modèle dans le sélecteur
- Tracking automatique des tokens consommés à chaque appel LLM, avec estimation USD agrégée par mois dans Firestore
- Carte "Coût IA estimé ce mois" dans l'onglet Statistiques (total + détail par provider)

**Exclus :**
- Override du modèle par tâche depuis l'UI (les overrides `TASK_ROUTING.model` restent en code, jugés stables)
- La génération d'images Nano Banana (`gemini-3.1-flash-image-preview`) reste hors sélecteur — `geminiImageClient.ts` non touché. Une note explicite sur la carte Gemini explique ce choix.
- Tracking côté image gen (pas de tarif tokens applicable)
- Budgets / alertes de coût

## Architecture

```
┌──────────────────────────────────────────────────────────────┐
│ src/lib/aiModels.ts        catalogue statique + types        │
│   AiProvider, AiModelInfo, AI_MODELS, getModel()             │
└──────────────────────────────────────────────────────────────┘
        │                                              │
        │ (lit catalogue)                              │ (lit catalogue)
        ▼                                              ▼
┌──────────────────────────────┐         ┌────────────────────────────┐
│ src/stores/aiSettings.store  │         │ src/features/stats/        │
│   selectedModel par provider │         │   aiUsageTracking.ts       │
│   fetchedModels (cache)      │         │   recordAiUsage()          │
│   persist localStorage       │         │   Firestore aiUsage/{u}_{m}│
└──────────────────────────────┘         └────────────────────────────┘
        │                                              ▲
        │ (getSelectedModel)                           │ (onUsage callback)
        ▼                                              │
┌──────────────────────────────────────────────────────┴────────┐
│ src/features/ai/llmRouter.ts                                  │
│   priorité : TASK_ROUTING.model > store > catalogue default   │
│   capture tokens dans réponses Claude/Gemini/OpenAI           │
│   appelle recordAiUsage automatiquement                       │
└───────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────┐
│ src/components/shared/                                       │
│   SettingsPanel.tsx → AiTab utilise <AiProviderCard ...>     │
│   AiProviderCard.tsx (nouveau) clé + sélecteur + refresh     │
│                                                              │
│   StatsTab (existant) → carte Coût IA depuis useUsageStats   │
└──────────────────────────────────────────────────────────────┘
```

## Composants

### 1. `src/lib/aiModels.ts` (nouveau, ~80 lignes)

Module pur, sans dépendance React/Zustand.

```ts
export type AiProvider = 'claude' | 'gemini' | 'openai'

export interface AiModelInfo {
  id: string                // 'claude-opus-4-7'
  label: string             // 'Claude Opus 4.7'
  pricing: {
    input: number           // USD par 1M tokens input
    output: number          // USD par 1M tokens output
  }
  isDefault?: boolean       // un seul par provider
}

export const AI_MODELS: Record<AiProvider, AiModelInfo[]> = {
  claude: [
    { id: 'claude-opus-4-7',   label: 'Claude Opus 4.7',   pricing: { input: 15,   output: 75 }, isDefault: true },
    { id: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6', pricing: { input: 3,    output: 15 } },
    { id: 'claude-haiku-4-5',  label: 'Claude Haiku 4.5',  pricing: { input: 0.80, output: 4 } },
  ],
  gemini: [
    { id: 'gemini-3.1-pro-preview', label: 'Gemini 3.1 Pro Preview', pricing: { input: 1.25,  output: 10 },  isDefault: true },
    { id: 'gemini-3-flash',         label: 'Gemini 3 Flash',         pricing: { input: 0.075, output: 0.30 } },
  ],
  openai: [
    { id: 'gpt-4o',      label: 'GPT-4o',      pricing: { input: 2.50, output: 10 },  isDefault: true },
    { id: 'gpt-4o-mini', label: 'GPT-4o mini', pricing: { input: 0.15, output: 0.60 } },
  ],
}

export function getModel(provider: AiProvider, id: string): AiModelInfo | undefined
export function getDefaultModel(provider: AiProvider): AiModelInfo
```

**Pricing source :** tarifs officiels au 2026-04-25 (anthropic.com/pricing, ai.google.dev/pricing, openai.com/pricing). À reviewer ponctuellement quand un nouveau modèle est ajouté.

### 2. `src/stores/aiSettings.store.ts` (nouveau, ~60 lignes)

Zustand + middleware `persist` (localStorage, clé `designstudio_ai_settings`).

```ts
interface AiSettingsState {
  selectedModel: Record<AiProvider, string>           // model id par provider
  fetchedModels: Record<AiProvider, AiModelInfo[]>    // résultats du dernier "Rafraîchir"
  setSelectedModel(provider: AiProvider, id: string): void
  setFetchedModels(provider: AiProvider, models: AiModelInfo[]): void
}
```

**Helpers exportés (hors hook) :**
- `getSelectedModel(provider): string` — utilisable depuis `llmRouter.ts` (non-React). Lit le state via `useAiSettingsStore.getState()`. Fallback : si l'id stocké n'existe ni dans le catalogue ni dans `fetchedModels`, retourne `getDefaultModel(provider).id`.
- `getEffectiveModelList(provider): AiModelInfo[]` — fusionne catalogue + `fetchedModels`. Dédup par `id` (le catalogue gagne quand un id est dans les deux, car il porte le pricing). Modèles fetched mais inconnus du catalogue ont `pricing: { input: 0, output: 0 }` (affichés "—" dans l'UI).

**Init :** `selectedModel` initialisé depuis les `isDefault: true` du catalogue lors de la 1ʳᵉ utilisation (gérée par `persist` qui hydrate après le default).

### 3. Modifications de `src/features/ai/llmRouter.ts`

**Sélection du modèle :**

Remplace `DEFAULT_MODEL` par `getSelectedModel`. Ordre de priorité dans `callProvider` :
```ts
const modelId =
  modelOverride                  // TASK_ROUTING[task].model si défini
  ?? getSelectedModel(provider)  // choix utilisateur via store
```
`getSelectedModel` retourne déjà le défaut catalogue en cas d'id invalide → pas besoin d'un 3ᵉ fallback ici.

**Tracking tokens :**

Ajoute un helper privé dans `llmRouter.ts` :
```ts
async function trackUsage(provider: AiProvider, model: string, usage: { input: number; output: number }) {
  const { recordAiUsage } = await import('@/features/stats/aiUsageTracking')
  recordAiUsage({ provider, model, inputTokens: usage.input, outputTokens: usage.output })
    .catch((e) => console.warn('[llmRouter] recordAiUsage failed', e))
}
```
Appelé en fin de `callClaude` (lecture `data.usage`), `callOpenAI` (`data.usage`), et passé en callback à `geminiGenerateJson` (qui doit nous remonter `usageMetadata`).

**Format des compteurs par provider :**
- Claude : `data.usage.input_tokens`, `data.usage.output_tokens`
- OpenAI : `data.usage.prompt_tokens`, `data.usage.completion_tokens`
- Gemini : `data.usageMetadata.promptTokenCount`, `data.usageMetadata.candidatesTokenCount`

### 4. Modifications de `src/features/briefs/ai/geminiClient.ts`

Petite modif : `generateJson` accepte un callback optionnel `onUsage?: (u: { input: number; output: number }) => void`. Il lit `usageMetadata` dans la réponse et appelle le callback. `llmRouter` lui passe ce callback pour tracker.

### 5. `src/features/stats/aiUsageTracking.ts` (nouveau, ~70 lignes)

```ts
export async function recordAiUsage(params: {
  provider: AiProvider
  model: string
  inputTokens: number
  outputTokens: number
}): Promise<void>
```

**Logique :**
1. Récupère pricing depuis `getModel(provider, model)` — si modèle inconnu, pricing 0 (estimation imparfaite mais ne bloque pas).
2. Calcule `costUsd = inputTokens * pricing.input / 1e6 + outputTokens * pricing.output / 1e6`.
3. `userId = useAuthStore.getState().user?.uid` — si pas de user, no-op.
4. `month = new Date().toISOString().slice(0, 7)` (`'2026-04'`)
5. `setDoc(doc(db, 'aiUsage', \`${userId}_${month}\`), { ... }, { merge: true })` avec `increment()` :
   ```
   {
     ownerId: userId,
     month,
     [`byProvider.${provider}.tokensIn`]:  increment(inputTokens),
     [`byProvider.${provider}.tokensOut`]: increment(outputTokens),
     [`byProvider.${provider}.costUsd`]:   increment(costUsd),
     [`total.costUsd`]:                    increment(costUsd),
   }
   ```
6. Toute erreur Firestore est `caught` et `console.warn` — un fail réseau ne doit jamais propager dans un appel LLM.

### 6. Modifications de `src/features/stats/useUsageStats.ts`

Étend `UsageStats` :
```ts
interface UsageStats {
  projectCount: number
  exportCount: number
  storageUsedMb: number
  storageQuotaMb: number
  aiCost: {
    total: number
    byProvider: Record<AiProvider, { tokensIn: number; tokensOut: number; costUsd: number }>
  }
}
```
`fetchStats` ajoute un `getDoc(doc(db, 'aiUsage', \`${userId}_${currentMonth}\`))`. Document absent → tous les compteurs à 0.

### 7. `src/components/shared/AiProviderCard.tsx` (nouveau, ~140 lignes)

Composant unique paramétré par `provider: AiProvider`. Réutilise la logique de `ApiKeyRow` (clé API, test connectivité, override) en interne pour ne pas dupliquer.

**Props :**
```ts
interface AiProviderCardProps {
  provider: AiProvider
  apiKeyId: 'gemini' | 'anthropic' | 'openai'
  label: string
  description: string
  logo?: ReactNode
  noteForGemini?: boolean   // affiche la note image gen sur la carte Gemini
}
```

**Sections :**
1. **Header** : logo + label + status connectivité (existant).
2. **Champ Clé API** : identique à `ApiKeyRow` actuel (édition inline, masque, test, reset).
3. **Sélecteur de modèle** :
   - Bouton custom (pas `<select>` natif) qui ouvre une popover avec la liste `getEffectiveModelList(provider)`. Style aligné avec le reste du panneau (dark, monospace pour les ids et tarifs).
   - Chaque option affiche : `[label]` puis sur ligne secondaire `$X in / $Y out · 1M tok` (pricing 0 → tiret `—`).
   - Au clic, `setSelectedModel(provider, id)` + ferme la popover.
4. **Bouton "Rafraîchir"** : disabled si pas de clé. Au clic :
   - Claude : `GET https://api.anthropic.com/v1/models` (header `x-api-key`)
   - Gemini : `GET https://generativelanguage.googleapis.com/v1beta/models?key=...`
   - OpenAI : `GET https://api.openai.com/v1/models`
   - Filtre les ids "raisonnables" (Claude : préfixe `claude-`; Gemini : préfixe `gemini-`, exclut `*-image-*`, `*-tts-*`, `*-embedding-*`; OpenAI : préfixe `gpt-`).
   - Pour chaque id trouvé : si présent dans le catalogue → ignoré (déjà là). Sinon → ajouté avec `pricing: { input: 0, output: 0 }`.
   - Stocke via `setFetchedModels`. Toast Sonner "X nouveaux modèles trouvés" / "Erreur réseau".
5. **Note Gemini uniquement** : `<div>` info expliquant que Nano Banana (`gemini-3.1-flash-image-preview`) reste fixe pour la génération d'images.

### 8. Modifications de `src/components/shared/SettingsPanel.tsx`

Le composant `AiTab` actuel devient :
```tsx
function AiTab() {
  return (
    <div className="flex flex-col gap-2">
      <AiProviderCard provider="gemini"   apiKeyId="gemini"    label="Nano Banana (Gemini)" description="..." logo={<GeminiLogo />} noteForGemini />
      <AiProviderCard provider="claude"   apiKeyId="anthropic" label="Claude (Anthropic)"   description="..." />
      <AiProviderCard provider="openai"   apiKeyId="openai"    label="OpenAI"                description="..." />
    </div>
  )
}
```

Le composant `StatsTab` reçoit une nouvelle carte "Coût IA estimé ce mois" :
- Total USD en grand (badge "estimation" à côté)
- 3 lignes (Claude / Gemini / OpenAI) : `tokensIn → tokensOut · $cost`
- Pas de pricing connu → "—"

`ApiKeyRow` reste utilisé tel quel pour les onglets Firebase et Connecteurs.

## Flux de données

**Démarrage de l'app :**
1. `aiSettings.store` hydraté depuis localStorage (ou défauts catalogue si vide)
2. Premier appel `generateJson(...)` : `llmRouter` lit `getSelectedModel('claude')` → utilise ce modèle pour l'appel API

**Sélection d'un modèle :**
1. User ouvre Réglages → IA, clique sur sélecteur Claude, choisit "Sonnet 4.6"
2. `setSelectedModel('claude', 'claude-sonnet-4-6')` met à jour le store + persist localStorage
3. Prochain appel LLM utilisera Sonnet (sauf overrides `TASK_ROUTING.model` toujours actifs)

**Appel LLM avec tracking :**
1. `generateJson({ task: 'brief.cartGeneration', ... })`
2. `llmRouter` route → `callClaude(opts, 'claude-sonnet-4-6')`
3. Réponse Anthropic contient `usage: { input_tokens: 1234, output_tokens: 567 }`
4. `trackUsage('claude', 'claude-sonnet-4-6', { input: 1234, output: 567 })`
5. `recordAiUsage` calcule cost = 1234 × 3/1e6 + 567 × 15/1e6 = $0.012205
6. `setDoc('aiUsage/uid_2026-04', { byProvider.claude.* increment, total.costUsd increment })`

**Affichage Stats :**
1. `useUsageStats` fetch `aiUsage/{userId}_{currentMonth}`
2. `StatsTab` rend la carte "Coût IA" avec total + détail provider

## Gestion d'erreurs

- **Modèle stocké invalide** (rare, ex : id supprimé du catalogue) → `getSelectedModel` fallback sur le défaut catalogue
- **Bouton Rafraîchir échoue** (clé invalide, réseau) → toast d'erreur, état inchangé
- **Tracking Firestore échoue** → log console, pas de propagation → l'appel LLM réussit
- **Pricing inconnu** (modèle fetched non documenté) → coût comptabilisé à 0 USD, badge "estimation" l'explique
- **Provider sans clé API** → sélecteur visible mais désactivé pour l'appel ; pas de tracking si l'appel n'a pas lieu

## Tests

- **Unitaires (catalogue)** : `getModel('claude', 'claude-opus-4-7')` retourne objet attendu. `getDefaultModel('claude')` retourne Opus.
- **Unitaires (store)** : `setSelectedModel` persiste. `getSelectedModel` fallback quand id invalide. `getEffectiveModelList` dédup correctement.
- **Unitaires (tracking)** : `recordAiUsage` calcule le bon coût pour pricing connu / inconnu.
- **Manuels (UI)** :
  - Choisir Sonnet pour Claude, recharger la page → toujours Sonnet
  - Lancer un brief → vérifier console : `[llmRouter] using claude-sonnet-4-6`
  - Ouvrir Stats → carte affiche un coût > 0
  - Bouton Rafraîchir avec clé valide → toast "X nouveaux modèles", liste élargie
  - Carte Gemini → note image gen présente

## Trade-offs / décisions

- **Pas d'override par tâche dans l'UI** — choix utilisateur (réponse Q1 brainstorming). Plus simple, garde le contrôle fin dans `TASK_ROUTING` côté code (où vivent déjà les contraintes : Opus forcé sur design.templateFill par exemple).
- **Catalogue statique + refresh optionnel** — combine contrôle du pricing (impossible à fetcher) avec adaptabilité aux nouveaux modèles. Refresh ajoute des modèles "sans pricing" plutôt que d'écraser le catalogue.
- **Tracking côté client direct dans Firestore** — pas de Cloud Function. Cohérent avec le reste de l'app (firestore depuis le browser via SDK). Risque : un user pourrait éditer son propre doc — acceptable car les coûts ne sont qu'informatifs (pas de billing dérivé).
- **Image gen exclue du tracking** — Nano Banana facture par image, pas par token. Hors scope ici, à traiter dans une feature distincte si besoin.
