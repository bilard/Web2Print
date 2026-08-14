// Chemins et écriture des tableaux de bord.
//
// ⚠ Sous `users/{workspaceUid}/…` : les tableaux de bord sont des DONNÉES DE TRAVAIL, donc
// partagées par les membres d'une société, jamais rangées sous l'identité de leur auteur.
import { doc, setDoc, deleteDoc } from 'firebase/firestore'
import { db } from '@/lib/firebase/config'
import { stripUndefined } from '@/lib/stripUndefined'
import { MAX_DASHBOARD_BYTES, parseDashboard, type Dashboard } from '../types'

export const dashboardsCol = (uid: string) => `users/${uid}/biDashboards`
export const dashboardDoc = (uid: string, id: string) => `${dashboardsCol(uid)}/${id}`

/** ⚠ Vérifié AVANT l'envoi : un refus de Firestore arriverait après coup, et l'écran aurait
 *  déjà affiché « enregistré ». */
export function assertWritable(d: Dashboard): void {
  const bytes = new TextEncoder().encode(JSON.stringify(d)).length
  if (bytes > MAX_DASHBOARD_BYTES) {
    throw new Error(`Tableau de bord trop volumineux (${Math.round(bytes / 1024)} ko) — retire des tuiles.`)
  }
}

export async function saveDashboard(uid: string, d: Dashboard): Promise<void> {
  const valid = parseDashboard({ ...d, updatedAt: Date.now() })
  assertWritable(valid)
  // ⚠ `Dashboard` porte des champs optionnels (description, filtres, tri…) : un `undefined`
  // explicite ferait lever `setDoc` (Firestore le refuse), cf. `stripUndefined`.
  await setDoc(doc(db, dashboardDoc(uid, valid.id)), stripUndefined(valid))
}

export async function deleteDashboard(uid: string, id: string): Promise<void> {
  await deleteDoc(doc(db, dashboardDoc(uid, id)))
}
