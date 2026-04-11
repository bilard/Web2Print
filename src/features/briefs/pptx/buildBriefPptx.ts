import pptxgen from 'pptxgenjs'
import type { Brief, BriefImage, SlideSpec } from '@/features/briefs/types'
import { extractBranding } from './branding'
import { fetchImageWithDimensions, type FetchedImage } from './imageFetcher'
import { buildSlide, type SlideContext } from './slideBuilders'

function buildFallbackSlides(brief: Brief): SlideSpec[] {
  const items = brief.cart?.items ?? []
  const company = (brief.client.values.companyName as string) || brief.clientName || 'Client'
  const slides: SlideSpec[] = [
    {
      type: 'cover',
      title: `Proposition pour ${company}`,
      subtitle: 'Solution signalétique sur-mesure',
      heroPrompt: '',
    },
    {
      type: 'product_grid',
      title: 'Notre sélection produits',
      productSkus: items.map((i) => i.sku),
      layout: items.length > 4 ? '3x2' : '2x2',
    },
    {
      type: 'budget',
      title: 'Budget estimatif',
      showTotal: true,
      showItemized: true,
    },
    {
      type: 'cta',
      title: 'Prochaines étapes',
      message: 'Validons ensemble cette proposition pour démarrer la production.',
    },
  ]
  return slides
}

interface BuildOpts {
  brief: Brief
  images: BriefImage[]
}

/**
 * Construit le PPTX commercial à partir du deck généré et des images du brief.
 * Retourne un Blob prêt à être téléchargé.
 */
export async function buildBriefPptx({ brief, images }: BuildOpts): Promise<Blob> {
  const slides: SlideSpec[] =
    brief.deck?.slides && brief.deck.slides.length > 0
      ? brief.deck.slides
      : buildFallbackSlides(brief)

  const branding = extractBranding(brief)

  // Pré-télécharge toutes les images du brief en parallèle (hero + produits + logo)
  const fetchTargets: { key: string; url: string }[] = images.map((img) => ({ key: img.id, url: img.url }))
  if (branding.logoUrl) fetchTargets.push({ key: 'logo', url: branding.logoUrl })

  const imageMap = new Map<string, FetchedImage>()
  await Promise.all(
    fetchTargets.map(async ({ key, url }) => {
      try {
        imageMap.set(key, await fetchImageWithDimensions(url))
      } catch (err) {
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
