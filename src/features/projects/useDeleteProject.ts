import { useMutation, useQueryClient } from '@tanstack/react-query'
import { doc, deleteDoc, collection, query, where, getDocs, writeBatch, serverTimestamp } from 'firebase/firestore'
import { ref, listAll, deleteObject } from 'firebase/storage'
import { db, storage } from '@/lib/firebase/config'
import { useAuthStore } from '@/stores/auth.store'

/** Known subfolders where project assets are stored */
const PROJECT_SUBFOLDERS = ['links', 'fonts']

/**
 * Delete all files in a specific Storage folder (non-recursive, one level).
 */
async function deleteFilesInFolder(folderPath: string): Promise<number> {
  let count = 0
  try {
    const folderRef = ref(storage, folderPath)
    console.log(`[Delete] listAll("${folderPath}")...`)
    const result = await listAll(folderRef)
    console.log(`[Delete] "${folderPath}" → ${result.items.length} files, ${result.prefixes.length} subfolders`)

    if (result.items.length > 0) {
      const results = await Promise.allSettled(
        result.items.map((itemRef) =>
          deleteObject(itemRef).then(() => {
            count++
            console.log(`[Delete] ✓ ${itemRef.fullPath}`)
          })
        )
      )
      for (const r of results) {
        if (r.status === 'rejected') {
          console.error(`[Delete] ✗ delete failed:`, r.reason)
        }
      }
    }

    // Also recurse into any unexpected subfolders
    if (result.prefixes.length > 0) {
      for (const subRef of result.prefixes) {
        count += await deleteFilesInFolder(subRef.fullPath)
      }
    }
  } catch (err: any) {
    // Log the full error — this is critical for diagnosing permission issues
    console.error(`[Delete] ERROR on "${folderPath}":`, err?.code, err?.message || err)
  }
  return count
}

/**
 * Retire `projectId` de tous les linkedProjectIds des nœuds de toutes les
 * taxonomies de l'utilisateur. Une écriture par taxonomie impactée.
 */
export async function cleanupOrphanLinksInTaxonomies(userId: string, projectId: string): Promise<void> {
  try {
    const q = query(collection(db, 'taxonomies'), where('ownerId', '==', userId))
    const snapshot = await getDocs(q)
    const batch = writeBatch(db)
    let touched = 0

    snapshot.docs.forEach((docSnap) => {
      const data = docSnap.data() as { nodes?: Record<string, { linkedProjectIds?: string[] }> }
      const nodes = data.nodes ?? {}
      let changed = false
      const newNodes: Record<string, unknown> = {}
      for (const [nodeId, node] of Object.entries(nodes)) {
        const ids = node.linkedProjectIds ?? []
        if (ids.includes(projectId)) {
          newNodes[nodeId] = { ...node, linkedProjectIds: ids.filter((id) => id !== projectId) }
          changed = true
        } else {
          newNodes[nodeId] = node
        }
      }
      if (changed) {
        batch.update(docSnap.ref, { nodes: newNodes, updatedAt: serverTimestamp() })
        touched++
      }
    })

    if (touched > 0) {
      await batch.commit()
      console.log(`[Delete] Cleaned orphan link in ${touched} taxonomy(ies)`)
    }
  } catch (err: any) {
    console.error('[Delete] ERROR cleaning taxonomy orphans:', err?.code, err?.message || err)
  }
}

async function deleteProjectWithAssets(projectId: string): Promise<void> {
  console.log(`[Delete] Starting deletion of project "${projectId}" assets...`)

  let totalDeleted = 0

  // Strategy 1: Delete known subfolders directly (works even if parent listAll fails)
  for (const sub of PROJECT_SUBFOLDERS) {
    const path = `projects/${projectId}/${sub}`
    totalDeleted += await deleteFilesInFolder(path)
  }

  // Strategy 2: Also try listing the project root (catches any other files)
  totalDeleted += await deleteFilesInFolder(`projects/${projectId}`)

  console.log(`[Delete] Storage cleanup done: ${totalDeleted} files deleted`)

  // Delete Firestore document
  await deleteDoc(doc(db, 'projects', projectId))
  console.log(`[Delete] Project "${projectId}" fully deleted (${totalDeleted} storage files removed)`)
}

export function useDeleteProject() {
  const user = useAuthStore((s) => s.user)
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (projectId: string) => {
      await deleteProjectWithAssets(projectId)
      if (user?.uid) await cleanupOrphanLinksInTaxonomies(user.uid, projectId)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects', user?.uid] })
      queryClient.invalidateQueries({ queryKey: ['taxonomies', user?.uid] })
    },
  })
}
