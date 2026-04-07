# Briefs IA — Lot 4 : Étape 4 — Génération du deck et des images Nano Banana — Plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Livrer l'étape 4 de l'éditeur de brief : génération via Gemini de la structure du deck commercial (`SlideSpec[]`) à partir du brief + panier, puis génération des visuels (1 hero + 1 image par produit) via `gemini-3.1-flash-image-preview` (Nano Banana). Les images sont uploadées dans Firebase Storage et leurs métadonnées persistées dans la sous-collection `briefs/{id}/images`. Galerie d'aperçu intégrée dans le step. Régénération possible image par image (écrasement).

**Architecture:**
- **Pas de Cloud Function.** Appel direct browser → Gemini avec `getApiKey('gemini')` (pattern Lot 3).
- 2 prompts versionnés : `deckStructure.prompt.ts` (texte JSON, modèle `gemini-2.5-flash`) et `imagePrompt.builder.ts` (fonction pure qui produit le prompt texte injecté dans l'appel Gemini Image).
- `geminiImageClient.ts` : POST à `gemini-3.1-flash-image-preview:generateContent`, parse `candidates[0].content.parts[].inlineData.data` (base64), retourne `{ blob, mimeType }`.
- `briefImagesStorage.ts` : `uploadBriefImage(briefId, imageId, blob, mimeType) → downloadURL`. Path : `briefs/{briefId}/images/{imageId}.{ext}`.
- 3 hooks : `useGenerateDeck` (1 appel Gemini text), `useGenerateBriefImage` (1 image atomique : Gemini image → upload → upsert Firestore), `useGenerateAllBriefImages` (séquentiel : hero puis 1 par produit, expose un état de progression via React Query mutations chainées).
- UI : `Step4Deck` affiche la liste des slides à gauche, une `BriefImagesGallery` à droite. Bouton « Générer le deck » au-dessus, « Générer toutes les images » à côté de la galerie. Régénération individuelle via bouton sur chaque tuile image.
- Régénération = écrasement (clé naturelle `hero` ou `product_${sku}`, doc Firestore en `setDoc` + même chemin Storage).

**Tech Stack:** React 18, Zustand, React Query, Zod 4, sonner, Firebase Storage (déjà configuré dans `src/lib/firebase/config.ts`), Gemini API REST direct (text + image).

**Spec de référence :** `docs/superpowers/specs/2026-04-07-taxonomy-briefs-design.md` sections 6.4 (UI étape 4), 7 (contrats IA), 5.2 (sous-collection images)
**Dépend de :** Lots 1-3 terminés (types `SlideSpec`/`BriefImage`, hooks `useBriefImages`/`useUpsertBriefImage`, wrapper `generateJson`, `geminiClient.ts`, `Step3Cart` → status `cart_ready`).

---

## File Structure

**Création (logique pure / IA) :**
- `src/features/briefs/ai/prompts/deckStructure.prompt.ts` — `VERSION`, `buildPrompt()`, `RESPONSE_SCHEMA_FOR_GEMINI`, `DeckResponseSchema` (Zod, valide la liste de `SlideSpec`)
- `src/features/briefs/ai/imagePromptBuilder.ts` — fonction pure `buildHeroImagePrompt(brief)` + `buildProductImagePrompt(brief, item)` (intègre branding, contexte client, produit). Pas d'appel réseau.
- `src/features/briefs/ai/imagePromptBuilder.test.ts` — TDD
- `src/features/briefs/ai/base64ToBlob.ts` — décode `base64` + `mimeType` → `Blob`
- `src/features/briefs/ai/base64ToBlob.test.ts` — TDD
- `src/features/briefs/ai/geminiImageClient.ts` — POST gemini-3.1-flash-image-preview, retourne `{ blob, mimeType }`
- `src/features/briefs/storage/briefImagesStorage.ts` — `uploadBriefImage(briefId, imageId, blob, mimeType): Promise<string>`

**Création (hooks React Query) :**
- `src/features/briefs/ai/useGenerateDeck.ts`
- `src/features/briefs/ai/useGenerateBriefImage.ts`
- `src/features/briefs/ai/useGenerateAllBriefImages.ts`

**Création (UI) :**
- `src/components/briefs/editor/SlideList.tsx` — rend la liste compacte des `SlideSpec` (titre + type + bullets/products en sous-texte)
- `src/components/briefs/editor/BriefImageCard.tsx` — tuile image (placeholder, image, bouton régénérer, état loading)
- `src/components/briefs/editor/BriefImagesGallery.tsx` — grille des images du brief
- `src/components/briefs/editor/Step4Deck.tsx` — assemblage de l'étape 4

**Modification :**
- `src/components/briefs/editor/BriefEditorModal.tsx` — brancher `Step4Deck` quand `currentStep === 4`

**Aucune modification des types Lot 1 ni des hooks Firestore Lot 1.**

---

## Conventions pour ce lot

- **TDD strict** sur la logique pure : `imagePromptBuilder` (déterminisme), `base64ToBlob` (décodage). Cible : ~9 tests ajoutés.
- **Pas de tests** sur les appels réseau (Gemini Image, Firebase Storage upload) — trop coûteux à mocker proprement, faible ROI.
- **Composants ≤ 150 lignes**.
- **Dark mode** (mêmes tokens : `#0f0f0f` / `#1a1a1a` / `#6366f1`, bordures `white/[0.06]`).
- **Pas de `any`** sur les API publiques.
- **Modèle texte :** `gemini-2.5-flash` (déjà utilisé par `geminiClient`). **Modèle image :** `gemini-3.1-flash-image-preview`.
- **Endpoint image :** `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-image-preview:generateContent?key=KEY`. Body : `{ contents: [{ parts: [{ text: prompt }] }], generationConfig: { responseModalities: ['IMAGE'] } }`. Réponse : `candidates[0].content.parts[].inlineData = { mimeType, data }` (base64).
- **git hygiene** : stager uniquement les fichiers explicites de chaque task, jamais `git add -A` (working tree dirty).
- **Régénération** : même `image.id` → même chemin Storage → écrase. Clés : `hero`, `product_${sku}`.

---

## Task 1 : Prompt `deckStructure.prompt.ts`

**Files:**
- Create: `src/features/briefs/ai/prompts/deckStructure.prompt.ts`

But : à partir du brief client + réponses dynamiques + panier, demander à Gemini une structure de deck commercial cohérente (4 à 8 slides) sous forme d'un tableau `SlideSpec`.

- [ ] **Step 1: Créer le prompt + schémas Zod**

Create `src/features/briefs/ai/prompts/deckStructure.prompt.ts`:
```ts
import { z } from 'zod'
import type { Brief } from '@/features/briefs/types'

export const VERSION = 'deck-structure-2026-04-07-1'

// Union discriminée alignée sur SlideSpec (types.ts).
export const SlideSpecSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('cover'),
    title: z.string().min(1),
    subtitle: z.string().min(1),
    heroPrompt: z.string().min(1),
  }),
  z.object({
    type: z.literal('context'),
    title: z.string().min(1),
    bullets: z.array(z.string()).min(1).max(6),
  }),
  z.object({
    type: z.literal('product_grid'),
    title: z.string().min(1),
    productSkus: z.array(z.string()).min(1),
    layout: z.enum(['2x2', '3x2', '1x3']),
  }),
  z.object({
    type: z.literal('product_focus'),
    title: z.string().min(1),
    productSku: z.string().min(1),
    keyPoints: z.array(z.string()).min(1).max(5),
    imagePrompt: z.string().min(1),
  }),
  z.object({
    type: z.literal('budget'),
    title: z.string().min(1),
    showTotal: z.boolean(),
    showItemized: z.boolean(),
  }),
  z.object({
    type: z.literal('cta'),
    title: z.string().min(1),
    message: z.string().min(1),
    contactEmail: z.string().optional(),
  }),
])

export const DeckResponseSchema = z.object({
  slides: z.array(SlideSpecSchema).min(3).max(10),
  reasoning: z.string(),
})

export type DeckResponse = z.infer<typeof DeckResponseSchema>

export const RESPONSE_SCHEMA_FOR_GEMINI = {
  type: 'object',
  properties: {
    slides: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          type: {
            type: 'string',
            enum: ['cover', 'context', 'product_grid', 'product_focus', 'budget', 'cta'],
          },
          title: { type: 'string' },
          subtitle: { type: 'string' },
          heroPrompt: { type: 'string' },
          bullets: { type: 'array', items: { type: 'string' } },
          productSkus: { type: 'array', items: { type: 'string' } },
          layout: { type: 'string', enum: ['2x2', '3x2', '1x3'] },
          productSku: { type: 'string' },
          keyPoints: { type: 'array', items: { type: 'string' } },
          imagePrompt: { type: 'string' },
          showTotal: { type: 'boolean' },
          showItemized: { type: 'boolean' },
          message: { type: 'string' },
          contactEmail: { type: 'string' },
        },
        required: ['type', 'title'],
      },
    },
    reasoning: { type: 'string' },
  },
  required: ['slides', 'reasoning'],
}

interface BuildOpts {
  brief: Brief
}

export function buildPrompt({ brief }: BuildOpts): string {
  const cartLines =
    brief.cart?.items
      .map((it) => `- ${it.sku} | ${it.name} | qté ${it.quantity}`)
      .join('\n') ?? '(panier vide)'

  return `Tu es un commercial expert en signalétique et PLV. Construis la structure d'un deck commercial cohérent pour présenter cette offre à un client. 4 à 8 slides au total.

Brief client :
${JSON.stringify(brief.client.values, null, 2)}

Réponses complémentaires :
${JSON.stringify(brief.dynamicForm?.answers ?? {}, null, 2)}

Panier proposé :
${cartLines}

Contraintes structurelles :
- Première slide OBLIGATOIRE : type="cover" avec un heroPrompt évocateur (1-2 phrases visuelles, en anglais, décrivant un visuel hero photoréaliste pour l'environnement du client).
- Au moins UNE slide "context" qui résume les enjeux du client en 3-5 bullets.
- Au moins UNE slide "product_grid" OU plusieurs "product_focus" couvrant les SKUs du panier. Pour product_focus, l'imagePrompt est une description visuelle anglaise du produit en situation chez le client (1-2 phrases).
- UNE slide "budget" obligatoire (showTotal: true, showItemized: true par défaut).
- DERNIÈRE slide OBLIGATOIRE : type="cta" avec un message d'engagement court.

Contraintes de validité :
- Tous les SKUs cités doivent appartenir au panier.
- Les champs obligatoires de chaque type doivent être présents (cf schéma JSON).
- Les imagePrompts (cover.heroPrompt, product_focus.imagePrompt) doivent être en anglais, descriptifs, sans logo ni texte intégré.

Réponds en JSON strict conforme au schéma demandé. Ajoute un champ reasoning de 2-3 phrases.`
}
```

- [ ] **Step 2: Vérifier tsc**

Run: `npx tsc -b`
Expected: pas d'erreur nouvelle (baseline 24).

- [ ] **Step 3: Commit**

```bash
git add src/features/briefs/ai/prompts/deckStructure.prompt.ts
git commit -m "feat(briefs): add deck structure prompt and Zod schema"
```

---

## Task 2 : `imagePromptBuilder.ts` (TDD pure fn)

**Files:**
- Create: `src/features/briefs/ai/imagePromptBuilder.ts`
- Create: `src/features/briefs/ai/imagePromptBuilder.test.ts`

But : générer un prompt anglais déterministe pour Gemini Image, à partir d'un brief (hero) ou d'un item du panier (produit). Intègre nom de l'entreprise, secteur, couleurs marque pour orienter l'ambiance.

- [ ] **Step 1: Tests**

Create `src/features/briefs/ai/imagePromptBuilder.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { buildHeroImagePrompt, buildProductImagePrompt } from './imagePromptBuilder'
import type { Brief, CartItem } from '@/features/briefs/types'

const briefBase = {
  id: 'b1',
  taxonomyId: 't1',
  ownerId: 'u1',
  clientName: 'Acme',
  status: 'cart_ready',
  currentStep: 4,
  client: {
    formTemplateSnapshot: [],
    values: {
      companyName: 'Acme Corp',
      sector: 'Restauration',
      primaryColor: '#FF6600',
      secondaryColor: '#003366',
    },
  },
} as unknown as Brief

const item: CartItem = {
  sku: 'DRP-FR-100150',
  name: 'Drapeau publicitaire 100x150',
  categoryNodeId: 'n1',
  quantity: 4,
  unitPrice: 89,
  description: 'Drapeau imprimé recto-verso, mat alu fourni',
  source: 'ai',
}

describe('buildHeroImagePrompt', () => {
  it('produces an English prompt mentioning the client sector', () => {
    const p = buildHeroImagePrompt(briefBase)
    expect(p).toMatch(/restauration|restaurant|hospitality/i)
    expect(p.toLowerCase()).toContain('photorealistic')
  })

  it('mentions brand colors when present', () => {
    const p = buildHeroImagePrompt(briefBase)
    expect(p).toContain('#FF6600')
  })

  it('falls back gracefully when sector is missing', () => {
    const b = {
      ...briefBase,
      client: { ...briefBase.client, values: { companyName: 'X' } },
    } as Brief
    expect(() => buildHeroImagePrompt(b)).not.toThrow()
  })

  it('is deterministic for the same input', () => {
    expect(buildHeroImagePrompt(briefBase)).toBe(buildHeroImagePrompt(briefBase))
  })

  it('forbids text and logos in the rendered scene', () => {
    const p = buildHeroImagePrompt(briefBase).toLowerCase()
    expect(p).toContain('no text')
    expect(p).toContain('no logo')
  })
})

describe('buildProductImagePrompt', () => {
  it('mentions the product name and the client sector', () => {
    const p = buildProductImagePrompt(briefBase, item)
    expect(p).toContain('Drapeau publicitaire 100x150')
    expect(p.toLowerCase()).toMatch(/restauration|restaurant|hospitality/)
  })

  it('forbids text overlays', () => {
    const p = buildProductImagePrompt(briefBase, item).toLowerCase()
    expect(p).toContain('no text')
  })

  it('is deterministic', () => {
    expect(buildProductImagePrompt(briefBase, item)).toBe(
      buildProductImagePrompt(briefBase, item),
    )
  })
})
```

- [ ] **Step 2: Run, expect fail**

Run: `npm run test:run -- imagePromptBuilder`

- [ ] **Step 3: Implémenter**

Create `src/features/briefs/ai/imagePromptBuilder.ts`:
```ts
import type { Brief, CartItem } from '@/features/briefs/types'

function readString(values: Record<string, unknown>, key: string): string | undefined {
  const v = values[key]
  return typeof v === 'string' && v.trim() ? v.trim() : undefined
}

function brandPalette(values: Record<string, unknown>): string {
  const primary = readString(values, 'primaryColor')
  const secondary = readString(values, 'secondaryColor')
  if (primary && secondary) return `Brand palette accents: ${primary} and ${secondary}.`
  if (primary) return `Brand accent color: ${primary}.`
  return ''
}

function sectorPhrase(values: Record<string, unknown>): string {
  const sector = readString(values, 'sector')
  if (!sector) return 'a generic commercial environment'
  return `a ${sector.toLowerCase()} environment`
}

const NEGATIVE = 'No text, no logo, no watermark, no people staring at camera.'

/**
 * Construit un prompt anglais déterministe pour le visuel hero d'un brief.
 */
export function buildHeroImagePrompt(brief: Brief): string {
  const v = brief.client.values
  const company = readString(v, 'companyName') ?? 'a company'
  const palette = brandPalette(v)
  const env = sectorPhrase(v)
  return `Photorealistic wide-angle hero image for a commercial proposal addressed to ${company}, set in ${env}. Cinematic lighting, shallow depth of field, premium feeling. ${palette} ${NEGATIVE}`.trim()
}

/**
 * Construit un prompt anglais déterministe pour mettre en scène un produit du panier.
 */
export function buildProductImagePrompt(brief: Brief, item: CartItem): string {
  const v = brief.client.values
  const env = sectorPhrase(v)
  const palette = brandPalette(v)
  const desc = item.description ? ` Product details: ${item.description}.` : ''
  return `Photorealistic product staging of "${item.name}" placed in ${env}. Soft natural lighting, marketing-grade composition.${desc} ${palette} ${NEGATIVE}`.trim()
}
```

- [ ] **Step 4: Run, expect pass (8)**

Run: `npm run test:run -- imagePromptBuilder`

- [ ] **Step 5: Commit**

```bash
git add src/features/briefs/ai/imagePromptBuilder.ts src/features/briefs/ai/imagePromptBuilder.test.ts
git commit -m "feat(briefs): add deterministic image prompt builder"
```

---

## Task 3 : `base64ToBlob.ts` (TDD pure fn)

**Files:**
- Create: `src/features/briefs/ai/base64ToBlob.ts`
- Create: `src/features/briefs/ai/base64ToBlob.test.ts`

- [ ] **Step 1: Tests**

Create `src/features/briefs/ai/base64ToBlob.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { base64ToBlob, mimeTypeToExtension } from './base64ToBlob'

describe('base64ToBlob', () => {
  it('decodes a small PNG header into a Blob with the right size and type', async () => {
    // 8 bytes = PNG signature
    const pngHeader = 'iVBORw0KGgo='
    const blob = base64ToBlob(pngHeader, 'image/png')
    expect(blob.type).toBe('image/png')
    expect(blob.size).toBe(8)
  })

  it('strips a data URL prefix if present', () => {
    const blob = base64ToBlob('data:image/png;base64,iVBORw0KGgo=', 'image/png')
    expect(blob.size).toBe(8)
  })

  it('throws on invalid base64', () => {
    expect(() => base64ToBlob('!!!not base64!!!', 'image/png')).toThrow()
  })
})

describe('mimeTypeToExtension', () => {
  it('maps common mime types', () => {
    expect(mimeTypeToExtension('image/png')).toBe('png')
    expect(mimeTypeToExtension('image/jpeg')).toBe('jpg')
    expect(mimeTypeToExtension('image/webp')).toBe('webp')
  })

  it('falls back to png for unknown types', () => {
    expect(mimeTypeToExtension('application/octet-stream')).toBe('png')
  })
})
```

- [ ] **Step 2: Run, expect fail**

Run: `npm run test:run -- base64ToBlob`

- [ ] **Step 3: Implémenter**

Create `src/features/briefs/ai/base64ToBlob.ts`:
```ts
const EXT_BY_MIME: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/webp': 'webp',
}

export function mimeTypeToExtension(mime: string): string {
  return EXT_BY_MIME[mime.toLowerCase()] ?? 'png'
}

/**
 * Décode une chaîne base64 (avec ou sans préfixe data URL) en Blob binaire.
 * Throw si la chaîne n'est pas du base64 valide.
 */
export function base64ToBlob(base64: string, mimeType: string): Blob {
  let payload = base64
  const commaIdx = payload.indexOf(',')
  if (payload.startsWith('data:') && commaIdx !== -1) {
    payload = payload.slice(commaIdx + 1)
  }
  let binary: string
  try {
    binary = atob(payload)
  } catch {
    throw new Error('base64 invalide')
  }
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return new Blob([bytes], { type: mimeType })
}
```

- [ ] **Step 4: Run, expect pass (5)**

Run: `npm run test:run -- base64ToBlob`

- [ ] **Step 5: Commit**

```bash
git add src/features/briefs/ai/base64ToBlob.ts src/features/briefs/ai/base64ToBlob.test.ts
git commit -m "feat(briefs): add base64-to-Blob decoder helper"
```

---

## Task 4 : `geminiImageClient.ts`

**Files:**
- Create: `src/features/briefs/ai/geminiImageClient.ts`

But : appel Gemini Image, parse `inlineData`, retourne `{ blob, mimeType }`. Pas de retry pour ce lot (génération image rare et coûteuse, on laisse l'utilisateur cliquer "Régénérer" en cas d'échec).

- [ ] **Step 1: Créer le client**

Create `src/features/briefs/ai/geminiImageClient.ts`:
```ts
import { getApiKey } from '@/lib/apiKeys'
import { base64ToBlob } from './base64ToBlob'

const MODEL = 'gemini-3.1-flash-image-preview'
const ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`

interface GenerateImageResult {
  blob: Blob
  mimeType: string
}

interface GeminiImagePart {
  inlineData?: { mimeType: string; data: string }
  text?: string
}
interface GeminiImageResponse {
  candidates?: Array<{ content?: { parts?: GeminiImagePart[] } }>
}

/**
 * Génère une image via Gemini Nano Banana à partir d'un prompt texte.
 * Retourne le Blob et son mimeType. Throw si la clé est absente, si l'API renvoie
 * une erreur, ou si la réponse ne contient pas d'inlineData.
 */
export async function generateImage(prompt: string): Promise<GenerateImageResult> {
  const apiKey = getApiKey('gemini')
  if (!apiKey) throw new Error('Clé Gemini absente. Configurez-la dans Réglages.')

  const res = await fetch(`${ENDPOINT}?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        responseModalities: ['IMAGE'],
      },
    }),
  })

  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Gemini Image API ${res.status} : ${body.slice(0, 200)}`)
  }

  const data = (await res.json()) as GeminiImageResponse
  const parts = data.candidates?.[0]?.content?.parts ?? []
  const inline = parts.find((p) => p.inlineData)?.inlineData
  if (!inline) {
    throw new Error("Gemini Image : aucune image dans la réponse")
  }

  const blob = base64ToBlob(inline.data, inline.mimeType)
  return { blob, mimeType: inline.mimeType }
}
```

- [ ] **Step 2: Vérifier tsc**

Run: `npx tsc -b`

- [ ] **Step 3: Commit**

```bash
git add src/features/briefs/ai/geminiImageClient.ts
git commit -m "feat(briefs): add Gemini Nano Banana image client"
```

---

## Task 5 : Helper Storage `briefImagesStorage.ts`

**Files:**
- Create: `src/features/briefs/storage/briefImagesStorage.ts`

But : upload du Blob dans Firebase Storage, retourne le `downloadURL`.

- [ ] **Step 1: Créer le helper**

Create `src/features/briefs/storage/briefImagesStorage.ts`:
```ts
import { ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage'
import { storage } from '@/lib/firebase/config'
import { mimeTypeToExtension } from '@/features/briefs/ai/base64ToBlob'

/**
 * Upload un Blob dans Firebase Storage à `briefs/{briefId}/images/{imageId}.{ext}`,
 * écrasant tout fichier précédent au même chemin (régénération = overwrite).
 * Retourne l'URL téléchargeable publique.
 */
export async function uploadBriefImage(
  briefId: string,
  imageId: string,
  blob: Blob,
  mimeType: string,
): Promise<string> {
  const ext = mimeTypeToExtension(mimeType)
  const path = `briefs/${briefId}/images/${imageId}.${ext}`
  const ref = storageRef(storage, path)
  await uploadBytes(ref, blob, { contentType: mimeType })
  return getDownloadURL(ref)
}
```

- [ ] **Step 2: Vérifier tsc**

Run: `npx tsc -b`

- [ ] **Step 3: Commit**

```bash
git add src/features/briefs/storage/briefImagesStorage.ts
git commit -m "feat(briefs): add Firebase Storage upload helper for brief images"
```

---

## Task 6 : Hook `useGenerateDeck`

**Files:**
- Create: `src/features/briefs/ai/useGenerateDeck.ts`

- [ ] **Step 1: Créer**

Create `src/features/briefs/ai/useGenerateDeck.ts`:
```ts
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore'
import { db } from '@/lib/firebase/config'
import { generateJson } from './geminiClient'
import {
  buildPrompt,
  RESPONSE_SCHEMA_FOR_GEMINI,
  DeckResponseSchema,
  VERSION,
} from './prompts/deckStructure.prompt'
import type { Brief } from '@/features/briefs/types'

interface Args {
  brief: Brief
}

export function useGenerateDeck() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ brief }: Args) => {
      const prompt = buildPrompt({ brief })
      const result = await generateJson({
        prompt,
        schema: DeckResponseSchema,
        schemaForGemini: RESPONSE_SCHEMA_FOR_GEMINI,
        version: VERSION,
      })

      // Filtre les SKUs cités qui n'existent pas dans le panier (sécurité)
      const cartSkus = new Set(brief.cart?.items.map((it) => it.sku) ?? [])
      const cleanedSlides = result.slides.map((s) => {
        if (s.type === 'product_grid') {
          return { ...s, productSkus: s.productSkus.filter((k) => cartSkus.has(k)) }
        }
        return s
      })

      await updateDoc(doc(db, 'briefs', brief.id), {
        'deck.slides': cleanedSlides,
        'aiVersions.deck': VERSION,
        updatedAt: serverTimestamp(),
      })

      return { slides: cleanedSlides, reasoning: result.reasoning }
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ['brief', vars.brief.id] })
    },
  })
}
```

- [ ] **Step 2: Vérifier tsc**

Run: `npx tsc -b`

- [ ] **Step 3: Commit**

```bash
git add src/features/briefs/ai/useGenerateDeck.ts
git commit -m "feat(briefs): add useGenerateDeck mutation"
```

---

## Task 7 : Hook `useGenerateBriefImage` (1 image atomique)

**Files:**
- Create: `src/features/briefs/ai/useGenerateBriefImage.ts`

- [ ] **Step 1: Créer**

Create `src/features/briefs/ai/useGenerateBriefImage.ts`:
```ts
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { doc, setDoc, serverTimestamp } from 'firebase/firestore'
import { db } from '@/lib/firebase/config'
import { generateImage } from './geminiImageClient'
import { uploadBriefImage } from '@/features/briefs/storage/briefImagesStorage'
import type { Brief, CartItem } from '@/features/briefs/types'
import { buildHeroImagePrompt, buildProductImagePrompt } from './imagePromptBuilder'

type Target = { kind: 'hero' } | { kind: 'product'; item: CartItem }

interface Args {
  brief: Brief
  target: Target
}

function imageIdFor(target: Target): string {
  return target.kind === 'hero' ? 'hero' : `product_${target.item.sku}`
}

function promptFor(brief: Brief, target: Target): string {
  return target.kind === 'hero'
    ? buildHeroImagePrompt(brief)
    : buildProductImagePrompt(brief, target.item)
}

/**
 * Génère UNE image (hero ou produit) via Gemini, l'upload sur Storage,
 * et persiste les métadonnées dans la sous-collection briefs/{id}/images.
 * Régénération = écrasement (clé naturelle = imageId).
 */
export function useGenerateBriefImage() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ brief, target }: Args) => {
      const id = imageIdFor(target)
      const prompt = promptFor(brief, target)
      const { blob, mimeType } = await generateImage(prompt)
      const url = await uploadBriefImage(brief.id, id, blob, mimeType)

      await setDoc(doc(db, 'briefs', brief.id, 'images', id), {
        id,
        type: target.kind,
        productSku: target.kind === 'product' ? target.item.sku : undefined,
        prompt,
        url,
        updatedAt: serverTimestamp(),
      })

      return { id, url }
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ['brief-images', vars.brief.id] })
    },
  })
}
```

- [ ] **Step 2: Vérifier tsc**

Run: `npx tsc -b`

- [ ] **Step 3: Commit**

```bash
git add src/features/briefs/ai/useGenerateBriefImage.ts
git commit -m "feat(briefs): add useGenerateBriefImage mutation (single image)"
```

---

## Task 8 : Hook `useGenerateAllBriefImages` (batch séquentiel)

**Files:**
- Create: `src/features/briefs/ai/useGenerateAllBriefImages.ts`

- [ ] **Step 1: Créer**

Create `src/features/briefs/ai/useGenerateAllBriefImages.ts`:
```ts
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { doc, setDoc, serverTimestamp } from 'firebase/firestore'
import { db } from '@/lib/firebase/config'
import { generateImage } from './geminiImageClient'
import { uploadBriefImage } from '@/features/briefs/storage/briefImagesStorage'
import { buildHeroImagePrompt, buildProductImagePrompt } from './imagePromptBuilder'
import type { Brief } from '@/features/briefs/types'

interface Args {
  brief: Brief
  /** Callback de progression : appelé après chaque image générée. */
  onProgress?: (info: { done: number; total: number; currentLabel: string }) => void
}

interface BatchResult {
  generated: string[]
  failed: { id: string; error: string }[]
}

/**
 * Génère séquentiellement le hero + une image par produit du panier.
 * Continue sur erreur (chaque échec est listé dans `failed`).
 */
export function useGenerateAllBriefImages() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ brief, onProgress }: Args): Promise<BatchResult> => {
      const items = brief.cart?.items ?? []
      const total = 1 + items.length
      const generated: string[] = []
      const failed: { id: string; error: string }[] = []
      let done = 0

      const runOne = async (
        id: string,
        label: string,
        type: 'hero' | 'product',
        prompt: string,
        productSku?: string,
      ) => {
        try {
          const { blob, mimeType } = await generateImage(prompt)
          const url = await uploadBriefImage(brief.id, id, blob, mimeType)
          await setDoc(doc(db, 'briefs', brief.id, 'images', id), {
            id,
            type,
            productSku,
            prompt,
            url,
            updatedAt: serverTimestamp(),
          })
          generated.push(id)
        } catch (err) {
          failed.push({ id, error: (err as Error).message })
        } finally {
          done += 1
          onProgress?.({ done, total, currentLabel: label })
        }
      }

      // 1) Hero
      await runOne('hero', 'Image hero', 'hero', buildHeroImagePrompt(brief))

      // 2) Une image par produit
      for (const item of items) {
        await runOne(
          `product_${item.sku}`,
          item.name,
          'product',
          buildProductImagePrompt(brief, item),
          item.sku,
        )
      }

      return { generated, failed }
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ['brief-images', vars.brief.id] })
    },
  })
}
```

- [ ] **Step 2: Vérifier tsc**

Run: `npx tsc -b`

- [ ] **Step 3: Commit**

```bash
git add src/features/briefs/ai/useGenerateAllBriefImages.ts
git commit -m "feat(briefs): add batch image generation mutation"
```

---

## Task 9 : `SlideList` (rendu compact des slides)

**Files:**
- Create: `src/components/briefs/editor/SlideList.tsx`

- [ ] **Step 1: Créer**

Create `src/components/briefs/editor/SlideList.tsx`:
```tsx
import { Layers } from 'lucide-react'
import type { SlideSpec } from '@/features/briefs/types'

interface Props {
  slides: SlideSpec[]
}

const TYPE_LABEL: Record<SlideSpec['type'], string> = {
  cover: 'Couverture',
  context: 'Contexte',
  product_grid: 'Grille produits',
  product_focus: 'Focus produit',
  budget: 'Budget',
  cta: 'Appel à l’action',
}

function summary(slide: SlideSpec): string {
  switch (slide.type) {
    case 'cover':
      return slide.subtitle
    case 'context':
      return `${slide.bullets.length} points clés`
    case 'product_grid':
      return `${slide.productSkus.length} produits — ${slide.layout}`
    case 'product_focus':
      return slide.productSku
    case 'budget':
      return [slide.showItemized && 'détail', slide.showTotal && 'total'].filter(Boolean).join(' + ')
    case 'cta':
      return slide.message
  }
}

export function SlideList({ slides }: Props) {
  if (slides.length === 0) {
    return (
      <div className="text-[12px] text-white/40 text-center py-12 border border-dashed border-white/[0.08] rounded-md">
        Aucun deck généré. Cliquez sur « Générer le deck » pour démarrer.
      </div>
    )
  }
  return (
    <div className="flex flex-col gap-2">
      {slides.map((slide, idx) => (
        <div
          key={idx}
          className="bg-[#141414] border border-white/[0.06] rounded-md px-3 py-2 flex items-start gap-3"
        >
          <div className="w-6 h-6 rounded bg-white/[0.06] text-white/60 text-[11px] flex items-center justify-center shrink-0 mt-0.5">
            {idx + 1}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-0.5">
              <Layers className="w-3 h-3 text-indigo-400/70" />
              <span className="text-[10px] uppercase tracking-wide text-indigo-300/80">
                {TYPE_LABEL[slide.type]}
              </span>
            </div>
            <p className="text-[13px] text-white/90 truncate">{slide.title}</p>
            <p className="text-[11px] text-white/40 truncate">{summary(slide)}</p>
          </div>
        </div>
      ))}
    </div>
  )
}
```

- [ ] **Step 2: Vérifier tsc**

Run: `npx tsc -b`

- [ ] **Step 3: Commit**

```bash
git add src/components/briefs/editor/SlideList.tsx
git commit -m "feat(briefs): add SlideList compact renderer"
```

---

## Task 10 : `BriefImageCard` + `BriefImagesGallery`

**Files:**
- Create: `src/components/briefs/editor/BriefImageCard.tsx`
- Create: `src/components/briefs/editor/BriefImagesGallery.tsx`

- [ ] **Step 1: Créer BriefImageCard**

Create `src/components/briefs/editor/BriefImageCard.tsx`:
```tsx
import { RefreshCw, ImageIcon, Loader2 } from 'lucide-react'

interface Props {
  label: string
  imageUrl?: string
  loading?: boolean
  onRegenerate: () => void
}

export function BriefImageCard({ label, imageUrl, loading, onRegenerate }: Props) {
  return (
    <div className="bg-[#141414] border border-white/[0.06] rounded-md overflow-hidden flex flex-col">
      <div className="aspect-square bg-[#0f0f0f] flex items-center justify-center relative">
        {imageUrl ? (
          <img src={imageUrl} alt={label} className="w-full h-full object-cover" />
        ) : (
          <ImageIcon className="w-6 h-6 text-white/20" />
        )}
        {loading && (
          <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
            <Loader2 className="w-5 h-5 text-white/80 animate-spin" />
          </div>
        )}
      </div>
      <div className="px-3 py-2 flex items-center justify-between gap-2">
        <span className="text-[11px] text-white/70 truncate flex-1">{label}</span>
        <button
          onClick={onRegenerate}
          disabled={loading}
          className="text-white/40 hover:text-white disabled:opacity-30"
          aria-label="Régénérer"
        >
          <RefreshCw className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Créer BriefImagesGallery**

Create `src/components/briefs/editor/BriefImagesGallery.tsx`:
```tsx
import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { useBriefImages } from '@/features/briefs/useBriefImages'
import { useGenerateBriefImage } from '@/features/briefs/ai/useGenerateBriefImage'
import { BriefImageCard } from './BriefImageCard'
import type { Brief, CartItem } from '@/features/briefs/types'

interface Props {
  brief: Brief
}

export function BriefImagesGallery({ brief }: Props) {
  const { data: images = [] } = useBriefImages(brief.id)
  const generate = useGenerateBriefImage()
  const [pending, setPending] = useState<string | null>(null)

  const byId = useMemo(() => new Map(images.map((i) => [i.id, i])), [images])
  const items: CartItem[] = brief.cart?.items ?? []

  const regenerate = async (id: string, target: Parameters<typeof generate.mutateAsync>[0]['target']) => {
    setPending(id)
    try {
      await generate.mutateAsync({ brief, target })
      toast.success('Image générée')
    } catch (err) {
      toast.error((err as Error).message || 'Échec de la génération')
    } finally {
      setPending(null)
    }
  }

  return (
    <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
      <BriefImageCard
        label="Hero"
        imageUrl={byId.get('hero')?.url}
        loading={pending === 'hero'}
        onRegenerate={() => regenerate('hero', { kind: 'hero' })}
      />
      {items.map((item) => {
        const id = `product_${item.sku}`
        return (
          <BriefImageCard
            key={id}
            label={item.name}
            imageUrl={byId.get(id)?.url}
            loading={pending === id}
            onRegenerate={() => regenerate(id, { kind: 'product', item })}
          />
        )
      })}
    </div>
  )
}
```

- [ ] **Step 3: Vérifier tsc**

Run: `npx tsc -b`

- [ ] **Step 4: Commit**

```bash
git add src/components/briefs/editor/BriefImageCard.tsx src/components/briefs/editor/BriefImagesGallery.tsx
git commit -m "feat(briefs): add brief images gallery components"
```

---

## Task 11 : `Step4Deck` (assemblage)

**Files:**
- Create: `src/components/briefs/editor/Step4Deck.tsx`

- [ ] **Step 1: Créer**

Create `src/components/briefs/editor/Step4Deck.tsx`:
```tsx
import { useState } from 'react'
import { ArrowRight, Sparkles, RefreshCw, Wand2 } from 'lucide-react'
import { toast } from 'sonner'
import { useGenerateDeck } from '@/features/briefs/ai/useGenerateDeck'
import { useGenerateAllBriefImages } from '@/features/briefs/ai/useGenerateAllBriefImages'
import { useUpdateBrief } from '@/features/briefs/useBriefMutations'
import { SlideList } from './SlideList'
import { BriefImagesGallery } from './BriefImagesGallery'
import type { Brief } from '@/features/briefs/types'

interface Props {
  brief: Brief
  onAdvance: () => void
}

export function Step4Deck({ brief, onAdvance }: Props) {
  const generateDeck = useGenerateDeck()
  const generateAllImages = useGenerateAllBriefImages()
  const update = useUpdateBrief()
  const [progress, setProgress] = useState<{ done: number; total: number; label: string } | null>(null)

  const slides = brief.deck?.slides ?? []
  const hasDeck = slides.length > 0

  const handleGenerateDeck = async () => {
    try {
      await generateDeck.mutateAsync({ brief })
      toast.success('Deck généré')
    } catch (err) {
      toast.error((err as Error).message || 'Échec de la génération')
    }
  }

  const handleGenerateAllImages = async () => {
    setProgress({ done: 0, total: 1 + (brief.cart?.items.length ?? 0), label: '' })
    try {
      const r = await generateAllImages.mutateAsync({
        brief,
        onProgress: (info) => setProgress({ done: info.done, total: info.total, label: info.currentLabel }),
      })
      if (r.failed.length === 0) toast.success(`${r.generated.length} images générées`)
      else toast.warning(`${r.generated.length} générées, ${r.failed.length} échec(s)`)
    } catch (err) {
      toast.error((err as Error).message || 'Échec du batch')
    } finally {
      setProgress(null)
    }
  }

  const handleNext = async () => {
    if (!hasDeck) {
      toast.error('Génère d’abord la structure du deck')
      return
    }
    try {
      await update.mutateAsync({
        briefId: brief.id,
        patch: { status: 'deck_ready', currentStep: 5 } as never,
      })
      onAdvance()
    } catch (err) {
      toast.error('Erreur lors de la sauvegarde')
      console.error(err)
    }
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-5xl mx-auto grid grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] gap-6">
          {/* Col 1 — Deck */}
          <section>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-[14px] font-semibold text-white/80">Structure du deck</h2>
              <button
                onClick={handleGenerateDeck}
                disabled={generateDeck.isPending}
                className="flex items-center gap-1.5 text-[12px] text-indigo-300 hover:text-white hover:bg-indigo-500/10 px-3 py-1.5 rounded-md disabled:opacity-50"
              >
                {hasDeck ? <RefreshCw className="w-3.5 h-3.5" /> : <Sparkles className="w-3.5 h-3.5" />}
                {generateDeck.isPending ? 'Génération…' : hasDeck ? 'Régénérer' : 'Générer le deck'}
              </button>
            </div>
            <SlideList slides={slides} />
          </section>

          {/* Col 2 — Images */}
          <section>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-[14px] font-semibold text-white/80">Visuels (Nano Banana)</h2>
              <button
                onClick={handleGenerateAllImages}
                disabled={generateAllImages.isPending || !brief.cart?.items.length}
                className="flex items-center gap-1.5 text-[12px] text-indigo-300 hover:text-white hover:bg-indigo-500/10 px-3 py-1.5 rounded-md disabled:opacity-50"
              >
                <Wand2 className="w-3.5 h-3.5" />
                {generateAllImages.isPending ? 'Génération…' : 'Générer toutes les images'}
              </button>
            </div>
            {progress && (
              <div className="mb-3 text-[11px] text-white/50">
                {progress.done}/{progress.total} — {progress.label || '…'}
              </div>
            )}
            <BriefImagesGallery brief={brief} />
          </section>
        </div>
      </div>
      <div className="border-t border-white/[0.06] bg-[#141414] px-6 py-3 flex justify-end shrink-0">
        <button
          onClick={handleNext}
          disabled={!hasDeck || update.isPending}
          className="flex items-center gap-1.5 text-[12px] text-white bg-indigo-500 hover:bg-indigo-600 px-4 py-2 rounded-md disabled:opacity-50"
        >
          Étape suivante
          <ArrowRight className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Vérifier tsc**

Run: `npx tsc -b`

- [ ] **Step 3: Commit**

```bash
git add src/components/briefs/editor/Step4Deck.tsx
git commit -m "feat(briefs): add Step4Deck (deck structure + images gallery)"
```

---

## Task 12 : Brancher `Step4Deck` dans `BriefEditorModal`

**Files:**
- Modify: `src/components/briefs/editor/BriefEditorModal.tsx`

- [ ] **Step 1: Modifier la modale**

Edit `src/components/briefs/editor/BriefEditorModal.tsx` :

1. Ajouter l'import :
```ts
import { Step4Deck } from './Step4Deck'
```

2. Remplacer le bloc qui rend `currentStep >= 4` par :
```tsx
{brief && brief.currentStep === 4 && (
  <Step4Deck brief={brief} onAdvance={() => {}} />
)}
{brief && brief.currentStep >= 5 && (
  <div className="h-full flex items-center justify-center text-[12px] text-white/40">
    Étape 5 (export PPTX) disponible dans le prochain lot.
  </div>
)}
```

- [ ] **Step 2: Vérifier tsc**

Run: `npx tsc -b`
Expected: baseline 24, pas d'erreur nouvelle.

- [ ] **Step 3: Commit**

```bash
git add src/components/briefs/editor/BriefEditorModal.tsx
git commit -m "feat(briefs): wire Step4Deck into BriefEditorModal"
```

---

## Task 13 : Vérification globale

**Files:** aucune modification.

- [ ] **Step 1: Suite de tests**

Run: `npm run test:run`
Expected: ~65 tests passants (52 hérités + 8 imagePromptBuilder + 5 base64ToBlob = 65). 0 failed.

- [ ] **Step 2: Typecheck**

Run: `npx tsc -b`
Expected: 24 erreurs baseline, 0 nouvelle.

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: même état que les lots précédents (échec sur les 24 erreurs pré-existantes, pas de régression).

---

## Récapitulatif

À l'issue du Lot 4 :
- Prompt deck versionné (`deck-structure-2026-04-07-1`) avec union discriminée Zod (6 types de slides) et validation stricte
- Builder de prompts image déterministe (hero + produit) qui exploite branding et secteur
- Décodeur base64 → Blob (TDD)
- Client Gemini Image (`gemini-3.1-flash-image-preview`) avec parsing `inlineData`
- Helper d'upload Firebase Storage (path `briefs/{id}/images/{imageId}.{ext}`, écrasement)
- 3 hooks de mutation : `useGenerateDeck`, `useGenerateBriefImage` (atomique), `useGenerateAllBriefImages` (batch séquentiel avec progress)
- UI Step 4 : structure du deck à gauche, galerie d'images à droite, boutons Générer/Régénérer, indicateur de progression batch
- Régénération individuelle par tuile (overwrite par clé naturelle)
- ~65 tests unitaires passants (52 hérités + 13 ajoutés)

**Hors scope :**
- Étape 5 (assemblage PPTX final avec PptxGenJS et application du branding) — Lot 5
- Édition manuelle des slides (utilisateur peut seulement régénérer pour l'instant)
- Variantes d'image (1 slot par rôle, régénération = écrasement assumé)

**Prochaine étape (Lot 5) :** consommer `brief.deck.slides` + `briefImages` pour construire un PPTX via PptxGenJS, appliquer les couleurs/logo client, exposer un bouton « Télécharger le PPT » qui termine le brief en passant `status='completed'`.
