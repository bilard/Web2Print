import { useState, useCallback } from 'react'
import { useImageGeneration } from '@/features/nanobana/useImageGeneration'

// Nano Banana 2 / Pro d'abord (création), repli flash.
const NB2_MODELS = [
  'gemini-3-pro-image-preview',
  'nano-banana-pro-preview',
  'gemini-3.1-flash-image-preview',
  'gemini-2.5-flash-image',
] as const

/** Prompt « affiche entière » : NB2 conçoit tout le design ; le prix/% exacts
 *  sont ajoutés ensuite en overlay texte → on lui demande des zones SANS chiffres. */
function buildPosterPrompt(name: string, brief: string | undefined, hasImage: boolean): string {
  return [
    `Affiche promotionnelle retail PROFESSIONNELLE et créative, format vertical, qualité studio.`,
    `Produit héros : « ${name} »${hasImage ? `, intègre FIDÈLEMENT le produit de l'image fournie (ne le déforme pas)` : ''}.`,
    brief ? `Ambiance : ${brief}.` : '',
    `Composition type grande surface de bricolage haut de gamme, fort contraste, énergie « promo », fond travaillé (pas blanc plat).`,
    `ZONES À RESPECTER STRICTEMENT : (1) le produit héros bien éclairé occupe la moitié SUPÉRIEURE/centre ;`,
    `(2) une pastille/explosion de remise colorée dans le COIN SUPÉRIEUR DROIT ;`,
    `(3) une BANDE ou cartouche de prix élégant occupant tout le CINQUIÈME INFÉRIEUR (bas) de l'image, fond uni lisible.`,
    `IMPORTANT : la pastille de remise ET la bande de prix doivent rester SANS AUCUN CHIFFRE ni texte (zones stylées VIDES) —`,
    `le pourcentage et le prix EXACTS seront ajoutés par-dessus en texte net. N'écris AUCUN chiffre, AUCUN prix, AUCUN pourcentage.`,
  ]
    .filter(Boolean)
    .join(' ')
}

async function urlToBase64(url: string): Promise<{ data: string; mime: string } | null> {
  try {
    const res = await fetch(url)
    if (!res.ok) return null
    const blob = await res.blob()
    const dataUrl: string = await new Promise((resolve, reject) => {
      const fr = new FileReader()
      fr.onload = () => resolve(fr.result as string)
      fr.onerror = reject
      fr.readAsDataURL(blob)
    })
    const comma = dataUrl.indexOf(',')
    const mime = dataUrl.slice(5, dataUrl.indexOf(';'))
    return { data: dataUrl.slice(comma + 1), mime: mime || 'image/png' }
  } catch {
    return null
  }
}

/** Génère une AFFICHE complète designée via NB2 (image produit en référence si dispo). */
export function useGeneratePromoPoster() {
  const { generateImage } = useImageGeneration()
  const [isLoading, setLoading] = useState(false)

  const generatePoster = useCallback(
    async (args: { name: string; brief?: string; width: number; height: number; imageUrl?: string }): Promise<string | null> => {
      setLoading(true)
      try {
        const src = args.imageUrl && /^https?:\/\//.test(args.imageUrl) ? await urlToBase64(args.imageUrl) : null
        const img = await generateImage({
          prompt: buildPosterPrompt(args.name || 'le produit', args.brief, !!src),
          targetWidth: args.width,
          targetHeight: args.height,
          models: NB2_MODELS,
          ...(src ? { sourceImageBase64: src.data, sourceImageMimeType: src.mime } : {}),
        })
        return img?.url ?? null
      } finally {
        setLoading(false)
      }
    },
    [generateImage],
  )

  return { generatePoster, isLoading }
}
