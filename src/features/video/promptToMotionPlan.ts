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

type MotionEffect = (typeof EFFECTS)[number]
type MotionPhase = (typeof PHASES)[number]
type MotionDirection = (typeof DIRECTIONS)[number]

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
type Directive = z.infer<typeof DirectiveSchema>

const MotionPlanSchema = z.object({
  fromScratch: z.boolean(),
  directives: z.array(DirectiveSchema).max(24),
})
export type MotionPlan = z.infer<typeof MotionPlanSchema>

// Schéma LÂCHE passé à generateJson : structure seulement (pas de bornes/regex/enum).
// repairMotionPlan est la SEULE autorité de validation (il clamp/drop) — sinon une
// valeur hors-borne légale côté Vertex ferait throw generateJson → plan vide.
const LooseMotionPlanSchema = z.object({
  fromScratch: z.boolean().optional(),
  directives: z
    .array(z.object({ target: z.string(), phase: z.string(), effect: z.string() }).passthrough())
    .optional(),
})

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

// responseSchema STRUCTURÉ mais prudent : on garde la forme (object → directives
// array → items) pour guider le modèle, MAIS `effect` est un `string` LIBRE (pas
// d'enum) car un enum de 29 valeurs déclenche un 400 INVALID_ARGUMENT côté Vertex
// (le reste du code n'utilise que des enums ≤8). Les valeurs d'effet sont dictées
// dans le SYSTEM_PROMPT ; `repairMotionPlan` reste l'unique autorité (clamp/drop
// des effets/cibles invalides).
const SCHEMA_FOR_GEMINI = {
  type: 'object',
  properties: {
    fromScratch: { type: 'boolean' },
    directives: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          target: { type: 'string', description: "id d'objet de l'inventaire, ou \"all\"" },
          phase: { type: 'string', enum: [...PHASES] },
          effect: { type: 'string', description: 'un des effets autorisés listés dans les instructions' },
          intensity: { type: 'number' },
          direction: { type: 'string', enum: [...DIRECTIONS] },
          color: { type: 'string' },
          startSec: { type: 'number' },
          durationSec: { type: 'number' },
          stagger: { type: 'number' },
        },
      },
    },
  },
}

const CASCADE_RE = /\b(cascade|d[ée]cal|un\s+(à|a|par)\s+un|tour\s+à\s+tour|stagger|l'un apr[èe]s l'autre)\b/
const ENTRY_VERB_RE = /\b(entr|arriv|rentr|appara|surg|d[ée]boul)/
const EXIT_VERB_RE = /\b(sort|quitt|dispar|repart|s'en vont|s'en va)/
const EXIT_CUT_RE = /\b(sort|quitt|dispar|repart)/
const DEFAULT_STAGGER = 0.15

/** Découpe l'instruction au 1er verbe de sortie pour raisonner par phase
 *  (entrée vs sortie) sur direction ET cascade. `exitSeg` est '' si pas de coupe. */
function splitPhaseSegments(p: string): { entrySeg: string; exitSeg: string } {
  const cut = p.search(EXIT_CUT_RE)
  return {
    entrySeg: cut > 0 ? p.slice(0, cut) : p,
    exitSeg: cut > 0 ? p.slice(cut) : '',
  }
}

/** Filet DÉTERMINISTE pour les instructions d'animation les plus courantes
 *  (entrée/sortie directionnelles, cascade). Garantit un résultat même quand le
 *  LLM renvoie un plan vide par intermittence. Cible toujours `all`. Retourne []
 *  si l'instruction ne matche aucun motif connu. */
function keywordFallback(prompt: string): Directive[] {
  const p = (prompt || '').toLowerCase()
  const DIRS: Array<[RegExp, MotionDirection]> = [
    [/\bgauche\b/, 'left'], [/\bdroite\b/, 'right'], [/\bhaut\b/, 'top'], [/\bbas\b/, 'bottom'],
  ]
  const findDir = (seg: string): MotionDirection | null => {
    for (const [re, d] of DIRS) if (re.test(seg)) return d
    return null
  }
  const { entrySeg, exitSeg } = splitPhaseSegments(p)
  const out: Directive[] = []
  if (ENTRY_VERB_RE.test(p)) {
    const d: Directive = { target: 'all', phase: 'entry', effect: 'slide-in', direction: findDir(entrySeg) ?? 'left' }
    if (CASCADE_RE.test(entrySeg)) d.stagger = DEFAULT_STAGGER
    out.push(d)
  }
  if (EXIT_VERB_RE.test(p)) {
    const d: Directive = { target: 'all', phase: 'exit', effect: 'slide-out', direction: findDir(exitSeg || p) ?? 'right' }
    // La cascade s'applique aussi à la SORTIE : on lit le segment de sortie.
    if (CASCADE_RE.test(exitSeg || p)) d.stagger = DEFAULT_STAGGER
    out.push(d)
  }
  return out
}

/** Normalisation DÉTERMINISTE du plan FINAL (LLM compris) : si l'instruction
 *  demande une cascade et qu'une directive entry/exit n'a pas de `stagger`, on
 *  l'injecte. Indispensable car le LLM oublie souvent le stagger en SORTIE → la
 *  sortie « part en bloc » au lieu de cascader. Raisonne par segment pour honorer
 *  « entrée en cascade, sortie en bloc ». Idempotent (préserve un stagger fixé). */
export function normalizeCascadeStagger(plan: MotionPlan, prompt: string): MotionPlan {
  const p = (prompt || '').toLowerCase()
  if (!CASCADE_RE.test(p)) return plan
  const { entrySeg, exitSeg } = splitPhaseSegments(p)
  const entryCascade = CASCADE_RE.test(entrySeg)
  const exitCascade = CASCADE_RE.test(exitSeg || p)
  const directives = plan.directives.map((d) => {
    if (typeof d.stagger === 'number') return d
    if (d.phase === 'entry' && entryCascade) return { ...d, stagger: DEFAULT_STAGGER }
    if (d.phase === 'exit' && exitCascade) return { ...d, stagger: DEFAULT_STAGGER }
    return d
  })
  return { ...plan, directives }
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
- CASCADE / DÉCALAGE : le \`stagger\` s'applique aussi bien à l'ENTRÉE qu'à la SORTIE. Si l'utilisateur veut
  une sortie « en cascade / décalée / un par un », mets un \`stagger\` (ex. 0.15) sur la directive exit, comme
  pour l'entrée. Ne laisse JAMAIS une sortie en cascade sans \`stagger\`.
- N'invente pas d'objets : n'utilise que des ids présents dans l'inventaire (ou "all").
- Dès que l'INSTRUCTION contient une intention d'animation (entrer, sortir, glisser, cascade, rebond, pulser,
  tourner, 3D, couleur, etc.), tu DOIS produire au moins une directive. Ne renvoie un tableau vide QUE si
  l'instruction ne décrit STRICTEMENT aucune animation. En cas de doute, produis des directives.
- Recopie \`fromScratch\` depuis le contexte fourni.

FORMAT DE SORTIE — réponds UNIQUEMENT par cet objet JSON, rien d'autre :
{ "fromScratch": false, "directives": [
  { "target": "<id ou 'all'>", "phase": "entry|loop|exit", "effect": "<effet>",
    "intensity": 0.6, "direction": "left|right|top|bottom", "color": "#RRGGBB",
    "startSec": 0, "durationSec": 0.8, "stagger": 0.15 }
] }
(target, phase, effect sont OBLIGATOIRES ; les autres champs sont optionnels — omets-les si inutiles.)

EFFETS AUTORISÉS (n'utilise QUE ceux-ci) :
- entry : slide-in, fade-in, scale-in, blur-in, drop-in, fly-in, flip-in, door-in, fold-in, depth-in
- loop  : pulse, bounce, wave, float, wiggle, color-cycle, glow, vibrate, tilt3d, swing3d, spin3d, flip3d, wobble3d, depth-pop, coin3d
- exit  : slide-out, fade-out, scale-out, flip-out

EXEMPLE — pour « tous les éléments entrent depuis la gauche en cascade, sortent à droite en cascade » :
{ "fromScratch": false, "directives": [
  { "target": "all", "phase": "entry", "effect": "slide-in", "direction": "left", "stagger": 0.15 },
  { "target": "all", "phase": "exit", "effect": "slide-out", "direction": "right", "stagger": 0.15 }
] }

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
  const base =
    SYSTEM_PROMPT +
    `\n[fromScratch=${args.fromScratch}]\n\n[INVENTAIRE]\n${inventoryText}\n\n[INSTRUCTION]\n${prompt}\n`
  const validIds = args.inventory.map((o) => o.id)
  const callOnce = async (extra: string): Promise<MotionPlan> => {
    const raw = await generateJson<z.infer<typeof LooseMotionPlanSchema>>({
      prompt: base + extra,
      schema: LooseMotionPlanSchema,
      schemaForGemini: SCHEMA_FOR_GEMINI,
      version: 'video-motion-plan-v1',
    })
    return repairMotionPlan(raw, validIds)
  }
  const force =
    `\n\nIMPORTANT : l'INSTRUCTION ci-dessus DÉCRIT bien une animation. Tu DOIS produire au moins une directive concrète (pour « tous les éléments » utilise target:"all"). Ne renvoie JAMAIS un tableau "directives" vide ici.`
  let plan: MotionPlan = { fromScratch: args.fromScratch, directives: [] }
  try {
    // Le modèle renvoie PARFOIS un tableau vide pour une instruction pourtant
    // claire (intermittence). On tente jusqu'à 2 relances forcées.
    plan = await callOnce('')
    for (let i = 0; i < 2 && plan.directives.length === 0; i++) {
      plan = await callOnce(force)
    }
  } catch (err) {
    console.warn('Interprétation motion plan échouée :', err)
  }
  // Filet DÉTERMINISTE : si le LLM n'a rien produit (vide ou erreur), on dérive
  // les directives des mots-clés courants — garantit que « entrent gauche /
  // sortent droite / cascade » marche À TOUS LES COUPS, sans dépendre du LLM.
  if (plan.directives.length === 0) {
    const fb = keywordFallback(prompt)
    if (fb.length > 0) plan = { fromScratch: args.fromScratch, directives: fb }
  }
  // Normalisation déterministe : garantit la cascade en sortie même quand le LLM
  // a produit une directive exit sans `stagger` (cas le plus fréquent).
  plan = normalizeCascadeStagger(plan, prompt)
  return { ...plan, fromScratch: args.fromScratch }
}
