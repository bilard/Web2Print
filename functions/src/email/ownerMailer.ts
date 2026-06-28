// functions/src/email/ownerMailer.ts
// Envoi d'email via Gmail API DEPUIS le compte Google serveur de l'owner.
// Les emails système RBAC (notification admin + confirmation d'accès) partent
// tous de l'owner : les nouveaux utilisateurs n'ont pas connecté Google, donc
// seul le refresh token de l'owner (Réglages → Connecteurs → « Connecter Google
// (accès serveur) ») peut servir d'expéditeur.
import { initializeApp, getApps } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import { getGoogleAccessToken } from '../google/serverAuth'

if (!getApps().length) initializeApp()

/** Email de l'owner : expéditeur système ET destinataire des notifications admin. */
export const OWNER_EMAIL = 'ibs.studio@gmail.com'

let ownerUidCache: string | null = null

/** UID Firestore de l'owner (résolu par email, mis en cache par instance). */
export async function getOwnerUid(): Promise<string> {
  if (ownerUidCache) return ownerUidCache
  const snap = await getFirestore()
    .collection('users')
    .where('email', '==', OWNER_EMAIL)
    .limit(1)
    .get()
  const uid = snap.docs[0]?.id
  if (!uid) throw new Error(`Owner introuvable (users où email == ${OWNER_EMAIL}).`)
  ownerUidCache = uid
  return uid
}

function buildMime(to: string, subject: string, html: string): string {
  const subj = `=?UTF-8?B?${Buffer.from(subject, 'utf8').toString('base64')}?=`
  return [
    `To: ${to}`,
    `From: Web2Print <${OWNER_EMAIL}>`,
    `Subject: ${subj}`,
    'MIME-Version: 1.0',
    'Content-Type: text/html; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    Buffer.from(html, 'utf8').toString('base64'),
  ].join('\r\n')
}

/** Envoie un email HTML depuis le compte Google serveur de l'owner. Throw en cas d'échec. */
export async function sendAsOwner(to: string, subject: string, html: string): Promise<void> {
  const ownerUid = await getOwnerUid()
  const token = await getGoogleAccessToken(ownerUid)
  const raw = Buffer.from(buildMime(to, subject, html), 'utf8').toString('base64url')
  const res = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ raw }),
  })
  const json = (await res.json().catch(() => null)) as { id?: string; error?: { message?: string } } | null
  if (!res.ok || !json?.id) {
    throw new Error(`Gmail ${res.status} — ${json?.error?.message ?? 'échec envoi'}`)
  }
}
