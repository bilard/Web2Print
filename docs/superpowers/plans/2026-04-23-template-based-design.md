# Template-Based Design Pipeline — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remplacer le pipeline Art Director + Vision Critic (non-convergent, chaque run redesigne from-scratch) par un pipeline déterministe basé sur une bibliothèque de templates pré-conçus. Le LLM ne choisit plus la composition ; il choisit un template et remplit du copy + des couleurs.

**Architecture :**
- Chaque template est un module TS qui expose : des slots avec bboxes en coordonnées normalisées (0-1), une SVG décorative paramétrée par palette, une palette par défaut.
- Un seul appel LLM court produit `{ templateId, palette, copy, assetMappings }`.
- Un assembleur déterministe projette le template sur les dimensions du canvas et remplit les slots.
- Suppression complète de : Art Director, Vision Critic, buildSvgFromPlan, clampPlanToCanvas, Nano Banana (et dépendances).

**Tech Stack :** TypeScript strict, React 18, Fabric.js v6 (inchangé côté rendu), Zod, Claude Opus 4.7 via llmRouter existant.

---

## Contexte et décisions

**Décisions validées par l'utilisateur (session 2026-04-23) :**
1. 2 templates initiaux : `retail-product-portrait` + `retail-product-landscape`
2. Coordonnées normalisées (un template = tous formats d'aspect compatible)
3. Drop Nano Banana (plus de génération d'image ref)
4. Suppression de l'ancien pipeline (pas de feature flag)

**Invariants du codebase à respecter :**
- Composants max 150 lignes (CLAUDE.md)
- Stores : `camelCase.store.ts`
- Imports Fabric v6 ESM : `import { Canvas, Rect, IText, Textbox } from 'fabric'`
- `data` sur FabricObject étendu via `src/types/fabric.d.ts`
- Dark mode : surfaces `#1a1a1a`, accents `#6366f1` (UI, pas les templates print)

**Contraintes mémoire (feedback utilisateur) :**
- Pas de worktree — travail sur master
- Modèles IA par défaut : Claude `claude-opus-4-7`
- Ne jamais écraser les feuilles existantes (pas applicable ici)

---

## File Structure

### Fichiers créés

```
src/features/ai-design/templates/
├── types.ts                          # Interfaces Template, TextSlot, ImageSlot, FeatureListSlot
├── pictoLibrary.ts                   # Bibliothèque de paths SVG stylisés (Lucide-like)
├── retail-product-portrait.ts        # Template vertical
├── retail-product-landscape.ts       # Template horizontal
├── index.ts                          # Registry : getTemplate(id), listTemplates()
├── assembler.ts                      # assembleSvgFromTemplate(template, fillData, dims)
└── __tests__/
    ├── assembler.test.ts             # Tests unitaires assembler
    └── registry.test.ts              # Tests unitaires registry

src/features/ai-design/
├── templateFillSchema.ts             # Zod schema + JSON schema pour LLM output
├── templateFillPrompt.ts             # Prompt builder pour l'appel LLM
└── __tests__/
    └── templateFillSchema.test.ts    # Validation schema
```

### Fichiers modifiés

- `src/features/ai-design/useGenerateDesign.ts` — pipeline remplacé
- `src/features/ai/llmRouter.ts` — nouvelle tâche `design.templateFill`
- `src/features/ai-design/DesignProgress.tsx` — retirer les logs d'overlap analyzer (plus pertinent)

### Fichiers supprimés

Liste complète, à vérifier avant chaque suppression qu'aucun import externe ne reste :

```
src/features/ai-design/artDirectorPrompt.ts
src/features/ai-design/artDirectorSchema.ts
src/features/ai-design/visionCritic.ts
src/features/ai-design/applyCriticPatch.ts
src/features/ai-design/buildSvgFromPlan.ts
src/features/ai-design/clampPlanToCanvas.ts
src/features/ai-design/rasterizeSvg.ts
src/features/ai-design/svgFidelityValidator.ts
src/features/ai-design/svgEngineerPrompt.ts
src/features/ai-design/designPrompt.ts
src/features/ai-design/designPrompt.test.ts
src/features/ai-design/designSchema.ts
src/features/ai-design/renderVectorPlan.ts
src/features/ai-design/vectorizeImage.ts
src/features/ai-design/generateFullDesignImage.ts
src/features/ai-design/generateSlotImage.ts
src/features/ai-design/saveRefImageToGallery.ts
src/features/ai-design/analyzeSvgOverlaps.ts
src/features/ai-design/optimizePrompt.ts
```

### Fichiers conservés (pas modifiés)

- `src/features/ai-design/generateProductAssets.ts` (scraping)
- `src/features/ai-design/scaleFabricObjects.ts` (rendering)
- `src/features/ai-design/sanitizeSvg.ts` (toujours utile post-assembler)
- `src/features/ai-design/fontsValidator.ts`
- `src/features/ai-design/types.ts` (partiellement : `DesignRequest`, `DesignResult`, `DesignStyle`)
- `src/features/svg/svgToFabric.ts` et sous-modules
- Composants UI `Claude*.tsx`, `DesignProgress.tsx` (à ajuster marginalement)

---

## Task 1: Types et squelette du module templates

**Files:**
- Create: `src/features/ai-design/templates/types.ts`

- [ ] **Step 1: Créer le fichier types.ts avec les interfaces**

```ts
/**
 * Types publics de la bibliothèque de templates.
 *
 * Un Template décrit une disposition de design product retail :
 *  - slots de contenu (texte/image) positionnés en coordonnées normalisées
 *  - SVG décoratif (motifs, cadres, dividers) paramétré par palette
 *  - palette par défaut (fallback si le LLM ne fournit rien)
 *
 * L'assembleur prend un template + un TemplateFillData + les dimensions
 * (widthMm, heightMm) et produit un SVG 100 % vectoriel éditable.
 */

/** Coordonnées normalisées dans [0, 1] — fraction de la dimension du canvas. */
export interface NormalizedBbox {
  x: number
  y: number
  w: number
  h: number
}

/** Référence vers une clé de palette, ou un hex littéral `#RRGGBB`. */
export type ColorRef =
  | 'primary'
  | 'secondary'
  | 'neutral'
  | 'text'
  | 'white'
  | 'black'
  | string

export interface TextSlot {
  bbox: NormalizedBbox
  role: 'title' | 'subtitle' | 'body' | 'price' | 'cta' | 'mention'
  fontFamily: 'hero' | 'body'
  /** Taille en pt, absolue — on suppose le template designé pour un A4 portrait
   *  de référence (210 mm × 297 mm). Pour d'autres dimensions, l'assembleur
   *  scale la taille au pro-rata de la surface (sqrt ratio). */
  fontSize: number
  fontWeight: number
  align: 'left' | 'center' | 'right'
  colorRef: ColorRef
  /** Si présent : fond coloré sous le texte (pour CTA, badges prix). */
  backgroundRef?: ColorRef
  /** Décoration du texte (prix barré). */
  decoration?: 'line-through' | 'underline'
  /** Taille minimum autorisée par l'auto-shrink. Défaut = fontSize. */
  minFontSize?: number
  /** Nombre de lignes visuelles max. Défaut = illimité. */
  maxLines?: number
  /** Contenu hard-codé quand le slot n'est PAS rempli par le LLM (rare —
   *  utile pour des étiquettes fixes "Prix barré" etc.). */
  hardcodedContent?: string
}

export interface ImageSlot {
  bbox: NormalizedBbox
  role: 'logo' | 'hero' | 'badge' | 'picto'
  preserveAspectRatio: 'contain' | 'cover'
  /** Paths SVG inline à utiliser si aucun asset scrapé n'est assigné au slot.
   *  Permet d'avoir des pictos décoratifs par défaut (ex: éclair, batterie). */
  fallbackPictoKey?: string
}

export interface FeatureItemSlot {
  /** bbox relative au conteneur du feature-list (coordonnées 0-1 dans l'item). */
  picto: { bbox: NormalizedBbox; fallbackPictoKey: string }
  title: {
    bbox: NormalizedBbox
    fontSize: number
    fontWeight: number
    colorRef: ColorRef
  }
  desc: {
    bbox: NormalizedBbox
    fontSize: number
    fontWeight: number
    colorRef: ColorRef
  }
}

export interface FeatureListSlot {
  /** bbox du conteneur global de la liste, en coordonnées normalisées du canvas. */
  container: NormalizedBbox
  /** Layout : vertical stack ou grille 2 colonnes. */
  layout: 'vertical' | 'grid-2col'
  maxItems: number
  /** Gabarit d'un item — coordonnées normalisées dans l'item (0-1 × 0-1). */
  itemTemplate: FeatureItemSlot
}

export interface Palette {
  primary: string
  secondary: string
  neutral: string
  text: string
}

export interface Template {
  id: string
  label: string
  description: string
  /** Aspect ratio supporté : le template s'adapte si le canvas correspond. */
  aspectRatio: 'portrait' | 'landscape' | 'any'
  /** Famille de fonts : hero pour titres, body pour le corps. Les noms DOIVENT
   *  être dans `AVAILABLE_FONTS` de `src/features/assets/useFonts.ts`. */
  fonts: { hero: string; body: string }
  defaultPalette: Palette
  slots: {
    logo?: ImageSlot
    badge?: ImageSlot
    heroProduct: ImageSlot
    title: TextSlot
    subtitle?: TextSlot
    features?: FeatureListSlot
    priceNew?: TextSlot
    priceOld?: TextSlot
    cta?: TextSlot
    mentions?: TextSlot
  }
  /** SVG décoratif (motifs, cadres, dividers) — coordonnées absolues en
   *  pourcentage (`%`) dans le viewBox. Peut contenir des variables
   *  `{{palette.primary}}` etc. que l'assembleur remplace. */
  decorativeSvg: string
}
```

- [ ] **Step 2: Commit**

```bash
git add src/features/ai-design/templates/types.ts
git commit -m "feat(templates): ajoute types publics de la bibliothèque"
```

---

## Task 2: Bibliothèque de pictos (paths SVG inline)

**Files:**
- Create: `src/features/ai-design/templates/pictoLibrary.ts`

- [ ] **Step 1: Créer pictoLibrary.ts avec 15 pictos Lucide-like**

```ts
/**
 * Bibliothèque de pictos SVG stylisés, inspirés de Lucide/Feather.
 *
 * Chaque picto est un `<path d>` monochromatique, rendu sur un viewBox 24×24.
 * L'assembleur applique la couleur via `fill` au moment du rendu.
 *
 * Les clés sont des concepts (verbes ou substantifs simples) pour permettre
 * au LLM de choisir sémantiquement (ex: `pictoHint: "zap"` → éclair).
 */

export interface PictoDefinition {
  /** Contenu SVG à insérer entre <svg viewBox="0 0 24 24">...</svg>.
   *  Supporte <path>, <circle>, <rect>. `fill="currentColor"` recommandé. */
  content: string
  /** Synonymes pour le matching LLM. */
  aliases: string[]
}

export const PICTO_LIBRARY: Record<string, PictoDefinition> = {
  zap: {
    content: '<path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" fill="currentColor"/>',
    aliases: ['power', 'puissance', 'energy', 'eclair'],
  },
  battery: {
    content: '<rect x="2" y="7" width="16" height="10" rx="1" stroke="currentColor" stroke-width="2" fill="none"/><rect x="19" y="10" width="3" height="4" fill="currentColor"/><rect x="4" y="9" width="11" height="6" fill="currentColor"/>',
    aliases: ['autonomie', 'batterie', 'energy-stored'],
  },
  gauge: {
    content: '<path d="M12 14l3-3m0-7a8 8 0 0 0-8 8 8 8 0 0 0 1.5 4.5" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round"/><circle cx="12" cy="14" r="1.5" fill="currentColor"/>',
    aliases: ['speed', 'vitesse', 'reglage', 'meter'],
  },
  scissors: {
    content: '<circle cx="6" cy="6" r="3" stroke="currentColor" stroke-width="2" fill="none"/><circle cx="6" cy="18" r="3" stroke="currentColor" stroke-width="2" fill="none"/><path d="M20 4L8.12 15.88M14.47 14.48L20 20M8.12 8.12L12 12" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round"/>',
    aliases: ['coupe', 'cut', 'taille', 'lame', 'blade'],
  },
  shield: {
    content: '<path d="M12 2L4 6v6c0 5.55 3.84 10.74 8 12 4.16-1.26 8-6.45 8-12V6l-8-4z" stroke="currentColor" stroke-width="2" fill="none"/>',
    aliases: ['protection', 'xpt', 'shield', 'secure'],
  },
  check: {
    content: '<path d="M5 12l5 5L20 7" stroke="currentColor" stroke-width="2.5" fill="none" stroke-linecap="round"/>',
    aliases: ['valid', 'ok', 'conception'],
  },
  award: {
    content: '<circle cx="12" cy="8" r="6" stroke="currentColor" stroke-width="2" fill="none"/><path d="M8.5 13L7 22l5-3 5 3-1.5-9" stroke="currentColor" stroke-width="2" fill="none"/>',
    aliases: ['quality', 'qualite', 'premium', 'garantie'],
  },
  ruler: {
    content: '<path d="M3 17L17 3l4 4L7 21 3 17z" stroke="currentColor" stroke-width="2" fill="none"/><path d="M7 13l2-2M9 15l2-2M11 17l2-2M13 11l2-2" stroke="currentColor" stroke-width="1.5"/>',
    aliases: ['longueur', 'taille-lame', 'length', 'measure'],
  },
  weight: {
    content: '<path d="M6 8h12l-1 12H7L6 8z" stroke="currentColor" stroke-width="2" fill="none"/><path d="M9 8V6a3 3 0 0 1 6 0v2" stroke="currentColor" stroke-width="2" fill="none"/>',
    aliases: ['poids', 'light', 'leger', 'weight'],
  },
  hand: {
    content: '<path d="M18 11V6a2 2 0 0 0-4 0v5M14 10V4a2 2 0 0 0-4 0v6M10 10.5V6a2 2 0 0 0-4 0v8.5A5.5 5.5 0 0 0 11.5 20h1A5.5 5.5 0 0 0 18 14.5V11a2 2 0 0 0-4 0" stroke="currentColor" stroke-width="2" fill="none"/>',
    aliases: ['ergonomique', 'handle', 'prise', 'grip'],
  },
  volume: {
    content: '<path d="M11 5L6 9H2v6h4l5 4V5z" stroke="currentColor" stroke-width="2" fill="none"/><path d="M15 9a3 3 0 0 1 0 6" stroke="currentColor" stroke-width="2" fill="none"/>',
    aliases: ['bruit', 'sound', 'silence', 'sonore'],
  },
  waves: {
    content: '<path d="M2 12c2-2 4-2 6 0s4 2 6 0 4-2 6 0" stroke="currentColor" stroke-width="2" fill="none"/><path d="M2 18c2-2 4-2 6 0s4 2 6 0 4-2 6 0" stroke="currentColor" stroke-width="2" fill="none"/>',
    aliases: ['vibration', 'avt', 'anti-vibration', 'wave'],
  },
  tool: {
    content: '<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" stroke="currentColor" stroke-width="2" fill="none"/>',
    aliases: ['outil', 'pro', 'professionnel', 'wrench'],
  },
  clock: {
    content: '<circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2" fill="none"/><path d="M12 6v6l4 2" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round"/>',
    aliases: ['duree', 'time', 'autonomy', 'heures'],
  },
  star: {
    content: '<path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" fill="currentColor"/>',
    aliases: ['premium', 'best', 'etoile', 'top'],
  },
}

/**
 * Résout un indice de picto (nom exact ou alias) vers sa définition.
 * Retourne null si aucun match — l'assembleur laissera le slot vide (pas
 * de fallback silencieux : un picto manquant doit se voir).
 */
export function resolvePicto(key: string | undefined): PictoDefinition | null {
  if (!key) return null
  const normalized = key.toLowerCase().trim()
  if (PICTO_LIBRARY[normalized]) return PICTO_LIBRARY[normalized]
  for (const def of Object.values(PICTO_LIBRARY)) {
    if (def.aliases.includes(normalized)) return def
  }
  return null
}

export function listPictoKeys(): string[] {
  return Object.keys(PICTO_LIBRARY)
}
```

- [ ] **Step 2: Créer test pour resolvePicto**

Create `src/features/ai-design/templates/__tests__/pictoLibrary.test.ts` :

```ts
import { describe, it, expect } from 'vitest'
import { resolvePicto, listPictoKeys } from '../pictoLibrary'

describe('pictoLibrary', () => {
  it('resolves exact key', () => {
    expect(resolvePicto('zap')).not.toBeNull()
    expect(resolvePicto('zap')!.content).toContain('<path')
  })

  it('resolves alias', () => {
    expect(resolvePicto('puissance')).not.toBeNull()
    expect(resolvePicto('eclair')).toEqual(resolvePicto('zap'))
  })

  it('is case-insensitive', () => {
    expect(resolvePicto('ZAP')).toEqual(resolvePicto('zap'))
    expect(resolvePicto('  Power  ')).toEqual(resolvePicto('zap'))
  })

  it('returns null for unknown key', () => {
    expect(resolvePicto('nonexistent-xyz')).toBeNull()
    expect(resolvePicto(undefined)).toBeNull()
    expect(resolvePicto('')).toBeNull()
  })

  it('listPictoKeys returns at least 10 keys', () => {
    expect(listPictoKeys().length).toBeGreaterThanOrEqual(10)
  })
})
```

- [ ] **Step 3: Lancer les tests**

```bash
cd /Applications/_IA/Claude_workspace/Web2Print
npx vitest run src/features/ai-design/templates/__tests__/pictoLibrary.test.ts
```

Expected: 5 tests passent.

- [ ] **Step 4: Commit**

```bash
git add src/features/ai-design/templates/pictoLibrary.ts src/features/ai-design/templates/__tests__/pictoLibrary.test.ts
git commit -m "feat(templates): bibliothèque de 15 pictos SVG avec alias"
```

---

## Task 3: Template `retail-product-portrait`

**Files:**
- Create: `src/features/ai-design/templates/retail-product-portrait.ts`

- [ ] **Step 1: Créer le template portrait**

```ts
/**
 * Template : retail product portrait
 *
 * Disposition :
 *  - Header band teal en haut (12 % de la hauteur)
 *    └─ Logo Makita à gauche (x=4 %, w=22 %)
 *    └─ Badge tech (LXT, 18V) à côté (x=28 %, w=14 %)
 *  - Titre display 3 lignes max, sur fond clair (y=15 % à 33 %)
 *  - Subtitle (nom produit + modèle), 1 ligne (y=34 % à 39 %)
 *  - Colonne features à gauche (x=4 %, y=40-85 %, w=48 %) — 7 items max
 *  - Hero produit à droite (x=54 %, y=38-86 %, w=44 %)
 *  - Bandeau prix + CTA en bas (y=87-97 %)
 *  - Mentions légales en pied (y=97-100 %)
 *  - Décorations : lignes cyan en haut-droite + dividers
 */

import type { Template } from './types'

export const retailProductPortrait: Template = {
  id: 'retail-product-portrait',
  label: 'Fiche produit retail — portrait',
  description: 'Header coloré, titre display, colonne features avec pictos, hero produit à droite, bloc prix+CTA en bas. Inspiration Makita/Milwaukee retail.',
  aspectRatio: 'portrait',
  fonts: { hero: 'Oswald', body: 'Inter' },
  defaultPalette: {
    primary: '#0A6E7C',
    secondary: '#E30613',
    neutral: '#F4F6F8',
    text: '#0E2A47',
  },
  slots: {
    logo: {
      bbox: { x: 0.04, y: 0.025, w: 0.24, h: 0.065 },
      role: 'logo',
      preserveAspectRatio: 'contain',
    },
    badge: {
      bbox: { x: 0.30, y: 0.025, w: 0.14, h: 0.065 },
      role: 'badge',
      preserveAspectRatio: 'contain',
    },
    title: {
      bbox: { x: 0.04, y: 0.14, w: 0.92, h: 0.18 },
      role: 'title',
      fontFamily: 'hero',
      fontSize: 42,
      fontWeight: 800,
      align: 'left',
      colorRef: 'text',
      minFontSize: 28,
      maxLines: 3,
    },
    subtitle: {
      bbox: { x: 0.04, y: 0.335, w: 0.92, h: 0.05 },
      role: 'subtitle',
      fontFamily: 'body',
      fontSize: 18,
      fontWeight: 600,
      align: 'left',
      colorRef: 'text',
      minFontSize: 14,
      maxLines: 1,
    },
    features: {
      container: { x: 0.04, y: 0.40, w: 0.48, h: 0.45 },
      layout: 'vertical',
      maxItems: 7,
      itemTemplate: {
        picto: {
          bbox: { x: 0, y: 0.15, w: 0.18, h: 0.70 },
          fallbackPictoKey: 'check',
        },
        title: {
          bbox: { x: 0.22, y: 0, w: 0.78, h: 0.40 },
          fontSize: 11,
          fontWeight: 700,
          colorRef: 'text',
        },
        desc: {
          bbox: { x: 0.22, y: 0.42, w: 0.78, h: 0.58 },
          fontSize: 9,
          fontWeight: 400,
          colorRef: 'text',
        },
      },
    },
    heroProduct: {
      bbox: { x: 0.54, y: 0.38, w: 0.44, h: 0.48 },
      role: 'hero',
      preserveAspectRatio: 'contain',
    },
    cta: {
      bbox: { x: 0.04, y: 0.88, w: 0.44, h: 0.08 },
      role: 'cta',
      fontFamily: 'hero',
      fontSize: 22,
      fontWeight: 700,
      align: 'center',
      colorRef: 'neutral',
      backgroundRef: 'primary',
    },
    priceNew: {
      bbox: { x: 0.56, y: 0.88, w: 0.28, h: 0.08 },
      role: 'price',
      fontFamily: 'hero',
      fontSize: 34,
      fontWeight: 800,
      align: 'left',
      colorRef: 'text',
    },
    priceOld: {
      bbox: { x: 0.85, y: 0.90, w: 0.13, h: 0.05 },
      role: 'price',
      fontFamily: 'body',
      fontSize: 14,
      fontWeight: 600,
      align: 'left',
      colorRef: 'text',
      decoration: 'line-through',
    },
    mentions: {
      bbox: { x: 0.04, y: 0.97, w: 0.92, h: 0.03 },
      role: 'mention',
      fontFamily: 'body',
      fontSize: 7,
      fontWeight: 400,
      align: 'center',
      colorRef: 'text',
      minFontSize: 5,
      maxLines: 1,
    },
  },
  decorativeSvg: `
    <!-- Header band -->
    <rect x="0" y="0" width="100%" height="12%" fill="{{palette.primary}}" data-role="background-decor"/>
    <!-- Decorative lines top-right -->
    <path d="M 85% 1% L 99% 1% M 87% 3% L 99% 3% M 89% 5% L 99% 5% M 91% 7% L 99% 7%" stroke="{{palette.neutral}}" stroke-width="0.5mm" stroke-opacity="0.4" fill="none" data-role="background-decor"/>
    <!-- Divider sous le subtitle -->
    <rect x="4%" y="39.5%" width="92%" height="0.4%" fill="{{palette.primary}}" data-role="background-decor"/>
    <!-- Bottom bar decoration -->
    <rect x="0" y="97%" width="100%" height="0.4%" fill="{{palette.primary}}" data-role="background-decor"/>
  `.trim(),
}
```

- [ ] **Step 2: Commit**

```bash
git add src/features/ai-design/templates/retail-product-portrait.ts
git commit -m "feat(templates): template retail-product-portrait"
```

---

## Task 4: Template `retail-product-landscape`

**Files:**
- Create: `src/features/ai-design/templates/retail-product-landscape.ts`

- [ ] **Step 1: Créer le template landscape**

```ts
/**
 * Template : retail product landscape
 *
 * Disposition horizontale :
 *  - Bande verticale teal à gauche (14 % de la largeur)
 *    └─ Logo en haut
 *    └─ Badge tech dessous
 *  - Hero produit à gauche (x=14 % à 50 %, y=10-85 %)
 *  - Bloc texte à droite (x=52 %, y=10-85 %)
 *    └─ Titre (3 lignes)
 *    └─ Subtitle (1 ligne)
 *    └─ 4-5 features en grid 2 colonnes
 *  - Bandeau prix + CTA en bas (y=88-98 %, full width)
 */

import type { Template } from './types'

export const retailProductLandscape: Template = {
  id: 'retail-product-landscape',
  label: 'Fiche produit retail — paysage',
  description: 'Bande verticale gauche avec logo, hero produit central, bloc texte à droite avec features en grille 2 colonnes, bandeau prix+CTA en bas.',
  aspectRatio: 'landscape',
  fonts: { hero: 'Oswald', body: 'Inter' },
  defaultPalette: {
    primary: '#0A6E7C',
    secondary: '#E30613',
    neutral: '#F4F6F8',
    text: '#0E2A47',
  },
  slots: {
    logo: {
      bbox: { x: 0.02, y: 0.04, w: 0.10, h: 0.08 },
      role: 'logo',
      preserveAspectRatio: 'contain',
    },
    badge: {
      bbox: { x: 0.02, y: 0.14, w: 0.10, h: 0.08 },
      role: 'badge',
      preserveAspectRatio: 'contain',
    },
    heroProduct: {
      bbox: { x: 0.14, y: 0.08, w: 0.36, h: 0.75 },
      role: 'hero',
      preserveAspectRatio: 'contain',
    },
    title: {
      bbox: { x: 0.52, y: 0.08, w: 0.46, h: 0.18 },
      role: 'title',
      fontFamily: 'hero',
      fontSize: 38,
      fontWeight: 800,
      align: 'left',
      colorRef: 'text',
      minFontSize: 26,
      maxLines: 3,
    },
    subtitle: {
      bbox: { x: 0.52, y: 0.27, w: 0.46, h: 0.05 },
      role: 'subtitle',
      fontFamily: 'body',
      fontSize: 16,
      fontWeight: 600,
      align: 'left',
      colorRef: 'text',
      minFontSize: 12,
      maxLines: 1,
    },
    features: {
      container: { x: 0.52, y: 0.34, w: 0.46, h: 0.48 },
      layout: 'grid-2col',
      maxItems: 6,
      itemTemplate: {
        picto: {
          bbox: { x: 0, y: 0.15, w: 0.20, h: 0.70 },
          fallbackPictoKey: 'check',
        },
        title: {
          bbox: { x: 0.24, y: 0, w: 0.76, h: 0.40 },
          fontSize: 10,
          fontWeight: 700,
          colorRef: 'text',
        },
        desc: {
          bbox: { x: 0.24, y: 0.42, w: 0.76, h: 0.58 },
          fontSize: 8,
          fontWeight: 400,
          colorRef: 'text',
        },
      },
    },
    cta: {
      bbox: { x: 0.04, y: 0.88, w: 0.30, h: 0.08 },
      role: 'cta',
      fontFamily: 'hero',
      fontSize: 22,
      fontWeight: 700,
      align: 'center',
      colorRef: 'neutral',
      backgroundRef: 'primary',
    },
    priceNew: {
      bbox: { x: 0.40, y: 0.87, w: 0.24, h: 0.10 },
      role: 'price',
      fontFamily: 'hero',
      fontSize: 38,
      fontWeight: 800,
      align: 'left',
      colorRef: 'text',
    },
    priceOld: {
      bbox: { x: 0.66, y: 0.90, w: 0.12, h: 0.05 },
      role: 'price',
      fontFamily: 'body',
      fontSize: 14,
      fontWeight: 600,
      align: 'left',
      colorRef: 'text',
      decoration: 'line-through',
    },
    mentions: {
      bbox: { x: 0.78, y: 0.88, w: 0.20, h: 0.08 },
      role: 'mention',
      fontFamily: 'body',
      fontSize: 7,
      fontWeight: 400,
      align: 'left',
      colorRef: 'text',
      minFontSize: 5,
      maxLines: 3,
    },
  },
  decorativeSvg: `
    <!-- Vertical left band -->
    <rect x="0" y="0" width="14%" height="100%" fill="{{palette.primary}}" data-role="background-decor"/>
    <!-- Decorative vertical lines right edge -->
    <path d="M 98% 15% L 98% 60% M 96% 20% L 96% 60% M 94% 25% L 94% 60%" stroke="{{palette.primary}}" stroke-width="0.4mm" stroke-opacity="0.5" fill="none" data-role="background-decor"/>
    <!-- Top divider after header -->
    <rect x="14%" y="7%" width="86%" height="0.3%" fill="{{palette.primary}}" fill-opacity="0.3" data-role="background-decor"/>
    <!-- Bottom bar decoration -->
    <rect x="0" y="98%" width="100%" height="0.4%" fill="{{palette.primary}}" data-role="background-decor"/>
  `.trim(),
}
```

- [ ] **Step 2: Commit**

```bash
git add src/features/ai-design/templates/retail-product-landscape.ts
git commit -m "feat(templates): template retail-product-landscape"
```

---

## Task 5: Registry + picker

**Files:**
- Create: `src/features/ai-design/templates/index.ts`
- Create: `src/features/ai-design/templates/__tests__/registry.test.ts`

- [ ] **Step 1: Écrire le test registry**

```ts
import { describe, it, expect } from 'vitest'
import { getTemplate, listTemplates, pickTemplateByAspect } from '../index'

describe('template registry', () => {
  it('listTemplates returns portrait and landscape at minimum', () => {
    const templates = listTemplates()
    const ids = templates.map((t) => t.id)
    expect(ids).toContain('retail-product-portrait')
    expect(ids).toContain('retail-product-landscape')
  })

  it('getTemplate returns template for valid id', () => {
    const t = getTemplate('retail-product-portrait')
    expect(t).not.toBeNull()
    expect(t!.id).toBe('retail-product-portrait')
    expect(t!.slots.title).toBeDefined()
  })

  it('getTemplate returns null for unknown id', () => {
    expect(getTemplate('nonexistent')).toBeNull()
  })

  it('pickTemplateByAspect returns portrait for tall canvas', () => {
    const t = pickTemplateByAspect(100, 150)
    expect(t.aspectRatio).toBe('portrait')
  })

  it('pickTemplateByAspect returns landscape for wide canvas', () => {
    const t = pickTemplateByAspect(200, 100)
    expect(t.aspectRatio).toBe('landscape')
  })
})
```

- [ ] **Step 2: Lancer le test (doit échouer — index.ts n'existe pas)**

```bash
npx vitest run src/features/ai-design/templates/__tests__/registry.test.ts
```

Expected: FAIL avec module not found.

- [ ] **Step 3: Implémenter index.ts**

```ts
/**
 * Registry de templates. Point d'entrée public du module templates.
 */

import type { Template } from './types'
import { retailProductPortrait } from './retail-product-portrait'
import { retailProductLandscape } from './retail-product-landscape'

const TEMPLATES: Template[] = [
  retailProductPortrait,
  retailProductLandscape,
]

export function listTemplates(): Template[] {
  return TEMPLATES
}

export function getTemplate(id: string): Template | null {
  return TEMPLATES.find((t) => t.id === id) ?? null
}

/**
 * Heuristique de sélection par défaut quand le LLM ne spécifie pas ou qu'un
 * fallback est nécessaire. Portrait si h ≥ w, landscape sinon.
 */
export function pickTemplateByAspect(widthMm: number, heightMm: number): Template {
  const wantPortrait = heightMm >= widthMm
  const candidate = TEMPLATES.find((t) =>
    wantPortrait ? t.aspectRatio === 'portrait' : t.aspectRatio === 'landscape'
  )
  return candidate ?? TEMPLATES[0]
}

export type { Template } from './types'
export type {
  NormalizedBbox,
  TextSlot,
  ImageSlot,
  FeatureListSlot,
  FeatureItemSlot,
  Palette,
  ColorRef,
} from './types'
```

- [ ] **Step 4: Lancer les tests**

```bash
npx vitest run src/features/ai-design/templates/__tests__/registry.test.ts
```

Expected: 5 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/ai-design/templates/index.ts src/features/ai-design/templates/__tests__/registry.test.ts
git commit -m "feat(templates): registry + sélection par aspect ratio"
```

---

## Task 6: Template fill schema (Zod + JSON pour LLM)

**Files:**
- Create: `src/features/ai-design/templateFillSchema.ts`
- Create: `src/features/ai-design/__tests__/templateFillSchema.test.ts`

- [ ] **Step 1: Écrire le test schema**

```ts
import { describe, it, expect } from 'vitest'
import { templateFillSchema } from '../templateFillSchema'

describe('templateFillSchema', () => {
  const valid = {
    templateId: 'retail-product-portrait',
    palette: { primary: '#0A6E7C', secondary: '#E30613', neutral: '#F4F6F8', text: '#0E2A47' },
    copy: {
      title: 'TAILLE-HAIE À BATTERIE',
      subtitle: 'DUH752Z — 75 cm',
      features: [
        { title: 'Puissance Équivalente', desc: 'Moteur BL sans balais.', pictoHint: 'zap' },
      ],
      priceNew: '199,50€',
      priceOld: '250,77€',
      cta: 'ACHETER MAINTENANT',
      mentions: '*Batterie non incluse*',
    },
    assetMappings: { logo: 0, badge: 1, heroProduct: 3 },
  }

  it('accepts a valid fill data', () => {
    expect(() => templateFillSchema.parse(valid)).not.toThrow()
  })

  it('rejects title longer than 60 chars', () => {
    const tooLong = { ...valid, copy: { ...valid.copy, title: 'A'.repeat(61) } }
    expect(() => templateFillSchema.parse(tooLong)).toThrow()
  })

  it('rejects palette with invalid hex', () => {
    const bad = { ...valid, palette: { ...valid.palette, primary: 'red' } }
    expect(() => templateFillSchema.parse(bad)).toThrow()
  })

  it('rejects features without title', () => {
    const bad = { ...valid, copy: { ...valid.copy, features: [{ desc: 'x', title: '' }] } }
    expect(() => templateFillSchema.parse(bad)).toThrow()
  })

  it('accepts features array with up to 8 items', () => {
    const withMax = {
      ...valid,
      copy: {
        ...valid.copy,
        features: Array.from({ length: 8 }, (_, i) => ({
          title: `F${i}`,
          desc: 'desc',
        })),
      },
    }
    expect(() => templateFillSchema.parse(withMax)).not.toThrow()
  })

  it('rejects features array with more than 8 items', () => {
    const tooMany = {
      ...valid,
      copy: {
        ...valid.copy,
        features: Array.from({ length: 9 }, (_, i) => ({ title: `F${i}`, desc: 'x' })),
      },
    }
    expect(() => templateFillSchema.parse(tooMany)).toThrow()
  })
})
```

- [ ] **Step 2: Lancer le test (doit échouer)**

```bash
npx vitest run src/features/ai-design/__tests__/templateFillSchema.test.ts
```

Expected: FAIL avec module not found.

- [ ] **Step 3: Implémenter templateFillSchema.ts**

```ts
/**
 * Schéma de l'output LLM pour le remplissage d'un template.
 *
 * Limites de longueur strictement enforcées — empêchent le LLM de produire des
 * copy-blocks interminables comme dans l'ancien pipeline.
 */

import { z } from 'zod'

const hexColor = z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'hex #RRGGBB attendu')

const featureSchema = z.object({
  title: z.string().min(1).max(40),
  desc: z.string().min(1).max(120),
  /** Clé de pictoLibrary (ou alias). Le LLM choisit sémantiquement. */
  pictoHint: z.string().max(30).optional(),
})

export const templateFillSchema = z.object({
  templateId: z.string(),
  palette: z.object({
    primary: hexColor,
    secondary: hexColor,
    neutral: hexColor,
    text: hexColor,
  }),
  copy: z.object({
    title: z.string().min(3).max(60),
    subtitle: z.string().max(80).optional(),
    features: z.array(featureSchema).min(0).max(8),
    priceNew: z.string().max(20).optional(),
    priceOld: z.string().max(20).optional(),
    cta: z.string().max(30).optional(),
    mentions: z.string().max(240).optional(),
  }),
  /** Index (0-based) dans le tableau scrapedAssets pour chaque slot image.
   *  Les entrées optionnelles peuvent être omises si le template n'a pas ce slot
   *  ou si aucun asset scrapé ne correspond. */
  assetMappings: z.object({
    logo: z.number().int().min(0).optional(),
    badge: z.number().int().min(0).optional(),
    heroProduct: z.number().int().min(0).optional(),
  }),
})

export type TemplateFillData = z.infer<typeof templateFillSchema>

/** JSON Schema équivalent, consommé par Claude tool-use et Gemini responseSchema.
 *  Respecte les mêmes contraintes de longueur. */
export const templateFillJsonSchema = {
  type: 'object' as const,
  properties: {
    templateId: { type: 'string' as const, description: 'ID du template choisi (voir liste dans le prompt)' },
    palette: {
      type: 'object' as const,
      properties: {
        primary: { type: 'string' as const, pattern: '^#[0-9A-Fa-f]{6}$' },
        secondary: { type: 'string' as const, pattern: '^#[0-9A-Fa-f]{6}$' },
        neutral: { type: 'string' as const, pattern: '^#[0-9A-Fa-f]{6}$' },
        text: { type: 'string' as const, pattern: '^#[0-9A-Fa-f]{6}$' },
      },
      required: ['primary', 'secondary', 'neutral', 'text'] as const,
    },
    copy: {
      type: 'object' as const,
      properties: {
        title: { type: 'string' as const, minLength: 3, maxLength: 60, description: 'Titre display MAJ, 3-6 mots max' },
        subtitle: { type: 'string' as const, maxLength: 80, description: 'Sous-titre 1 ligne (nom produit + modèle)' },
        features: {
          type: 'array' as const,
          maxItems: 8,
          items: {
            type: 'object' as const,
            properties: {
              title: { type: 'string' as const, minLength: 1, maxLength: 40 },
              desc: { type: 'string' as const, minLength: 1, maxLength: 120 },
              pictoHint: { type: 'string' as const, maxLength: 30, description: 'Mot-clé pour choisir un picto (voir liste dans le prompt)' },
            },
            required: ['title', 'desc'] as const,
          },
        },
        priceNew: { type: 'string' as const, maxLength: 20 },
        priceOld: { type: 'string' as const, maxLength: 20 },
        cta: { type: 'string' as const, maxLength: 30 },
        mentions: { type: 'string' as const, maxLength: 240 },
      },
      required: ['title', 'features'] as const,
    },
    assetMappings: {
      type: 'object' as const,
      properties: {
        logo: { type: 'number' as const },
        badge: { type: 'number' as const },
        heroProduct: { type: 'number' as const },
      },
    },
  },
  required: ['templateId', 'palette', 'copy', 'assetMappings'] as const,
}
```

- [ ] **Step 4: Lancer les tests**

```bash
npx vitest run src/features/ai-design/__tests__/templateFillSchema.test.ts
```

Expected: 6 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/ai-design/templateFillSchema.ts src/features/ai-design/__tests__/templateFillSchema.test.ts
git commit -m "feat(design): schéma Zod + JSON pour template fill data"
```

---

## Task 7: Prompt builder pour le remplissage

**Files:**
- Create: `src/features/ai-design/templateFillPrompt.ts`

- [ ] **Step 1: Implémenter le prompt**

```ts
/**
 * Prompt pour l'appel LLM qui remplit un template.
 *
 * Un seul appel court — le LLM ne conçoit plus le layout, il remplit des cases
 * pré-définies avec du copy contraint en longueur.
 */

import type { Template } from './templates/types'
import { listPictoKeys } from './templates/pictoLibrary'

export interface BuildTemplateFillPromptArgs {
  userPrompt: string
  productName?: string
  templates: Template[]
  scrapedAssets: Array<{ type: string; title?: string }>
  widthMm: number
  heightMm: number
}

export function buildTemplateFillPrompt(args: BuildTemplateFillPromptArgs): string {
  const templatesList = args.templates
    .map((t) => `- **${t.id}** (${t.aspectRatio}) : ${t.description}`)
    .join('\n')

  const assetsList = args.scrapedAssets.length > 0
    ? args.scrapedAssets
        .map((a, i) => `- index=${i} — type=${a.type} — "${a.title ?? '(sans titre)'}"`)
        .join('\n')
    : '(aucun asset scrapé disponible)'

  const pictoKeys = listPictoKeys().join(', ')

  const aspect = args.heightMm >= args.widthMm ? 'portrait' : 'landscape'

  return `Tu es un directeur artistique retail print. Ta tâche : choisir un template et le remplir avec du copy cohérent.

## Brief utilisateur
<user_brief>
${args.userPrompt}
</user_brief>

${args.productName ? `## Produit cible\n${args.productName}\n` : ''}

## Format canvas
${args.widthMm.toFixed(0)} × ${args.heightMm.toFixed(0)} mm — aspect ${aspect}.

## Templates disponibles
${templatesList}

**Règle** : choisis le template dont l'aspect ratio correspond au canvas. Pour un canvas portrait, \`retail-product-portrait\`. Pour un canvas landscape, \`retail-product-landscape\`.

## Assets scrapés (numérotés)
${assetsList}

### Règles d'assignation
- \`logo\` → type \`logo\` (souvent index 0).
- \`badge\` → type \`picto\` (badge technique type LXT, 18V…).
- \`heroProduct\` → type \`image\` (photo produit détourée).

Si aucun asset du type attendu n'est présent, omets le champ \`assetMappings.X\` — le template affichera le slot vide.

## Palette
4 couleurs hex #RRGGBB :
- **primary** : couleur brand dominante (ex: teal Makita \`#0A6E7C\`, rouge Milwaukee \`#E30613\`).
- **secondary** : accent contrasté (souvent le rouge promo).
- **neutral** : fond clair (blanc cassé \`#F4F6F8\` ou gris très pâle).
- **text** : couleur texte principale (navy foncé ou noir charbon).

Choisis cohérent avec la marque du produit.

## Copy

- **title** : 3-6 mots, en MAJUSCULES pour l'impact. Max 60 caractères, y compris espaces.
  - Exemples : "TAILLE-HAIE À BATTERIE", "PERFUSEUR 18V LXT", "PUISSANCE ET PRÉCISION".
- **subtitle** : 1 ligne, nom produit + modèle. Max 80 caractères. Ex: "DUH752Z — Lame 75 cm".
- **features** : 4-7 items. Pour chacun :
  - \`title\` : 2-4 mots, capitalisation normale, **sans deux-points final**. Max 40 caractères. Ex: "Puissance Équivalente", "Conception Ergonomique".
  - \`desc\` : 1 phrase concrète avec une valeur chiffrée si possible. Max 120 caractères. Ex: "Moteur BL sans balais, performance équivalente thermique.".
  - \`pictoHint\` (optionnel mais recommandé) : mot-clé du picto correspondant parmi : ${pictoKeys}. L'assembleur matche ce mot à sa bibliothèque de pictos SVG.
- **priceNew** : nouveau prix avec devise. Ex: "199,50€".
- **priceOld** : ancien prix barré (omis s'il n'y a pas de promo). Ex: "250,77€".
- **cta** : bouton d'action. Ex: "ACHETER MAINTENANT", "VOIR LE PRODUIT". Max 30 caractères.
- **mentions** : mentions légales. Ex: "*Produit vendu sans batterie ni chargeur*". Max 240 caractères.

## Contraintes strictes

- **NE JAMAIS** dépasser les longueurs max — le schema refuse tout texte trop long.
- **Features** : max 8, mais vise 4-7. Pas de paragraphes, des phrases courtes.
- Respecte la capitalisation (titre MAJ, features en capitalisation de mots).

## Sortie

Produis ta réponse via l'outil \`emit_response\` conforme au schéma JSON fourni. Aucune narration hors schema.`
}
```

- [ ] **Step 2: Commit**

```bash
git add src/features/ai-design/templateFillPrompt.ts
git commit -m "feat(design): prompt builder pour template fill"
```

---

## Task 8: Assembleur (cœur du rendu)

**Files:**
- Create: `src/features/ai-design/templates/assembler.ts`
- Create: `src/features/ai-design/templates/__tests__/assembler.test.ts`

L'assembleur fait 3 choses :
1. Projette les bboxes normalisées sur les dimensions réelles (mm).
2. Substitue les couleurs palette dans le decorativeSvg.
3. Émet les slots textuels et images comme `<text>`/`<image>` absolus.

- [ ] **Step 1: Écrire les tests assembler**

```ts
import { describe, it, expect } from 'vitest'
import { assembleSvgFromTemplate } from '../assembler'
import { retailProductPortrait } from '../retail-product-portrait'
import type { TemplateFillData } from '../../templateFillSchema'

const fillData: TemplateFillData = {
  templateId: 'retail-product-portrait',
  palette: {
    primary: '#0A6E7C',
    secondary: '#E30613',
    neutral: '#F4F6F8',
    text: '#0E2A47',
  },
  copy: {
    title: 'TAILLE-HAIE À BATTERIE',
    subtitle: 'DUH752Z — Lame 75 cm',
    features: [
      { title: 'Puissance Équivalente', desc: 'Moteur BL sans balais.', pictoHint: 'zap' },
      { title: 'Conception Ergonomique', desc: 'Poignée pivotante 5 positions.', pictoHint: 'hand' },
    ],
    priceNew: '199,50€',
    priceOld: '250,77€',
    cta: 'ACHETER MAINTENANT',
    mentions: '*Batterie non incluse.*',
  },
  assetMappings: { logo: 0, badge: 1, heroProduct: 3 },
}

describe('assembleSvgFromTemplate', () => {
  it('produces a valid <svg> root', () => {
    const svg = assembleSvgFromTemplate({
      template: retailProductPortrait,
      fillData,
      widthMm: 210,
      heightMm: 297,
      bleedMm: 0,
    })
    expect(svg).toMatch(/^<svg /)
    expect(svg).toMatch(/<\/svg>$/)
    expect(svg).toContain('viewBox="0 0 210 297"')
  })

  it('substitutes palette colors in decorativeSvg', () => {
    const svg = assembleSvgFromTemplate({
      template: retailProductPortrait,
      fillData,
      widthMm: 210,
      heightMm: 297,
      bleedMm: 0,
    })
    expect(svg).toContain('#0A6E7C')
    expect(svg).not.toContain('{{palette.primary}}')
  })

  it('emits placeholder image for heroProduct with correct id', () => {
    const svg = assembleSvgFromTemplate({
      template: retailProductPortrait,
      fillData,
      widthMm: 210,
      heightMm: 297,
      bleedMm: 0,
    })
    expect(svg).toContain('id="heroProduct"')
    expect(svg).toContain('href="placeholder:heroProduct"')
  })

  it('emits title text with data-content', () => {
    const svg = assembleSvgFromTemplate({
      template: retailProductPortrait,
      fillData,
      widthMm: 210,
      heightMm: 297,
      bleedMm: 0,
    })
    expect(svg).toContain('id="title"')
    expect(svg).toMatch(/data-content="TAILLE-HAIE À BATTERIE"/)
  })

  it('emits feature items with pictos', () => {
    const svg = assembleSvgFromTemplate({
      template: retailProductPortrait,
      fillData,
      widthMm: 210,
      heightMm: 297,
      bleedMm: 0,
    })
    expect(svg).toContain('id="feature-0-title"')
    expect(svg).toContain('id="feature-0-desc"')
    expect(svg).toContain('id="feature-1-title"')
    expect(svg).toMatch(/data-content="Puissance Équivalente"/)
    expect(svg).toMatch(/data-content="Moteur BL sans balais\."/)
  })

  it('projects normalized bboxes to absolute mm', () => {
    const svg = assembleSvgFromTemplate({
      template: retailProductPortrait,
      fillData,
      widthMm: 100,
      heightMm: 200,
      bleedMm: 0,
    })
    // logo bbox = {0.04, 0.025, 0.24, 0.065} → (4, 5, 24, 13) mm
    expect(svg).toMatch(/id="logo"[^>]*x="4"[^>]*y="5"[^>]*width="24"[^>]*height="13"/)
  })

  it('emits cta with background rect', () => {
    const svg = assembleSvgFromTemplate({
      template: retailProductPortrait,
      fillData,
      widthMm: 210,
      heightMm: 297,
      bleedMm: 0,
    })
    expect(svg).toContain('id="cta-bg"')
    expect(svg).toContain('id="cta"')
    expect(svg).toMatch(/data-content="ACHETER MAINTENANT"/)
  })

  it('omits slots when fillData has no matching content', () => {
    const partialFill: TemplateFillData = {
      ...fillData,
      copy: { ...fillData.copy, priceOld: undefined, mentions: undefined },
    }
    const svg = assembleSvgFromTemplate({
      template: retailProductPortrait,
      fillData: partialFill,
      widthMm: 210,
      heightMm: 297,
      bleedMm: 0,
    })
    expect(svg).not.toContain('id="priceOld"')
    expect(svg).not.toContain('id="mentions"')
  })

  it('uses bleed-extended viewBox when bleedMm > 0', () => {
    const svg = assembleSvgFromTemplate({
      template: retailProductPortrait,
      fillData,
      widthMm: 210,
      heightMm: 297,
      bleedMm: 3,
    })
    expect(svg).toContain('viewBox="-3 -3 216 303"')
  })
})
```

- [ ] **Step 2: Lancer les tests (doivent tous échouer)**

```bash
npx vitest run src/features/ai-design/templates/__tests__/assembler.test.ts
```

Expected: 9 tests FAIL (module manquant).

- [ ] **Step 3: Implémenter assembler.ts**

```ts
/**
 * Assembleur : template + TemplateFillData + dimensions → SVG final.
 *
 * Flow :
 *  1. Projette les bboxes normalisées (0-1) sur widthMm × heightMm.
 *  2. Substitue {{palette.X}} dans decorativeSvg.
 *  3. Émet <rect> de fond si slot texte a un backgroundRef.
 *  4. Émet <image> placeholder pour chaque image slot (le useGenerateDesign
 *     remplacera plus tard par les data URIs).
 *  5. Émet <text> pour chaque slot texte avec data-content pour le re-wrap
 *     naturel par Fabric.Textbox.
 *  6. Émet les features item par item (picto + title + desc).
 */

import type {
  Template,
  NormalizedBbox,
  TextSlot,
  ImageSlot,
  FeatureListSlot,
  Palette,
  ColorRef,
} from './types'
import type { TemplateFillData } from '../templateFillSchema'
import { resolvePicto } from './pictoLibrary'

export interface AssembleArgs {
  template: Template
  fillData: TemplateFillData
  widthMm: number
  heightMm: number
  bleedMm: number
}

/** Projette un bbox normalisé (0-1) sur les dimensions du canvas, en mm. */
function project(bbox: NormalizedBbox, widthMm: number, heightMm: number) {
  return {
    x: bbox.x * widthMm,
    y: bbox.y * heightMm,
    w: bbox.w * widthMm,
    h: bbox.h * heightMm,
  }
}

/** Résout une référence couleur en hex. */
function resolveColor(ref: ColorRef, palette: Palette): string {
  switch (ref) {
    case 'primary': return palette.primary
    case 'secondary': return palette.secondary
    case 'neutral': return palette.neutral
    case 'text': return palette.text
    case 'white': return '#FFFFFF'
    case 'black': return '#000000'
    default:
      // hex littéral ou clé inconnue : on retourne la valeur telle quelle.
      return ref
  }
}

/** Substitue {{palette.primary}} etc. dans le SVG décoratif. */
function substitutePalette(svg: string, palette: Palette): string {
  return svg
    .replace(/\{\{palette\.primary\}\}/g, palette.primary)
    .replace(/\{\{palette\.secondary\}\}/g, palette.secondary)
    .replace(/\{\{palette\.neutral\}\}/g, palette.neutral)
    .replace(/\{\{palette\.text\}\}/g, palette.text)
}

/**
 * Scale une taille pt selon la surface du canvas par rapport à la surface A4.
 * Un template est designé pour A4 (210×297 mm) ; pour un canvas plus petit/grand,
 * on scale les fontSize au pro-rata de la racine carrée du ratio de surfaces
 * (préserve la proportion visuelle sans créer des textes démesurés sur grand format).
 */
const A4_AREA_MM2 = 210 * 297

function scaleFontSize(baseSizePt: number, widthMm: number, heightMm: number): number {
  const area = widthMm * heightMm
  const ratio = Math.sqrt(area / A4_AREA_MM2)
  return baseSizePt * ratio
}

function escapeAttr(v: string): string {
  return v.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')
}

function escapeText(v: string): string {
  return v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/** Encode \n en &#10; pour survivre à la sérialisation XML d'attribut. */
function encodeDataContent(v: string): string {
  return escapeAttr(v).replace(/\n/g, '&#10;')
}

interface EmittedPart {
  zIndex: number
  svg: string
}

function emitImageSlot(
  id: string,
  slot: ImageSlot,
  widthMm: number,
  heightMm: number,
  palette: Palette,
  fallbackToPicto: boolean,
): EmittedPart[] {
  const box = project(slot.bbox, widthMm, heightMm)
  // Image placeholder — sera remplacé par un data URI au stade slot-fill.
  const img = `<image id="${escapeAttr(id)}" x="${box.x}" y="${box.y}" width="${box.w}" height="${box.h}" href="placeholder:${escapeAttr(id)}" preserveAspectRatio="${slot.preserveAspectRatio === 'contain' ? 'xMidYMid meet' : 'xMidYMid slice'}"/>`
  const parts: EmittedPart[] = [{ zIndex: 50, svg: img }]

  if (fallbackToPicto && slot.fallbackPictoKey) {
    const picto = resolvePicto(slot.fallbackPictoKey)
    if (picto) {
      parts.push({
        zIndex: 40,
        svg: `<svg x="${box.x}" y="${box.y}" width="${box.w}" height="${box.h}" viewBox="0 0 24 24" color="${resolveColor('text', palette)}">${picto.content}</svg>`,
      })
    }
  }

  return parts
}

function emitTextSlot(
  id: string,
  slot: TextSlot,
  content: string,
  palette: Palette,
  widthMm: number,
  heightMm: number,
  fontFamily: string,
): EmittedPart[] {
  const box = project(slot.bbox, widthMm, heightMm)
  const parts: EmittedPart[] = []

  // Rect de fond pour les slots CTA/price-badge qui en définissent un.
  if (slot.backgroundRef) {
    const bgColor = resolveColor(slot.backgroundRef, palette)
    parts.push({
      zIndex: 20,
      svg: `<rect id="${escapeAttr(id)}-bg" x="${box.x}" y="${box.y}" width="${box.w}" height="${box.h}" fill="${escapeAttr(bgColor)}" stroke="none" data-role="slot-background"/>`,
    })
  }

  const fontSizePt = scaleFontSize(slot.fontSize, widthMm, heightMm)
  const fontSizeMm = fontSizePt * 0.3528

  const textAnchor = slot.align === 'center' ? 'middle' : slot.align === 'right' ? 'end' : 'start'
  const anchorX =
    slot.align === 'center' ? box.x + box.w / 2
    : slot.align === 'right' ? box.x + box.w
    : box.x

  // Positionnement baseline : centré verticalement dans la bbox pour les textes
  // à 1 ligne (cas typique title/subtitle/cta/price). Le Textbox re-wrap naturel.
  const verticalCenter = box.y + box.h / 2
  const baselineY = verticalCenter + fontSizeMm * 0.35

  const fillColor = resolveColor(slot.colorRef, palette)
  const decoAttr = slot.decoration ? ` text-decoration="${slot.decoration}"` : ''
  const dataContent = ` data-content="${encodeDataContent(content)}"`

  const attrs = `font-family="${escapeAttr(fontFamily)}" font-size="${fontSizeMm}" font-weight="${slot.fontWeight}" fill="${escapeAttr(fillColor)}" text-anchor="${textAnchor}" width="${box.w}"${decoAttr}${dataContent}`

  parts.push({
    zIndex: 70,
    svg: `<text id="${escapeAttr(id)}" x="${anchorX}" y="${baselineY}" ${attrs}>${escapeText(content)}</text>`,
  })

  return parts
}

function emitFeatureList(
  listSlot: FeatureListSlot,
  features: TemplateFillData['copy']['features'],
  palette: Palette,
  widthMm: number,
  heightMm: number,
  bodyFont: string,
): EmittedPart[] {
  const parts: EmittedPart[] = []
  const container = project(listSlot.container, widthMm, heightMm)
  const items = features.slice(0, listSlot.maxItems)
  if (items.length === 0) return parts

  // Calcul de la bbox de chaque item.
  const layoutRows = listSlot.layout === 'grid-2col' ? Math.ceil(items.length / 2) : items.length
  const itemH = container.h / layoutRows
  const itemW = listSlot.layout === 'grid-2col' ? container.w / 2 : container.w

  items.forEach((feature, i) => {
    const row = listSlot.layout === 'grid-2col' ? Math.floor(i / 2) : i
    const col = listSlot.layout === 'grid-2col' ? i % 2 : 0
    const itemOriginX = container.x + col * itemW
    const itemOriginY = container.y + row * itemH

    const templateItem = listSlot.itemTemplate

    // Picto — fallback sur pictoLibrary si pictoHint matche, sinon fallbackPictoKey du template.
    const pictoKey = feature.pictoHint ?? templateItem.picto.fallbackPictoKey
    const picto = resolvePicto(pictoKey)
    if (picto) {
      const pb = templateItem.picto.bbox
      const px = itemOriginX + pb.x * itemW
      const py = itemOriginY + pb.y * itemH
      const pw = pb.w * itemW
      const ph = pb.h * itemH
      parts.push({
        zIndex: 60,
        svg: `<svg id="feature-${i}-picto" x="${px}" y="${py}" width="${pw}" height="${ph}" viewBox="0 0 24 24" color="${resolveColor('primary', palette)}">${picto.content}</svg>`,
      })
    }

    // Title — émis comme un TextSlot synthétisé.
    const titleBox = templateItem.title.bbox
    const titleSlot: TextSlot = {
      bbox: {
        x: (itemOriginX + titleBox.x * itemW) / widthMm,
        y: (itemOriginY + titleBox.y * itemH) / heightMm,
        w: (titleBox.w * itemW) / widthMm,
        h: (titleBox.h * itemH) / heightMm,
      },
      role: 'body',
      fontFamily: 'body',
      fontSize: templateItem.title.fontSize,
      fontWeight: templateItem.title.fontWeight,
      align: 'left',
      colorRef: templateItem.title.colorRef,
    }
    parts.push(...emitTextSlot(`feature-${i}-title`, titleSlot, feature.title, palette, widthMm, heightMm, bodyFont))

    // Desc — idem.
    const descBox = templateItem.desc.bbox
    const descSlot: TextSlot = {
      bbox: {
        x: (itemOriginX + descBox.x * itemW) / widthMm,
        y: (itemOriginY + descBox.y * itemH) / heightMm,
        w: (descBox.w * itemW) / widthMm,
        h: (descBox.h * itemH) / heightMm,
      },
      role: 'body',
      fontFamily: 'body',
      fontSize: templateItem.desc.fontSize,
      fontWeight: templateItem.desc.fontWeight,
      align: 'left',
      colorRef: templateItem.desc.colorRef,
    }
    parts.push(...emitTextSlot(`feature-${i}-desc`, descSlot, feature.desc, palette, widthMm, heightMm, bodyFont))
  })

  return parts
}

export function assembleSvgFromTemplate(args: AssembleArgs): string {
  const { template, fillData, widthMm, heightMm, bleedMm } = args
  const palette = fillData.palette

  const parts: EmittedPart[] = []

  // Fond neutre full-canvas (palette.neutral) — non-sélectionnable.
  parts.push({
    zIndex: 0,
    svg: `<rect x="${-bleedMm}" y="${-bleedMm}" width="${widthMm + 2 * bleedMm}" height="${heightMm + 2 * bleedMm}" fill="${escapeAttr(palette.neutral)}" stroke="none" data-role="background-decor"/>`,
  })

  // SVG décoratif du template (coords en % du viewBox, substitution palette).
  const decorSvg = substitutePalette(template.decorativeSvg, palette)
  parts.push({ zIndex: 10, svg: decorSvg })

  const heroFont = template.fonts.hero
  const bodyFont = template.fonts.body
  const resolveFont = (f: 'hero' | 'body') => (f === 'hero' ? heroFont : bodyFont)

  // Image slots
  if (template.slots.logo) {
    const hasAsset = fillData.assetMappings.logo !== undefined
    parts.push(...emitImageSlot('logo', template.slots.logo, widthMm, heightMm, palette, !hasAsset))
  }
  if (template.slots.badge) {
    const hasAsset = fillData.assetMappings.badge !== undefined
    parts.push(...emitImageSlot('badge', template.slots.badge, widthMm, heightMm, palette, !hasAsset))
  }
  if (template.slots.heroProduct) {
    const hasAsset = fillData.assetMappings.heroProduct !== undefined
    parts.push(...emitImageSlot('heroProduct', template.slots.heroProduct, widthMm, heightMm, palette, !hasAsset))
  }

  // Text slots
  if (template.slots.title) {
    parts.push(...emitTextSlot('title', template.slots.title, fillData.copy.title, palette, widthMm, heightMm, resolveFont(template.slots.title.fontFamily)))
  }
  if (template.slots.subtitle && fillData.copy.subtitle) {
    parts.push(...emitTextSlot('subtitle', template.slots.subtitle, fillData.copy.subtitle, palette, widthMm, heightMm, resolveFont(template.slots.subtitle.fontFamily)))
  }
  if (template.slots.priceNew && fillData.copy.priceNew) {
    parts.push(...emitTextSlot('priceNew', template.slots.priceNew, fillData.copy.priceNew, palette, widthMm, heightMm, resolveFont(template.slots.priceNew.fontFamily)))
  }
  if (template.slots.priceOld && fillData.copy.priceOld) {
    parts.push(...emitTextSlot('priceOld', template.slots.priceOld, fillData.copy.priceOld, palette, widthMm, heightMm, resolveFont(template.slots.priceOld.fontFamily)))
  }
  if (template.slots.cta && fillData.copy.cta) {
    parts.push(...emitTextSlot('cta', template.slots.cta, fillData.copy.cta, palette, widthMm, heightMm, resolveFont(template.slots.cta.fontFamily)))
  }
  if (template.slots.mentions && fillData.copy.mentions) {
    parts.push(...emitTextSlot('mentions', template.slots.mentions, fillData.copy.mentions, palette, widthMm, heightMm, resolveFont(template.slots.mentions.fontFamily)))
  }

  // Features list
  if (template.slots.features && fillData.copy.features.length > 0) {
    parts.push(...emitFeatureList(template.slots.features, fillData.copy.features, palette, widthMm, heightMm, bodyFont))
  }

  // Tri par zIndex (stable) pour garantir l'ordre de rendu.
  parts.sort((a, b) => a.zIndex - b.zIndex)

  const viewBox = `${-bleedMm} ${-bleedMm} ${widthMm + 2 * bleedMm} ${heightMm + 2 * bleedMm}`
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}">${parts.map((p) => p.svg).join('')}</svg>`
}
```

- [ ] **Step 4: Lancer les tests**

```bash
npx vitest run src/features/ai-design/templates/__tests__/assembler.test.ts
```

Expected: 9 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/ai-design/templates/assembler.ts src/features/ai-design/templates/__tests__/assembler.test.ts
git commit -m "feat(templates): assembleur déterministe template → SVG"
```

---

## Task 9: Router LLM + tâche `design.templateFill`

**Files:**
- Modify: `src/features/ai/llmRouter.ts`

- [ ] **Step 1: Ajouter la tâche au routing table**

Dans `src/features/ai/llmRouter.ts`, ligne 41-54 (`type LLMTask`), ajouter :

```ts
type LLMTask =
  | 'brief.dynamicQuestions'
  | 'brief.cartGeneration'
  | 'brief.deckStructure'
  | 'brief.imagePrompts'
  | 'brief.catalogKeywords'
  | 'product.enrichment'
  | 'design.generate'      // legacy — à supprimer task 11
  | 'design.plan'          // legacy — à supprimer task 11
  | 'design.emit'          // legacy — à supprimer task 11
  | 'design.vectorize'     // legacy — à supprimer task 11
  | 'design.validate.visual' // legacy — à supprimer task 11
  | 'design.critic.vision' // legacy — à supprimer task 11
  | 'design.templateFill'  // nouveau
```

Dans `TASK_ROUTING` (ligne 67+) :

```ts
'design.templateFill':    { primary: 'claude', fallback: 'gemini', model: 'claude-opus-4-7' },
```

Dans `TASK_TEMPERATURE` (ligne 88+) :

```ts
'design.templateFill':    0.5,
```

Dans la branche `max_tokens` (ligne 244+) : inutile de modifier, `design.templateFill` n'est PAS dans la liste `design.emit | design.generate | design.vectorize | design.plan | design.critic.vision`, donc retombe sur le défaut 8192 — suffisant pour du copy court.

- [ ] **Step 2: Vérifier le type-check**

```bash
npx tsc --noEmit
```

Expected: exit code 0.

- [ ] **Step 3: Commit**

```bash
git add src/features/ai/llmRouter.ts
git commit -m "feat(llm): route design.templateFill sur Claude Opus 4.7"
```

---

## Task 10: Réécrire `useGenerateDesign`

**Files:**
- Modify (rewrite): `src/features/ai-design/useGenerateDesign.ts`

Remplacer complètement le fichier par la version template-based.

- [ ] **Step 1: Remplacer le contenu complet du fichier**

```ts
import { useState, useCallback, useRef } from 'react'
import { toast } from 'sonner'
import { generateJson } from '@/features/ai/llmRouter'
import { buildTemplateFillPrompt } from './templateFillPrompt'
import { templateFillSchema, templateFillJsonSchema, type TemplateFillData } from './templateFillSchema'
import { listTemplates, getTemplate, pickTemplateByAspect } from './templates'
import { assembleSvgFromTemplate } from './templates/assembler'
import { generateProductAssets, extractSupplierUrl } from './generateProductAssets'
import { sanitizeSvg } from './sanitizeSvg'
import { validateSvgFonts } from './fontsValidator'
import { scaleObjectForCanvas } from './scaleFabricObjects'
import type { DesignRequest, DesignResult } from './types'
import { parseSvgToFabric } from '@/features/svg/svgToFabric'
import { globalFabricCanvas, globalFitCanvas } from '@/features/editor/CanvasContainer'
import { syncToStore } from '@/features/editor/useAddObject'
import { useUIStore } from '@/stores/ui.store'
import { getFormatById } from '@/features/print/PRINT_FORMATS'
import { mmToPx, pxToMm } from '@/features/print/dimensions'
import { AVAILABLE_FONTS } from '@/features/assets/useFonts'

export type Step = 'idle' | 'planning' | 'illustrating' | 'sanitizing' | 'rendering' | 'done' | 'error'

interface State {
  step: Step
  progress: string
  error: string | null
  lastResult: DesignResult | null
  lastFillData: TemplateFillData | null
}

export function useGenerateDesign() {
  const runningRef = useRef(false)
  const [state, setState] = useState<State>({
    step: 'idle',
    progress: '',
    error: null,
    lastResult: null,
    lastFillData: null,
  })

  const generate = useCallback(async (req: DesignRequest) => {
    if (runningRef.current) return
    runningRef.current = true
    try {
      setState((s) => ({ ...s, error: null, lastResult: null, lastFillData: null }))

      // ─── Dimensions canvas ─────────────────────────────────────────────────
      const { canvasWidth, canvasHeight, bleedMm: storeBleed, dpi: storeDpi } = useUIStore.getState()

      let formatLabel = `Custom ${canvasWidth} × ${canvasHeight} px`
      let formatNativeDpi: number | undefined
      if (req.formatId !== 'custom') {
        const f = getFormatById(req.formatId)
        if (f) {
          const fDpi = f.nativeDpi ?? storeDpi
          const wPxExpected = Math.round(mmToPx(f.widthMm, fDpi))
          const hPxExpected = Math.round(mmToPx(f.heightMm, fDpi))
          if (Math.abs(wPxExpected - canvasWidth) <= 2 && Math.abs(hPxExpected - canvasHeight) <= 2) {
            formatLabel = f.label
            formatNativeDpi = f.nativeDpi
          }
        }
      }

      const dpi = formatNativeDpi ?? storeDpi
      const widthMm = pxToMm(canvasWidth, dpi)
      const heightMm = pxToMm(canvasHeight, dpi)
      const effectiveBleed = req.includeBleed ? Math.max(storeBleed, 3) : 0

      if (useUIStore.getState().bleedMm !== effectiveBleed) {
        useUIStore.getState().setBleedMm(effectiveBleed)
      }

      console.log('[Claude Design] Canvas:', `${widthMm.toFixed(0)}×${heightMm.toFixed(0)}mm (bleed ${effectiveBleed}mm)`, 'format:', formatLabel)

      // ─── Phase 1 : scraping des assets produit ─────────────────────────────
      setState((s) => ({ ...s, step: 'illustrating', progress: 'Récupération des assets produit…' }))

      const supplierUrl = extractSupplierUrl(req.prompt, req.productImageUrl)
      const productName = req.productName || req.prompt.split('\n')[0].substring(0, 100)

      const productAssetsResult = supplierUrl && productName
        ? await generateProductAssets(supplierUrl, productName)
        : { ok: true, assets: [] as Array<{ type: string; title?: string; dataUri: string }> }

      const scrapedAssets = productAssetsResult.ok ? (productAssetsResult.assets ?? []) : []
      console.log(`[Claude Design] ✓ ${scrapedAssets.length} assets scrapés`)
      scrapedAssets.forEach((a, i) => console.log(`  → [${i}] ${a.type}: ${a.title ?? ''}`))

      // ─── Phase 2 : LLM template fill ──────────────────────────────────────
      setState((s) => ({ ...s, step: 'planning', progress: 'Sélection du template et rédaction…' }))

      const templates = listTemplates()
      const prompt = buildTemplateFillPrompt({
        userPrompt: req.prompt,
        productName: req.productName,
        templates,
        scrapedAssets: scrapedAssets.map((a) => ({ type: a.type, title: a.title })),
        widthMm,
        heightMm,
      })

      let fillData: TemplateFillData
      try {
        fillData = await generateJson<TemplateFillData>({
          task: 'design.templateFill',
          prompt,
          schema: templateFillSchema,
          schemaForLLM: templateFillJsonSchema,
          schemaForClaude: templateFillJsonSchema,
          version: 'design.templateFill.v1',
        })
        console.log('[Claude Design] ✓ Template fill:', fillData.templateId, '|', fillData.copy.features.length, 'features')
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        setState((s) => ({ ...s, step: 'error', progress: '', error: `LLM échoué : ${msg}`, lastResult: null, lastFillData: null }))
        return
      }

      // ─── Phase 3 : assemblage SVG ──────────────────────────────────────────
      setState((s) => ({ ...s, progress: 'Assemblage du SVG…', lastFillData: fillData }))

      let template = getTemplate(fillData.templateId)
      if (!template) {
        console.warn(`[Claude Design] Template inconnu "${fillData.templateId}", fallback sur aspect-based`)
        template = pickTemplateByAspect(widthMm, heightMm)
      }

      const assembledSvg = assembleSvgFromTemplate({
        template,
        fillData,
        widthMm,
        heightMm,
        bleedMm: effectiveBleed,
      })

      // ─── Phase 4 : sanitize ────────────────────────────────────────────────
      setState((s) => ({ ...s, step: 'sanitizing', progress: 'Validation du SVG…' }))

      let cleanSvg: string
      try {
        cleanSvg = sanitizeSvg(assembledSvg)
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        setState((s) => ({ ...s, step: 'error', progress: '', error: `SVG invalide : ${msg}`, lastResult: null, lastFillData: fillData }))
        return
      }

      // Fonts validation + fallback
      const availableFonts = AVAILABLE_FONTS.map((f) => f.family)
      const fontCheck = validateSvgFonts(cleanSvg, availableFonts)
      if (fontCheck.missingFonts.length > 0) {
        toast.warning(`Fonts non disponibles : ${fontCheck.missingFonts.join(', ')}. Remplacées par Inter.`)
        for (const missing of fontCheck.missingFonts) {
          const reDouble = new RegExp(`font-family\\s*=\\s*"${missing}[^"]*"`, 'g')
          const reSingle = new RegExp(`font-family\\s*=\\s*'${missing}[^']*'`, 'g')
          cleanSvg = cleanSvg.replace(reDouble, 'font-family="Inter"').replace(reSingle, 'font-family="Inter"')
        }
      }

      // ─── Phase 5 : injection des assets scrapés ───────────────────────────
      let finalSvg = cleanSvg
      const replacePlaceholder = (slotId: string, assetIdx: number | undefined) => {
        if (assetIdx === undefined || assetIdx < 0 || assetIdx >= scrapedAssets.length) return
        const dataUri = scrapedAssets[assetIdx].dataUri
        finalSvg = finalSvg.replace(
          new RegExp(`href="placeholder:${slotId}"`, 'g'),
          `href="${dataUri}"`,
        )
        console.log(`[Claude Design] Slot "${slotId}" ← asset #${assetIdx}`)
      }
      replacePlaceholder('logo', fillData.assetMappings.logo)
      replacePlaceholder('badge', fillData.assetMappings.badge)
      replacePlaceholder('heroProduct', fillData.assetMappings.heroProduct)

      const result: DesignResult = {
        svg: finalSvg,
        widthMm,
        heightMm,
        bleedMm: effectiveBleed,
        palette: [
          fillData.palette.primary,
          fillData.palette.secondary,
          fillData.palette.neutral,
          fillData.palette.text,
        ],
        fontsUsed: Array.from(new Set([template.fonts.hero, template.fonts.body])),
        rationale: `Template ${template.label} — ${fillData.copy.features.length} features`,
        slots: [],
      }
      void formatLabel

      // ─── Phase 6 : rendering sur canvas ───────────────────────────────────
      setState((s) => ({ ...s, step: 'rendering', progress: 'Rendu sur le canvas…' }))

      const canvas = globalFabricCanvas
      if (!canvas) {
        setState((s) => ({ ...s, step: 'error', progress: '', error: 'Canvas non initialisé', lastResult: null, lastFillData: fillData }))
        return
      }

      const toRemove = canvas.getObjects().filter((o) => !o.data?.isGrid && !o.data?.isPageBg && !o.data?.isPrintMark)
      for (const o of toRemove) canvas.remove(o)

      try {
        const { objects } = await parseSvgToFabric(finalSvg)
        const scale = canvasWidth / widthMm
        for (const obj of objects) {
          scaleObjectForCanvas(obj, scale)
          canvas.add(obj)
        }
        canvas.requestRenderAll()
        syncToStore(canvas)
        requestAnimationFrame(() => globalFitCanvas?.())
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        setState((s) => ({ ...s, step: 'error', progress: '', error: `Parse SVG échoué : ${msg}`, lastResult: null, lastFillData: fillData }))
        return
      }

      console.log('[Claude Design] ✓ Pipeline terminé')
      setState((s) => ({ ...s, step: 'done', progress: '', error: null, lastResult: result, lastFillData: fillData }))
    } catch (fatalErr) {
      console.error('[Claude Design] ✗ Fatal:', fatalErr)
      setState((s) => ({ ...s, step: 'error', progress: '', error: `Erreur fatale : ${fatalErr instanceof Error ? fatalErr.message : String(fatalErr)}`, lastResult: null, lastFillData: null }))
    } finally {
      runningRef.current = false
    }
  }, [])

  const reset = useCallback(() => {
    setState({ step: 'idle', progress: '', error: null, lastResult: null, lastFillData: null })
  }, [])

  return { state, generate, reset }
}
```

- [ ] **Step 2: Vérifier le type-check**

```bash
npx tsc --noEmit
```

Expected: exit code 0. Si des imports cassés apparaissent (depuis `DesignProgress.tsx` qui référence `lastPlan`, `nanobananaImage`, `validationAttempt`), les corriger à la volée — voir Task 12.

- [ ] **Step 3: Commit**

```bash
git add src/features/ai-design/useGenerateDesign.ts
git commit -m "feat(design): réécrit le pipeline en template-based (drop AD + Critic + Nano Banana)"
```

---

## Task 11: Supprimer les fichiers obsolètes

Cette tâche supprime tous les fichiers de l'ancien pipeline. On procède fichier par fichier, en vérifiant pour chacun qu'aucun import externe n'est resté (hors `useGenerateDesign.ts` qu'on a déjà mis à jour).

- [ ] **Step 1: Vérifier qu'aucune référence externe subsiste**

```bash
cd /Applications/_IA/Claude_workspace/Web2Print

# Chaque grep doit retourner AU PLUS des résultats dans les fichiers qui vont être supprimés.
for f in artDirectorPrompt artDirectorSchema visionCritic applyCriticPatch buildSvgFromPlan clampPlanToCanvas rasterizeSvg svgFidelityValidator svgEngineerPrompt designPrompt designSchema renderVectorPlan vectorizeImage generateFullDesignImage generateSlotImage saveRefImageToGallery analyzeSvgOverlaps optimizePrompt; do
  echo "=== $f ==="
  grep -rn "from.*ai-design/$f" src/ --include="*.ts" --include="*.tsx" | grep -v "ai-design/$f"
done
```

Expected: chaque section `=== X ===` ne doit montrer aucune ligne (ou seulement des refs circulaires internes au groupe à supprimer).

Si un fichier à conserver référence un des listés : adapter le fichier conservé pour retirer l'import (commit séparé) avant de supprimer.

- [ ] **Step 2: Supprimer les fichiers**

```bash
rm src/features/ai-design/artDirectorPrompt.ts
rm src/features/ai-design/artDirectorSchema.ts
rm src/features/ai-design/visionCritic.ts
rm src/features/ai-design/applyCriticPatch.ts
rm src/features/ai-design/buildSvgFromPlan.ts
rm src/features/ai-design/clampPlanToCanvas.ts
rm src/features/ai-design/rasterizeSvg.ts
rm src/features/ai-design/svgFidelityValidator.ts
rm src/features/ai-design/svgEngineerPrompt.ts
rm src/features/ai-design/designPrompt.ts
rm src/features/ai-design/designPrompt.test.ts
rm src/features/ai-design/designSchema.ts
rm src/features/ai-design/renderVectorPlan.ts
rm src/features/ai-design/vectorizeImage.ts
rm src/features/ai-design/generateFullDesignImage.ts
rm src/features/ai-design/generateSlotImage.ts
rm src/features/ai-design/saveRefImageToGallery.ts
rm src/features/ai-design/analyzeSvgOverlaps.ts
rm src/features/ai-design/optimizePrompt.ts
```

- [ ] **Step 3: Nettoyer les routes LLM legacy**

Dans `src/features/ai/llmRouter.ts`, supprimer des types `LLMTask` et tables `TASK_ROUTING`, `TASK_TEMPERATURE` les entrées :
- `'design.generate'`
- `'design.plan'`
- `'design.emit'`
- `'design.vectorize'`
- `'design.validate.visual'`
- `'design.critic.vision'`

Garder uniquement `'design.templateFill'` pour le design.

- [ ] **Step 4: Vérifier le type-check**

```bash
npx tsc --noEmit
```

Expected: exit code 0. Si erreurs, corriger les imports cassés dans les fichiers UI (`ClaudeDesign*.tsx`, `DesignProgress.tsx`). Ces composants référencent probablement des champs d'état (`lastPlan`, `nanobananaImage`, `validationAttempt`) qui ont disparu.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore(design): supprime ancien pipeline AD + Critic + Nano Banana"
```

---

## Task 12: Ajuster les composants UI

**Files:**
- Modify: `src/features/ai-design/DesignProgress.tsx`
- Modify: `src/features/ai-design/ClaudeDesignModal.tsx` (si besoin)

Ces composants référencent `state.lastPlan`, `state.nanobananaImage`, `state.validationAttempt`, `state.lastValidationResult` qui n'existent plus. Les retirer ou remplacer par `state.lastFillData`.

- [ ] **Step 1: Lister les usages obsolètes**

```bash
grep -rn "lastPlan\|nanobananaImage\|validationAttempt\|lastValidationResult" src/features/ai-design --include="*.tsx"
```

- [ ] **Step 2: Modifier DesignProgress.tsx**

Remplacer toutes les références à `state.lastPlan` par `state.lastFillData`. Retirer l'analyseur d'overlaps (`analyzeAndReport`, `compareWithPlan`) qui pointait sur des APIs supprimées. Garder le log du SVG brut et l'export SVG.

Ouvrir `src/features/ai-design/DesignProgress.tsx`, et adapter la fonction debug pour utiliser `lastFillData` (on loggue `templateId`, `palette`, `copy` au lieu de `zones`).

- [ ] **Step 3: Modifier ClaudeDesignModal.tsx si nécessaire**

Si le composant affiche `nanobananaImage` (image de ref côté UI), retirer cette section — Nano Banana est supprimé.

- [ ] **Step 4: Vérifier le build**

```bash
npx tsc --noEmit
npm run build 2>&1 | tail -20
```

Expected: tsc exit 0 ; build succeeds.

- [ ] **Step 5: Commit**

```bash
git add src/features/ai-design/DesignProgress.tsx src/features/ai-design/ClaudeDesignModal.tsx
git commit -m "refactor(ui): adapte DesignProgress et Modal au nouveau state template-based"
```

---

## Task 13: Test manuel de bout en bout

**Objectif :** valider que le pipeline complet fonctionne sur un cas réel Makita.

- [ ] **Step 1: Lancer le dev server**

```bash
npm run dev
```

- [ ] **Step 2: Ouvrir l'éditeur, choisir un format portrait (A4 par ex.), et générer un design avec le brief :**

```
Créer une affiche promotionnelle Retail graphique et commerciale pour le produit :
https://www.makita.fr/product/duh752z.html
Nom : Taille-haie à batterie DUH752Z
```

- [ ] **Step 3: Vérifier dans la console :**

```
[Claude Design] Canvas: ... mm (bleed ...mm) format: A4 Portrait
[Claude Design] ✓ 5 assets scrapés
[Claude Design] ✓ Template fill: retail-product-portrait | 5 features
[Claude Design] Slot "logo" ← asset #0
[Claude Design] Slot "heroProduct" ← asset #3
[Claude Design] ✓ Pipeline terminé
```

Pas de warnings `⚠️` (ils venaient de l'ancien pipeline).

- [ ] **Step 4: Vérifier visuellement sur le canvas :**

- [ ] Titre visible et bien dimensionné
- [ ] Subtitle visible sous le titre
- [ ] Features sont en colonne, chacune avec son picto + title + desc, pas de chevauchement
- [ ] Hero produit Makita visible à droite
- [ ] Logo Makita dans le header
- [ ] Prix (neuf + barré) dans le bas
- [ ] CTA visible dans le bas
- [ ] Mentions légales en pied

- [ ] **Step 5: Vérifier l'éditabilité :**

- [ ] Double-clic sur le titre → entre en mode édition Textbox (curseur clignotant)
- [ ] Clic sur une feature desc → sélectionne la Textbox
- [ ] Clic sur un background → ne sélectionne RIEN (data-role="background-decor")

- [ ] **Step 6: Tester en format landscape**

Changer le format pour un flyer landscape (par ex. 297×210 mm). Relancer la génération. Vérifier que `retail-product-landscape` est choisi automatiquement.

- [ ] **Step 7: Si tout passe, commit du plan-as-documentation**

```bash
git add docs/superpowers/plans/2026-04-23-template-based-design.md
git commit -m "docs: plan d'implémentation template-based design"
```

---

## Checklist finale de revue

Après complétion, valider :

- [ ] `npx tsc --noEmit` → exit 0
- [ ] `npm test` → tous les tests passent
- [ ] `npm run build` → build OK
- [ ] Génération test sur Makita portrait produit un design lisible + éditable
- [ ] Génération test sur Makita landscape produit un design lisible + éditable
- [ ] Aucun fichier legacy (artDirectorPrompt, visionCritic, etc.) ne subsiste
- [ ] `grep -r "Nano Banana\|buildSvgFromPlan\|artDirector\|visionCritic" src/` → aucun résultat
