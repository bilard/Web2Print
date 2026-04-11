import { useEffect, useState } from 'react'
import { ref, listAll, getDownloadURL } from 'firebase/storage'
import { storage } from '@/lib/firebase/config'

export interface AssetItem {
  name: string
  url: string
  fullPath: string
}

interface UseProjectAssetsOptions {
  /** Optional cache-busting version — increment externally to force reload */
  version?: number
}

/**
 * Loads images and fonts from a project's Firebase Storage folders.
 * - Images: `projects/{projectId}/links/` (URLs resolved for drag/preview)
 * - Fonts:  `projects/{projectId}/fonts/` (URL resolved lazily by consumer)
 */
export function useProjectAssets(projectId: string | null, options: UseProjectAssetsOptions = {}) {
  const { version = 0 } = options
  const [images, setImages] = useState<AssetItem[]>([])
  const [fonts, setFonts] = useState<AssetItem[]>([])
  const [loading, setLoading] = useState(false)

  const load = async () => {
    if (!projectId) {
      setImages([])
      setFonts([])
      return
    }
    setLoading(true)
    try {
      const [imgResult, fontResult] = await Promise.allSettled([
        listAll(ref(storage, `projects/${projectId}/links`)),
        listAll(ref(storage, `projects/${projectId}/fonts`)),
      ])

      if (imgResult.status === 'fulfilled') {
        const items = await Promise.all(
          imgResult.value.items.map(async (item) => {
            try {
              const url = await getDownloadURL(item)
              return { name: item.name, url, fullPath: item.fullPath }
            } catch {
              return { name: item.name, url: '', fullPath: item.fullPath }
            }
          })
        )
        setImages(items)
      } else {
        setImages([])
      }

      if (fontResult.status === 'fulfilled') {
        const items = await Promise.all(
          fontResult.value.items.map(async (item) => {
            try {
              const url = await getDownloadURL(item)
              return { name: item.name, url, fullPath: item.fullPath }
            } catch {
              return { name: item.name, url: '', fullPath: item.fullPath }
            }
          })
        )
        setFonts(items)
      } else {
        setFonts([])
      }
    } catch (err) {
      console.warn('[useProjectAssets] Error loading:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, version])

  return { images, fonts, loading, reload: load }
}

/** Parse font storage name: "Family__weight__style.ext" */
export function parseFontName(name: string): { family: string; weight: string; style: string } {
  const base = name.replace(/\.[^.]+$/, '')
  const parts = base.split('__')
  return {
    family: parts[0] || name,
    weight: parts[1] || '400',
    style: parts[2] || 'normal',
  }
}
