import { useAccessStore } from '@/stores/access.store'
import { DEFAULT_ACCOUNT_ID } from '@/features/i18n/accountI18nApi'
import { TEAM_VIEW_PERMISSION } from './permissions'

/**
 * PÉRIMÈTRE d'administration de l'utilisateur courant.
 *
 * Deux niveaux, à ne pas confondre :
 *  - **admin global** — voit toutes les sociétés, tous les membres, tous les rôles ;
 *  - **administrateur d'entreprise** (`team.view`) — sa société et elle seule.
 *
 * ⚠️ `accountId` n'est pas cosmétique : c'est le filtre que les écrans DOIVENT
 * passer à `listUsers`/`listRoles`. Les règles autorisent la lecture document par
 * document (même société), mais Firestore refuse EN BLOC une requête non filtrée
 * sur `users` — l'écran remonterait vide, sans erreur visible.
 */
export interface ManagedScope {
  /** Administration globale : aucune restriction de société. */
  isGlobalAdmin: boolean
  /** Peut administrer au moins une société (globale ou la sienne). */
  canManage: boolean
  /** Société à interroger. `undefined` ⇒ toutes (admin global uniquement). */
  accountId: string | undefined
}

export function useManagedScope(): ManagedScope {
  // ⚠️ Sélecteurs ATOMIQUES : renvoyer l'objet composé depuis le sélecteur en
  // recréerait un à chaque rendu, et Zustand (comparaison par référence) rendrait
  // en boucle. On compose dans le corps du hook, hors abonnement.
  const isOwner = useAccessStore((s) => s.isOwner)
  const permissions = useAccessStore((s) => s.permissions)
  const accountId = useAccessStore((s) => s.accountId)

  const isGlobalAdmin = isOwner || permissions.has('admin')
  const isTeamAdmin = !isGlobalAdmin && permissions.has(TEAM_VIEW_PERMISSION)
  return {
    isGlobalAdmin,
    canManage: isGlobalAdmin || isTeamAdmin,
    accountId: isGlobalAdmin ? undefined : (accountId || DEFAULT_ACCOUNT_ID),
  }
}
