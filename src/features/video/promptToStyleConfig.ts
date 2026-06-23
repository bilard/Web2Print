import { z } from 'zod'
import { generateJson } from '@/features/briefs/ai/geminiClient'

const StyleConfigSchema = z.object({
  pace: z.enum(['slow', 'normal', 'fast']),
  intensity: z.enum(['subtle', 'normal', 'punchy']),
  ease: z.enum(['soft', 'classic', 'snappy']),
  /** Personnalité du mouvement — pilote le CARACTÈRE de la chorégraphie
   *  (et pas seulement le timing/l'amplitude). C'est le levier qui rend
   *  audience/objectif/ton visiblement différents à l'écran. */
  motion: z.enum(['cinematic', 'energetic', 'minimal', 'playful']),
  palette: z.object({
    bg: z.string().regex(/^#[0-9a-fA-F]{6}$/),
    accent: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  }),
  mood: z.string().min(1).max(200),
})

export type StyleConfig = z.infer<typeof StyleConfigSchema>

export const DEFAULT_STYLE_CONFIG: StyleConfig = {
  pace: 'normal',
  intensity: 'normal',
  ease: 'classic',
  motion: 'cinematic',
  palette: { bg: '#0a0a0a', accent: '#ffffff' },
  mood: 'Reveal cinématique équilibré',
}

const SCHEMA_FOR_GEMINI = {
  type: 'object',
  required: ['pace', 'intensity', 'ease', 'motion', 'palette', 'mood'],
  properties: {
    pace: { type: 'string', enum: ['slow', 'normal', 'fast'] },
    intensity: { type: 'string', enum: ['subtle', 'normal', 'punchy'] },
    ease: { type: 'string', enum: ['soft', 'classic', 'snappy'] },
    motion: {
      type: 'string',
      enum: ['cinematic', 'energetic', 'minimal', 'playful'],
      description:
        "Personnalité du mouvement. cinematic = posé/premium, mouvements doux, couleurs FIDÈLES (pas de variation de teinte), léger flip 3D. energetic = punchy/dynamique, slides marqués, pulsations, idéal Digital Signage / promo / point de vente. minimal = sobre/corporate, entrée propre quasi statique, aucun effet tape-à-l'œil. playful = ludique/jeune, rebonds, oscillations, couleurs vives.",
    },
    palette: {
      type: 'object',
      required: ['bg', 'accent'],
      properties: {
        bg: { type: 'string', description: 'Couleur de fond hex #RRGGBB' },
        accent: { type: 'string', description: 'Couleur accent texte/marque hex #RRGGBB' },
      },
    },
    mood: { type: 'string', description: 'Description courte (1 phrase) du ton choisi' },
  },
}

const SYSTEM_PROMPT = `Tu transformes un brief vidéo (sujet + audience + objectif + ton + instructions) en config JSON structurée qui anime un visuel produit existant.

CONFIG :
- pace : rythme global (slow = posé, normal = standard, fast = punchy)
- intensity : amplitude des mouvements (subtle = discret, normal = équilibré, punchy = exagéré)
- ease : caractère des transitions (soft = doux/cinéma, classic = équilibré, snappy = rebond/dynamique)
- motion : PERSONNALITÉ du mouvement, c'est le levier le plus visible. Choisis-la selon l'AUDIENCE, l'OBJECTIF et le TON :
   * energetic → Digital Signage, point de vente, magasin, promo, soldes, retail, public à capter de loin.
   * cinematic → premium, luxe, lancement produit, storytelling, image de marque soignée.
   * minimal → B2B, corporate, institutionnel, audience pro, ton sobre/sérieux.
   * playful → grand public jeune, ludique, fun, réseaux sociaux décontractés.
- palette.bg : fond de la vidéo (hex)
- palette.accent : couleur d'accent — cadre lumineux + barre + caption (hex VIF, contraste fort). Si une marque/secteur est cité, aligne l'accent dessus (Milwaukee→rouge, Bosch→bleu, finance→bleu, promo/retail→rouge ou jaune, premium→or, écolo/santé→vert).
- mood : une phrase qui résume l'ambiance choisie

Adapte pace/intensity/ease pour qu'ils soient cohérents avec motion (ex: energetic ⇒ plutôt fast+punchy, minimal ⇒ slow+subtle+soft). Si le brief est vague, choisis des valeurs cohérentes entre elles. Ne réponds QUE par le JSON.

BRIEF :
`

/** Filet déterministe keyword → motion, miroir d'`enforceAnimationIntent`
 *  (mode standalone). Le mode Canvas n'a AUCUN garde-fou : si le LLM rate son
 *  choix de `motion` (ou échoue → DEFAULT = cinematic, la personnalité la plus
 *  calme), le brief de l'utilisateur retombe sur le mouvement le moins visible
 *  — exactement le « rien ne change » qu'on corrige. Quand un mot-clé fort
 *  matche, on FORCE la personnalité ; sinon on laisse le choix du LLM.
 *
 *  Exporté pour pouvoir l'appliquer aussi au fallback DEFAULT_STYLE_CONFIG. */
export function applyMotionHeuristic(config: StyleConfig, prompt: string): StyleConfig {
  const p = (prompt || '').toLowerCase()
  const forced =
    /\b(signage|point\s+de\s+vente|pos|magasin|en\s+rayon|in[\s-]store|retail|promo|soldes?|d[ée]stockage|black\s+friday|auchan|carrefour|leclerc|intermarch|monoprix|lidl|aldi)\b/.test(p)
      ? 'energetic'
    : /\b(fun|ludique|jeune|playful|d[ée]contract|tiktok|insta|r[ée]seaux\s+sociaux|cartoon|pop)\b/.test(p)
      ? 'playful'
    : /\b(premium|luxe|luxury|haut\s+de\s+gamme|prestige|[ée]l[ée]gan|cin[ée]ma|cinematic|storytelling|raffin)\b/.test(p)
      ? 'cinematic'
    : /\b(corporate|b2b|institutionnel|sobre|professionnel|entreprise|s[ée]rieux|formation|interne)\b/.test(p)
      ? 'minimal'
      : null
  if (!forced) return config
  // Aligne aussi pace/intensity quand on force energetic/minimal, pour rester
  // cohérent avec la personnalité imposée.
  if (forced === 'energetic') return { ...config, motion: forced, pace: 'fast', intensity: 'punchy' }
  if (forced === 'minimal') return { ...config, motion: forced, intensity: 'subtle', ease: 'soft' }
  return { ...config, motion: forced }
}

export async function interpretPromptToStyleConfig(prompt: string): Promise<StyleConfig> {
  const raw = await generateJson<StyleConfig>({
    prompt: SYSTEM_PROMPT + prompt,
    schema: StyleConfigSchema,
    schemaForGemini: SCHEMA_FOR_GEMINI,
    version: 'video-style-config-v2',
  })
  return applyMotionHeuristic(raw, prompt)
}
