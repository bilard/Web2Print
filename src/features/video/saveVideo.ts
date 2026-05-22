import { doc, setDoc, serverTimestamp } from 'firebase/firestore'
import { db } from '@/lib/firebase/config'
import { fetchRenderStatus } from './api'
import type { AspectFormat } from './types'
import type { StyleConfig } from './promptToStyleConfig'

export interface SaveVideoInput {
  renderId: string
  url: string
  durationMs?: number
  aspect: AspectFormat
  caption?: string
  brand?: string
  prompt?: string
  styleConfig?: StyleConfig
  ownerId: string
}

export async function saveRenderedVideo(input: SaveVideoInput): Promise<void> {
  let storagePath: string | undefined
  try {
    const status = await fetchRenderStatus(input.renderId)
    storagePath = status.storagePath
  } catch {
    // best-effort: persist record even without canonical storagePath
  }

  const ref = doc(db, 'videos', input.renderId)
  await setDoc(ref, {
    renderId: input.renderId,
    ownerId: input.ownerId,
    url: input.url,
    storagePath: storagePath ?? null,
    durationMs: input.durationMs ?? null,
    aspect: input.aspect,
    caption: input.caption ?? null,
    brand: input.brand ?? null,
    prompt: input.prompt ?? null,
    styleConfig: input.styleConfig ?? null,
    createdAt: serverTimestamp(),
  })
}
