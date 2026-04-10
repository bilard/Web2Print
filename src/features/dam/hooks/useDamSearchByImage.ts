import { useCallback, useState } from 'react'
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage'
import { httpsCallable } from 'firebase/functions'
import { storage, functions } from '../../../lib/firebase/config'
import { useDamStore } from '../../../stores/dam.store'
import type { DamSearchResponse } from '../types'

const searchSimilarFn = httpsCallable<{ imageUrl: string }, DamSearchResponse>(
  functions,
  'damSearchSimilar'
)

export function useDamSearchByImage() {
  const [uploading, setUploading] = useState(false)
  const { setResults, setLoading } = useDamStore()

  const searchByImage = useCallback(
    async (file: File) => {
      setUploading(true)
      setLoading(true)

      try {
        const tempRef = ref(storage, `dam/temp/${Date.now()}_${file.name}`)
        await uploadBytes(tempRef, file)
        const imageUrl = await getDownloadURL(tempRef)

        const result = await searchSimilarFn({ imageUrl })
        setResults(result.data.images, result.data.totalResults, result.data.hasMore)
      } catch (err) {
        console.error('Search by image failed:', err)
        setResults([], 0, false)
      } finally {
        setUploading(false)
        setLoading(false)
      }
    },
    [setResults, setLoading]
  )

  return { searchByImage, uploading }
}
