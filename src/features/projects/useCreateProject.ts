import { useMutation, useQueryClient } from '@tanstack/react-query'
import { collection, addDoc, doc, setDoc } from 'firebase/firestore'
import { db } from '@/lib/firebase/config'
import { useAuthStore } from '@/stores/auth.store'
import { cleanupOrphanLinksInTaxonomies } from './useDeleteProject'
import type { ProjectData } from '@/types/project'
import type { CanvasBgType } from '@/stores/ui.store'
import type { GradientConfig } from '@/stores/editor.store'

interface CreateProjectParams {
  title: string
  canvasWidth: number
  canvasHeight: number
  canvasBg: string
  /** Type d'arrière-plan persisté. Défaut "solid" si non fourni — useLoadCanvas
   *  fait déjà le fallback côté restauration. */
  canvasBgType?: CanvasBgType
  /** Sérialisé via JSON.stringify pour matcher le format produit par useAutoSave. */
  canvasBgGradient?: GradientConfig
  canvasBgImage?: string | null
  /** Optional custom document ID (e.g. IDML filename slug). If omitted, Firestore auto-generates one. */
  customId?: string
}

/**
 * Sanitize a string for use as a Firestore document ID.
 * Removes special chars, replaces spaces with hyphens, lowercases.
 */
export function slugify(name: string): string {
  return name
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')  // strip accents
    .replace(/[^a-zA-Z0-9\s_-]/g, '')                  // remove special chars
    .trim()
    .replace(/\s+/g, '-')                               // spaces → hyphens
    .toLowerCase()
    || `project-${Date.now()}`
}

async function createProject(userId: string, params: CreateProjectParams): Promise<ProjectData> {
  const now = Date.now()
  const data: Record<string, unknown> = {
    title: params.title,
    thumbnail: null,
    createdAt: now,
    updatedAt: now,
    ownerId: userId,
    canvasData: null,
    canvasWidth: params.canvasWidth,
    canvasHeight: params.canvasHeight,
    canvasBg: params.canvasBg,
    canvasBgType: params.canvasBgType ?? 'solid',
    canvasBgImage: params.canvasBgImage ?? null,
  }
  if (params.canvasBgGradient) {
    // Stringify pour matcher le schéma produit par useAutoSave (sinon useLoadCanvas
    // accepte les deux, mais on évite un mismatch silencieux entre projets jeunes/anciens).
    data.canvasBgGradient = JSON.stringify(params.canvasBgGradient)
  }

  let projectId: string

  if (params.customId) {
    // Use custom ID (e.g. IDML filename slug) — setDoc creates or overwrites.
    // Purge d'éventuels liens de taxonomie orphelins sur ce même ID (réimport).
    projectId = params.customId
    await cleanupOrphanLinksInTaxonomies(userId, projectId)
    await setDoc(doc(db, 'projects', projectId), data)
  } else {
    // Auto-generate ID
    const ref = await addDoc(collection(db, 'projects'), data)
    projectId = ref.id
  }

  return { id: projectId, title: data.title, thumbnail: null, createdAt: now, updatedAt: now, ownerId: userId, canvasData: null }
}

export function useCreateProject() {
  const user = useAuthStore((s) => s.user)
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (params: CreateProjectParams) => createProject(user!.uid, params),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects', user?.uid] })
      queryClient.invalidateQueries({ queryKey: ['taxonomies', user?.uid] })
    },
  })
}
