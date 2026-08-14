// Les gestes qui portent sur le tableau de bord ENTIER : le dupliquer, le supprimer.
//
// ⚠ Distinct de `useBoardActions`, qui modifie le CONTENU d'un tableau (pages, tuiles,
// filtres, nom) : ici on crée ou on détruit un document. Les deux ne partagent ni les
// dépendances (celui-ci a besoin de l'auteur et de la société) ni les précautions.
//
// ⚠⚠ Aucun échec silencieux : un refus Firestore (permission `bi.edit` manquante, règle
// d'espace de travail) rejette la promesse et l'appelant AFFICHE la cause. Ce projet a déjà
// connu des écritures qui échouaient sans un mot.
import { useCallback } from 'react'
import { toast } from 'sonner'
import { useTranslation } from '@/lib/i18n'
import { useAuthStore } from '@/stores/auth.store'
import { useAccessStore } from '@/stores/access.store'
import { dashboardExists, deleteDashboard, saveDashboard } from '../store/dashboardsStore'
import { DASHBOARD_VERSION, type Dashboard } from '../types'

/**
 * Un identifiant LIBRE, vérifié en base avant l'écriture.
 *
 * ⚠⚠ `bi_${Date.now()}` seul retombe sur le même identifiant à deux clics rapprochés, et
 * `setDoc` REMPLACE : la seconde duplication écraserait la première. C'est exactement le
 * défaut déjà corrigé pour les modèles (`dashboardExists`), pas à rejouer ici.
 */
async function freeId(uid: string): Promise<string> {
  const base = `bi_${Date.now().toString(36)}`
  for (let n = 0; n < 8; n++) {
    const id = n === 0 ? base : `${base}_${n}`
    if (!(await dashboardExists(uid, id))) return id
  }
  throw new Error('Impossible de trouver un identifiant libre pour la copie')
}

export function useBoardCommands(uid: string | null) {
  const { t } = useTranslation()
  const user = useAuthStore((s) => s.user)
  // ⚠ `accountId` vaut '' sans société rattachée — `??` ne le rattraperait pas (cf. création).
  const accountId = useAccessStore((s) => s.accountId) || 'default'

  /** Copie complète (pages, tuiles, filtres, base source), sous un nouvel identifiant.
   *  Rend l'identifiant de la copie pour que l'écran l'affiche sans attendre l'écho. */
  const duplicate = useCallback(async (board: Dashboard): Promise<string | null> => {
    // ⚠ Pas de retour muet : `useWorkspaceUid` vaut `null` tant que l'accès n'est pas
    // hydraté, et un clic sans effet se lit comme un bouton cassé.
    if (!uid || !user) { toast.error(t('bi.save.failed')); return null }
    try {
      const id = await freeId(uid)
      const now = Date.now()
      await saveDashboard(uid, {
        ...board, id, name: t('bi.board.copyName', { name: board.name }),
        accountId, workspaceUid: uid, version: DASHBOARD_VERSION,
        createdAt: now, updatedAt: now, createdBy: user.uid,
      })
      toast.success(t('bi.board.duplicated'))
      return id
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('bi.save.failed'))
      return null
    }
  }, [uid, user, accountId])

  /** Supprime le document. Rend `true` si la base l'a accepté — l'écran bascule alors. */
  const remove = useCallback(async (board: Dashboard): Promise<boolean> => {
    if (!uid) { toast.error(t('bi.board.deleteFailed')); return false }
    try {
      await deleteDashboard(uid, board.id)
      toast.success(t('bi.board.deleted', { name: board.name }))
      return true
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('bi.board.deleteFailed'))
      return false
    }
  }, [uid])

  return { duplicate, remove }
}
