import { useEffect, useState, useCallback } from 'react'
import { doc, getDoc, setDoc, updateDoc, deleteField, serverTimestamp } from 'firebase/firestore'
import { db } from '@/lib/firebase/config'
import { useAuthStore } from '@/stores/auth.store'

interface GDriveSettings {
  email: string
  savedAt: unknown // Firestore Timestamp
}

export function useGDriveSettings() {
  const user = useAuthStore((s) => s.user)
  const [savedEmail, setSavedEmail] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  // Load on mount
  useEffect(() => {
    if (!user) { setLoading(false); return }

    const ref = doc(db, 'users', user.uid)
    getDoc(ref)
      .then((snap) => {
        const data = snap.data()
        const gd = data?.connectors?.googleDrive as GDriveSettings | undefined
        setSavedEmail(gd?.email ?? null)
      })
      .catch((err) => console.error('[GDriveSettings] Load error:', err))
      .finally(() => setLoading(false))
  }, [user])

  const saveSettings = useCallback(async (email: string) => {
    if (!user) return
    const ref = doc(db, 'users', user.uid)
    await setDoc(ref, {
      connectors: {
        googleDrive: { email, savedAt: serverTimestamp() },
      },
    }, { merge: true })
    setSavedEmail(email)
  }, [user])

  const clearSettings = useCallback(async () => {
    if (!user) return
    const ref = doc(db, 'users', user.uid)
    await updateDoc(ref, { 'connectors.googleDrive': deleteField() })
    setSavedEmail(null)
  }, [user])

  return { savedEmail, loading, saveSettings, clearSettings }
}
