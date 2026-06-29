import { useState, useCallback } from 'react'
import { useImageGeneration } from '@/features/nanobana/useImageGeneration'

// Nano Banana 2 / Pro d'abord (meilleure qualité créative pour le design),
// repli sur les modèles flash si indisponible.
const NB2_MODELS = [
  'gemini-3-pro-image-preview',
  'nano-banana-pro-preview',
  'gemini-3.1-flash-image-preview',
  'gemini-2.5-flash-image',
] as const

function buildBackgroundPrompt(brief?: string): string {
  return [
    `Arrière-plan d'affiche promotionnelle retail haut de gamme, format vertical.`,
    brief ? `Ambiance souhaitée : ${brief}.` : '',
    `Design moderne et épuré, couleurs dominantes indigo (#6366f1) et bleu nuit (#0f172a),`,
    `accents doux, léger dégradé, formes géométriques abstraites discrètes,`,
    `beaucoup d'espace vide au centre et en bas pour poser un produit et un prix, lumineux, premium.`,
    `STRICTEMENT AUCUN texte, AUCUN mot, AUCUN chiffre, AUCUN prix, AUCUN produit, AUCUN logo, AUCUNE personne.`,
  ]
    .filter(Boolean)
    .join(' ')
}

/** Génère un fond décoratif via Nano Banana 2/Pro. Renvoie l'URL de l'image (gallery) ou null. */
export function useGeneratePromoBackground() {
  const { generateImage } = useImageGeneration()
  const [isLoading, setLoading] = useState(false)

  const generateBackground = useCallback(
    async (args: { brief?: string; width: number; height: number }): Promise<string | null> => {
      setLoading(true)
      try {
        const img = await generateImage({
          prompt: buildBackgroundPrompt(args.brief),
          targetWidth: args.width,
          targetHeight: args.height,
          models: NB2_MODELS,
        })
        return img?.url ?? null
      } finally {
        setLoading(false)
      }
    },
    [generateImage],
  )

  return { generateBackground, isLoading }
}
