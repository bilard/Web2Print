// Déclinaisons multi-format v3 — re-layout piloté par LLM. Module PUR (aucune
// dépendance Fabric/React) : traduit les objets Fabric sérialisés en descripteurs
// pour le LLM, et traduit le placement renvoyé (boîtes en %) en objets transformés
// (cover/contain déterministe). Voir relayoutToFormats.ts pour l'orchestration.
import { z } from 'zod'
import { projectObjectsToFormat, type DeclineTarget } from './declineLayout'
import { translate } from '@/lib/i18n'

/** Objet Fabric sérialisé, sous-ensemble des champs qu'on lit/transforme. */
export interface DesignObject {
  left?: number
  top?: number
  scaleX?: number
  scaleY?: number
  width?: number
  height?: number
  type?: string
  text?: string
  data?: { role?: string; [k: string]: unknown }
  [key: string]: unknown
}

/** Descripteur compact envoyé au LLM (bbox source en fractions [0..1]). */
export interface RelayoutDescriptor {
  i: number
  type: string
  role?: string
  text?: string
  xPct: number
  yPct: number
  wPct: number
  hPct: number
}

/** Placement renvoyé par le LLM pour un objet dans un format cible. */
export interface RelayoutElement {
  i: number
  xPct: number
  yPct: number
  wPct: number
  hPct: number
  fit: 'cover' | 'contain'
}

/** Schéma Zod — valide la STRUCTURE (les bornes sont clampées à l'application). */
export const RelayoutSchema = z.object({
  formats: z.array(
    z.object({
      id: z.string(),
      elements: z.array(
        z.object({
          i: z.number().int(),
          xPct: z.number(),
          yPct: z.number(),
          wPct: z.number(),
          hPct: z.number(),
          fit: z.enum(['cover', 'contain']),
        }),
      ),
    }),
  ),
})

/** JSON Schema (Gemini responseSchema / Claude input_schema). */
export const relayoutJsonSchema = {
  type: 'object',
  properties: {
    formats: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          elements: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                i: { type: 'number' },
                xPct: { type: 'number' },
                yPct: { type: 'number' },
                wPct: { type: 'number' },
                hPct: { type: 'number' },
                fit: { type: 'string', enum: ['cover', 'contain'] },
              },
              required: ['i', 'xPct', 'yPct', 'wPct', 'hPct', 'fit'],
            },
          },
        },
        required: ['id', 'elements'],
      },
    },
  },
  required: ['formats'],
} as const

const round2 = (n: number): number => Math.round(n * 100) / 100

/**
 * Construit un descripteur indexé par objet (même ordre que le tableau source →
 * l'index `i` est la clé de mapping retour). bbox rendue en fractions de la page.
 */
export function buildDescriptors(
  objects: readonly DesignObject[],
  srcW: number,
  srcH: number,
): RelayoutDescriptor[] {
  if (srcW <= 0 || srcH <= 0) return []
  return objects.map((o, i) => {
    const w = (o.width ?? 0) * (o.scaleX ?? 1)
    const h = (o.height ?? 0) * (o.scaleY ?? 1)
    const d: RelayoutDescriptor = {
      i,
      type: String(o.type ?? 'object'),
      xPct: round2((o.left ?? 0) / srcW),
      yPct: round2((o.top ?? 0) / srcH),
      wPct: round2(w / srcW),
      hPct: round2(h / srcH),
    }
    const role = o.data?.role
    if (typeof role === 'string') d.role = role
    if (typeof o.text === 'string' && o.text.trim()) d.text = o.text.slice(0, 60)
    return d
  })
}

const clamp = (n: number, lo: number, hi: number): number =>
  Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : lo

/**
 * Applique le placement LLM (boîtes en %) aux objets sérialisés vers un format
 * cible. Le LLM PLACE (région), le calcul DIMENSIONNE (cover/contain, ratio
 * préservé). Tombent dans le repli homothétique (`projectObjectsToFormat`) :
 * (1) les objets sans placement (aucun `el` pour leur index), ET (2) les objets
 * dont les dimensions courantes sont nulles (`curW<=0`/`curH<=0`, p. ex. un
 * groupe Fabric dont width/height ne sont pas sérialisés) MÊME si un `el` de
 * placement existe — car cover/contain exige une taille source non nulle.
 * Renvoie de NOUVEAUX objets (sources non mutées).
 */
export function applyRelayout<T extends DesignObject>(
  objects: readonly T[],
  srcW: number,
  srcH: number,
  dstW: number,
  dstH: number,
  elements: readonly RelayoutElement[],
): T[] {
  const byIndex = new Map(elements.map((e) => [e.i, e]))
  return objects.map((o, i) => {
    const el = byIndex.get(i)
    const curW = (o.width ?? 0) * (o.scaleX ?? 1)
    const curH = (o.height ?? 0) * (o.scaleY ?? 1)
    if (!el || curW <= 0 || curH <= 0) {
      return projectObjectsToFormat([o], srcW, srcH, dstW, dstH)[0]
    }
    const bx = clamp(el.xPct, 0, 1) * dstW
    const by = clamp(el.yPct, 0, 1) * dstH
    const bw = Math.max(clamp(el.wPct, 0, 1), 0.01) * dstW
    const bh = Math.max(clamp(el.hPct, 0, 1), 0.01) * dstH
    const f =
      el.fit === 'cover'
        ? Math.max(bw / curW, bh / curH)
        : Math.min(bw / curW, bh / curH)
    return {
      ...o,
      left: bx + (bw - curW * f) / 2,
      top: by + (bh - curH * f) / 2,
      scaleX: (o.scaleX ?? 1) * f,
      scaleY: (o.scaleY ?? 1) * f,
    }
  })
}

const DA_PROMPT = `Tu es directeur artistique. On te donne une AFFICHE/CRÉA (image de référence) et la liste de ses ÉLÉMENTS (index "i", "type", "role" éventuel, "text" éventuel, et boîte source "xPct"/"yPct"/"wPct"/"hPct" en fractions [0..1] de la page source).

Tu dois RÉADAPTER la mise en page à plusieurs FORMATS cibles de ratios différents (carré, story verticale, paysage, bannière).

Pour CHAQUE format et CHAQUE élément, renvoie une boîte cible "xPct"/"yPct" (coin haut-gauche, fractions [0..1] de la page CIBLE), "wPct"/"hPct" (taille de la boîte en fractions), et "fit" :
- "cover" : UNIQUEMENT le fond pleine-page (la grande image/forme d'arrière-plan) — il doit COUVRIR toute la page cible (xPct=0, yPct=0, wPct=1, hPct=1, fit="cover").
- "contain" : TOUT le reste (titre, prix, photo produit, logo, mentions) — placé dans une région qui respecte son ratio.

RÈGLES :
- Préserve la hiérarchie visuelle (un gros prix reste proéminent, un logo reste petit dans un coin).
- Adapte la disposition au ratio : en story verticale, empile verticalement ; en bannière horizontale, aligne sur une bande.
- Ne fais pas déborder les éléments "contain" hors de la page (0 ≤ xPct, xPct+wPct ≤ 1, idem en y).
- Renvoie un placement pour CHAQUE index "i" de CHAQUE format.

Réponds UNIQUEMENT en JSON {"formats":[{"id":"<id format>","elements":[{"i":…,"xPct":…,"yPct":…,"wPct":…,"hPct":…,"fit":"cover|contain"}]}]}.`

/** Assemble le prompt envoyé au LLM (image passée séparément en imageDataUris). */
export function buildRelayoutPrompt(
  descriptors: readonly RelayoutDescriptor[],
  targets: readonly DeclineTarget[],
  srcW: number,
  srcH: number,
): string {
  // ⚠️ Le libellé part dans un PROMPT : il reste FRANÇAIS quelle que soit la
  // langue de l'UI (même règle que `buildRegistryContext`).
  const fmts = targets.map((fmt) => ({
    id: fmt.id,
    label: translate('fr', fmt.labelKey),
    w: fmt.w,
    h: fmt.h,
    ratio: round2(fmt.w / fmt.h),
  }))
  return `${DA_PROMPT}

PAGE SOURCE : ${srcW}×${srcH} (ratio ${round2(srcW / srcH)}).

FORMATS CIBLES :
${JSON.stringify(fmts)}

ÉLÉMENTS :
${JSON.stringify(descriptors)}`
}
