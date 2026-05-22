import { z } from 'zod'
import { generateJson } from '@/features/briefs/ai/geminiClient'

export const StyleConfigSchema = z.object({
  pace: z.enum(['slow', 'normal', 'fast']),
  intensity: z.enum(['subtle', 'normal', 'punchy']),
  ease: z.enum(['soft', 'classic', 'snappy']),
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
  palette: { bg: '#0a0a0a', accent: '#ffffff' },
  mood: 'Reveal cinématique équilibré',
}

const SCHEMA_FOR_GEMINI = {
  type: 'object',
  required: ['pace', 'intensity', 'ease', 'palette', 'mood'],
  properties: {
    pace: { type: 'string', enum: ['slow', 'normal', 'fast'] },
    intensity: { type: 'string', enum: ['subtle', 'normal', 'punchy'] },
    ease: { type: 'string', enum: ['soft', 'classic', 'snappy'] },
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

const SYSTEM_PROMPT = `Tu transformes une instruction de formatage vidéo en config JSON structurée.

CONFIG :
- pace : rythme global (slow = posé, normal = standard, fast = punchy)
- intensity : amplitude des mouvements (subtle = discret, normal = équilibré, punchy = exagéré)
- ease : caractère des transitions (soft = doux/cinéma, classic = équilibré, snappy = rebond/dynamique)
- palette.bg : fond de la vidéo (hex)
- palette.accent : couleur du texte de marque + caption (hex, contraste fort avec bg)
- mood : une phrase qui résume l'ambiance choisie

Si l'instruction est vague, choisis des valeurs cohérentes entre elles. Ne réponds QUE par le JSON.

INSTRUCTION :
`

export async function interpretPromptToStyleConfig(prompt: string): Promise<StyleConfig> {
  return generateJson<StyleConfig>({
    prompt: SYSTEM_PROMPT + prompt,
    schema: StyleConfigSchema,
    schemaForGemini: SCHEMA_FOR_GEMINI,
    version: 'video-style-config-v1',
  })
}
