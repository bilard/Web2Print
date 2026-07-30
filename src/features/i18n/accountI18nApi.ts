import { doc, getDoc, setDoc } from 'firebase/firestore'
import { db } from '@/lib/firebase/config'
import type { Locale } from '@/stores/locale.store'
import type { LocaleOverrides } from '@/stores/i18nOverrides.store'

/**
 * Accès Firestore aux surcharges de vocabulaire d'un COMPTE.
 *
 * Modèle :
 *   users/{uid}.accountId                       → compte de rattachement
 *   accounts/{accountId}                        → { name, activeLocales, businessContext }
 *   accounts/{accountId}/i18nOverrides/{locale} → { entries: { clé: texte } }
 *
 * Un doc PAR LANGUE, et non un doc unique ni un shard par préfixe de clé :
 * ⚠️ un document Firestore plafonne à 1 Mio. Les 4 000+ clés du catalogue tiennent
 * largement dans un doc tant que les surcharges restent ce qu'elles sont —
 * quelques dizaines de mots métier réécrits. Le découpage par langue donne une
 * marge de 5× sans multiplier les écouteurs (5 au maximum, un par langue
 * activée), et `MAX_DOC_BYTES` refuse l'écriture avant que Firestore ne la
 * rejette avec une erreur illisible.
 *
 * ⚠️ Il n'y a pas de fonction de LECTURE ici : tout passe par les écouteurs
 * temps réel de `useAccountI18nSync`. Un mot renommé doit atteindre les écrans
 * des collègues sans rechargement — une lecture ponctuelle ne le ferait pas.
 */

/** Compte par défaut : un déploiement mono-entreprise n'a rien à configurer. */
export const DEFAULT_ACCOUNT_ID = 'default'

/**
 * Plafond d'écriture d'un doc de surcharges. Sous la limite Firestore de 1 Mio :
 * la marge couvre les métadonnées du doc et l'encodage UTF-8 des accents.
 */
const MAX_DOC_BYTES = 800_000

/** Compte de rattachement de l'utilisateur. Absent ⇒ compte par défaut. */
export async function fetchAccountId(uid: string): Promise<string> {
  const snap = await getDoc(doc(db, 'users', uid))
  const id = snap.data()?.accountId
  return typeof id === 'string' && id !== '' ? id : DEFAULT_ACCOUNT_ID
}

export async function saveActiveLocales(accountId: string, activeLocales: Locale[]): Promise<void> {
  await setDoc(
    doc(db, 'accounts', accountId),
    { activeLocales, updatedAt: Date.now() },
    { merge: true },
  )
}

/** Métier du compte — contexte donné au modèle de traduction. */
export async function saveBusinessContext(accountId: string, businessContext: string): Promise<void> {
  await setDoc(
    doc(db, 'accounts', accountId),
    { businessContext, updatedAt: Date.now() },
    { merge: true },
  )
}

/**
 * Écrit EN BLOC les surcharges d'une langue.
 *
 * ⚠️ Écriture NON fusionnée sur `entries` : c'est ce qui permet de SUPPRIMER une
 * surcharge. Un `merge: true` laisserait la clé retirée en base, et le libellé
 * d'origine ne reviendrait jamais.
 */
export async function saveOverrides(
  accountId: string,
  locale: Locale,
  entries: LocaleOverrides,
  updatedBy: string,
): Promise<void> {
  const bytes = new TextEncoder().encode(JSON.stringify(entries)).length
  if (bytes > MAX_DOC_BYTES) {
    throw new Error(`i18n-overrides-too-large:${locale}:${bytes}`)
  }
  await setDoc(doc(db, 'accounts', accountId, 'i18nOverrides', locale), {
    entries,
    updatedAt: Date.now(),
    updatedBy,
  })
}
