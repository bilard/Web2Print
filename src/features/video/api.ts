import { auth } from '@/lib/firebase/config'
import type { RenderRequest, RenderResponse, RenderStatus } from './types'

const HF_URL = (import.meta.env.VITE_HF_RENDER_URL as string | undefined)?.replace(/\/$/, '')

function assertServiceUrl(): string {
  if (!HF_URL) {
    throw new Error(`VITE_HF_RENDER_URL n'est pas défini. Renseigne l'URL Cloud Run dans .env.local.`)
  }
  return HF_URL
}

async function getIdToken(): Promise<string> {
  const user = auth.currentUser
  if (!user) throw new Error('Utilisateur non connecté')
  return user.getIdToken()
}

export async function requestRender(req: RenderRequest): Promise<RenderResponse> {
  const url = `${assertServiceUrl()}/render`
  const idToken = await getIdToken()

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify(req),
  })

  const body = (await res.json().catch(() => ({}))) as Partial<RenderResponse> & {
    error?: string
  }

  if (!res.ok) {
    throw new Error(body.error ?? `Échec rendu (${res.status})`)
  }
  return body as RenderResponse
}

export async function fetchRenderStatus(renderId: string): Promise<RenderStatus> {
  const url = `${assertServiceUrl()}/render/${renderId}`
  const idToken = await getIdToken()

  const res = await fetch(url, {
    headers: { authorization: `Bearer ${idToken}` },
  })
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string }
    throw new Error(body.error ?? `Échec lecture statut (${res.status})`)
  }
  return (await res.json()) as RenderStatus
}
