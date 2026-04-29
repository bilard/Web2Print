import { useCallback, useState } from 'react'
import { getApiKey } from '@/lib/apiKeys'

export function useRemoveBg() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  /**
   * Supprime le fond d'une image via l'API Remove.bg.
   * @param imageUrl URL de l'image source (doit être accessible publiquement ou en base64 data URL)
   * @returns URL blob de l'image sans fond, ou null en cas d'erreur
   */
  const removeBg = useCallback(async (imageUrl: string): Promise<string | null> => {
    const apiKey = getApiKey('removebg')
    if (!apiKey) {
      setError('Clé API Remove.bg non configurée (Paramètres > Connecteurs)')
      return null
    }

    setLoading(true)
    setError(null)

    try {
      const formData = new FormData()

      if (imageUrl.startsWith('data:')) {
        // Base64 data URL → convertir en File
        const res = await fetch(imageUrl)
        const blob = await res.blob()
        formData.append('image_file', blob, 'image.png')
      } else {
        formData.append('image_url', imageUrl)
      }

      formData.append('size', 'auto')

      const response = await fetch('https://api.remove.bg/v1.0/removebg', {
        method: 'POST',
        headers: { 'X-Api-Key': apiKey },
        body: formData,
      })

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}))
        const msg = (errData as any)?.errors?.[0]?.title ?? `Erreur ${response.status}`
        setError(msg)
        return null
      }

      const blob = await response.blob()
      return URL.createObjectURL(blob)
    } catch {
      setError('Erreur réseau lors de la suppression du fond')
      return null
    } finally {
      setLoading(false)
    }
  }, [])

  return { removeBg, loading, error }
}
