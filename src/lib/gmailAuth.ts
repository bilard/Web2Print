// src/lib/gmailAuth.ts
// OAuth 2.0 client + envoi via Gmail API.
// Utilise Google Identity Services (GIS, lib accounts.google.com/gsi/client).

declare global {
  interface Window {
    google?: {
      accounts: {
        oauth2: {
          initTokenClient: (cfg: {
            client_id: string
            scope: string
            callback: (resp: {
              access_token?: string
              expires_in?: number
              error?: string
              error_description?: string
            }) => void
          }) => { requestAccessToken: (override?: { prompt?: string }) => void }
        }
      }
    }
  }
}

const GIS_SRC = 'https://accounts.google.com/gsi/client'
const STORAGE_KEY = 'workflows_gmail_token_v1'
const GMAIL_SCOPE = 'https://www.googleapis.com/auth/gmail.send'

export interface GmailToken {
  accessToken: string
  expiresAt: number // ms epoch
}

let scriptPromise: Promise<void> | null = null

function loadGoogleScript(): Promise<void> {
  if (typeof window === 'undefined') return Promise.reject(new Error('Pas de window'))
  if (window.google?.accounts?.oauth2) return Promise.resolve()
  if (scriptPromise) return scriptPromise

  scriptPromise = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector(`script[src="${GIS_SRC}"]`)
    if (existing) {
      existing.addEventListener('load', () => resolve())
      existing.addEventListener('error', () => reject(new Error('GIS script error')))
      return
    }
    const s = document.createElement('script')
    s.src = GIS_SRC
    s.async = true
    s.defer = true
    s.onload = () => resolve()
    s.onerror = () => reject(new Error('Échec de chargement de Google Identity Services'))
    document.head.appendChild(s)
  })
  return scriptPromise
}

export function getStoredGmailToken(): GmailToken | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as GmailToken
    if (!parsed.accessToken || typeof parsed.expiresAt !== 'number') return null
    if (parsed.expiresAt < Date.now()) return null
    return parsed
  } catch {
    return null
  }
}

function storeToken(token: GmailToken): void {
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(token))
}

export function clearGmailToken(): void {
  sessionStorage.removeItem(STORAGE_KEY)
}

export async function requestGmailToken(clientId: string): Promise<GmailToken> {
  if (!clientId) throw new Error('Client ID OAuth manquant.')
  await loadGoogleScript()
  if (!window.google?.accounts?.oauth2) {
    throw new Error('Google Identity Services indisponible.')
  }

  return new Promise<GmailToken>((resolve, reject) => {
    const tokenClient = window.google!.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: GMAIL_SCOPE,
      callback: (resp) => {
        if (resp.error) {
          reject(new Error(`OAuth: ${resp.error_description || resp.error}`))
          return
        }
        if (!resp.access_token) {
          reject(new Error('Pas de access_token dans la réponse OAuth.'))
          return
        }
        const token: GmailToken = {
          accessToken: resp.access_token,
          expiresAt: Date.now() + (resp.expires_in ?? 3600) * 1000,
        }
        storeToken(token)
        resolve(token)
      },
    })
    tokenClient.requestAccessToken()
  })
}

export interface SendGmailAttachment {
  filename: string
  mimeType: string
  base64: string // contenu déjà encodé en base64 standard
}

export interface SendGmailOptions {
  to: string
  subject: string
  body: string
  isHtml?: boolean
  attachments?: SendGmailAttachment[]
}

function base64UrlEncode(str: string): string {
  // Encode UTF-8 → bytes → base64 → base64url
  const bytes = new TextEncoder().encode(str)
  let binary = ''
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function encodeMimeHeader(s: string): string {
  // RFC 2047 encoded-word pour les sujets non-ASCII
  // eslint-disable-next-line no-control-regex -- la plage ASCII complète (avec caractères de contrôle) est volontaire
  if (/^[\x00-\x7F]*$/.test(s)) return s
  return `=?UTF-8?B?${btoa(new TextEncoder().encode(s).reduce((a, b) => a + String.fromCharCode(b), ''))}?=`
}

function buildMimeMessage(opts: SendGmailOptions): string {
  const bodyContentType = `text/${opts.isHtml ? 'html' : 'plain'}; charset=UTF-8`
  const subject = encodeMimeHeader(opts.subject || '')

  if (!opts.attachments || opts.attachments.length === 0) {
    return [
      `To: ${opts.to}`,
      `Subject: ${subject}`,
      `MIME-Version: 1.0`,
      `Content-Type: ${bodyContentType}`,
      ``,
      opts.body || '',
    ].join('\r\n')
  }

  // multipart/mixed avec body + attachments
  const boundary = `----w2p_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
  const parts: string[] = []
  parts.push(`To: ${opts.to}`)
  parts.push(`Subject: ${subject}`)
  parts.push(`MIME-Version: 1.0`)
  parts.push(`Content-Type: multipart/mixed; boundary="${boundary}"`)
  parts.push(``)
  parts.push(`--${boundary}`)
  parts.push(`Content-Type: ${bodyContentType}`)
  parts.push(``)
  parts.push(opts.body || '')

  for (const att of opts.attachments) {
    parts.push(``)
    parts.push(`--${boundary}`)
    parts.push(`Content-Type: ${att.mimeType}; name="${att.filename}"`)
    parts.push(`Content-Disposition: attachment; filename="${att.filename}"`)
    parts.push(`Content-Transfer-Encoding: base64`)
    parts.push(``)
    // Base64 — découpé en lignes de 76 chars (RFC 2045)
    parts.push(att.base64.replace(/(.{76})/g, '$1\r\n').trimEnd())
  }
  parts.push(``)
  parts.push(`--${boundary}--`)
  return parts.join('\r\n')
}

export async function sendGmail(
  accessToken: string,
  opts: SendGmailOptions,
): Promise<{ id: string }> {
  const message = buildMimeMessage(opts)
  const raw = base64UrlEncode(message)

  const res = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ raw }),
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Gmail API HTTP ${res.status} : ${text || res.statusText}`)
  }

  const json = (await res.json()) as { id: string }
  return { id: json.id }
}

/** Convertit un File en base64 standard (sans préfixe data:URI). */
export async function fileToBase64(file: File | Blob): Promise<string> {
  const buf = await file.arrayBuffer()
  const bytes = new Uint8Array(buf)
  let binary = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  return btoa(binary)
}
