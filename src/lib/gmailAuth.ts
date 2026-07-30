// Construction du message MIME + envoi via Gmail API.
// Le jeton d'accès est fourni par l'APPELANT. Côté client comme côté serveur (cron),
// les nodes Gmail réutilisent désormais le jeton du connecteur Google SERVEUR
// (refresh token persistant, rafraîchi tout seul) — cf. features/gdrive/serverGoogleToken.ts
// (client) et functions/google/serverAuth.ts (cron). L'ancien flux OAuth navigateur
// par-node (access_token ~1 h dans sessionStorage, Client ID à saisir) est supprimé :
// il obligeait à se reconnecter chaque heure / à chaque onglet.

import { t } from '@/lib/i18n'

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
    throw new Error(t('err.gm.apiHttp', { status: res.status, body: text || res.statusText }))
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
