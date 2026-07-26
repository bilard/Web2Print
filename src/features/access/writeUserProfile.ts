import { doc, getDoc, setDoc } from 'firebase/firestore'
import { db } from '@/lib/firebase/config'
import type { User } from 'firebase/auth'

/** Écrit/rafraîchit l'identité du user dans users/{uid} (pour l'écran admin). N'écrase PAS
 *  les secrets (apiKeys/telegram/siteCookies) ni les champs access* gérés par l'admin.
 *  `displayName` n'est rempli QUE s'il est vide : un renommage admin (ex. « Pimalion »
 *  pour le compte de test) ne doit pas être écrasé par le profil Google au login. */
export async function writeUserProfile(user: User): Promise<void> {
  try {
    const ref = doc(db, 'users', user.uid)
    const existingName = ((await getDoc(ref)).data()?.displayName as string | undefined) ?? ''
    await setDoc(
      ref,
      {
        email: user.email ?? '',
        ...(existingName ? {} : { displayName: user.displayName ?? '' }),
        photoURL: user.photoURL ?? '',
        lastSeenAt: Date.now(),
      },
      { merge: true },
    )
  } catch (e) {
    console.warn('[writeUserProfile] failed:', e)
  }
}
