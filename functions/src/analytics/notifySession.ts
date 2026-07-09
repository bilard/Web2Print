// functions/src/analytics/notifySession.ts
// Notifications Telegram best-effort au propriétaire, façon LOG LIVE. Déclenché
// depuis collectAnalytics après l'écriture de l'event, et UNIQUEMENT pour les
// visiteurs non exclus (le propriétaire ne se notifie donc jamais lui-même).
//
// Deux régimes selon que le visiteur est identifié :
//  • Utilisateur CONNECTÉ (uid effectif présent) → flux d'activité : une notif à
//    CHAQUE page/section visitée (anti-doublon PAR ÉVÉNEMENT via `eid`), pour un
//    suivi live indépendant de ce qui est supprimé côté Telegram.
//  • Visiteur ANONYME → un seul ping d'arrivée par session (`sid`), pour signaler
//    le trafic public sans le noyer sous chaque page vue.
//
// Anti-doublon multi-instances : `create()` sur analyticsNotifyGuards/{clé} —
// atomique (rejet ALREADY_EXISTS), sûr même avec maxInstances > 1. Clé = `e:<eid>`
// (activité connectée, granularité event) ou `s:<sid>` (arrivée anonyme, session).
//
// Destinataire : users/{ownerUid}.telegram (botToken + chatId), la même config que
// le digest quotidien. Coupe-circuit : telegram.sessionAlerts === false désactive
// tout sans redéploiement.
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

/** Drapeau emoji à partir d'un code pays ISO-3166 alpha-2 (`''` sinon). */
function flagEmoji(cc: string | null): string {
  if (!cc || !/^[A-Za-z]{2}$/.test(cc)) return ''
  const base = 0x1f1e6
  const up = cc.toUpperCase()
  return String.fromCodePoint(base + up.charCodeAt(0) - 65, base + up.charCodeAt(1) - 65)
}

/** Pur : message d'ARRIVÉE d'un visiteur anonyme (un par session). */
export function buildSessionText(i: {
  area: string
  path: string
  device: string | null
  browser: string | null
  os: string | null
  country: string | null
  city: string | null
}): string {
  const lines = ['🔵 Nouvelle visite — Visiteur anonyme']
  const place = [i.city, i.country].filter(Boolean).join(', ')
  if (place) lines.push(`📍 ${flagEmoji(i.country)} ${place}`.trim())
  lines.push(`📄 ${i.area} · ${i.path}`)
  const tech = [i.device, i.browser, i.os].filter(Boolean).join(' · ')
  if (tech) lines.push(`💻 ${tech}`)
  return lines.join('\n')
}

/** Pur : ligne de LOG LIVE d'un utilisateur connecté (une par page/section). */
export function buildActivityText(i: {
  name: string
  area: string
  path: string
  country: string | null
  city: string | null
}): string {
  const lines = [`🟢 ${i.name}`, `📄 ${i.area} · ${i.path}`]
  const place = [i.city, i.country].filter(Boolean).join(', ')
  if (place) lines.push(`📍 ${flagEmoji(i.country)} ${place}`.trim())
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

/** Résout un nom lisible pour un visiteur connecté (`null` si inconnu). */
async function resolveName(uid: string): Promise<string | null> {
  try {
    const rec = await getAuth().getUser(uid)
    return rec.displayName || rec.email || null
  } catch {
    return null
  }
}

/**
 * Garde atomique : `true` si cette clé n'avait jamais été notifiée (donc on notifie),
 * `false` sinon (doublon ou erreur d'écriture — on s'abstient).
 */
async function claimGuard(db: Firestore, key: string, meta: Record<string, unknown>): Promise<boolean> {
  try {
    await db.collection('analyticsNotifyGuards').doc(key).create({
      firstSeen: FieldValue.serverTimestamp(),
      ...meta,
    })
    return true
  } catch {
    return false
  }
}

/**
 * Libère une garde posée dont l'envoi a échoué, pour qu'un événement ultérieur de la
 * même session/activité puisse REESSAYER (sinon la notif est perdue à jamais : la garde
 * poser-avant-envoi bloquerait tout nouvel essai). Best-effort.
 */
async function releaseGuard(db: Firestore, key: string): Promise<void> {
  try {
    await db.collection('analyticsNotifyGuards').doc(key).delete()
  } catch {
    /* best-effort : au pire la garde subsiste et on ne renotifie pas — comportement d'avant */
  }
}

/**
 * Notifie le propriétaire par Telegram selon le régime du visiteur (cf. en-tête).
 * Entièrement best-effort : ne lève jamais afin de ne jamais bloquer la réponse au
 * beacon. `effectiveUid` = uid pour NOMMER le visiteur (doc.uid ?? luid) — `luid`
 * est présent dès le 1er hit d'un utilisateur connu ; servi au seul affichage,
 * JAMAIS persisté.
 */
export async function maybeNotifyNewSession(
  db: Firestore,
  doc: SessionEventDoc,
  effectiveUid: string | null,
  eid: string | null,
): Promise<void> {
  try {
    if (effectiveUid) {
      // Utilisateur connecté → log live : une ligne par événement.
      // Anti-doublon par event ; sans `eid` (rare) on laisse passer.
      const key = eid ? `e:${eid}` : null
      if (key && !(await claimGuard(db, key, { uid: effectiveUid, path: doc.path }))) return
      try {
        const recipient = await readOwnerTelegram(db)
        if (!recipient) return
        const name = (await resolveName(effectiveUid)) ?? 'Utilisateur connecté'
        const text = buildActivityText({
          name,
          area: doc.area,
          path: doc.path,
          country: doc.country,
          city: doc.city,
        })
        await sendTelegram(recipient.botToken, recipient.chatId, text)
      } catch (err) {
        // Envoi raté → on libère la garde pour réessayer au prochain événement.
        if (key) await releaseGuard(db, key)
        throw err
      }
      return
    }

    // Visiteur anonyme → un seul ping d'arrivée par session.
    if (!doc.sid) return
    const sessionKey = `s:${doc.sid}`
    if (!(await claimGuard(db, sessionKey, { vid: doc.vid, country: doc.country, city: doc.city }))) return
    try {
      const recipient = await readOwnerTelegram(db)
      if (!recipient) return
      const text = buildSessionText({
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
      // Envoi raté → on libère la garde pour renotifier cette session plus tard.
      await releaseGuard(db, sessionKey)
      throw err
    }
  } catch (err) {
    console.error('maybeNotifyNewSession: notification Telegram échouée', err)
  }
}
