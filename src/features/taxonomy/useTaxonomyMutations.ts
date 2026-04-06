// src/features/taxonomy/useTaxonomyMutations.ts
import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  doc,
  setDoc,
  updateDoc,
  deleteDoc,
  Timestamp,
} from 'firebase/firestore'
import { db } from '@/lib/firebase/config'
import { useAuthStore } from '@/stores/auth.store'
import { toast } from 'sonner'
import { getAllDescendantIds, getNextOrder } from './taxonomyUtils'
import type { Taxonomy, TaxonomyNode } from './types'

// ─── Clés React Query ─────────────────────────────────────────────────────────

const taxListKey = (uid: string) => ['taxonomies', uid]
const taxKey = (id: string) => ['taxonomy', id]

// ─── Helper : récupère les taxonomies depuis le cache ─────────────────────────

function getCachedList(qc: ReturnType<typeof useQueryClient>, uid: string) {
  return qc.getQueryData<Taxonomy[]>(taxListKey(uid)) ?? []
}

// ─── createTaxonomy ───────────────────────────────────────────────────────────

export function useCreateTaxonomy() {
  const user = useAuthStore((s) => s.user)
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
        ownerId: user!.uid,
        createdAt: now,
        updatedAt: now,
        nodes,
      }
      await setDoc(doc(db, 'taxonomies', id), taxonomy)
      return taxonomy
    },
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: taxListKey(user!.uid) }),
    onError: () => toast.error('Erreur lors de la création'),
  })
}

// ─── renameTaxonomy ───────────────────────────────────────────────────────────

export function useRenameTaxonomy() {
  const user = useAuthStore((s) => s.user)
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, name }: { id: string; name: string }) => {
      await updateDoc(doc(db, 'taxonomies', id), {
        name,
        updatedAt: Timestamp.now(),
      })
    },
    onMutate: async ({ id, name }) => {
      await qc.cancelQueries({ queryKey: taxListKey(user!.uid) })
      const previous = getCachedList(qc, user!.uid)
      qc.setQueryData<Taxonomy[]>(taxListKey(user!.uid), (old) =>
        (old ?? []).map((t) => (t.id === id ? { ...t, name } : t))
      )
      return { previous }
    },
    onError: (_e, _v, ctx) => {
      qc.setQueryData(taxListKey(user!.uid), ctx?.previous)
      toast.error('Erreur lors du renommage')
    },
    onSettled: () =>
      qc.invalidateQueries({ queryKey: taxListKey(user!.uid) }),
  })
}

// ─── deleteTaxonomy ───────────────────────────────────────────────────────────

export function useDeleteTaxonomy() {
  const user = useAuthStore((s) => s.user)
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (id: string) => {
      await deleteDoc(doc(db, 'taxonomies', id))
    },
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: taxListKey(user!.uid) })
      const previous = getCachedList(qc, user!.uid)
      qc.setQueryData<Taxonomy[]>(taxListKey(user!.uid), (old) =>
        (old ?? []).filter((t) => t.id !== id)
      )
      return { previous }
    },
    onError: (_e, _v, ctx) => {
      qc.setQueryData(taxListKey(user!.uid), ctx?.previous)
      toast.error('Erreur lors de la suppression')
    },
    onSettled: () =>
      qc.invalidateQueries({ queryKey: taxListKey(user!.uid) }),
  })
}

// ─── duplicateTaxonomy ────────────────────────────────────────────────────────

export function useDuplicateTaxonomy() {
  const user = useAuthStore((s) => s.user)
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async ({ id }: { id: string }) => {
      const source = getCachedList(qc, user!.uid).find((t) => t.id === id)
      if (!source) throw new Error('Taxonomie introuvable')

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
        ownerId: user!.uid,
        createdAt: now,
        updatedAt: now,
        nodes: newNodes,
      }
      await setDoc(doc(db, 'taxonomies', newId), newTaxonomy)
      return newTaxonomy
    },
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: taxListKey(user!.uid) }),
    onError: () => toast.error('Erreur lors de la duplication'),
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
  const user = useAuthStore((s) => s.user)
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async ({
      taxonomyId,
      parentId,
      label,
      nodeId,
    }: {
      taxonomyId: string
      parentId: string | null
      label: string
      nodeId: string
    }) => {
      // Re-read from Firestore-synced cache, but filter out optimistic temp node
      // to build the final state with the definitive ID
      const taxonomy = getCachedList(qc, user!.uid).find(
        (t) => t.id === taxonomyId
      )
      if (!taxonomy) throw new Error('Taxonomie introuvable')

      const parentNode = parentId ? taxonomy.nodes[parentId] : null
      // Remove the optimistic entry (same nodeId) and re-add with final data
      const baseNodes = { ...taxonomy.nodes }
      delete baseNodes[nodeId]
      const node: TaxonomyNode = {
        id: nodeId,
        label,
        parentId,
        order: getNextOrder(baseNodes, parentId),
        level: parentNode ? parentNode.level + 1 : 0,
        linkedProjectIds: [],
      }
      const updatedNodes = { ...baseNodes, [nodeId]: node }
      await updateDoc(doc(db, 'taxonomies', taxonomyId), {
        nodes: updatedNodes,
        updatedAt: Timestamp.now(),
      })
      return node
    },
    onMutate: async ({ taxonomyId, parentId, label, nodeId }) => {
      const applyOptimistic = makeOptimisticUpdater(qc, user!.uid)
      const cached = getCachedList(qc, user!.uid)
      const taxonomy = cached.find((t) => t.id === taxonomyId)
      if (!taxonomy) return { previous: cached }
      const parentNode = parentId ? taxonomy.nodes[parentId] : null
      const tempNode: TaxonomyNode = {
        id: nodeId,
        label,
        parentId,
        order: getNextOrder(taxonomy.nodes, parentId),
        level: parentNode ? parentNode.level + 1 : 0,
        linkedProjectIds: [],
      }
      return applyOptimistic(taxonomyId, (nodes) => ({
        ...nodes,
        [nodeId]: tempNode,
      }))
    },
    onError: (_e, _v, ctx) => {
      if (ctx) qc.setQueryData(taxListKey(user!.uid), (ctx as { previous: Taxonomy[] }).previous)
      toast.error("Erreur lors de l'ajout du nœud")
    },
    onSettled: (_d, _e, vars) => {
      qc.invalidateQueries({ queryKey: taxListKey(user!.uid) })
      qc.invalidateQueries({ queryKey: taxKey(vars.taxonomyId) })
    },
  })
}

// ─── renameNode ───────────────────────────────────────────────────────────────

export function useRenameNode() {
  const user = useAuthStore((s) => s.user)
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
      const taxonomy = getCachedList(qc, user!.uid).find(
        (t) => t.id === taxonomyId
      )
      if (!taxonomy) throw new Error('Taxonomie introuvable')
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
      const applyOptimistic = makeOptimisticUpdater(qc, user!.uid)
      return applyOptimistic(taxonomyId, (nodes) => ({
        ...nodes,
        [nodeId]: { ...nodes[nodeId], label },
      }))
    },
    onError: (_e, _v, ctx) => {
      if (ctx) qc.setQueryData(taxListKey(user!.uid), (ctx as { previous: Taxonomy[] }).previous)
      toast.error('Erreur lors du renommage du nœud')
    },
    onSettled: (_d, _e, vars) => {
      qc.invalidateQueries({ queryKey: taxListKey(user!.uid) })
      qc.invalidateQueries({ queryKey: taxKey(vars.taxonomyId) })
    },
  })
}

// ─── deleteNode ───────────────────────────────────────────────────────────────

export function useDeleteNode() {
  const user = useAuthStore((s) => s.user)
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async ({
      taxonomyId,
      nodeId,
    }: {
      taxonomyId: string
      nodeId: string
    }) => {
      const taxonomy = getCachedList(qc, user!.uid).find(
        (t) => t.id === taxonomyId
      )
      if (!taxonomy) throw new Error('Taxonomie introuvable')
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
      const applyOptimistic = makeOptimisticUpdater(qc, user!.uid)
      const cached = getCachedList(qc, user!.uid)
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
      if (ctx) qc.setQueryData(taxListKey(user!.uid), (ctx as { previous: Taxonomy[] }).previous)
      toast.error('Erreur lors de la suppression du nœud')
    },
    onSettled: (_d, _e, vars) => {
      qc.invalidateQueries({ queryKey: taxListKey(user!.uid) })
      qc.invalidateQueries({ queryKey: taxKey(vars.taxonomyId) })
    },
  })
}

// ─── moveNode (D&D) ───────────────────────────────────────────────────────────

export function useMoveNode() {
  const user = useAuthStore((s) => s.user)
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
      const taxonomy = getCachedList(qc, user!.uid).find(
        (t) => t.id === taxonomyId
      )
      if (!taxonomy) throw new Error('Taxonomie introuvable')

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
      const cascadeLevels = (parentId: string, parentLevel: number, nodesMap: Record<string, TaxonomyNode>) => {
        const children = Object.values(nodesMap).filter(n => n.parentId === parentId)
        for (const child of children) {
          nodesMap[child.id] = { ...nodesMap[child.id], level: parentLevel + 1 }
          cascadeLevels(child.id, parentLevel + 1, nodesMap)
        }
      }
      cascadeLevels(nodeId, updatedNodes[nodeId].level, updatedNodes)

      await updateDoc(doc(db, 'taxonomies', taxonomyId), {
        nodes: updatedNodes,
        updatedAt: Timestamp.now(),
      })
    },
    onMutate: ({ taxonomyId, nodeId, newParentId, newOrder }) => {
      const applyOptimistic = makeOptimisticUpdater(qc, user!.uid)
      const cached = getCachedList(qc, user!.uid)
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
        const cascadeLevels = (parentId: string, parentLevel: number, nodesMap: Record<string, TaxonomyNode>) => {
          const children = Object.values(nodesMap).filter(n => n.parentId === parentId)
          for (const child of children) {
            nodesMap[child.id] = { ...nodesMap[child.id], level: parentLevel + 1 }
            cascadeLevels(child.id, parentLevel + 1, nodesMap)
          }
        }
        cascadeLevels(nodeId, updated[nodeId].level, updated)

        return updated
      })
    },
    onError: (_e, _v, ctx) => {
      if (ctx) qc.setQueryData(taxListKey(user!.uid), (ctx as { previous: Taxonomy[] }).previous)
      toast.error('Erreur lors du déplacement du nœud')
    },
    onSettled: (_d, _e, vars) => {
      qc.invalidateQueries({ queryKey: taxListKey(user!.uid) })
      qc.invalidateQueries({ queryKey: taxKey(vars.taxonomyId) })
    },
  })
}

// ─── purgeEmptyNodes ─────────────────────────────────────────────────────────

export function usePurgeEmptyNodes() {
  const user = useAuthStore((s) => s.user)
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async ({
      taxonomyId,
      label = 'Nouveau nœud',
    }: {
      taxonomyId: string
      label?: string
    }) => {
      const taxonomy = getCachedList(qc, user!.uid).find(
        (t) => t.id === taxonomyId
      )
      if (!taxonomy) throw new Error('Taxonomie introuvable')

      // Trouve tous les nœuds correspondant au label ET sans enfants ET sans projets liés
      const nodeIds = Object.keys(taxonomy.nodes)
      const childCounts = new Map<string, number>()
      for (const node of Object.values(taxonomy.nodes)) {
        if (node.parentId) {
          childCounts.set(node.parentId, (childCounts.get(node.parentId) ?? 0) + 1)
        }
      }

      const toDelete = new Set<string>()
      for (const [id, node] of Object.entries(taxonomy.nodes)) {
        if (
          node.label === label &&
          (childCounts.get(id) ?? 0) === 0 &&
          node.linkedProjectIds.length === 0
        ) {
          toDelete.add(id)
        }
      }

      if (toDelete.size === 0) return 0

      const updatedNodes: Record<string, TaxonomyNode> = {}
      for (const [id, node] of Object.entries(taxonomy.nodes)) {
        if (!toDelete.has(id)) updatedNodes[id] = node
      }
      await updateDoc(doc(db, 'taxonomies', taxonomyId), {
        nodes: updatedNodes,
        updatedAt: Timestamp.now(),
      })
      return toDelete.size
    },
    onSuccess: (count) => {
      qc.invalidateQueries({ queryKey: taxListKey(user!.uid) })
      if (count && count > 0) toast.success(`${count} nœud(s) vide(s) supprimé(s)`)
      else toast.info('Aucun nœud vide à supprimer')
    },
    onError: () => toast.error('Erreur lors de la purge'),
  })
}

// ─── linkProject / unlinkProject ─────────────────────────────────────────────

export function useLinkProject() {
  const user = useAuthStore((s) => s.user)
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
      const taxonomy = getCachedList(qc, user!.uid).find(
        (t) => t.id === taxonomyId
      )
      if (!taxonomy) throw new Error('Taxonomie introuvable')
      const node = taxonomy.nodes[nodeId]
      if (!node) throw new Error('Nœud introuvable')
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
      const applyOptimistic = makeOptimisticUpdater(qc, user!.uid)
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
      if (ctx) qc.setQueryData(taxListKey(user!.uid), (ctx as { previous: Taxonomy[] }).previous)
      toast.error('Erreur lors de la liaison')
    },
    onSettled: (_d, _e, vars) => {
      qc.invalidateQueries({ queryKey: taxListKey(user!.uid) })
      qc.invalidateQueries({ queryKey: taxKey(vars.taxonomyId) })
    },
  })
}

export function useUnlinkProject() {
  const user = useAuthStore((s) => s.user)
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
      const taxonomy = getCachedList(qc, user!.uid).find(
        (t) => t.id === taxonomyId
      )
      if (!taxonomy) throw new Error('Taxonomie introuvable')
      const node = taxonomy.nodes[nodeId]
      if (!node) throw new Error('Nœud introuvable')
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
      const applyOptimistic = makeOptimisticUpdater(qc, user!.uid)
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
      if (ctx) qc.setQueryData(taxListKey(user!.uid), (ctx as { previous: Taxonomy[] }).previous)
      toast.error('Erreur lors de la déliaison')
    },
    onSettled: (_d, _e, vars) => {
      qc.invalidateQueries({ queryKey: taxListKey(user!.uid) })
      qc.invalidateQueries({ queryKey: taxKey(vars.taxonomyId) })
    },
  })
}
