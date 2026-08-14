// Chemins et écriture des tableaux de bord.
//
// ⚠ Sous `users/{workspaceUid}/…` : les tableaux de bord sont des DONNÉES DE TRAVAIL, donc
// partagées par les membres d'une société, jamais rangées sous l'identité de leur auteur.
import { doc, setDoc } from 'firebase/firestore'
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

// ⚠ `DashboardDraft` et non `Dashboard` : l'appelant qui CRÉE un tableau n'a pas encore de
// pages, et c'est `parseDashboard` — ici même — qui les reconstitue avant l'écriture.
export async function saveDashboard(uid: string, d: DashboardDraft): Promise<void> {
  const valid = parseDashboard({ ...d, updatedAt: Date.now() })
  assertWritable(valid)
  // ⚠ Un tableau de bord porte des champs optionnels (description, filtres, tri…) : un `undefined`
  // explicite ferait lever `setDoc` (Firestore le refuse), cf. `stripUndefined`.
  await setDoc(doc(db, dashboardDoc(uid, valid.id)), stripUndefined(valid))
}
