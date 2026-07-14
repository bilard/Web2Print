// src/features/demo-express/seedAnimations.ts
// Étape « Animations HTML produits » de la Démo express : pour chaque produit
// enrichi, une composition multi-scènes DÉTERMINISTE (aucun appel IA — nom,
// marque, prix, image produit en fond, couleurs de la charte) est compilée en
// ZIP HTML autonome via le module Animations HTML, puis sauvegardée dans le
// DAM (Firestore `animations/{id}` + Storage). Id stable → un re-run REMPLACE
// les animations « Démo {Société} » au lieu d'empiler des doublons.
import { auth } from '@/lib/firebase/config'
import { buildHtmlZipBlob } from '@/features/video/exportHtmlZip'
import { saveHtmlZip } from '@/features/video/saveHtmlZip'
import type { Composition, Scene } from '@/features/video/promptToComposition'
import { charteToThemePatch } from '@/features/catalog/charte/extractCharte'
import { damSlug } from '@/features/dam/uploadImageToDam'
import type { CatalogCharte } from '@/features/catalog/catalogTypes'
import type { DemoProduct } from './buildDemoSheet'

const HEX = /^#[0-9a-fA-F]{6}$/
const DURATION_SEC = 8
const SIZE = 1080 // format carré : lisible en signage comme en social

/** Luminance relative approx. d'un #RRGGBB — pour ne garder que des fonds sombres
 *  (les templates multi-scene posent du texte clair sur `palette.bg`). */
function isDarkHex(hex: string): boolean {
  const n = parseInt(hex.slice(1), 16)
  const r = (n >> 16) & 0xff, g = (n >> 8) & 0xff, b = n & 0xff
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255 < 0.45
}

/** Palette de l'animation : accent de la charte du site, fond sombre (celui de
 *  la charte s'il est sombre, sinon le noir studio). */
function paletteFromCharte(charte: CatalogCharte): { bg: string; accent: string } {
  const patch = charteToThemePatch(charte)
  const accent = patch.accent && HEX.test(patch.accent) ? patch.accent : '#6366f1'
  const candidate = patch.headerBg && HEX.test(patch.headerBg) ? patch.headerBg : null
  return { bg: candidate && isDarkHex(candidate) ? candidate : '#0a0a0a', accent }
}

const str = (v: unknown): string => (v == null ? '' : String(v).trim())
const clip = (s: string, max: number): string => (s.length > max ? `${s.slice(0, max - 1)}…` : s)

/** 1-4 chips factuelles pour la scène 'visual' : prix, marque, référence, puis
 *  une valeur de spec courte. Jamais de texte rédigé — données VERBATIM. */
function productKpis(fields: Record<string, unknown>): string[] {
  const kpis: string[] = []
  const push = (s: string) => { if (s && s.length <= 20 && !kpis.includes(s)) kpis.push(s) }
  push(str(fields.price))
  push(str(fields.brand))
  const ref = str(fields.reference)
  if (ref) push(clip(`Réf ${ref}`, 20))
  for (const line of str(fields.specifications).split(/\n+/)) {
    const i = line.indexOf(':')
    if (i > 0) push(line.slice(i + 1).trim())
    if (kpis.length >= 4) break
  }
  return kpis.slice(0, 4)
}

/** Composition hook → visual (image produit en fond) → cta, sans undefined
 *  (Firestore rejette undefined : chaque champ optionnel n'est posé que s'il
 *  a une valeur). */
function buildProductComposition(item: DemoProduct, company: string, siteUrl: string, charte: CatalogCharte): Composition {
  const name = str(item.fields.name) || 'Produit'
  const brand = str(item.fields.brand)
  const imageUrl = item.assets.find((a) => a.type === 'image' && /^https:\/\//i.test(a.url))?.url

  const hook: Scene = { type: 'hook', duration: 2, title: clip(brand || company, 60), sub: clip(name, 120), entryAnim: 'blur' }
  const visual: Scene = { type: 'visual', duration: 4, title: clip(name, 60), entryAnim: 'scale' }
  const kpis = productKpis(item.fields)
  if (kpis.length) visual.kpis = kpis
  if (imageUrl) visual.imageUrl = imageUrl
  const cta: Scene = { type: 'cta', duration: 2, label: 'Découvrir le produit', entryAnim: 'rise' }
  try { cta.url = clip(new URL(siteUrl).host, 80) } catch { /* url du site illisible : CTA sans url */ }

  return {
    scenes: [hook, visual, cta],
    palette: paletteFromCharte(charte),
    pace: 'normal',
    mood: `Fiche produit animée — démo ${company}`,
    theme: 'ecommerce',
    transition: 'slide-lr',
  }
}

export interface SeedAnimationsInput {
  items: DemoProduct[]
  company: string
  siteUrl: string
  charte: CatalogCharte
  aborted: () => boolean
  onDetail: (detail: string) => void
  log: (kind: 'connector' | 'error', text: string) => void
}

/** Génère et sauve une animation HTML par produit. Tolérant : un échec est
 *  journalisé et on passe au produit suivant ; renvoie la première cause. */
export async function seedAnimations(input: SeedAnimationsInput): Promise<{ created: number; firstError: string | null }> {
  const { items, company, siteUrl, charte, aborted, onDetail, log } = input
  const uid = auth.currentUser?.uid
  if (!uid) return { created: 0, firstError: 'non connecté' }

  let created = 0
  let firstError: string | null = null
  for (let i = 0; i < items.length; i++) {
    if (aborted()) break
    const item = items[i]
    const name = str(item.fields.name) || `produit-${i + 1}`
    onDetail(`${i + 1}/${items.length} — ${name}`)
    try {
      const composition = buildProductComposition(item, company, siteUrl, charte)
      const blob = await buildHtmlZipBlob({
        aspect: 'square',
        isMultiScene: true,
        variables: { composition, brand: str(item.fields.brand) || company, caption: name },
        width: SIZE,
        height: SIZE,
        durationSec: DURATION_SEC,
        filename: `demo-${damSlug(company)}-${damSlug(name)}`,
      })
      await saveHtmlZip({
        // Id stable par société+produit : setDoc et le Storage écrasent
        // l'animation du run précédent (même contrat que catalogue/promo).
        animationId: `demo-${damSlug(company)}-${damSlug(name)}`,
        blob,
        aspect: 'square',
        composition,
        caption: name,
        brand: str(item.fields.brand) || company,
        prompt: `Démo express ${company} — animation produit générée depuis la fiche scrapée`,
        width: SIZE,
        height: SIZE,
        ownerId: uid,
      })
      created++
      log('connector', `Animations HTML — « ${name} » sauvegardée dans le DAM (${created}/${items.length})`)
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'erreur inconnue'
      firstError ??= msg
      log('error', `Animations HTML — ${name} : ${msg}`)
    }
  }
  return { created, firstError }
}
