import { useAuthStore } from '@/stores/auth.store'
import { useAccessStore } from '@/stores/access.store'

/**
 * UID de l'ESPACE DE TRAVAIL — celui sous lequel vivent les DONNÉES.
 *
 * Une société peut désigner un compte porteur (`accounts/{id}.workspaceUid`) :
 * ses projets, produits, assets, workflows et veille tarifaire deviennent alors
 * l'espace commun de tous ses membres. Sans porteur désigné, chacun reste sur
 * ses propres données — la bascule se fait société par société.
 *
 * ⚠️ À NE PAS confondre avec `user.uid`, qui reste l'IDENTITÉ :
 *   - identité (`user.uid`) → profil, clés d'API personnelles, préférences,
 *     journal d'audit, compteurs d'usage/quotas ;
 *   - espace (`useWorkspaceUid()`) → tout ce qui constitue le travail partagé.
 *
 * Confondre les deux ferait écrire les secrets d'un membre chez un autre.
 */
export function useWorkspaceUid(): string | null {
  const user = useAuthStore((s) => s.user)
  const workspaceUid = useAccessStore((s) => s.workspaceUid)
  if (!user) return null
  return workspaceUid || user.uid
}

/**
 * Version hors composant (services, appels ponctuels). Même règle que le hook.
 *
 * ⚠️ Lit l'état à l'instant T : dans un composant, préférer le hook, qui suit
 * les changements (un rattachement de société doit rediriger les écrans sans
 * rechargement).
 */
export function getWorkspaceUid(): string | null {
  const user = useAuthStore.getState().user
  if (!user) return null
  return useAccessStore.getState().workspaceUid || user.uid
}

/** L'utilisateur travaille-t-il dans l'espace commun d'une société ? */
export function useIsSharedWorkspace(): boolean {
  const user = useAuthStore((s) => s.user)
  const workspaceUid = useAccessStore((s) => s.workspaceUid)
  return !!workspaceUid && !!user && workspaceUid !== user.uid
}
