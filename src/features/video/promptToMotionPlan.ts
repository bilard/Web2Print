import { z } from 'zod'
import { generateJson } from '@/features/briefs/ai/geminiClient'
import type { CanvasObjectProps } from '@/stores/editor.store'

const PHASES = ['entry', 'loop', 'exit'] as const
const DIRECTIONS = ['left', 'right', 'top', 'bottom'] as const
const EFFECTS = [
  // entry 2D
  'slide-in', 'fade-in', 'scale-in', 'blur-in', 'drop-in', 'fly-in',
  // entry 2.5D
  'flip-in', 'door-in', 'fold-in', 'depth-in',
  // loop 2D
  'pulse', 'bounce', 'wave', 'float', 'wiggle', 'color-cycle', 'glow', 'vibrate',
  // loop 2.5D
  'tilt3d', 'swing3d', 'spin3d', 'flip3d', 'wobble3d', 'depth-pop', 'coin3d',
  // exit
  'slide-out', 'fade-out', 'scale-out', 'flip-out',
] as const

export type MotionEffect = (typeof EFFECTS)[number]
export type MotionPhase = (typeof PHASES)[number]
export type MotionDirection = (typeof DIRECTIONS)[number]

const HEX = /^#[0-9a-fA-F]{6}$/

const DirectiveSchema = z.object({
  target: z.string().min(1).max(40),
  phase: z.enum(PHASES),
  effect: z.enum(EFFECTS),
  intensity: z.number().min(0).max(1).optional(),
  direction: z.enum(DIRECTIONS).optional(),
  color: z.string().regex(HEX).optional(),
  startSec: z.number().min(0).max(15).optional(),
  durationSec: z.number().min(0.1).max(15).optional(),
  stagger: z.number().min(0).max(2).optional(),
})
export type Directive = z.infer<typeof DirectiveSchema>

const MotionPlanSchema = z.object({
  fromScratch: z.boolean(),
  directives: z.array(DirectiveSchema).max(24),
})
export type MotionPlan = z.infer<typeof MotionPlanSchema>

export const EMPTY_MOTION_PLAN: MotionPlan = { fromScratch: false, directives: [] }

export interface SceneObject {
  id: string
  label: string
  type: string
  bbox: { x: number; y: number; w: number; h: number }
}

/** Aplatit les objets (récursif) en inventaire {id,label,type,bbox} pour que
 *  l'IA puisse cibler « le bloc prix » par son texte/nom. */
export function buildSceneInventory(objs: CanvasObjectProps[]): SceneObject[] {
  const out: SceneObject[] = []
  const visit = (list: CanvasObjectProps[]) => {
    for (const o of list) {
      const raw = (o.name || o.text || o.type || '').toString().trim().replace(/\s+/g, ' ')
      out.push({
        id: o.id,
        label: raw ? raw.slice(0, 48) : (o.type || 'objet'),
        type: o.type || 'objet',
        bbox: {
          x: Math.round(o.x ?? 0), y: Math.round(o.y ?? 0),
          w: Math.round(o.width ?? 0), h: Math.round(o.height ?? 0),
        },
      })
      if (o.children) visit(o.children)
    }
  }
  visit(objs)
  return out
}

const EFFECT_SET = new Set<string>(EFFECTS)
const PHASE_SET = new Set<string>(PHASES)
const DIR_SET = new Set<string>(DIRECTIONS)

/** Garde les directives valides, droppe les cibles inconnues / effets invalides,
 *  clamp les nombres. JAMAIS de rejet global → résultat partiel exploitable. */
export function repairMotionPlan(raw: unknown, validIds: string[]): MotionPlan {
  if (!raw || typeof raw !== 'object') return { fromScratch: false, directives: [] }
  const r = raw as Record<string, unknown>
  const idSet = new Set(validIds)
  const list = Array.isArray(r.directives) ? r.directives : []
  const directives: Directive[] = []
  for (const d of list) {
    if (!d || typeof d !== 'object') continue
    const o = d as Record<string, unknown>
    const target = typeof o.target === 'string' ? o.target : ''
    if (target !== 'all' && !idSet.has(target)) continue
    if (typeof o.phase !== 'string' || !PHASE_SET.has(o.phase)) continue
    if (typeof o.effect !== 'string' || !EFFECT_SET.has(o.effect)) continue
    const clamp = (v: unknown, lo: number, hi: number): number | undefined =>
      typeof v === 'number' && Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : undefined
    const dir = typeof o.direction === 'string' && DIR_SET.has(o.direction) ? (o.direction as MotionDirection) : undefined
    const color = typeof o.color === 'string' && HEX.test(o.color) ? o.color : undefined
    directives.push({
      target, phase: o.phase as MotionPhase, effect: o.effect as MotionEffect,
      intensity: clamp(o.intensity, 0, 1), direction: dir, color,
      startSec: clamp(o.startSec, 0, 15), durationSec: clamp(o.durationSec, 0.1, 15),
      stagger: clamp(o.stagger, 0, 2),
    })
    if (directives.length >= 24) break
  }
  return { fromScratch: r.fromScratch === true, directives }
}

const SCHEMA_FOR_GEMINI = {
  type: 'object',
  required: ['fromScratch', 'directives'],
  properties: {
    fromScratch: { type: 'boolean' },
    directives: {
      type: 'array',
      maxItems: 24,
      items: {
        type: 'object',
        required: ['target', 'phase', 'effect'],
        properties: {
          target: { type: 'string', description: "id d'objet de l'inventaire, ou \"all\" pour tous les éléments" },
          phase: { type: 'string', enum: [...PHASES] },
          effect: { type: 'string', enum: [...EFFECTS] },
          intensity: { type: 'number', description: '0..1 (léger≈0.3, moyen≈0.6, franc≈1)' },
          direction: { type: 'string', enum: [...DIRECTIONS] },
          color: { type: 'string', description: 'hex #RRGGBB (glow / color-cycle)' },
          startSec: { type: 'number', description: 'décalage de départ en secondes' },
          durationSec: { type: 'number', description: "durée d'un cycle / de l'entrée en secondes" },
          stagger: { type: 'number', description: 'cascade entre éléments quand target=all (secondes)' },
        },
      },
    },
  },
}

const SYSTEM_PROMPT = `Tu es un motion designer. Tu transformes une instruction d'animation en plan structuré
de directives, appliquées à un design existant (capture SVG). Tu reçois l'INVENTAIRE des objets du design
(id + libellé + type). Tu DOIS cibler chaque directive par un \`target\` = un id de l'inventaire, ou "all".

RÈGLES :
- Résous les descriptions en ids : « le bloc prix » → l'id dont le libellé contient le prix ; « le logo » →
  l'objet logo/image ; « tous les éléments » → "all".
- Chaque directive a une \`phase\` : entry (entrée), loop (boucle continue), exit (sortie).
- Effets 3D par élément (tilt3d, swing3d, spin3d, flip3d, wobble3d, depth-pop, coin3d, flip-in/out, door-in,
  fold-in, depth-in) : ce sont des effets « carte/charnière » (2.5D), choisis-les quand l'utilisateur parle de 3D,
  retournement, pivot, profondeur.
- \`intensity\` ∈ [0,1] continu : mappe tout adjectif (léger≈0.3, moyen≈0.6, franc/à fond≈1).
- ALÉATOIRE : n'écris JAMAIS "random". Si l'utilisateur demande de l'aléatoire/variété (ex. « entrée aléatoire »),
  produis PLUSIEURS directives ciblées (une par id) avec des \`direction\`/\`startSec\`/\`durationSec\` VARIÉS et
  CONCRETS, ou une directive target="all" avec un \`stagger\`. Tout doit être déterministe.
- Respecte les directions demandées (entrée gauche → direction:"left" ; sortie droite → direction:"right").
- N'invente pas d'objets : n'utilise que des ids présents dans l'inventaire (ou "all").
- Si l'instruction est vide ou non pertinente, renvoie directives: [].
- Recopie \`fromScratch\` depuis le contexte fourni.

Réponds UNIQUEMENT par le JSON.

INVENTAIRE + INSTRUCTION :
`

export async function interpretPromptToMotionPlan(args: {
  prompt: string
  inventory: SceneObject[]
  fromScratch: boolean
}): Promise<MotionPlan> {
  const prompt = (args.prompt || '').trim()
  if (!prompt) return { fromScratch: args.fromScratch, directives: [] }
  const inventoryText = args.inventory
    .map((o) => `- id=${o.id} · "${o.label}" · ${o.type}`)
    .join('\n')
  const full =
    SYSTEM_PROMPT +
    `\n[fromScratch=${args.fromScratch}]\n\n[INVENTAIRE]\n${inventoryText}\n\n[INSTRUCTION]\n${prompt}\n`
  try {
    const raw = await generateJson<MotionPlan>({
      prompt: full,
      schema: MotionPlanSchema,
      schemaForGemini: SCHEMA_FOR_GEMINI,
      version: 'video-motion-plan-v1',
    })
    const plan = repairMotionPlan(raw, args.inventory.map((o) => o.id))
    return { ...plan, fromScratch: args.fromScratch }
  } catch (err) {
    console.warn('Interprétation motion plan échouée, plan vide :', err)
    return { fromScratch: args.fromScratch, directives: [] }
  }
}
