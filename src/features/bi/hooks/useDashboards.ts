// Liste LIVE des tableaux de bord de l'espace de travail. Aucun cache : l'abonnement
// reflète la base, un tableau créé sur un autre poste apparaît sans rechargement.
import { useEffect, useState } from 'react'
import { collection, onSnapshot, query, orderBy } from 'firebase/firestore'
import { db } from '@/lib/firebase/config'
import { useWorkspaceUid } from '@/features/access/useWorkspaceUid'
import { dashboardsCol } from '../store/dashboardsStore'
import { parseDashboard, type Dashboard } from '../types'
import { debugLog } from '@/lib/debugLog'

export function useDashboards(): Dashboard[] {
  const uid = useWorkspaceUid()
  const [items, setItems] = useState<Dashboard[]>([])

  useEffect(() => {
    if (!uid) { setItems([]); return }
    return onSnapshot(
      query(collection(db, dashboardsCol(uid)), orderBy('updatedAt', 'desc')),
      (snap) => {
        const out: Dashboard[] = []
        for (const d of snap.docs) {
          try {
            out.push(parseDashboard(d.data()))
          } catch (e) {
            // ⚠ Un document invalide n'emporte pas la liste entière : il est écarté et DIT.
            debugLog('[bi] tableau de bord illisible', d.id, e)
          }
        }
        setItems(out)
      },
      (e) => console.warn('[bi] liste des tableaux de bord illisible :', e),
    )
  }, [uid])

  return items
}
