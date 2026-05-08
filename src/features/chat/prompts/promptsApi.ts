import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  increment,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  type DocumentData,
} from 'firebase/firestore'
import { db } from '@/lib/firebase/config'
import type { Prompt, PromptDraft } from './types'

function promptsCol(uid: string) {
  return collection(db, 'users', uid, 'prompts')
}

function fromDoc(id: string, data: DocumentData): Prompt {
  const ts = (v: unknown): number | null => {
    if (!v) return null
    if (typeof v === 'number') return v
    if (typeof v === 'object' && v !== null && 'toMillis' in v) {
      return (v as { toMillis: () => number }).toMillis()
    }
    return null
  }
  return {
    id,
    title: String(data.title ?? ''),
    content: String(data.content ?? ''),
    category: data.category ?? 'custom',
    favorite: Boolean(data.favorite),
    usageCount: Number(data.usageCount ?? 0),
    lastUsedAt: ts(data.lastUsedAt),
    createdAt: ts(data.createdAt) ?? Date.now(),
    updatedAt: ts(data.updatedAt) ?? Date.now(),
  }
}

export async function listPrompts(uid: string): Promise<Prompt[]> {
  const q = query(promptsCol(uid), orderBy('updatedAt', 'desc'))
  const snap = await getDocs(q)
  return snap.docs.map((d) => fromDoc(d.id, d.data()))
}

function newId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

export async function createPrompt(uid: string, draft: PromptDraft): Promise<Prompt> {
  const id = newId()
  const ref = doc(promptsCol(uid), id)
  const payload = {
    title: draft.title.trim(),
    content: draft.content.trim(),
    category: draft.category,
    favorite: false,
    usageCount: 0,
    lastUsedAt: null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  }
  await setDoc(ref, payload)
  const now = Date.now()
  return {
    id,
    title: payload.title,
    content: payload.content,
    category: payload.category,
    favorite: false,
    usageCount: 0,
    lastUsedAt: null,
    createdAt: now,
    updatedAt: now,
  }
}

export async function updatePrompt(
  uid: string,
  id: string,
  patch: Partial<PromptDraft> & { favorite?: boolean },
): Promise<void> {
  const ref = doc(promptsCol(uid), id)
  const data: Record<string, unknown> = { updatedAt: serverTimestamp() }
  if (patch.title !== undefined) data.title = patch.title.trim()
  if (patch.content !== undefined) data.content = patch.content.trim()
  if (patch.category !== undefined) data.category = patch.category
  if (patch.favorite !== undefined) data.favorite = patch.favorite
  await updateDoc(ref, data)
}

export async function deletePrompt(uid: string, id: string): Promise<void> {
  await deleteDoc(doc(promptsCol(uid), id))
}

export async function recordPromptUse(uid: string, id: string): Promise<void> {
  await updateDoc(doc(promptsCol(uid), id), {
    usageCount: increment(1),
    lastUsedAt: serverTimestamp(),
  })
}
