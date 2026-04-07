import pptxgen from 'pptxgenjs'
import type { Brief, BriefImage } from '@/features/briefs/types'
import { extractBranding } from './branding'
import { fetchImageAsBase64 } from './imageFetcher'
import { buildSlide, type SlideContext } from './slideBuilders'

interface BuildOpts {
  brief: Brief
  images: BriefImage[]
}

/**
 * Construit le PPTX commercial à partir du deck généré et des images du brief.
 * Retourne un Blob prêt à être téléchargé.
 */
export async function buildBriefPptx({ brief, images }: BuildOpts): Promise<Blob> {
  const slides = brief.deck?.slides ?? []
  if (slides.length === 0) {
    throw new Error('Le deck est vide. Génère la structure du deck à l\'étape 4.')
  }

  const branding = extractBranding(brief)

  // Pré-télécharge toutes les images du brief en parallèle (hero + produits + logo)
  const fetchTargets: { key: string; url: string }[] = images.map((img) => ({ key: img.id, url: img.url }))
  if (branding.logoUrl) fetchTargets.push({ key: 'logo', url: branding.logoUrl })

  const imageMap = new Map<string, string>()
  await Promise.all(
    fetchTargets.map(async ({ key, url }) => {
      try {
        const dataUrl = await fetchImageAsBase64(url)
        imageMap.set(key, dataUrl)
      } catch (err) {
        // On continue sans cette image (placeholder dans le slide builder)
        console.warn(`Image ${key} non téléchargée :`, err)
      }
    }),
  )

  const pres = new pptxgen()
  pres.layout = 'LAYOUT_WIDE' // 13.33 x 7.5
  pres.author = branding.companyName
  pres.company = branding.companyName
  pres.title = `Proposition commerciale — ${branding.companyName}`

  const ctx: SlideContext = {
    branding,
    cart: brief.cart?.items ?? [],
    discount: brief.cart?.discount,
    images: imageMap,
  }

  for (const spec of slides) {
    buildSlide(pres, spec, ctx)
  }

  const blob = (await pres.write({ outputType: 'blob' })) as Blob
  return blob
}
