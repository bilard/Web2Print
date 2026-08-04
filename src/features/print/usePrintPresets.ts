import { useWorkspaceUid } from '@/features/access/useWorkspaceUid'
import { useCallback, useEffect, useState } from 'react'
import {
  addDoc, collection, deleteDoc, doc, onSnapshot,
  orderBy, query, updateDoc, where,
} from 'firebase/firestore'
import { db } from '@/lib/firebase/config'

/**
 * Ensemble complet des paramètres "Repères et fonds perdus" sauvegardables
 * comme famille réutilisable entre projets.
 */
export interface PrintPresetParams {
  dpi: number
  bleedMm: number
  safeAreaMm: number
  cropMarkLengthMm: number
  cropMarkOffsetMm: number
  showPrintMarks: boolean
  showSafeArea: boolean
  showRegistrationMarks: boolean
  cropStroke: number
  cropColor: string
  bleedStroke: number
  bleedColor: string
  regRadiusMm: number
  regStroke: number
  regColor: string
  regOffsetMm: number
  safeStroke: number
  safeColor: string
  safeDash: number
  safeGap: number
}

export interface PrintPreset extends PrintPresetParams {
  id: string
  name: string
  ownerId: string
  createdAt: number
  updatedAt: number
}

/**
 * Hook de gestion des familles de paramètres d'impression Firestore.
 * Collection : `printPresets/{id}`, scopée à `ownerId` (cf firestore.rules).
 */
export function usePrintPresets() {
  const uid = useWorkspaceUid()
  const [presets, setPresets] = useState<PrintPreset[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!uid) {
      setPresets([])
      setLoading(false)
      return
    }
    const q = query(
      collection(db, 'printPresets'),
      where('ownerId', '==', uid),
      orderBy('createdAt', 'desc'),
    )
    const unsub = onSnapshot(
      q,
      (snap) => {
        setPresets(snap.docs.map((d) => ({ id: d.id, ...d.data() } as PrintPreset)))
        setLoading(false)
      },
      (err) => {
        console.error('[usePrintPresets] subscribe failed', err)
        setLoading(false)
      },
    )
    return () => unsub()
  }, [uid])

  const savePreset = useCallback(
    async (name: string, params: PrintPresetParams): Promise<string | null> => {
      if (!uid) return null
      try {
        const now = Date.now()
        const ref = await addDoc(collection(db, 'printPresets'), {
          ...params,
          name: name.trim(),
          ownerId: uid,
          createdAt: now,
          updatedAt: now,
        })
        return ref.id
      } catch (err) {
        console.error('[usePrintPresets] save failed', err)
        return null
      }
    },
    [uid],
  )

  const updatePreset = useCallback(
    async (id: string, params: Partial<PrintPresetParams> & { name?: string }) => {
      try {
        await updateDoc(doc(db, 'printPresets', id), {
          ...params,
          updatedAt: Date.now(),
        })
        return true
      } catch (err) {
        console.error('[usePrintPresets] update failed', err)
        return false
      }
    },
    [],
  )

  const deletePreset = useCallback(async (id: string) => {
    try {
      await deleteDoc(doc(db, 'printPresets', id))
      return true
    } catch (err) {
      console.error('[usePrintPresets] delete failed', err)
      return false
    }
  }, [])

  return { presets, loading, savePreset, updatePreset, deletePreset }
}
