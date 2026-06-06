import { useEffect } from 'react'
import { onAuthStateChanged, signInWithPopup, signOut, GoogleAuthProvider } from 'firebase/auth'
import { auth } from '@/lib/firebase/config'
import { useAuthStore } from '@/stores/auth.store'
import { writeUserProfile } from '@/features/access/writeUserProfile'

const googleProvider = new GoogleAuthProvider()
// Force le sélecteur de compte Google à CHAQUE connexion. Sans ce paramètre,
// signInWithPopup réutilise silencieusement l'unique session Google active du
// navigateur — impossible alors de se connecter avec un autre compte (on est
// reconnecté direct au compte déjà actif, sans choix ni erreur).
googleProvider.setCustomParameters({ prompt: 'select_account' })

/** Compte propriétaire de l'app. Sert UNIQUEMENT à masquer les données financières
 *  personnelles du compte Bright Data partagé (solde/facturation) aux autres comptes —
 *  pas à restreindre l'accès aux fonctionnalités. */
export const OWNER_EMAIL = 'ibs.studio@gmail.com'

/** Helper pur (utilisable hors composant React, ex: option `enabled` d'une query). */
export function isOwnerEmail(email: string | null | undefined): boolean {
  return !!email && email.toLowerCase() === OWNER_EMAIL
}

/** Vrai si l'utilisateur connecté est le propriétaire de l'app. */
export function useIsOwner(): boolean {
  const email = useAuthStore((s) => s.user?.email)
  return isOwnerEmail(email)
}

export function useAuthInit() {
  const { setUser, setLoading } = useAuthStore()

  useEffect(() => {
    // undefined = pas encore initialisé (1er événement = chargement de page)
    let prevUid: string | null | undefined = undefined
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      const uid = user?.uid ?? null
      // Changement de compte (ou déconnexion) sur ce navigateur → purger les données
      // en cache du compte précédent (localStorage est partagé par navigateur). On ne
      // purge PAS au tout premier événement, sinon un simple refresh effacerait les
      // données légitimes du user déjà connecté (elles seront re-hydratées via Firestore).
      if (prevUid !== undefined && prevUid !== uid) {
        purgeLocalUserData()
      }
      prevUid = uid
      // Écrire le profil AVANT d'exposer le user (donc avant que les hooks d'hydratation,
      // déclenchés par [uid], ne lisent users/{uid}). Sinon le setDoc(merge) de
      // writeUserProfile reste une écriture LOCALE EN ATTENTE qui, sur un doc pas encore
      // chargé, masque tous les autres champs (aiSettings, apiKeys, accessRoleId…) dans le
      // snapshot des getDoc concurrents → « hydratation muette » (clés API, cascade IA,
      // rôles). On borne l'attente à 4 s pour ne jamais figer la connexion hors-ligne.
      if (user) {
        await Promise.race([
          writeUserProfile(user),
          new Promise<void>((r) => setTimeout(r, 4000)),
        ])
      }
      setUser(user)
      setLoading(false)
    })
    return unsubscribe
  }, [setUser, setLoading])
}

export function useSignInWithGoogle() {
  return () => signInWithPopup(auth, googleProvider)
}

/** Préfixe commun à la plupart des données utilisateur mises en cache dans localStorage
 *  (clés API, settings IA/Telegram, cookies de scraping…). */
const LOCAL_USER_DATA_PREFIX = 'designstudio_'

/** Clés utilisateur SANS le préfixe commun, à purger explicitement (ex. historique de
 *  recherche). Ne PAS y mettre les simples préférences d'UI (viewMode, couleurs…) qu'il
 *  est pratique de conserver entre comptes. */
const LOCAL_USER_DATA_EXTRA_KEYS = ['dam_recent_searches']

/** Purge les données utilisateur du localStorage. CRITIQUE pour la sécurité : le
 *  localStorage est partagé entre TOUS les comptes Google qui se connectent sur le même
 *  navigateur. Sans ce nettoyage, l'utilisateur suivant voit les données du précédent
 *  (cf getApiKey() qui lit le localStorage en priorité).
 *  ⚠️ Toute donnée précieuse purgée ici DOIT avoir une sauvegarde Firestore (sinon perte
 *  définitive au changement de compte — cf cookies, ré-synchronisés via useSiteCookiesSync). */
export function purgeLocalUserData() {
  for (let i = localStorage.length - 1; i >= 0; i--) {
    const k = localStorage.key(i)
    if (k && (k.startsWith(LOCAL_USER_DATA_PREFIX) || LOCAL_USER_DATA_EXTRA_KEYS.includes(k))) {
      localStorage.removeItem(k)
    }
  }
}

export function useSignOut() {
  const { setUser } = useAuthStore()
  return async () => {
    await signOut(auth)
    purgeLocalUserData()
    setUser(null)
  }
}
