import { useEffect, useMemo, useState } from 'react'
import {
  collection,
  query,
  onSnapshot,
  doc,
  setDoc,
  deleteDoc,
  updateDoc,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore'
import { db } from '@/lib/firebase/config'
import { useAuthStore } from '@/stores/auth.store'
import type { AspectFormat } from './types'

/** Un prompt mémorisé pour la bibliothèque vidéo.
 *
 *  Stocké sous `users/{uid}/videoPrompts/{id}`. Chaque champ optionnel du
 *  formulaire VideoModal a son équivalent ici — la dérive est volontairement
 *  exhaustive pour qu'un rejeu reproduise exactement le contexte d'origine. */
export interface VideoPrompt {
  id: string
  topic: string
  audience?: string | null
  goal?: string | null
  tone?: string | null
  freeform?: string | null
  brand?: string | null
  caption?: string | null
  aspect?: AspectFormat | null
  /** Durée totale cible en secondes (3-60). */
  targetDurationSec?: number | null
  /** Nom personnalisé (sinon dérivé du topic). */
  title?: string | null
  createdAt: Timestamp | null
  lastUsedAt: Timestamp | null
}

export interface VideoPromptInput {
  topic: string
  audience?: string
  goal?: string
  tone?: string
  freeform?: string
  brand?: string
  caption?: string
  aspect?: AspectFormat
  targetDurationSec?: number
  title?: string
}

/** Génère un identifiant local — pas de besoin de crypto, juste de
 *  l'unicité par user et timestamp. */
function makeId(): string {
  return `vp_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

function nullify<T extends string | undefined>(v: T): string | null {
  const t = (v ?? '').trim()
  return t.length > 0 ? t : null
}

export function useVideoPromptLibrary() {
  const user = useAuthStore((s) => s.user)
  const [prompts, setPrompts] = useState<VideoPrompt[]>([])
  const [loading, setLoading] = useState(true)

  const collectionPath = useMemo(
    () => (user?.uid ? `users/${user.uid}/videoPrompts` : null),
    [user?.uid],
  )

  useEffect(() => {
    if (!collectionPath) {
      setPrompts([])
      setLoading(false)
      return
    }
    setLoading(true)
    const q = query(collection(db, collectionPath))
    const unsub = onSnapshot(
      q,
      (snap) => {
        const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as VideoPrompt)
        list.sort((a, b) => {
          const ta = a.lastUsedAt?.toMillis() ?? a.createdAt?.toMillis() ?? 0
          const tb = b.lastUsedAt?.toMillis() ?? b.createdAt?.toMillis() ?? 0
          return tb - ta
        })
        setPrompts(list)
        setLoading(false)
      },
      (err) => {
        console.warn('videoPrompts listener error:', err.message)
        setLoading(false)
      },
    )
    return unsub
  }, [collectionPath])

  const savePrompt = async (input: VideoPromptInput): Promise<string> => {
    if (!collectionPath) throw new Error('Utilisateur non connecté')
    const trimmedTopic = input.topic.trim()
    if (!trimmedTopic) throw new Error('Le sujet est requis')

    const id = makeId()
    const ref = doc(db, collectionPath, id)
    await setDoc(ref, {
      topic: trimmedTopic,
      audience: nullify(input.audience),
      goal: nullify(input.goal),
      tone: nullify(input.tone),
      freeform: nullify(input.freeform),
      brand: nullify(input.brand),
      caption: nullify(input.caption),
      aspect: input.aspect ?? null,
      targetDurationSec: typeof input.targetDurationSec === 'number' ? input.targetDurationSec : null,
      title: nullify(input.title),
      createdAt: serverTimestamp(),
      lastUsedAt: serverTimestamp(),
    })
    return id
  }

  const touchPrompt = async (id: string): Promise<void> => {
    if (!collectionPath) return
    try {
      await updateDoc(doc(db, collectionPath, id), { lastUsedAt: serverTimestamp() })
    } catch {
      // best-effort : si le doc a été supprimé, on ignore
    }
  }

  const deletePrompt = async (id: string): Promise<void> => {
    if (!collectionPath) throw new Error('Utilisateur non connecté')
    await deleteDoc(doc(db, collectionPath, id))
  }

  const renamePrompt = async (id: string, title: string): Promise<void> => {
    if (!collectionPath) return
    await updateDoc(doc(db, collectionPath, id), { title: nullify(title) })
  }

  return { prompts, loading, savePrompt, touchPrompt, deletePrompt, renamePrompt }
}
