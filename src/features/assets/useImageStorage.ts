import { useCallback } from 'react'
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage'
import { storage } from '@/lib/firebase/config'
import { useAuthStore } from '@/stores/auth.store'

export function useImageStorage() {
  const userId = useAuthStore((s) => s.user?.uid)

  const uploadImage = useCallback(
    async (file: File): Promise<string> => {
      if (!userId) {
        // Fallback to local URL if not authenticated
        return URL.createObjectURL(file)
      }
      const ext = file.name.split('.').pop() ?? 'png'
      const path = `users/${userId}/images/${Date.now()}_${Math.random().toString(36).slice(2, 7)}.${ext}`
      const storageRef = ref(storage, path)
      await uploadBytes(storageRef, file)
      return getDownloadURL(storageRef)
    },
    [userId],
  )

  return { uploadImage }
}
