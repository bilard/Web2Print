// Chemins et écriture des tableaux de bord.
//
// ⚠ Sous `users/{workspaceUid}/…` : les tableaux de bord sont des DONNÉES DE TRAVAIL, donc
// partagées par les membres d'une société, jamais rangées sous l'identité de leur auteur.
import { deleteDoc, doc, getDoc, setDoc } from 'firebase/firestore'
import { db } from '@/lib/firebase/config'
import { stripUndefined } from '@/lib/stripUndefined'
import { MAX_DASHBOARD_BYTES, parseDashboard, type DashboardDraft } from '../types'

export const dashboardsCol = (uid: string) => `users/${uid}/biDashboards`
export const dashboardDoc = (uid: string, id: string) => `${dashboardsCol(uid)}/${id}`

/** ⚠ Vérifié AVANT l'envoi : un refus de Firestore arriverait après coup, et l'écran aurait
 *  déjà affiché « enregistré ». */
export function assertWritable(d: DashboardDraft): void {
  const bytes = new TextEncoder().encode(JSON.stringify(d)).length
  if (bytes > MAX_DASHBOARD_BYTES) {
    throw new Error(`Tableau de bord trop volumineux (${Math.round(bytes / 1024)} ko) — retire des tuiles.`)
  }
}

/**
 * Ce document existe-t-il DÉJÀ ? Lecture DIRECTE, jamais l'abonnement de la liste.
 *
 * ⚠⚠ `useDashboards` part de `[]` et se remplit APRÈS le premier instantané : une création à
 * identifiant déterministe (un modèle) décidée sur cette liste écraserait, au premier rendu,
 * le tableau que l'utilisateur avait déjà bâti dessus — `setDoc` remplace, il ne fusionne pas.
 * La liste écarte en outre en silence tout document illisible, qui paraîtrait donc absent.
 */
export async function dashboardExists(uid: string, id: string): Promise<boolean> {
  const snap = await getDoc(doc(db, dashboardDoc(uid, id)))
  return snap.exists()
}

// ⚠ `DashboardDraft` et non `Dashboard` : l'appelant qui CRÉE un tableau n'a pas encore de
// pages, et c'est `parseDashboard` — ici même — qui les reconstitue avant l'écriture.
export async function saveDashboard(uid: string, d: DashboardDraft): Promise<void> {
  const valid = parseDashboard({ ...d, updatedAt: Date.now() })
  assertWritable(valid)
  // ⚠ Un tableau de bord porte des champs optionnels (description, filtres, tri…) : un `undefined`
  // explicite ferait lever `setDoc` (Firestore le refuse), cf. `stripUndefined`.
  await setDoc(doc(db, dashboardDoc(uid, valid.id)), stripUndefined(valid))
}

/**
 * Supprime un tableau de bord. ⚠⚠ C'est une donnée de l'ESPACE DE TRAVAIL : le document
 * disparaît pour toute la société, pas pour le seul auteur du clic. L'appelant DOIT donc
 * confirmer en nommant le tableau (`BoardActionsMenu`) — cette fonction, elle, ne demande rien.
 *
 * ⚠ Elle avait été retirée du module faute d'interface qui l'utilise ; elle revient parce que
 * la liste, elle, se remplissait de tableaux vides impossibles à écarter.
 * ⚠ Le refus Firestore (permission `bi.edit`) remonte par le rejet de la promesse : l'appelant
 * l'AFFICHE, jamais ne l'avale — ce projet a déjà connu des écritures échouées en silence.
 */
export async function deleteDashboard(uid: string, id: string): Promise<void> {
  await deleteDoc(doc(db, dashboardDoc(uid, id)))
}
