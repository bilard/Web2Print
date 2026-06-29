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
    `Visuel PUBLICITAIRE RETAIL de grande distribution (style prospectus / catalogue promo type Leroy Merlin, Castorama, Brico Dépôt, Carrefour), format vertical.`,
    `Produit héros : « ${name} »${hasImage ? `, intègre FIDÈLEMENT le produit de l'image fournie (packshot net, ne le déforme pas)` : ' en packshot net'}.`,
    brief ? `Ambiance : ${brief}.` : '',
    `STYLE : graphisme commercial PROPRE, LUMINEUX et à PLAT — fond clair ou aplats de couleurs de marque francs, packshot produit détouré bien éclairé (lumière douce de studio, PAS de scène), composition nette type flyer promo.`,
    `ZONES À RESPECTER STRICTEMENT : (1) produit détouré au centre/haut sur fond propre ; (2) pastille/macaron de remise (rond ou étoile) dans le COIN SUPÉRIEUR DROIT ; (3) BANDE de prix occupant tout le CINQUIÈME INFÉRIEUR, aplat de couleur uni et lisible.`,
    `INTERDICTIONS ABSOLUES : PAS de style jeu vidéo, PAS de rendu cinématique ou 3D dramatique, PAS d'ambiance sombre, PAS d'étincelles/flammes/explosions de particules, PAS de lens flare, PAS de fond d'atelier ou de scène d'action. Rester sobre, lumineux et commercial.`,
    `La pastille et la bande de prix doivent rester SANS AUCUN CHIFFRE ni texte (zones VIDES) — le pourcentage et le prix EXACTS sont ajoutés par-dessus. N'écris AUCUN chiffre, AUCUN prix, AUCUN pourcentage.`,
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
