// Interrupteur des alertes Telegram de visite (« log live » : 🟢 une ligne par
// page d'un utilisateur connecté, 🔵 un ping par session anonyme). Pilote le
// coupe-circuit SERVEUR `users/{uid}.telegram.sessionAlerts`, lu par la CF
// notifySession à CHAQUE envoi — effet immédiat, sans redéploiement. Le merge
// profond préserve botToken/chatId du même map `telegram`.
import { useEffect, useState } from 'react'
import { doc, getDoc, setDoc } from 'firebase/firestore'
import { auth, db } from '@/lib/firebase/config'

export function useSessionAlerts() {
  const [enabled, setEnabled] = useState<boolean | null>(null) // null = chargement

  useEffect(() => {
    const uid = auth.currentUser?.uid
    if (!uid) return
    void getDoc(doc(db, 'users', uid)).then((s) => {
      const tg = (s.data()?.telegram ?? {}) as { sessionAlerts?: boolean }
      // Absent = actif (le serveur ne coupe que sur `=== false`).
      setEnabled(tg.sessionAlerts !== false)
    }).catch(() => setEnabled(true))
  }, [])

  const toggle = async (): Promise<boolean | null> => {
    const uid = auth.currentUser?.uid
    if (!uid || enabled === null) return null
    const next = !enabled
    setEnabled(next)
    try {
      await setDoc(doc(db, 'users', uid), { telegram: { sessionAlerts: next } }, { merge: true })
      return next
    } catch {
      setEnabled(!next) // rollback optimiste
      return null
    }
  }

  return { enabled, toggle }
}
