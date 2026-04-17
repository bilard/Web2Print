import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore'
import { db } from '@/lib/firebase/config'

const COLLECTION = 'scrapingRules'
const DOC_ID = 'global'

export interface ScrapingRulesDoc {
  content: string
  updatedAt: number
  updatedBy?: string
}

export async function loadRules(): Promise<ScrapingRulesDoc> {
  const snap = await getDoc(doc(db, COLLECTION, DOC_ID))
  if (!snap.exists()) {
    return { content: '', updatedAt: Date.now() }
  }
  const data = snap.data()
  return {
    content: typeof data.content === 'string' ? data.content : '',
    updatedAt: typeof data.updatedAt === 'number' ? data.updatedAt : Date.now(),
    updatedBy: typeof data.updatedBy === 'string' ? data.updatedBy : undefined,
  }
}

export async function saveRules(content: string, updatedBy?: string): Promise<void> {
  await setDoc(doc(db, COLLECTION, DOC_ID), {
    content,
    updatedAt: Date.now(),
    updatedBy: updatedBy ?? null,
    _serverUpdatedAt: serverTimestamp(),
  })
}
