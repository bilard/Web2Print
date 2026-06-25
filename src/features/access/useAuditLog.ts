// Lecture du journal d'audit (auditLog). Admin → tout ; chaque user → ses propres
// actions. Index composite requis pour la vue user : auditLog (userId ASC, createdAt DESC).
import { useQuery } from '@tanstack/react-query'
import { collection, getDocs, limit, orderBy, query, where, type QueryDocumentSnapshot } from 'firebase/firestore'
import { db } from '@/lib/firebase/config'
import { useAuthStore } from '@/stores/auth.store'
import type { AuditEntry } from '@/lib/auditLog'

const MAX_ENTRIES = 500

function mapDoc(d: QueryDocumentSnapshot): AuditEntry {
  const x = d.data()
  return {
    id: d.id,
    userId: x.userId ?? '',
    userEmail: x.userEmail ?? '',
    userName: x.userName ?? '',
    action: x.action ?? '',
    module: x.module ?? '',
    targetId: x.targetId ?? undefined,
    targetLabel: x.targetLabel ?? undefined,
    meta: x.meta ?? undefined,
    createdAt: x.createdAt?.toDate?.() ?? null,
  }
}

/** Admin : tout le journal récent (filtres QUI/QUOI/QUAND appliqués côté UI). */
export function useAuditLogAll(enabled: boolean) {
  return useQuery({
    queryKey: ['auditLog', 'all'],
    enabled,
    staleTime: 30_000,
    queryFn: async (): Promise<AuditEntry[]> => {
      const snap = await getDocs(
        query(collection(db, 'auditLog'), orderBy('createdAt', 'desc'), limit(MAX_ENTRIES)),
      )
      return snap.docs.map(mapDoc)
    },
  })
}

/** Les actions d'un utilisateur (par défaut : l'utilisateur courant). */
export function useMyAuditLog(uidArg?: string) {
  const me = useAuthStore((s) => s.user?.uid)
  const uid = uidArg ?? me
  return useQuery({
    queryKey: ['auditLog', 'user', uid],
    enabled: !!uid,
    staleTime: 30_000,
    queryFn: async (): Promise<AuditEntry[]> => {
      const snap = await getDocs(
        query(
          collection(db, 'auditLog'),
          where('userId', '==', uid),
          orderBy('createdAt', 'desc'),
          limit(MAX_ENTRIES),
        ),
      )
      return snap.docs.map(mapDoc)
    },
  })
}
