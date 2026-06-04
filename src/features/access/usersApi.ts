// src/features/access/usersApi.ts
import { collection, deleteDoc, doc, getDocs, setDoc } from 'firebase/firestore'
import { db } from '@/lib/firebase/config'

export interface ManagedUser {
  uid: string
  email: string
  displayName: string
  photoURL: string
  lastSeenAt: number
  accessRoleId: string | null
  accessGrants: string[]
  accessRevokes: string[]
  /** Compte suspendu par un admin → aucun accès, quel que soit le rôle. */
  accessBlocked: boolean
}

/** Liste tous les users (admin only — la règle Firestore l'autorise). On NE lit QUE les
 *  champs d'identité/access, jamais les secrets (apiKeys/telegram/siteCookies). */
export async function listUsers(): Promise<ManagedUser[]> {
  const snap = await getDocs(collection(db, 'users'))
  return snap.docs
    .map((d) => {
      const x = d.data()
      return {
        uid: d.id,
        email: (x.email as string) ?? '',
        displayName: (x.displayName as string) ?? '',
        photoURL: (x.photoURL as string) ?? '',
        lastSeenAt: (x.lastSeenAt as number) ?? 0,
        accessRoleId: (x.accessRoleId as string | null) ?? null,
        accessGrants: (x.accessGrants as string[]) ?? [],
        accessRevokes: (x.accessRevokes as string[]) ?? [],
        accessBlocked: (x.accessBlocked as boolean) ?? false,
      }
    })
    .sort((a, b) => b.lastSeenAt - a.lastSeenAt)
}

export async function updateUserAccess(
  uid: string,
  access: { accessRoleId?: string | null; accessGrants?: string[]; accessRevokes?: string[]; accessBlocked?: boolean },
): Promise<void> {
  await setDoc(doc(db, 'users', uid), access, { merge: true })
}

/** Supprime le profil utilisateur (doc `users/{uid}`) — admin uniquement.
 *  ⚠️ Ne supprime PAS le compte Firebase Auth ni les sous-collections : si la
 *  personne se reconnecte, `writeUserProfile` recrée le doc et elle réapparaît
 *  « en attente » (rôle + blocage perdus). Pour barrer durablement → Bloquer. */
export async function deleteUser(uid: string): Promise<void> {
  await deleteDoc(doc(db, 'users', uid))
}
