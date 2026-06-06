import { doc, setDoc } from 'firebase/firestore'
import { db } from '@/lib/firebase/config'

/**
 * Marque l'onboarding comme terminé dans users/{uid}. `merge: true` n'écrase ni
 * les secrets ni les champs access*. Garde `if (!uid) return` : la fluctuation
 * auth null→uid a déjà poussé un {} qui a effacé la config Telegram — on n'écrit
 * jamais sans uid stable et truthy.
 */
export async function completeOnboarding(uid: string): Promise<void> {
  if (!uid) return
  try {
    await setDoc(doc(db, 'users', uid), { onboardingComplete: true }, { merge: true })
  } catch (e) {
    console.warn('[completeOnboarding] failed:', e)
  }
}
