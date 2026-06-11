// src/features/versions/useVersions.ts
// Historique de versions du document : snapshots des champs de CONTENU du doc
// projet (projects/{id}/versions), restauration = ré-écriture des champs puis
// rechargement de l'éditeur (même chemin de chargement que d'habitude — pas de
// désérialisation parallèle). Plafond de 20 versions (les plus anciennes purgées).
import { useCallback, useEffect, useState } from 'react'
import {
  addDoc, collection, deleteDoc, doc, getDoc, getDocs, orderBy, query, setDoc,
} from 'firebase/firestore'
import { db } from '@/lib/firebase/config'
import { globalSave } from '@/features/editor/useAutoSave'

const MAX_VERSIONS = 20

/** Champs du doc projet capturés/restaurés (contenu + apparence, pas les méta). */
const CONTENT_KEYS = [
  'title', 'canvasData', 'charSpacingMaps',
  'canvasWidth', 'canvasHeight', 'canvasBg', 'canvasBgType', 'canvasBgGradient', 'canvasBgImage',
  'dpi', 'bleedMm', 'paletteColors', 'paletteGradients', 'thumbnail',
] as const

interface VersionMeta {
  id: string
  label: string
  createdAt: number
  thumbnail: string | null
}

interface UseVersions {
  versions: VersionMeta[] | null
  createVersion: (label: string) => Promise<void>
  restoreVersion: (versionId: string) => Promise<void>
  deleteVersion: (versionId: string) => Promise<void>
}

export function useVersions(projectId: string | null): UseVersions {
  const [versions, setVersions] = useState<VersionMeta[] | null>(null)

  const reload = useCallback(async () => {
    if (!projectId) return
    const snap = await getDocs(
      query(collection(db, 'projects', projectId, 'versions'), orderBy('createdAt', 'desc')),
    )
    setVersions(
      snap.docs.map((d) => {
        const data = d.data() as { label?: string; createdAt?: number; snapshot?: { thumbnail?: string } }
        return {
          id: d.id,
          label: data.label ?? 'Version',
          createdAt: data.createdAt ?? 0,
          thumbnail: data.snapshot?.thumbnail ?? null,
        }
      }),
    )
  }, [projectId])

  useEffect(() => {
    setVersions(null)
    void reload().catch(() => setVersions([]))
  }, [reload])

  const createVersion = useCallback(
    async (label: string) => {
      if (!projectId) return
      // Commit l'état courant du canvas avant le snapshot.
      await globalSave?.()
      const projectSnap = await getDoc(doc(db, 'projects', projectId))
      if (!projectSnap.exists()) throw new Error('Projet introuvable.')
      const data = projectSnap.data()
      const snapshot: Record<string, unknown> = {}
      for (const k of CONTENT_KEYS) {
        if (data[k] !== undefined) snapshot[k] = data[k]
      }
      await addDoc(collection(db, 'projects', projectId, 'versions'), {
        label: label.trim() || new Date().toLocaleString('fr-FR'),
        createdAt: Date.now(),
        snapshot,
      })
      // Purge au-delà du plafond (les plus anciennes).
      const all = await getDocs(
        query(collection(db, 'projects', projectId, 'versions'), orderBy('createdAt', 'desc')),
      )
      for (const d of all.docs.slice(MAX_VERSIONS)) {
        await deleteDoc(d.ref).catch(() => {})
      }
      await reload()
    },
    [projectId, reload],
  )

  const restoreVersion = useCallback(
    async (versionId: string) => {
      if (!projectId) return
      const vSnap = await getDoc(doc(db, 'projects', projectId, 'versions', versionId))
      const snapshot = vSnap.data()?.snapshot as Record<string, unknown> | undefined
      if (!snapshot) throw new Error('Version introuvable ou vide.')
      await setDoc(doc(db, 'projects', projectId), { ...snapshot, updatedAt: Date.now() }, { merge: true })
      // Recharge l'éditeur : le chargement standard (sanitize + fixAndReattach) s'applique.
      window.location.reload()
    },
    [projectId],
  )

  const deleteVersion = useCallback(
    async (versionId: string) => {
      if (!projectId) return
      await deleteDoc(doc(db, 'projects', projectId, 'versions', versionId))
      await reload()
    },
    [projectId, reload],
  )

  return { versions, createVersion, restoreVersion, deleteVersion }
}
