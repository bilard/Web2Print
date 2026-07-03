// Hook de détourage (boutons « Supprimer le fond » promo/galerie…) — délègue au
// moteur partagé features/imaging/removeBackground : rembg (gratuit, Cloud Run)
// par défaut, Remove.bg si clé configurée et non désactivée dans les Réglages.
import { useCallback, useState } from 'react'
import { removeBackground } from '@/features/imaging/removeBackground'

export function useRemoveBg() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  /**
   * Supprime le fond d'une image (URL data:/blob:/https).
   * @returns URL blob du PNG détouré, ou null en cas d'erreur.
   */
  const removeBg = useCallback(async (imageUrl: string): Promise<string | null> => {
    setLoading(true)
    setError(null)
    try {
      const { url } = await removeBackground(imageUrl)
      return url
    } catch (e) {
      setError(String((e as Error).message))
      return null
    } finally {
      setLoading(false)
    }
  }, [])

  return { removeBg, loading, error }
}
