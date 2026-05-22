import { z } from 'zod'
import { generateJson } from '@/features/briefs/ai/geminiClient'

const HEX = /^#[0-9a-fA-F]{6}$/

export const SceneTypeSchema = z.enum(['hook', 'visual', 'cta'])
export type SceneType = z.infer<typeof SceneTypeSchema>

/** Thème visuel du mockup affiché en arrière-plan des scènes 'visual'.
 *
 *  - dashboard  : header + sidebar + chart line + KPI cards (B2B, SaaS, traders, analytics)
 *  - mobile     : phone frame + content cards (apps mobiles, MVP, produit consumer)
 *  - ecommerce  : grille de product cards (retail, marketplace, catalogue)
 *  - data       : sparklines + bars (data viz, reporting, KPI-heavy)
 *  - editorial  : colonnes de texte wireframe (médias, blog, contenu long-form)
 *  - default    : juste fond dégradé + blobs (texte pur, citations, branding)
 */
export const VisualThemeSchema = z.enum([
  'dashboard',
  'mobile',
  'ecommerce',
  'data',
  'editorial',
  'default',
])
export type VisualTheme = z.infer<typeof VisualThemeSchema>

/** Animation d'entrée des éléments à l'intérieur d'une scène (titre, KPIs, label).
 *
 *  - rise         : montée verticale + opacité (défaut classique).
 *  - slide-left   : entre depuis la droite (glisse vers la gauche).
 *  - slide-right  : entre depuis la gauche (glisse vers la droite).
 *  - fade         : pure opacité, sans déplacement.
 *  - scale        : pop scale 0.85→1 + opacité.
 *  - blur         : flou décroissant + opacité (effet premium/cinéma).
 */
export const EntryAnimSchema = z.enum([
  'rise',
  'slide-left',
  'slide-right',
  'fade',
  'scale',
  'blur',
])
export type EntryAnim = z.infer<typeof EntryAnimSchema>

/** Transition INTER-scènes (entre la fin d'une scène et le début de la suivante).
 *
 *  - fade     : crossfade opacité (défaut actuel).
 *  - slide-lr : sortante part à gauche, entrante arrive de la droite.
 *  - slide-rl : sortante part à droite, entrante arrive de la gauche.
 *  - slide-tb : sortante part en bas, entrante arrive du haut.
 *  - slide-bt : sortante part en haut, entrante arrive du bas.
 *  - wipe-lr  : balayage horizontal gauche→droite.
 *  - zoom     : sortante zoome out, entrante zoome in.
 *  - cut      : coupe sèche, sans transition (signage punchy).
 */
export const TransitionSchema = z.enum([
  'fade',
  'slide-lr',
  'slide-rl',
  'slide-tb',
  'slide-bt',
  'wipe-lr',
  'zoom',
  'cut',
])
export type Transition = z.infer<typeof TransitionSchema>

/** Propriétés graphiques tweenables par GSAP. Toutes optionnelles : Gemini ne
 *  remplit que celles qu'il veut animer. Le template construit dynamiquement
 *  l'objet GSAP correspondant (transforms purs + filter composé + color CSS).
 *
 *  - transforms : x, y, scale, scaleX, scaleY, rotation (deg), rotationX/Y, skewX/Y
 *  - appearance : opacity (0-1), color (#hex texte), backgroundColor (#hex)
 *  - filters    : blur (px), brightness, hueRotate (deg), saturate, contrast
 */
const HEX_COLOR = /^#[0-9a-fA-F]{6}$/
export const AnimPropsSchema = z.object({
  x: z.number().optional(),
  y: z.number().optional(),
  scale: z.number().optional(),
  scaleX: z.number().optional(),
  scaleY: z.number().optional(),
  rotation: z.number().optional(),
  rotationX: z.number().optional(),
  rotationY: z.number().optional(),
  skewX: z.number().optional(),
  skewY: z.number().optional(),
  opacity: z.number().min(0).max(1).optional(),
  color: z.string().regex(HEX_COLOR).optional(),
  backgroundColor: z.string().regex(HEX_COLOR).optional(),
  blur: z.number().min(0).max(60).optional(),
  brightness: z.number().min(0).max(3).optional(),
  hueRotate: z.number().optional(),
  saturate: z.number().min(0).max(3).optional(),
  contrast: z.number().min(0).max(3).optional(),
})
export type AnimProps = z.infer<typeof AnimPropsSchema>

/** Directive d'animation libre, en complément (ou à la place) des presets
 *  entryAnim/transition. Permet à Gemini d'exprimer n'importe quelle anim
 *  GSAP-compatible : rotation, changement de couleur, blur progressif, etc.
 *
 *  - target   : sélecteur CSS RELATIF au container de scène. Sélecteurs sûrs :
 *               '.title', '.sub', '.label', '.url', '.kpi', '.kpi:nth-child(N)',
 *               '.word', '.accent-bar', '.scene-image img', '.mockup-bg', et
 *               le container lui-même via ':scope'.
 *  - from/to  : états GSAP. Si seul 'to' présent → gsap.to(). Si 'from' seul
 *               → gsap.from(). Si les deux → gsap.fromTo().
 *  - start    : décalage en SECONDES depuis le début de la scène (0 = pile au
 *               début). Si absent, l'anim démarre à 0.
 *  - duration : en secondes (0.05 à 15).
 *  - ease     : easing GSAP texte libre ('power2.out', 'back.out(1.5)', 'sine.inOut'...)
 *  - stagger  : décalage en secondes entre éléments quand target matche plusieurs nœuds.
 *  - repeat   : 0 = une fois, -1 = infini (mais on clamp à 5 pour éviter les boucles infinies).
 *  - yoyo     : si true et repeat > 0, alterne aller/retour.
 */
export const AnimDirectiveSchema = z.object({
  target: z.string().min(1).max(80),
  from: AnimPropsSchema.optional(),
  to: AnimPropsSchema.optional(),
  start: z.number().min(0).max(15).optional(),
  duration: z.number().min(0.05).max(15),
  ease: z.string().max(40).optional(),
  stagger: z.number().min(0).max(2).optional(),
  repeat: z.number().int().min(0).max(5).optional(),
  yoyo: z.boolean().optional(),
})
export type AnimDirective = z.infer<typeof AnimDirectiveSchema>

/** Type de chart inline pour scènes 'visual'. Si présent, les templates
 *  Remotion affichent un vrai chart animé frame-by-frame avec les dataPoints. */
export const ChartHintSchema = z.enum(['line', 'bars', 'donut'])
export type ChartHint = z.infer<typeof ChartHintSchema>

/** Point de donnée pour les charts inline ou KPIs enrichis. */
export const DataPointSchema = z.object({
  label: z.string().max(24),
  value: z.number(),
  unit: z.string().max(8).optional(),
})
export type DataPoint = z.infer<typeof DataPointSchema>

export const SceneSchema = z.object({
  type: SceneTypeSchema,
  duration: z.number().min(1).max(15),
  title: z.string().max(60).optional(),
  sub: z.string().max(120).optional(),
  kpis: z.array(z.string().max(20)).max(4).optional(),
  label: z.string().max(40).optional(),
  url: z.string().max(80).optional(),
  /** URL Firebase Storage d'une image IA générée pour cette scène (Phase 2).
   *  Quand présente, les templates l'affichent en background Ken Burns au lieu
   *  (ou en plus) du mockup SVG. */
  imageUrl: z.string().url().optional(),
  /** Icônes Lucide React à afficher en accompagnement du contenu (max 4).
   *  Ex: ['TrendingUp', 'Zap', 'Shield', 'Award']. Cf icons.lucide.dev. */
  icons: z.array(z.string().max(24)).max(4).optional(),
  /** Vraies données numériques à animer en count-up + chart. Max 4 points. */
  dataPoints: z.array(DataPointSchema).max(4).optional(),
  /** Suggestion de chart inline pour la scène 'visual'. */
  chartHint: ChartHintSchema.optional(),
  /** Animation d'entrée des éléments de cette scène. Si absent, on retombe sur
   *  le défaut `rise` (montée verticale). Permet à Gemini de varier d'une scène
   *  à l'autre pour briser la monotonie (ex: hook=slide-right, visual=scale,
   *  cta=rise). */
  entryAnim: EntryAnimSchema.optional(),
  /** Animations LIBRES jouées en plus des presets entryAnim/transition.
   *  Permet rotation, changement de couleur, blur progressif, scale animé,
   *  bref toutes les transformations GSAP. Max 6 pour éviter de saturer la
   *  scène. Utilise customAnimations quand l'utilisateur demande des
   *  transformations précises non couvertes par les presets. */
  customAnimations: z.array(AnimDirectiveSchema).max(6).optional(),
})
export type Scene = z.infer<typeof SceneSchema>

export const CompositionSchema = z.object({
  scenes: z.array(SceneSchema).min(2).max(5),
  palette: z.object({
    bg: z.string().regex(HEX),
    accent: z.string().regex(HEX),
  }),
  pace: z.enum(['slow', 'normal', 'fast']),
  mood: z.string().min(1).max(200),
  /** Thème visuel choisi par Gemini selon le brief. Pilote le mockup SVG
   *  affiché en arrière-plan des scènes 'visual'. */
  theme: VisualThemeSchema,
  /** Transition INTER-scènes globale. Si absent, on retombe sur `fade`
   *  (crossfade opacité, défaut historique). Pilote le passage d'une scène à
   *  la suivante dans les 3 templates multi-scene. */
  transition: TransitionSchema.optional(),
})
export type Composition = z.infer<typeof CompositionSchema>

export const DEFAULT_COMPOSITION: Composition = {
  scenes: [
    { type: 'hook', duration: 2.0, title: 'Annimation', sub: 'Vidéo générée par IA' },
    { type: 'visual', duration: 4.0, title: 'Web2Print', kpis: ['IA', 'Print', 'Web'] },
    { type: 'cta', duration: 2.0, label: 'En savoir plus' },
  ],
  palette: { bg: '#0a0a0a', accent: '#ffffff' },
  pace: 'normal',
  mood: 'Reveal cinématique équilibré',
  theme: 'default',
  transition: 'fade',
}

const SCHEMA_FOR_GEMINI = {
  type: 'object',
  required: ['scenes', 'palette', 'pace', 'mood', 'theme', 'transition'],
  properties: {
    scenes: {
      type: 'array',
      minItems: 2,
      maxItems: 5,
      items: {
        type: 'object',
        required: ['type', 'duration'],
        properties: {
          type: {
            type: 'string',
            enum: ['hook', 'visual', 'cta'],
            description:
              "hook = intro accrocheuse avec titre + sous-titre ; visual = scène centrale avec titre + 1-4 KPIs/chiffres ; cta = appel à l'action final.",
          },
          duration: {
            type: 'number',
            description:
              'Durée en secondes (1 à 15). Le total des scènes doit matcher la durée totale demandée (voir hint de durée en fin de prompt).',
          },
          title: { type: 'string', description: 'Titre principal de la scène (court, ≤ 60 char)' },
          sub: { type: 'string', description: 'Sous-titre ou description (≤ 120 char)' },
          kpis: {
            type: 'array',
            maxItems: 4,
            items: { type: 'string', description: '1 chiffre ou tag court (≤ 20 char)' },
            description: "Réservé au type 'visual' : 1-4 KPIs ou caractéristiques clés.",
          },
          label: { type: 'string', description: "Réservé au type 'cta' : libellé du call-to-action" },
          url: { type: 'string', description: "Réservé au type 'cta' : URL ou contact (≤ 80 char)" },
          icons: {
            type: 'array',
            maxItems: 4,
            items: { type: 'string', description: "Nom d'icône Lucide React PascalCase (ex: TrendingUp, Zap, Shield, BarChart3)" },
            description: "Icônes Lucide qui illustrent la scène. Choisis 2-4 icônes pertinentes par scène 'visual', 0-1 pour hook/cta.",
          },
          dataPoints: {
            type: 'array',
            maxItems: 4,
            items: {
              type: 'object',
              required: ['label', 'value'],
              properties: {
                label: { type: 'string', description: 'Libellé du point (ex: "Croissance", "Clients", "ROI")' },
                value: { type: 'number', description: 'Valeur numérique (sera animée en count-up de 0 à value)' },
                unit: { type: 'string', description: 'Unité optionnelle (ex: "%", "k", "€", "M")' },
              },
            },
            description: "Données numériques RÉELLES à animer en count-up + chart. Réservé aux scènes 'visual'. Exemples : [{label:'CA 2025', value:42, unit:'M€'}, {label:'Clients', value:1200}].",
          },
          chartHint: {
            type: 'string',
            enum: ['line', 'bars', 'donut'],
            description: "Type de chart à animer si dataPoints fournis. 'line' pour évolution, 'bars' pour comparaison, 'donut' pour parts. Réservé aux scènes 'visual'.",
          },
          entryAnim: {
            type: 'string',
            enum: ['rise', 'slide-left', 'slide-right', 'fade', 'scale', 'blur'],
            description:
              "Animation d'entrée des éléments de la scène (titre, KPIs, label). 'rise'=montée verticale, 'slide-left'=arrive de la droite, 'slide-right'=arrive de la gauche, 'fade'=pure opacité, 'scale'=pop, 'blur'=flou cinéma. VARIE entre scènes pour casser la monotonie. Pour Digital Signage / POS, privilégie slide-left/slide-right qui dirigent le regard.",
          },
          // NOTE: customAnimations est volontairement EXCLU du schéma envoyé à
          // Gemini car la profondeur (object→items→object→items→object→object)
          // déclenche un INVALID_ARGUMENT 400 côté Vertex. Le post-process
          // `enforceAnimationIntent` ajoute des customAnimations côté front
          // selon les keywords détectés dans le brief.
        },
      },
    },
    palette: {
      type: 'object',
      required: ['bg', 'accent'],
      properties: {
        bg: { type: 'string', description: 'Couleur de fond hex #RRGGBB (sombre recommandé)' },
        accent: {
          type: 'string',
          description:
            "Couleur d'accent hex #RRGGBB. Contraste fort avec bg. Inspire-toi de la marque si mentionnée.",
        },
      },
    },
    pace: {
      type: 'string',
      enum: ['slow', 'normal', 'fast'],
      description: 'Rythme global : slow=posé/premium, normal=équilibré, fast=punchy/dynamique.',
    },
    mood: { type: 'string', description: 'Une phrase résumant le ton choisi.' },
    theme: {
      type: 'string',
      enum: ['dashboard', 'mobile', 'ecommerce', 'data', 'editorial', 'default'],
      description:
        "Mockup visuel en arrière-plan des scènes 'visual'. Choisis selon le brief : dashboard (B2B/SaaS/trading/analytics), mobile (apps consumer), ecommerce (retail/catalogue), data (KPI-heavy/reporting), editorial (media/contenu long), default (citation/branding pur).",
    },
    transition: {
      type: 'string',
      enum: ['fade', 'slide-lr', 'slide-rl', 'slide-tb', 'slide-bt', 'wipe-lr', 'zoom', 'cut'],
      description:
        "Transition INTER-scènes. 'fade' (crossfade, défaut sobre), 'slide-lr/rl' (slide horizontal — IDÉAL pour Digital Signage POS), 'slide-tb/bt' (slide vertical, plutôt mobile/portrait), 'wipe-lr' (balayage net), 'zoom' (premium/cinéma), 'cut' (coupe sèche punchy). Si l'utilisateur mentionne 'gauche à droite', 'inversement', 'slide', 'glissé' → choisis slide-lr ou slide-rl. Si 'fondu' → 'fade'. Si 'punchy/rapide' → 'cut' ou 'wipe-lr'.",
    },
  },
}

const SYSTEM_PROMPT = `Tu es un directeur artistique vidéo. Tu transformes un brief utilisateur en composition vidéo structurée pour un rendu animé.

CONTRAINTES :
- Toujours 3 scènes par défaut (hook → visual → cta). Tu peux ajouter 1-2 scènes 'visual' supplémentaires si le brief justifie (multiples produits/bénéfices). Pour une vidéo très courte (≤6s), réduis à 2 scènes (hook + cta).
- Pour une vidéo longue (≥20s), n'hésite pas à enchaîner 2-3 scènes 'visual' avec des angles différents.
- 'hook' : titre court (3-5 mots), sous-titre optionnel.
- 'visual' : titre + 1-4 KPIs/caractéristiques (chiffres, mots-clés, pas de phrases). Pour les scènes 'visual', AJOUTE TOUJOURS :
   * icons : 2-4 noms d'icônes Lucide React PascalCase pertinentes (TrendingUp, BarChart3, Zap, Shield, Award, Star, etc.)
   * dataPoints : 2-4 vraies données chiffrées crédibles ({label, value, unit?})
   * chartHint : 'line' (évolution temporelle), 'bars' (comparaison) ou 'donut' (parts de marché)
   Ces enrichissements transforment la scène en mini-dashboard animé. NE JAMAIS les omettre sur une scène 'visual'.
- 'cta' : label court ("Demander un devis", "En savoir plus"...), URL/contact optionnels. icons optionnel (1 picto comme ArrowRight, Mail).
- La somme des durées des scènes doit matcher la durée totale demandée (voir hint en fin de prompt). Par défaut, vise ≈10s.
- Palette : si une marque/secteur est cité, choisis une accent color cohérente (Milwaukee→rouge, Bosch→bleu, Apple→argent, banque/finance→bleu, retail/promo→rouge ou jaune, premium/luxe→or/argent, écolo/santé→vert sage). Sinon palette sobre.
- Theme visuel : choisis 'dashboard' pour SaaS/B2B/finance/trading/analytics, 'mobile' pour apps consumer, 'ecommerce' pour retail/produits, 'data' pour reporting/KPI-heavy, 'editorial' pour média/contenu, 'default' si pur branding/citation. Le mockup correspondant s'affichera en arrière-plan animé des scènes 'visual'.
- Animation : tu DOIS choisir une 'transition' (inter-scènes) cohérente avec le brief. Pour du Digital Signage en point de vente (Auchan, Carrefour, retail) → slide-lr ou slide-rl alternés pour capter le regard. Pour du contenu premium/cinéma → 'zoom' ou 'fade'. Pour du contenu punchy/promo flash → 'cut' ou 'wipe-lr'. Tu DOIS aussi varier 'entryAnim' d'une scène à l'autre (ex: hook=slide-right, visual=scale, cta=rise) pour casser la monotonie quand l'utilisateur demande d'être créatif sur les animations.
- Le texte doit être en français, percutant, factuel.

BRIEF UTILISATEUR :
`

export interface InterpretCompositionInput {
  prompt: string
  aspect?: 'square' | 'portrait' | 'landscape'
  /** Durée totale souhaitée en secondes (3-60). Gemini ajustera le nombre de
   *  scènes et leur durée pour la respecter. Une normalisation par rescale
   *  s'applique après pour garantir le total exact. */
  targetDurationSec?: number
}

/** Rescale proportionnellement les durées de scènes pour atteindre une cible.
 *
 *  Gemini peut sortir un total légèrement différent de la cible (8-12s
 *  par défaut). Pour des cibles éloignées du défaut (5s ou 30s par exemple)
 *  on force le rescale pour respecter le contrat avec l'UI. */
export function normalizeScenesDuration(
  composition: Composition,
  targetSec: number,
): Composition {
  const total = composition.scenes.reduce((acc, s) => acc + s.duration, 0)
  if (total <= 0) return composition
  const factor = targetSec / total
  // Tolérance : si on est déjà à ±5% de la cible, ne pas rescaler (évite
  // les durées avec décimales bizarres comme 1.83s).
  if (Math.abs(factor - 1) < 0.05) return composition
  return {
    ...composition,
    scenes: composition.scenes.map((s) => ({
      ...s,
      duration: Math.max(1, Math.round(s.duration * factor * 10) / 10),
    })),
  }
}

/** Détecte les mots-clés d'animation dans le brief utilisateur et fabrique
 *  un HINT FORT qui force Gemini à respecter l'intention. Sans ce hint,
 *  l'instruction libre se noie dans le prompt et Gemini retombe sur les
 *  défauts (transition: 'fade', entryAnim non variés). */
export function extractAnimationHint(prompt: string): string {
  const p = prompt.toLowerCase()
  const hints: string[] = []

  // Direction de slide (gauche↔droite / inversement / horizontal)
  const wantsLR = /\b(gauche\s+(à|a|vers)\s+droite|left[\s-]to[\s-]right|lr)\b/.test(p)
  const wantsRL = /\b(droite\s+(à|a|vers)\s+gauche|right[\s-]to[\s-]left|rl|inversement|inverse|alterné|alternance)\b/.test(p)
  const wantsSlide = /\b(slide|glisse|glissé|glissement|défile|defilé|défilement)\b/.test(p) || wantsLR || wantsRL
  if (wantsSlide && (wantsLR || wantsRL)) {
    hints.push(
      `→ transition: alterne 'slide-lr' et 'slide-rl' entre scènes (l'utilisateur veut "gauche à droite ou inversement"). Pour entryAnim, alterne 'slide-left' et 'slide-right' entre scènes.`,
    )
  } else if (wantsSlide || wantsLR) {
    hints.push(`→ transition: 'slide-lr'. entryAnim: 'slide-right' ou 'slide-left' selon le sens demandé.`)
  } else if (wantsRL) {
    hints.push(`→ transition: 'slide-rl'. entryAnim alterné slide-left/slide-right.`)
  }

  // Fondu enchainé
  if (/\b(fondu|fade|cross[\s-]?fade|enchain|enchaîn)\b/.test(p)) {
    hints.push(`→ transition: 'fade' (fondu enchainé) — au moins une scène doit utiliser cette transition.`)
  }

  // Vertical
  if (/\b(haut\s+(en|vers)\s+bas|top[\s-]to[\s-]bottom)\b/.test(p)) {
    hints.push(`→ transition: 'slide-tb', entryAnim: 'rise' ou 'fade'.`)
  }
  if (/\b(bas\s+(en|vers)\s+haut|bottom[\s-]to[\s-]top|monte|montée)\b/.test(p)) {
    hints.push(`→ transition: 'slide-bt', entryAnim: 'rise'.`)
  }

  // Zoom / Scale
  if (/\b(zoom|scale|grossit|grossi|agrandi|rétréc|retrec|pop|pulse|pulsat)\b/.test(p)) {
    hints.push(`→ transition: 'zoom', entryAnim: 'scale' sur les scènes 'visual'.`)
  }

  // Punchy / cut sec
  if (/\b(punchy|punch|coupe|cut|sec|brutal|rapide|nerveux|énergique|energique)\b/.test(p)) {
    hints.push(`→ envisage transition: 'cut' ou 'wipe-lr', pace: 'fast'.`)
  }

  // Créatif / varié / surprenant — varie les presets
  if (/\b(créati|creati|original|varié|varie|surprenant|inattendu|fun|ludique|sois\s+créatif|soit\s+créatif|sois\s+creatif)\b/.test(p)) {
    hints.push(
      `→ L'utilisateur veut de la VARIÉTÉ. OBLIGATOIRE : varie entryAnim entre chaque scène (jamais deux scènes consécutives avec le même entryAnim).`,
    )
  }

  // Digital Signage / POS — slide horizontal naturel
  if (/\b(signage|point\s+de\s+vente|pos|magasin|auchan|carrefour|leclerc|intermarch|monoprix|retail|in[\s-]store)\b/.test(p)) {
    hints.push(
      `→ Contexte Digital Signage point de vente : transition 'slide-lr' ou 'slide-rl' alternés (capte le regard de loin). entryAnim: 'slide-right' puis 'slide-left' alternés. pace: 'normal' à 'fast'. Pas de transition 'fade' (trop molle pour POS).`,
    )
  }

  if (hints.length === 0) return ''
  return (
    `\n\n[INSTRUCTIONS ANIMATION DÉTECTÉES DANS LE BRIEF — TU DOIS LES SUIVRE STRICTEMENT]\n` +
    hints.map((h) => `- ${h}`).join('\n')
  )
}

/** Override les champs animation de la composition si le brief contient des
 *  keywords explicites. Gemini ignore parfois les hints malgré le SYSTEM_PROMPT
 *  et l'animationHint — ce post-process garantit que l'intention utilisateur
 *  est RESPECTÉE même si Gemini retombe sur les défauts.
 *
 *  Conservatif : on n'override QUE si un keyword fort matche. Sans match,
 *  on laisse la composition de Gemini intacte. */
export function enforceAnimationIntent(
  composition: Composition,
  prompt: string,
): Composition {
  const p = prompt.toLowerCase()
  const wantsLR = /\b(gauche\s+(à|a|vers)\s+droite|left[\s-]to[\s-]right)\b/.test(p)
  const wantsRL = /\b(droite\s+(à|a|vers)\s+gauche|right[\s-]to[\s-]left|inversement|inverse|alterné|alternance)\b/.test(p)
  const wantsSlide = /\b(slide|glisse|glissé|glissement|défile|défilement)\b/.test(p) || wantsLR || wantsRL
  const wantsZoom = /\b(zoom|grossit|agrandi)\b/.test(p)
  const wantsCut = /\b(coupe\s+sec|cut|punch|brutal)\b/.test(p)
  const wantsSignage = /\b(signage|point\s+de\s+vente|pos|magasin|auchan|carrefour|leclerc|intermarch|monoprix|retail|in[\s-]store)\b/.test(p)
  const wantsCreative = /\b(créati|creati|original|varié|varie|surprenant|inattendu|fun|ludique|sois\s+créatif|soit\s+créatif|sois\s+creatif)\b/.test(p)
  const wantsColorShift = /\b(couleur|color|teinte|change\s+de\s+couleur|colore|colora|colorée)\b/.test(p)
  const wantsRotation = /\b(rotation|tourne|tournant|pivot|pivote)\b/.test(p)
  const wantsBlur = /\b(flou|blur|défocus|defocus)\b/.test(p)
  const wantsPulse = /\b(pulse|pulsat|battement|vibrer|vibre)\b/.test(p)

  // Choix de la transition forcée selon priorité keywords.
  let forcedTransition: Transition | null = null
  if (wantsCut) forcedTransition = 'cut'
  else if (wantsZoom) forcedTransition = 'zoom'
  else if (wantsSlide || wantsSignage) {
    // Si l'utilisateur précise "inversement"/"alterné", on prend slide-lr
    // (la première transition) — la variation entre scènes se fera via
    // entryAnim. Sinon on respecte le sens explicite.
    if (wantsLR) forcedTransition = 'slide-lr'
    else if (wantsRL) forcedTransition = 'slide-rl'
    else forcedTransition = 'slide-lr'
  }

  if (!forcedTransition && !wantsCreative && !wantsColorShift && !wantsRotation && !wantsBlur && !wantsPulse) return composition

  const transition = forcedTransition ?? composition.transition

  // Si l'utilisateur veut de la VARIÉTÉ ou de l'alternance, on force des
  // entryAnim variés entre scènes. On alterne slide-right / slide-left /
  // scale / blur pour casser la monotonie.
  const ALTERNATE_ENTRIES: EntryAnim[] = wantsLR && wantsRL
    ? ['slide-right', 'slide-left', 'slide-right', 'slide-left']
    : wantsSlide || wantsSignage
    ? ['slide-right', 'slide-left', 'slide-right']
    : wantsCreative
    ? ['rise', 'scale', 'slide-right', 'blur', 'slide-left']
    : []

  const shouldVaryEntry = ALTERNATE_ENTRIES.length > 0

  // Couleur d'accent pour les color shifts (rouge promo par défaut, ou la
  // couleur d'accent déjà dans la composition).
  const accentColor = composition.palette?.accent ?? '#e30613'
  const altColor = '#ffffff'

  return {
    ...composition,
    transition,
    scenes: composition.scenes.map((scene, i) => {
      const next: Scene = { ...scene }
      if (shouldVaryEntry && !scene.entryAnim) {
        next.entryAnim = ALTERNATE_ENTRIES[i % ALTERNATE_ENTRIES.length]
      }

      // On accumule les customAnimations à injecter pour cette scène selon
      // les keywords détectés. On garde celles que Gemini a éventuellement
      // déjà fournies et on ajoute les nôtres en plus.
      const injected: AnimDirective[] = []

      // Changement de couleur AMPLE : titre alterne accent ↔ blanc en boucle
      // continue sur toute la scène. Très visible.
      if (wantsColorShift || wantsCreative || wantsSignage) {
        injected.push({
          target: '.title',
          from: { color: altColor },
          to: { color: accentColor },
          duration: 0.9,
          ease: 'sine.inOut',
          repeat: 5,
          yoyo: true,
        })
        if (scene.type === 'visual') {
          injected.push({
            target: '.kpi',
            from: { color: altColor },
            to: { color: accentColor },
            duration: 0.8,
            stagger: 0.2,
            repeat: 5,
            yoyo: true,
          })
        }
      }

      // Rotation très visible.
      if (wantsRotation) {
        injected.push({
          target: '.title',
          from: { rotation: -8 },
          to: { rotation: 8 },
          duration: 1.0,
          repeat: 5,
          yoyo: true,
          ease: 'sine.inOut',
        })
      }

      // Flou progressif.
      if (wantsBlur) {
        injected.push({
          target: '.scene-image img, .mockup-bg',
          from: { blur: 0 },
          to: { blur: 18 },
          duration: 2.0,
          ease: 'sine.inOut',
          repeat: 3,
          yoyo: true,
        })
      }

      // Pulsation scale AMPLE — visible toute la scène.
      if (wantsPulse || wantsCreative || wantsSignage) {
        injected.push({
          target: '.title',
          from: { scale: 0.95 },
          to: { scale: 1.12 },
          duration: 0.6,
          ease: 'sine.inOut',
          repeat: 5,
          yoyo: true,
          start: 0.3,
        })
        if (scene.type === 'cta') {
          injected.push({
            target: '.accent-bar',
            from: { scaleX: 0.7 },
            to: { scaleX: 1.4 },
            duration: 0.5,
            ease: 'sine.inOut',
            repeat: 5,
            yoyo: true,
          })
        }
      }

      // Translation continue (flotte) — toujours active pour effet vivant.
      if (wantsCreative || wantsSignage) {
        injected.push({
          target: '.title',
          from: { y: -10 },
          to: { y: 10 },
          duration: 1.4,
          ease: 'sine.inOut',
          repeat: 5,
          yoyo: true,
          start: 0.5,
        })
      }

      if (injected.length > 0) {
        next.customAnimations = [
          ...(scene.customAnimations ?? []),
          ...injected,
        ].slice(0, 6) // cap à 6 pour respecter le schema Zod
      }

      return next
    }),
  }
}

export async function interpretPromptToComposition(
  input: InterpretCompositionInput,
): Promise<Composition> {
  const aspectHint = input.aspect ? `\n\n[Format attendu : ${input.aspect}]` : ''
  const durationHint = input.targetDurationSec
    ? `\n\n[Durée totale cible : ${input.targetDurationSec} secondes — adapte le nombre de scènes (2-5) et leurs durées pour matcher.]`
    : ''
  const animationHint = extractAnimationHint(input.prompt)
  const raw = await generateJson<Composition>({
    prompt: SYSTEM_PROMPT + input.prompt + aspectHint + durationHint + animationHint,
    schema: CompositionSchema,
    schemaForGemini: SCHEMA_FOR_GEMINI,
    version: 'video-composition-v2',
  })
  const enforced = enforceAnimationIntent(raw, input.prompt)
  return input.targetDurationSec
    ? normalizeScenesDuration(enforced, input.targetDurationSec)
    : enforced
}
