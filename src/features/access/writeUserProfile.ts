// src/features/access/writeUserProfile.ts
import { doc, setDoc } from 'firebase/firestore'
import { db } from '@/lib/firebase/config'
import type { User } from 'firebase/auth'

/** Écrit/rafraîchit l'identité du user dans users/{uid} (pour l'écran admin). N'écrase PAS
 *  les secrets (apiKeys/telegram/siteCookies) ni les champs access* gérés par l'admin. */
export async function writeUserProfile(user: User): Promise<void> {
  try {
    await setDoc(
      doc(db, 'users', user.uid),
      {
        email: user.email ?? '',
        displayName: user.displayName ?? '',
        photoURL: user.photoURL ?? '',
        lastSeenAt: Date.now(),
      },
      { merge: true },
    )
  } catch (e) {
    console.warn('[writeUserProfile] failed:', e)
  }
}
