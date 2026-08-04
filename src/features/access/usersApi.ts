import { collection, deleteDoc, doc, getDocs, query, setDoc, where } from 'firebase/firestore'
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
  /**
   * Compte (entreprise) de rattachement — porte le VOCABULAIRE d'interface
   * partagé par ses membres. Vide ⇒ compte `default`, ce qui convient à un
   * déploiement mono-entreprise.
   *
   * ⚠️ Champ RÉSERVÉ à l'admin dans `firestore.rules` : c'est lui qui décide de
   * quel compte on lit et écrit les libellés. Laissé au user, se rattacher au
   * compte d'un tiers suffirait à en réécrire l'interface.
   */
  accountId: string
}

/**
 * Membres d'une société — ou tous les comptes si `accountId` est omis (admin global).
 * On NE lit QUE les champs d'identité/access, jamais les secrets
 * (apiKeys/telegram/siteCookies).
 *
 * ⚠️ Un administrateur de société DOIT passer `accountId` : la règle serveur
 * autorise la lecture doc par doc (même société), mais une requête non filtrée
 * sur toute la collection est refusée EN BLOC par Firestore — l'écran
 * remonterait vide sans le moindre message. Cf. `useManagedScope`.
 */
export async function listUsers(accountId?: string): Promise<ManagedUser[]> {
  const snap = await getDocs(
    accountId ? query(collection(db, 'users'), where('accountId', '==', accountId)) : collection(db, 'users'),
  )
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
        accountId: (x.accountId as string) ?? '',
      }
    })
    .sort((a, b) => b.lastSeenAt - a.lastSeenAt)
}

/**
 * Rattache un utilisateur à un compte (vocabulaire d'interface partagé).
 *
 * ⚠️ Le changement ne prend effet chez l'intéressé qu'au prochain chargement :
 * `useAccountI18nSync` pose ses écouteurs une fois par `uid`, pas par compte.
 * C'est assumé — un rattachement est un acte d'administration rare, et
 * rebrancher les écouteurs à chaud ferait clignoter tous les libellés.
 */
export async function updateUserAccount(uid: string, accountId: string): Promise<void> {
  await setDoc(doc(db, 'users', uid), { accountId: accountId.trim() }, { merge: true })
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
