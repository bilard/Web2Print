// functions/src/analytics/notifySession.ts
// Notification Telegram best-effort au propriétaire à CHAQUE nouvelle session
// visiteur (premier hit d'un `sid`). Déclenché depuis collectAnalytics après
// l'écriture de l'event, et UNIQUEMENT pour les visiteurs non exclus (le
// propriétaire ne se notifie donc jamais lui-même).
//
// Anti-doublon multi-instances : on tente `create()` sur analyticsSessions/{sid} ;
// il n'aboutit qu'une seule fois par session (rejet ALREADY_EXISTS sinon), ce qui
// est atomique et sûr même avec maxInstances > 1. On ne notifie que sur ce succès.
//
// Destinataire : users/{ownerUid}.telegram (botToken + chatId), la même config que
// le digest quotidien. Coupe-circuit : telegram.sessionAlerts === false désactive
// les notifications sans redéploiement.
import type { Firestore } from 'firebase-admin/firestore'
import { FieldValue } from 'firebase-admin/firestore'
import { getAuth } from 'firebase-admin/auth'
import { OWNER_EMAILS } from './owner'

/** Doc d'event tel que produit par buildEventDoc (sous-ensemble utilisé ici). */
interface SessionEventDoc {
  sid: string
  vid: string
  area: string
  path: string
  device: string | null
  browser: string | null
  os: string | null
  country: string | null
  city: string | null
}

export interface SessionNotifyInput {
  name: string | null
  area: string
  path: string
  device: string | null
  browser: string | null
  os: string | null
  country: string | null
  city: string | null
}

/** Drapeau emoji à partir d'un code pays ISO-3166 alpha-2 (`''` sinon). */
function flagEmoji(cc: string | null): string {
  if (!cc || !/^[A-Za-z]{2}$/.test(cc)) return ''
  const base = 0x1f1e6
  const up = cc.toUpperCase()
  return String.fromCodePoint(base + up.charCodeAt(0) - 65, base + up.charCodeAt(1) - 65)
}

/** Pur : compose le message Telegram d'une nouvelle session. */
export function buildSessionText(i: SessionNotifyInput): string {
  const who = i.name ? ` — ${i.name}` : ' — Visiteur anonyme'
  const lines = [`🔵 Nouvelle visite${who}`]

  const place = [i.city, i.country].filter(Boolean).join(', ')
  if (place) lines.push(`📍 ${flagEmoji(i.country)} ${place}`.trim())

  lines.push(`📄 ${i.area} · ${i.path}`)

  const tech = [i.device, i.browser, i.os].filter(Boolean).join(' · ')
  if (tech) lines.push(`💻 ${tech}`)

  return lines.join('\n')
}

async function sendTelegram(botToken: string, chatId: string, text: string): Promise<void> {
  const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, disable_web_page_preview: true }),
  })
  const json = (await res.json().catch(() => null)) as { ok?: boolean; description?: string } | null
  if (!json?.ok) throw new Error(`Telegram sendMessage: ${json?.description ?? res.status}`)
}

interface OwnerTelegram {
  botToken?: string
  chatId?: string
  sessionAlerts?: boolean
}

/** Lit la config Telegram d'envoi du propriétaire (`null` si absente ou coupée). */
async function readOwnerTelegram(db: Firestore): Promise<{ botToken: string; chatId: string } | null> {
  const snap = await db.collection('users').where('email', 'in', OWNER_EMAILS).get()
  for (const d of snap.docs) {
    const tg = (d.data().telegram ?? {}) as OwnerTelegram
    if (tg.sessionAlerts === false) continue // coupe-circuit explicite
    if (tg.botToken && tg.chatId) return { botToken: tg.botToken, chatId: tg.chatId }
  }
  return null
}

/** Résout un nom lisible pour un visiteur connecté (`null` si anonyme/inconnu). */
async function resolveName(uid: string | null): Promise<string | null> {
  if (!uid) return null
  try {
    const rec = await getAuth().getUser(uid)
    return rec.displayName || rec.email || null
  } catch {
    return null
  }
}

/**
 * Notifie le propriétaire par Telegram si `doc` inaugure une nouvelle session.
 * Entièrement best-effort : ne lève jamais (les erreurs sont avalées) afin de ne
 * jamais bloquer la réponse au beacon.
 */
export async function maybeNotifyNewSession(
  db: Firestore,
  doc: SessionEventDoc,
  // uid effectif pour NOMMER le visiteur (doc.uid ?? luid) : `luid` est présent dès
  // le premier hit d'un utilisateur connu, là où `doc.uid` n'est backfillé qu'après.
  // Servi au seul affichage du nom — JAMAIS persisté dans analyticsSessions.
  effectiveUid: string | null,
): Promise<void> {
  const sid = doc.sid
  if (!sid) return
  try {
    // Garde atomique : n'aboutit qu'au premier hit de cette session.
    await db.collection('analyticsSessions').doc(sid).create({
      firstSeen: FieldValue.serverTimestamp(),
      vid: doc.vid,
      country: doc.country,
      city: doc.city,
    })
  } catch {
    // ALREADY_EXISTS (session déjà vue) ou erreur d'écriture → on ne notifie pas.
    return
  }
  try {
    const recipient = await readOwnerTelegram(db)
    if (!recipient) return
    const name = await resolveName(effectiveUid)
    const text = buildSessionText({
      name,
      area: doc.area,
      path: doc.path,
      device: doc.device,
      browser: doc.browser,
      os: doc.os,
      country: doc.country,
      city: doc.city,
    })
    await sendTelegram(recipient.botToken, recipient.chatId, text)
  } catch (err) {
    console.error('maybeNotifyNewSession: envoi Telegram échoué', err)
  }
}
