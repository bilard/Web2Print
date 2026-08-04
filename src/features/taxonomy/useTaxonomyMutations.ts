import { useWorkspaceUid } from '@/features/access/useWorkspaceUid'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  doc,
  setDoc,
  updateDoc,
  deleteDoc,
  Timestamp,
} from 'firebase/firestore'
import { db } from '@/lib/firebase/config'
import { toast } from 'sonner'
import { getAllDescendantIds, getNextOrder } from './taxonomyUtils'
import { createDefaultFormTemplate } from '@/features/briefs/defaults'
import type { Taxonomy, TaxonomyNode } from './types'
import { t } from '@/lib/i18n'

// ─── Clés React Query ─────────────────────────────────────────────────────────

const taxListKey = (uid: string) => ['taxonomies', uid]
const taxKey = (id: string) => ['taxonomy', id]

// ─── Helper : récupère les taxonomies depuis le cache ─────────────────────────

function getCachedList(qc: ReturnType<typeof useQueryClient>, uid: string) {
  return qc.getQueryData<Taxonomy[]>(taxListKey(uid)) ?? []
}

// ─── createTaxonomy ───────────────────────────────────────────────────────────

export function useCreateTaxonomy() {
  const uid = useWorkspaceUid()
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async ({
      name,
      nodes,
    }: {
      name: string
      nodes: Record<string, TaxonomyNode>
    }) => {
      const id = crypto.randomUUID()
      const now = Timestamp.now()
      const taxonomy: Taxonomy = {
        id,
        name,
        ownerId: uid!,
        createdAt: now,
        updatedAt: now,
        nodes,
        formTemplate: createDefaultFormTemplate(),
      }
      await setDoc(doc(db, 'taxonomies', id), taxonomy)
      return taxonomy
    },
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: taxListKey(uid!) }),
    onError: () => toast.error(t('tst.createFailed')),
  })
}

// ─── renameTaxonomy ───────────────────────────────────────────────────────────

export function useRenameTaxonomy() {
  const uid = useWorkspaceUid()
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, name }: { id: string; name: string }) => {
      await updateDoc(doc(db, 'taxonomies', id), {
        name,
        updatedAt: Timestamp.now(),
      })
    },
    onMutate: async ({ id, name }) => {
      await qc.cancelQueries({ queryKey: taxListKey(uid!) })
      const previous = getCachedList(qc, uid!)
      qc.setQueryData<Taxonomy[]>(taxListKey(uid!), (old) =>
        (old ?? []).map((t) => (t.id === id ? { ...t, name } : t))
      )
      return { previous }
    },
    onError: (_e, _v, ctx) => {
      qc.setQueryData(taxListKey(uid!), ctx?.previous)
      toast.error(t('tst.tx.renameFailed'))
    },
    onSettled: () =>
      qc.invalidateQueries({ queryKey: taxListKey(uid!) }),
  })
}

// ─── updateTaxonomySettings ───────────────────────────────────────────────────

export function useUpdateTaxonomySettings() {
  const uid = useWorkspaceUid()
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, sourceUrl }: { id: string; sourceUrl: string }) => {
      await updateDoc(doc(db, 'taxonomies', id), {
        sourceUrl,
        updatedAt: Timestamp.now(),
      })
    },
    onMutate: async ({ id, sourceUrl }) => {
      await qc.cancelQueries({ queryKey: taxListKey(uid!) })
      const previous = getCachedList(qc, uid!)
      qc.setQueryData<Taxonomy[]>(taxListKey(uid!), (old) =>
        (old ?? []).map((t) => (t.id === id ? { ...t, sourceUrl } : t))
      )
      return { previous }
    },
    onError: (_e, _v, ctx) => {
      qc.setQueryData(taxListKey(uid!), ctx?.previous)
      toast.error(t('tst.updateFailed'))
    },
    onSettled: () =>
      qc.invalidateQueries({ queryKey: taxListKey(uid!) }),
  })
}

// ─── deleteTaxonomy ───────────────────────────────────────────────────────────

export function useDeleteTaxonomy() {
  const uid = useWorkspaceUid()
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (id: string) => {
      await deleteDoc(doc(db, 'taxonomies', id))
    },
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: taxListKey(uid!) })
      const previous = getCachedList(qc, uid!)
      qc.setQueryData<Taxonomy[]>(taxListKey(uid!), (old) =>
        (old ?? []).filter((t) => t.id !== id)
      )
      return { previous }
    },
    onError: (_e, _v, ctx) => {
      qc.setQueryData(taxListKey(uid!), ctx?.previous)
      toast.error(t('tst.deleteFailed'))
    },
    onSettled: () =>
      qc.invalidateQueries({ queryKey: taxListKey(uid!) }),
  })
}

// ─── duplicateTaxonomy ────────────────────────────────────────────────────────

export function useDuplicateTaxonomy() {
  const uid = useWorkspaceUid()
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async ({ id }: { id: string }) => {
      const source = getCachedList(qc, uid!).find((t) => t.id === id)
      if (!source) throw new Error(t('err.notFound.taxonomy'))

      // Remap les IDs pour éviter les collisions
      const idMap = new Map<string, string>()
      for (const nodeId of Object.keys(source.nodes)) {
        idMap.set(nodeId, crypto.randomUUID())
      }

      const newNodes: Record<string, TaxonomyNode> = {}
      for (const [oldId, node] of Object.entries(source.nodes)) {
        const newId = idMap.get(oldId)!
        newNodes[newId] = {
          ...node,
          id: newId,
          parentId: node.parentId ? (idMap.get(node.parentId) ?? null) : null,
          linkedProjectIds: [],
        }
      }

      const newId = crypto.randomUUID()
      const now = Timestamp.now()
      const newTaxonomy: Taxonomy = {
        id: newId,
        name: `${source.name} (copie)`,
        ownerId: uid!,
        createdAt: now,
        updatedAt: now,
        nodes: newNodes,
      }
      await setDoc(doc(db, 'taxonomies', newId), newTaxonomy)
      return newTaxonomy
    },
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: taxListKey(uid!) }),
    onError: () => toast.error(t('tst.duplicateFailed')),
  })
}

// ─── Helper : met à jour les nodes d'une taxonomie avec optimistic update ─────

function makeOptimisticUpdater(
  qc: ReturnType<typeof useQueryClient>,
  uid: string
) {
  return async (
    taxonomyId: string,
    updater: (nodes: Record<string, TaxonomyNode>) => Record<string, TaxonomyNode>
  ): Promise<{ previous: Taxonomy[] }> => {
    await qc.cancelQueries({ queryKey: taxListKey(uid) })
    const previous = getCachedList(qc, uid)
    qc.setQueryData<Taxonomy[]>(taxListKey(uid), (old) =>
      (old ?? []).map((t) =>
        t.id === taxonomyId ? { ...t, nodes: updater(t.nodes) } : t
      )
    )
    return { previous }
  }
}

// ─── addNode ──────────────────────────────────────────────────────────────────

export function useAddNode() {
  const uid = useWorkspaceUid()
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async ({
      taxonomyId,
      parentId,
      label,
    }: {
      taxonomyId: string
      parentId: string | null
      label: string
    }) => {
      const taxonomy = getCachedList(qc, uid!).find(
        (t) => t.id === taxonomyId
      )
      if (!taxonomy) throw new Error(t('err.notFound.taxonomy'))

      const parentNode = parentId ? taxonomy.nodes[parentId] : null
      const id = crypto.randomUUID()
      const node: TaxonomyNode = {
        id,
        label,
        parentId,
        order: getNextOrder(taxonomy.nodes, parentId),
        level: parentNode ? parentNode.level + 1 : 0,
        linkedProjectIds: [],
      }
      const updatedNodes = { ...taxonomy.nodes, [id]: node }
      await updateDoc(doc(db, 'taxonomies', taxonomyId), {
        nodes: updatedNodes,
        updatedAt: Timestamp.now(),
      })
      return node
    },
    onMutate: async ({ taxonomyId, parentId, label }) => {
      const applyOptimistic = makeOptimisticUpdater(qc, uid!)
      const cached = getCachedList(qc, uid!)
      const taxonomy = cached.find((t) => t.id === taxonomyId)
      if (!taxonomy) return { previous: cached }
      const parentNode = parentId ? taxonomy.nodes[parentId] : null
      const tempId = crypto.randomUUID()
      const tempNode: TaxonomyNode = {
        id: tempId,
        label,
        parentId,
        order: getNextOrder(taxonomy.nodes, parentId),
        level: parentNode ? parentNode.level + 1 : 0,
        linkedProjectIds: [],
      }
      return applyOptimistic(taxonomyId, (nodes) => ({
        ...nodes,
        [tempId]: tempNode,
      }))
    },
    onError: (_e, _v, ctx) => {
      if (ctx) qc.setQueryData(taxListKey(uid!), (ctx as { previous: Taxonomy[] }).previous)
      toast.error(t('tst.tx.addNodeFailed'))
    },
    onSettled: (_d, _e, vars) => {
      qc.invalidateQueries({ queryKey: taxListKey(uid!) })
      qc.invalidateQueries({ queryKey: taxKey(vars.taxonomyId) })
    },
  })
}

// ─── renameNode ───────────────────────────────────────────────────────────────

export function useRenameNode() {
  const uid = useWorkspaceUid()
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async ({
      taxonomyId,
      nodeId,
      label,
    }: {
      taxonomyId: string
      nodeId: string
      label: string
    }) => {
      const taxonomy = getCachedList(qc, uid!).find(
        (t) => t.id === taxonomyId
      )
      if (!taxonomy) throw new Error(t('err.notFound.taxonomy'))
      const updatedNodes = {
        ...taxonomy.nodes,
        [nodeId]: { ...taxonomy.nodes[nodeId], label },
      }
      await updateDoc(doc(db, 'taxonomies', taxonomyId), {
        nodes: updatedNodes,
        updatedAt: Timestamp.now(),
      })
    },
    onMutate: ({ taxonomyId, nodeId, label }) => {
      const applyOptimistic = makeOptimisticUpdater(qc, uid!)
      return applyOptimistic(taxonomyId, (nodes) => ({
        ...nodes,
        [nodeId]: { ...nodes[nodeId], label },
      }))
    },
    onError: (_e, _v, ctx) => {
      if (ctx) qc.setQueryData(taxListKey(uid!), (ctx as { previous: Taxonomy[] }).previous)
      toast.error(t('tst.tx.nodeRenameFailed'))
    },
    onSettled: (_d, _e, vars) => {
      qc.invalidateQueries({ queryKey: taxListKey(uid!) })
      qc.invalidateQueries({ queryKey: taxKey(vars.taxonomyId) })
    },
  })
}

// ─── deleteNode ───────────────────────────────────────────────────────────────

export function useDeleteNode() {
  const uid = useWorkspaceUid()
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async ({
      taxonomyId,
      nodeId,
    }: {
      taxonomyId: string
      nodeId: string
    }) => {
      const taxonomy = getCachedList(qc, uid!).find(
        (t) => t.id === taxonomyId
      )
      if (!taxonomy) throw new Error(t('err.notFound.taxonomy'))
      const toDelete = new Set([
        nodeId,
        ...getAllDescendantIds(taxonomy.nodes, nodeId),
      ])
      const updatedNodes: Record<string, TaxonomyNode> = {}
      for (const [id, node] of Object.entries(taxonomy.nodes)) {
        if (!toDelete.has(id)) updatedNodes[id] = node
      }
      await updateDoc(doc(db, 'taxonomies', taxonomyId), {
        nodes: updatedNodes,
        updatedAt: Timestamp.now(),
      })
    },
    onMutate: ({ taxonomyId, nodeId }) => {
      const applyOptimistic = makeOptimisticUpdater(qc, uid!)
      const cached = getCachedList(qc, uid!)
      const taxonomy = cached.find((t) => t.id === taxonomyId)
      if (!taxonomy) return { previous: cached }
      const toDelete = new Set([
        nodeId,
        ...getAllDescendantIds(taxonomy.nodes, nodeId),
      ])
      return applyOptimistic(taxonomyId, (nodes) => {
        const next: Record<string, TaxonomyNode> = {}
        for (const [id, node] of Object.entries(nodes)) {
          if (!toDelete.has(id)) next[id] = node
        }
        return next
      })
    },
    onError: (_e, _v, ctx) => {
      if (ctx) qc.setQueryData(taxListKey(uid!), (ctx as { previous: Taxonomy[] }).previous)
      toast.error(t('tst.tx.nodeDeleteFailed'))
    },
    onSettled: (_d, _e, vars) => {
      qc.invalidateQueries({ queryKey: taxListKey(uid!) })
      qc.invalidateQueries({ queryKey: taxKey(vars.taxonomyId) })
    },
  })
}

// ─── moveNode (D&D) ───────────────────────────────────────────────────────────

/** Met à jour récursivement le `level` de tous les descendants de `parentId`. */
function cascadeLevels(parentId: string, parentLevel: number, nodesMap: Record<string, TaxonomyNode>) {
  const children = Object.values(nodesMap).filter((n) => n.parentId === parentId)
  for (const child of children) {
    nodesMap[child.id] = { ...nodesMap[child.id], level: parentLevel + 1 }
    cascadeLevels(child.id, parentLevel + 1, nodesMap)
  }
}

export function useMoveNode() {
  const uid = useWorkspaceUid()
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async ({
      taxonomyId,
      nodeId,
      newParentId,
      newOrder,
    }: {
      taxonomyId: string
      nodeId: string
      newParentId: string | null
      newOrder: number
    }) => {
      const taxonomy = getCachedList(qc, uid!).find(
        (t) => t.id === taxonomyId
      )
      if (!taxonomy) throw new Error(t('err.notFound.taxonomy'))

      const siblings = Object.values(taxonomy.nodes)
        .filter((n) => n.parentId === newParentId && n.id !== nodeId)
        .sort((a, b) => a.order - b.order)

      const updatedNodes = { ...taxonomy.nodes }

      siblings.splice(newOrder, 0, taxonomy.nodes[nodeId])
      siblings.forEach((n, i) => {
        updatedNodes[n.id] = { ...updatedNodes[n.id], order: i }
      })
      updatedNodes[nodeId] = {
        ...updatedNodes[nodeId],
        parentId: newParentId,
        order: newOrder,
        level: newParentId
          ? (updatedNodes[newParentId]?.level ?? 0) + 1
          : 0,
      }

      // Recursively update levels of all descendants
      cascadeLevels(nodeId, updatedNodes[nodeId].level, updatedNodes)

      await updateDoc(doc(db, 'taxonomies', taxonomyId), {
        nodes: updatedNodes,
        updatedAt: Timestamp.now(),
      })
    },
    onMutate: ({ taxonomyId, nodeId, newParentId, newOrder }) => {
      const applyOptimistic = makeOptimisticUpdater(qc, uid!)
      const cached = getCachedList(qc, uid!)
      const taxonomy = cached.find((t) => t.id === taxonomyId)
      if (!taxonomy) return { previous: cached }
      return applyOptimistic(taxonomyId, (nodes) => {
        const siblings = Object.values(nodes)
          .filter((n) => n.parentId === newParentId && n.id !== nodeId)
          .sort((a, b) => a.order - b.order)
        const updated = { ...nodes }
        siblings.splice(newOrder, 0, nodes[nodeId])
        siblings.forEach((n, i) => {
          updated[n.id] = { ...updated[n.id], order: i }
        })
        updated[nodeId] = {
          ...updated[nodeId],
          parentId: newParentId,
          order: newOrder,
          level: newParentId ? (updated[newParentId]?.level ?? 0) + 1 : 0,
        }

        // Recursively update levels of all descendants
        cascadeLevels(nodeId, updated[nodeId].level, updated)

        return updated
      })
    },
    onError: (_e, _v, ctx) => {
      if (ctx) qc.setQueryData(taxListKey(uid!), (ctx as { previous: Taxonomy[] }).previous)
      toast.error(t('tst.tx.moveFailed'))
    },
    onSettled: (_d, _e, vars) => {
      qc.invalidateQueries({ queryKey: taxListKey(uid!) })
      qc.invalidateQueries({ queryKey: taxKey(vars.taxonomyId) })
    },
  })
}

// ─── linkProject / unlinkProject ─────────────────────────────────────────────

export function useLinkProject() {
  const uid = useWorkspaceUid()
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async ({
      taxonomyId,
      nodeId,
      projectId,
    }: {
      taxonomyId: string
      nodeId: string
      projectId: string
    }) => {
      const taxonomy = getCachedList(qc, uid!).find(
        (t) => t.id === taxonomyId
      )
      if (!taxonomy) throw new Error(t('err.notFound.taxonomy'))
      const node = taxonomy.nodes[nodeId]
      if (!node) throw new Error(t('err.notFound.node'))
      const linkedProjectIds = [...new Set([...node.linkedProjectIds, projectId])]
      const updatedNodes = {
        ...taxonomy.nodes,
        [nodeId]: { ...node, linkedProjectIds },
      }
      await updateDoc(doc(db, 'taxonomies', taxonomyId), {
        nodes: updatedNodes,
        updatedAt: Timestamp.now(),
      })
    },
    onMutate: ({ taxonomyId, nodeId, projectId }) => {
      const applyOptimistic = makeOptimisticUpdater(qc, uid!)
      return applyOptimistic(taxonomyId, (nodes) => ({
        ...nodes,
        [nodeId]: {
          ...nodes[nodeId],
          linkedProjectIds: [
            ...new Set([...nodes[nodeId].linkedProjectIds, projectId]),
          ],
        },
      }))
    },
    onError: (_e, _v, ctx) => {
      if (ctx) qc.setQueryData(taxListKey(uid!), (ctx as { previous: Taxonomy[] }).previous)
      toast.error(t('tst.tx.linkFailed'))
    },
    onSettled: (_d, _e, vars) => {
      qc.invalidateQueries({ queryKey: taxListKey(uid!) })
      qc.invalidateQueries({ queryKey: taxKey(vars.taxonomyId) })
    },
  })
}

export function useUnlinkProject() {
  const uid = useWorkspaceUid()
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async ({
      taxonomyId,
      nodeId,
      projectId,
    }: {
      taxonomyId: string
      nodeId: string
      projectId: string
    }) => {
      const taxonomy = getCachedList(qc, uid!).find(
        (t) => t.id === taxonomyId
      )
      if (!taxonomy) throw new Error(t('err.notFound.taxonomy'))
      const node = taxonomy.nodes[nodeId]
      if (!node) throw new Error(t('err.notFound.node'))
      const linkedProjectIds = node.linkedProjectIds.filter(
        (id) => id !== projectId
      )
      const updatedNodes = {
        ...taxonomy.nodes,
        [nodeId]: { ...node, linkedProjectIds },
      }
      await updateDoc(doc(db, 'taxonomies', taxonomyId), {
        nodes: updatedNodes,
        updatedAt: Timestamp.now(),
      })
    },
    onMutate: ({ taxonomyId, nodeId, projectId }) => {
      const applyOptimistic = makeOptimisticUpdater(qc, uid!)
      return applyOptimistic(taxonomyId, (nodes) => ({
        ...nodes,
        [nodeId]: {
          ...nodes[nodeId],
          linkedProjectIds: nodes[nodeId].linkedProjectIds.filter(
            (id) => id !== projectId
          ),
        },
      }))
    },
    onError: (_e, _v, ctx) => {
      if (ctx) qc.setQueryData(taxListKey(uid!), (ctx as { previous: Taxonomy[] }).previous)
      toast.error(t('tst.tx.unlinkFailed'))
    },
    onSettled: (_d, _e, vars) => {
      qc.invalidateQueries({ queryKey: taxListKey(uid!) })
      qc.invalidateQueries({ queryKey: taxKey(vars.taxonomyId) })
    },
  })
}
