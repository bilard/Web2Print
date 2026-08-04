import { collection, doc, getDocs, setDoc, deleteDoc } from 'firebase/firestore'
import { db } from '@/lib/firebase/config'
import { DEFAULT_ACCOUNT_ID } from '@/features/i18n/accountI18nApi'

/**
 * SOCIÉTÉS (comptes d'entreprise) — le niveau au-dessus des utilisateurs.
 *
 *   accounts/{id}          → { name, activeLocales, businessContext }
 *   users/{uid}.accountId  → rattachement d'un membre à sa société
 *   roles/{id}.accountId   → société propriétaire du rôle
 *
 * ⚠️ La collection `accounts` PRÉEXISTE : elle portait le vocabulaire d'interface
 * partagé (cf. `accountI18nApi`). On lui ajoute un `name` sans jamais écraser
 * `activeLocales`/`businessContext` — d'où le `merge: true` systématique.
 *
 * ⚠️ Un `accountId` absent vaut `'default'` PARTOUT (users, rôles). C'est ce qui
 * permet à un déploiement mono-entreprise de continuer sans rien configurer.
 * Attention : une requête `where('accountId','==','default')` ne renvoie PAS les
 * documents où le champ MANQUE — d'où `backfillAccountIds()`.
 */
export interface Company {
  id: string
  name: string
  createdAt: number
  updatedAt: number
}

/** Identifiant technique dérivé du nom (« Auchan Retail » → « auchan-retail »). */
export function companyId(name: string): string {
  return name.trim().toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
}

export async function listCompanies(): Promise<Company[]> {
  const snap = await getDocs(collection(db, 'accounts'))
  return snap.docs
    .map((d) => {
      const x = d.data()
      return {
        id: d.id,
        // Une société créée avant cet écran n'a pas de `name` : son identifiant
        // fait office de libellé plutôt que d'afficher une ligne vide.
        name: (x.name as string) || d.id,
        createdAt: (x.createdAt as number) ?? 0,
        updatedAt: (x.updatedAt as number) ?? 0,
      }
    })
    .sort((a, b) => a.name.localeCompare(b.name))
}

/** Crée ou renomme une société. L'id est dérivé du nom à la création seulement :
 *  le changer casserait le rattachement de tous ses membres. */
export async function saveCompany(input: { id?: string; name: string }): Promise<string> {
  const name = input.name.trim()
  const id = input.id ?? companyId(name)
  if (!id) throw new Error('nom de société vide')
  const now = Date.now()
  await setDoc(
    doc(db, 'accounts', id),
    { name, updatedAt: now, ...(input.id ? {} : { createdAt: now }) },
    { merge: true },
  )
  return id
}

/**
 * Supprime la société. Ses membres NE SONT PAS supprimés : ils retombent sur
 * `default` au prochain rattachement. Refusé tant qu'elle a des membres —
 * supprimer sous les pieds de quelqu'un le laisserait rattaché à un fantôme.
 */
export async function deleteCompany(id: string): Promise<void> {
  if (id === DEFAULT_ACCOUNT_ID) throw new Error('la société par défaut ne se supprime pas')
  await deleteDoc(doc(db, 'accounts', id))
}

/**
 * Écrit `accountId: 'default'` sur les profils qui n'ont pas le champ.
 *
 * ⚠️ Indispensable : l'administrateur d'une société liste ses membres par
 * `where('accountId','==',…)`, et Firestore EXCLUT les documents dépourvus du
 * champ — sans ce rattrapage, les comptes antérieurs seraient invisibles pour
 * tout le monde sauf l'admin global. Admin global uniquement (lecture de toute
 * la collection `users`). Renvoie le nombre de profils corrigés.
 */
export async function backfillAccountIds(): Promise<number> {
  const snap = await getDocs(collection(db, 'users'))
  const orphans = snap.docs.filter((d) => {
    const v = d.data().accountId
    return typeof v !== 'string' || v === ''
  })
  await Promise.all(
    orphans.map((d) => setDoc(doc(db, 'users', d.id), { accountId: DEFAULT_ACCOUNT_ID }, { merge: true })),
  )
  return orphans.length
}
