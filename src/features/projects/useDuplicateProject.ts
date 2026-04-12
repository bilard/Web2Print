import { useMutation, useQueryClient } from '@tanstack/react-query'
import { addDoc, collection, doc, getDoc } from 'firebase/firestore'
import { db } from '@/lib/firebase/config'
import { useAuthStore } from '@/stores/auth.store'
import { toast } from 'sonner'
import type { ProjectData } from '@/types/project'

async function duplicateProject(
  userId: string,
  projectId: string
): Promise<ProjectData> {
  const snap = await getDoc(doc(db, 'projects', projectId))
  if (!snap.exists()) throw new Error('Projet introuvable')
  const source = snap.data() as Record<string, unknown>
  // Strip un éventuel `id` résiduel pour qu'il ne pollue pas le nouveau doc
  const { id: _ignored, ...sourceClean } = source

  const now = Date.now()
  const data = {
    ...sourceClean,
    title: `${(source.title as string) ?? 'Projet'} (copie)`,
    ownerId: userId,
    createdAt: now,
    updatedAt: now,
  }

  const ref = await addDoc(collection(db, 'projects'), data)

  const extras = data as typeof data & { thumbnail?: string | null; canvasData?: string | null }
  return {
    id: ref.id,
    title: data.title as string,
    thumbnail: extras.thumbnail ?? null,
    createdAt: now,
    updatedAt: now,
    ownerId: userId,
    canvasData: extras.canvasData ?? null,
  }
}

export function useDuplicateProject() {
  const user = useAuthStore((s) => s.user)
  const qc = useQueryClient()

  return useMutation({
    mutationFn: (projectId: string) => duplicateProject(user!.uid, projectId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['projects', user?.uid] })
      toast.success('Projet dupliqué')
    },
    onError: (e) => {
      console.error('[duplicateProject]', e)
      toast.error('Erreur lors de la duplication')
    },
  })
}
