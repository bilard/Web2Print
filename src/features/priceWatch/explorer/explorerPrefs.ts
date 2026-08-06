// Réglages d'affichage de l'explorateur, PARTAGÉS par l'espace de travail.
//
// ⚠ Ils vivaient en `localStorage` seul : la base source, le préfixe d'image et le
// gabarit d'URL produit étaient donc propres à UN navigateur. Un collègue ouvrant le
// même suivi voyait la colonne F1 sans visuels (préfixe absent → `absoluteImage` rend
// une chaîne vide) et sans taxonomie (base source retombée sur « celle ouverte dans le
// PIM », qu'un rôle de veille n'ouvre jamais) — sans rien pour l'expliquer.
//
// Portés par le doc RACINE du suivi : ils décrivent le suivi, pas la personne.
import { doc, getDoc, setDoc } from 'firebase/firestore'
import { db } from '@/lib/firebase/config'
import { watchRootDoc } from '../paths'

export interface ExplorerPrefs {
  dbId?: string
  imagePrefix?: string
  productUrl?: string
}

export async function loadExplorerPrefs(uid: string, watchId: string): Promise<ExplorerPrefs | null> {
  const snap = await getDoc(doc(db, watchRootDoc(uid, watchId)))
  const raw = snap.data()?.explorerSource as ExplorerPrefs | undefined
  return raw && typeof raw === 'object' ? raw : null
}

/**
 * Écrit les réglages SANS toucher au reste du doc de suivi.
 *
 * ⚠ `merge: true` obligatoire : ce doc porte aussi la méta du suivi (libellé,
 * `updatedAt`, `lastReportAt`) qu'affiche le sélecteur — un `setDoc` nu l'effacerait.
 * Et jamais d'`undefined` : Firestore refuse le document entier.
 */
export async function saveExplorerPrefs(uid: string, watchId: string, prefs: ExplorerPrefs): Promise<void> {
  const clean: Record<string, string> = {}
  for (const [k, v] of Object.entries(prefs)) {
    if (typeof v === 'string') clean[k] = v
  }
  await setDoc(doc(db, watchRootDoc(uid, watchId)), { explorerSource: clean }, { merge: true })
}
