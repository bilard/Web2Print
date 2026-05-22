import { generateText } from '@/features/chat/ai/chatRouter'

export interface ImproveImageRef {
  /** Data brute base64 SANS préfixe data:. */
  data: string
  /** MIME type (image/png, image/jpeg, image/webp, ...). */
  mimeType: string
  /** Nom du fichier pour log / contexte sémantique (ex. "tente-brise_2.webp"). */
  name?: string
}

export interface ImprovementQuestion {
  /** Identifiant stable pour l'UI. */
  id: string
  /** Texte de la question en français. */
  question: string
  /** Options proposées (3-6). La première est la suggestion par défaut de Gemini. */
  options: string[]
}

export interface ImprovementAnswer {
  /** Texte exact de la question (pour réinjection en clair dans le prompt). */
  question: string
  /** Réponse choisie ou libre. */
  answer: string
}

// ─── System prompts ──────────────────────────────────────────────────────────

const SYSTEM_PROMPT_WITH_REFS =
  "You write Nano Banana 2 (Gemini 3.1 image) prompts for compositions that combine USER-SUPPLIED REFERENCE IMAGES with a desired scene/branding.\n\n" +
  "CRITICAL — how to use the references:\n" +
  "Nano Banana 2 receives the same reference images attached to your output prompt. It can SEE them directly. Therefore you must NOT re-describe each product's visual structure in detail (shape of poles, exact silhouette, fabric type, panel layout) — that re-description fights the images and triggers hallucination.\n\n" +
  "INSTEAD, in the prompt you write:\n" +
  "1. Identify each reference image briefly: one short noun phrase + dominant color only (e.g. \"the black spider tent (ref 1)\", \"the blue inflatable shelter (ref 2)\", \"the yellow inflatable tent (ref 3)\"). One line max per reference.\n" +
  "2. Tell Nano Banana to preserve the EXACT structure, geometry, proportions, materials and silhouette from each reference image — do not invent variations.\n" +
  "3. State clearly what CHANGES from the references: branding (logo replacement), baseline text \"...\" rendered legibly, new scene/background.\n" +
  "4. Describe the new SCENE (environment, lighting, composition, camera) in rich English: this is where you can be detailed.\n" +
  "5. Preserve every literal element from the user brief: brand names, slogans (original language + double-quoted), counts, dimensions, color constraints.\n" +
  "6. If the user has provided clarification answers below the brief, treat them as the authoritative source for ambiguous points (environment, lighting, layout, mood) and integrate them faithfully.\n\n" +
  "OUTPUT: one paragraph, 80-140 words. No preamble, no markdown, no bullets, no surrounding quotes."

const SYSTEM_PROMPT_NO_REFS =
  "You rewrite short image briefs into rich Nano Banana 2 (Google Gemini 3.1 image) prompts.\n\n" +
  "RULES:\n" +
  "1. Keep EVERY concrete element the user named: brand names, slogans/baselines, exact counts, dimensions, colors, scene intent.\n" +
  "2. Brands and slogans/baselines stay in their original language. Wrap slogans in double quotes and tell Nano Banana to render them legibly.\n" +
  "3. Use given physical dimensions to drive in-scene scale.\n" +
  "4. Enrich the rest in English: composition, framing, lighting, palette, materials, lens, photographic quality.\n" +
  "5. If clarification answers are supplied, treat them as authoritative for ambiguous points and integrate them faithfully.\n" +
  "6. Output ONE dense paragraph, 100-160 words. No preamble, no markdown, no bullets, no surrounding quotes."

const SYSTEM_PROMPT_QUESTIONS =
  "You analyze an image-generation brief (plus optional reference product images) and produce a SHORT list of clarifying questions to ask the user before the prompt is written.\n\n" +
  "Goal: extract only the AMBIGUITIES that would push Nano Banana 2 in a meaningfully different direction. Skip anything the brief already pins down. Examples of useful axes:\n" +
  "- Environment / setting (mountain, forest, urban, studio, beach, desert, indoor stage…)\n" +
  "- Lighting & mood (golden hour, midday, overcast, dusk, studio strobe…)\n" +
  "- Composition / arrangement of multiple products (aligned, triangle, hero+supporting, scattered…)\n" +
  "- Camera angle & framing (eye-level, low angle, top-down, wide vs tight…)\n" +
  "- Season / weather (summer, snow, rain, autumn foliage…)\n" +
  "- Human presence (yes/no, type of people, action)\n" +
  "- Branding placement (where the logo/baseline appears — on product, in scene, as overlay)\n" +
  "- Image format / aspect ratio if relevant\n\n" +
  "RULES:\n" +
  "1. Ask between 2 and 5 questions. Fewer is better — only the ones that genuinely change the output.\n" +
  "2. For each question, propose 3-5 concrete options (short, in French). The FIRST option is your best guess given the brief and images.\n" +
  "3. Write questions in French, in clear, natural conversational tone.\n" +
  "4. Output ONLY valid JSON, no preamble, no markdown fences, matching:\n" +
  '{"questions":[{"id":"env","question":"…?","options":["…","…","…"]}]}'

// ─── User content builders ───────────────────────────────────────────────────

const buildBriefContent = (
  brief: string,
  refs: ImproveImageRef[],
  answers: ImprovementAnswer[],
) => {
  const refLines = refs.length
    ? `\n\nReferences attached:\n${refs.map((r, i) => `- ref ${i + 1}${r.name ? ` (${r.name})` : ''}`).join('\n')}`
    : ''
  const answersBlock = answers.length
    ? `\n\nUser clarifications (authoritative):\n${answers.map((a) => `- ${a.question}\n  → ${a.answer}`).join('\n')}`
    : ''
  const instruction = refs.length
    ? `Write ONE Nano Banana 2 prompt that composes the ${refs.length} attached reference images into the scene described. Preserve their exact structure; only branding and scene change. Return ONLY the prompt paragraph.`
    : 'Rewrite the following brief into one Nano Banana 2 prompt following the rules. Return ONLY the rewritten prompt paragraph, nothing else.'
  return `${instruction}${refLines}${answersBlock}\n\nBRIEF:\n${brief.trim()}`
}

const buildQuestionsContent = (brief: string, refs: ImproveImageRef[]) => {
  const refLines = refs.length
    ? `\n\nReference images attached (${refs.length}): ${refs.map((r, i) => `#${i + 1}${r.name ? ` (${r.name})` : ''}`).join(', ')}.`
    : ''
  return (
    `Analyze the brief below${refs.length ? ' and the attached reference images' : ''}, then produce the JSON list of clarifying questions.${refLines}\n\nBRIEF:\n${brief.trim()}`
  )
}

// ─── Utilities ───────────────────────────────────────────────────────────────

const stripWrappingQuotes = (s: string) => s.replace(/^["'`]+|["'`]+$/g, '').trim()

/** Extrait le premier objet JSON valide d'une chaîne, en ignorant un éventuel
 *  préfixe (```json) ou texte parasite. Tolère les fences markdown. */
function extractJson(raw: string): unknown {
  const cleaned = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim()
  // Tentative directe : si la réponse EST déjà un objet JSON valide (mode
  // responseMimeType: application/json), on parse tel quel.
  try {
    return JSON.parse(cleaned)
  } catch {
    // Sinon on cherche le premier { et le dernier } et on parse cette tranche.
  }
  const start = cleaned.indexOf('{')
  const end = cleaned.lastIndexOf('}')
  if (start === -1 || end === -1) {
    console.error('[improvementQuestions] Réponse brute non-JSON:', raw)
    throw new Error('Aucun JSON détecté dans la réponse.')
  }
  return JSON.parse(cleaned.slice(start, end + 1))
}

function isImprovementQuestion(x: unknown): x is ImprovementQuestion {
  if (!x || typeof x !== 'object') return false
  const q = x as Record<string, unknown>
  return (
    typeof q.id === 'string' &&
    typeof q.question === 'string' &&
    Array.isArray(q.options) &&
    q.options.every((o) => typeof o === 'string')
  )
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Demande à Gemini d'inspecter le brief + les refs, et de produire 2-5 questions
 * de clarification ciblées sur les ambiguïtés qui changeraient vraiment le rendu
 * Nano Banana 2 (environnement, lumière, composition, etc.).
 */
export async function generateImprovementQuestions(
  brief: string,
  refs: ImproveImageRef[] = [],
): Promise<ImprovementQuestion[]> {
  const imageRefs = refs.filter((r) => r.mimeType.startsWith('image/'))
  const imageDataUris = imageRefs.map((r) => `data:${r.mimeType};base64,${r.data}`)

  const { text, provider, model } = await generateText({
    system: SYSTEM_PROMPT_QUESTIONS,
    messages: [
      {
        role: 'user',
        content: buildQuestionsContent(brief, imageRefs),
        imageDataUris: imageDataUris.length ? imageDataUris : undefined,
      },
    ],
    temperature: 0.3,
    maxTokens: 2048,
    responseFormat: 'json',
    onProviderFailed: ({ provider, error }) =>
      console.warn(`[improvementQuestions] ${provider} a échoué, fallback. Cause:`, error.message),
  })

  const parsed = extractJson(text) as { questions?: unknown }
  if (!parsed || !Array.isArray(parsed.questions)) {
    throw new Error('Réponse Gemini sans tableau "questions".')
  }
  const questions = parsed.questions.filter(isImprovementQuestion)
  console.log(
    `[improvementQuestions] ✓ ${provider}/${model} refs=${imageRefs.length} q=${questions.length}`,
  )
  return questions
}

/**
 * Réécrit un prompt utilisateur pour la génération d'image Nano Banana 2.
 *
 * Délègue à `generateText()` qui respecte la cascade configurée dans
 * Réglages → IA. Les images de référence sont attachées en multimodal — le LLM
 * les VOIT et écrit un prompt qui dit à Nano Banana de préserver leur apparence
 * exacte (pas de re-description textuelle qui fait halluciner).
 *
 * Si `answers` est fourni, les réponses de l'utilisateur aux questions de
 * clarification sont injectées en bloc autoritaire dans le prompt — elles
 * lèvent les ambiguïtés que Gemini ne peut pas deviner depuis le brief seul.
 */
export async function improveImagePrompt(
  current: string,
  refs: ImproveImageRef[] = [],
  answers: ImprovementAnswer[] = [],
): Promise<string> {
  const imageRefs = refs.filter((r) => r.mimeType.startsWith('image/'))
  const imageDataUris = imageRefs.map((r) => `data:${r.mimeType};base64,${r.data}`)

  const { text, provider, model } = await generateText({
    system: imageRefs.length > 0 ? SYSTEM_PROMPT_WITH_REFS : SYSTEM_PROMPT_NO_REFS,
    messages: [
      {
        role: 'user',
        content: buildBriefContent(current, imageRefs, answers),
        imageDataUris: imageDataUris.length ? imageDataUris : undefined,
      },
    ],
    temperature: 0.5,
    maxTokens: 2048,
    onProviderFailed: ({ provider, error }) =>
      console.warn(`[improveImagePrompt] ${provider} a échoué, fallback. Cause:`, error.message),
  })
  console.log(
    `[improveImagePrompt] ✓ ${provider}/${model} refs=${imageRefs.length} answers=${answers.length} len=${text.length}`,
  )
  return stripWrappingQuotes(text)
}
