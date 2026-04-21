import type { Brief, CartItem } from '@/features/briefs/types'

export type ImageTarget =
  | { kind: 'hero' }
  | { kind: 'product'; item: CartItem }
  | { kind: 'staging_scene'; items: CartItem[] }

/**
 * Construit DÉTERMINISTIQUEMENT le prompt Nano Banana depuis le brief.
 *
 * Historique : une version précédente déléguait la réécriture à Gemini Pro
 * (meta-prompt → texte → prompt final). Supprimée car elle coûtait 12-18 s
 * par image, timeoutait régulièrement à 45 s, et n'apportait pas de gain de
 * qualité mesurable par rapport au template ci-dessous qui injecte déjà
 * brand lock, scene, subject directive et contexte cappé.
 */
export async function composeImagePrompt(
  brief: Brief,
  target: ImageTarget,
  scene: string,
): Promise<string> {
  const v = brief.client.values as Record<string, unknown>
  const str = (k: string) => (typeof v[k] === 'string' ? (v[k] as string).trim() : '')
  const company = str('companyName')
  const context = str('contextSummary')
  const primaryColor = str('primaryColor')
  const secondaryColor = str('secondaryColor')

  const answers = brief.dynamicForm?.answers ?? {}
  const answerLines = Object.entries(answers)
    .filter(([, val]) => typeof val === 'string' && (val as string).trim().length > 0)
    .map(([k, val]) => `- ${k}: ${(val as string).trim()}`)
    .join('\n')

  // Règle exclusive de marque — indispensable quand le brief nomme un vrai
  // événement (Paris-Roubaix, Tour de France…) : sans ça, Nano Banana peint
  // les vrais sponsors connus (Mavic, Skoda, LCL, ASO…) qu'il associe à
  // l'événement, et le client devient invisible.
  const brandLock = company
    ? `ABSOLUTE BRAND RULE: This is a FICTIONAL brand activation by "${company}". ${company} is the ONLY brand that may appear as logo, wordmark or sponsor branding on any product, banner, flag, arch, tent, barrier, sticker, totem, etc. ABSOLUTELY NO third-party brands, sponsor logos, team names, or real-world race sponsors (e.g. Mavic, Skoda, LCL, ASO, Roubaix, Continental, Shimano, Santini, etc.) may be visible anywhere in the image.${primaryColor || secondaryColor ? ` Brand palette: ${[primaryColor, secondaryColor].filter(Boolean).join(' + ')}.` : ''}`
    : 'No third-party brands, sponsor logos or real-world race sponsors may appear.'

  let subjectDirective = ''
  if (target.kind === 'hero') {
    subjectDirective =
      'Subject: the hero visual of the campaign — capture the event/brand atmosphere and emotional core. No print product must be visible. Wide editorial framing.'
  } else if (target.kind === 'product') {
    const desc = target.item.description?.trim().slice(0, 400)
    subjectDirective = `Subject: a photorealistic hero shot of a single "${target.item.name}" (print product), shown realistically in the described environment. Show the product clearly with believable materials and finishing.${desc ? ` Product spec (describes the REAL physical object — use it to determine the correct shape, format and function): ${desc}` : ''}`
  } else {
    const list = target.items
      .slice(0, 8)
      .map((i) => (i.description ? `${i.name} (${i.description.trim().slice(0, 120)})` : i.name))
      .join('; ')
    subjectDirective = `Subject: a branded promotional staging featuring these print products: ${list}. Arrange them naturally in the described environment, editorial composition.`
  }
  subjectDirective = `${subjectDirective}\n\n${brandLock}`

  // Template déterministe. Les champs libres sont cappés : un brief verbeux ou
  // un answerLines markdown sans cap produisait un prompt >100k tokens que
  // Nano Banana refusait (finishReason IMAGE_OTHER / STOP sans image).
  const CAP_CONTEXT = 800
  const CAP_ANSWERS = 800
  const capField = (s: string, max: number): string =>
    s.length > max ? `${s.slice(0, max).trimEnd()}…` : s

  const parts: string[] = []
  parts.push(`Photorealistic photograph. Scene: ${scene}.`)
  parts.push(subjectDirective)
  if (context) parts.push(`Creative brief (verbatim, must be honored): ${capField(context, CAP_CONTEXT)}`)
  if (answerLines) parts.push(`Project details:\n${capField(answerLines, CAP_ANSWERS)}`)
  parts.push(
    'Honor the art direction, palette, mood and subject described above literally. Photorealistic, high-end editorial quality, print-ready.',
  )
  return parts.join('\n\n')
}
