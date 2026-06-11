// functions/src/telegram/dailyDigest.ts
// Digest Telegram quotidien (08:00 Europe/Paris) : pour chaque utilisateur
// opt-in (users/{uid}.telegram.dailyDigest == true), résume les dernières 24 h
// (runs de workflows, messages Telegram en attente) et l'envoie via son bot.
// Silencieux s'il n'y a rien à dire.
import { onSchedule } from 'firebase-functions/v2/scheduler'
import { initializeApp, getApps } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'

if (!getApps().length) initializeApp()

export interface DigestStats {
  ok: number
  errors: number
  failedNames: string[]
  pendingInbox: number
}

/** Pur : compose le message du digest, ou null s'il n'y a rien à signaler. */
export function buildDigestText(stats: DigestStats): string | null {
  const { ok, errors, failedNames, pendingInbox } = stats
  if (ok === 0 && errors === 0 && pendingInbox === 0) return null
  const lines = ['🗞 Digest Web2Print — dernières 24 h']
  if (ok > 0 || errors > 0) {
    let runLine = `• Workflows : ${ok} réussi${ok > 1 ? 's' : ''}, ${errors} en échec`
    if (failedNames.length > 0) runLine += ` (${failedNames.slice(0, 5).join(', ')})`
    lines.push(runLine)
  }
  if (pendingInbox > 0) {
    lines.push(`• Telegram : ${pendingInbox} message${pendingInbox > 1 ? 's' : ''} en attente de traitement`)
  }
  return lines.join('\n')
}

async function sendTelegram(botToken: string, chatId: string, text: string): Promise<void> {
  const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text }),
  })
  const json = (await res.json().catch(() => null)) as { ok?: boolean; description?: string } | null
  if (!json?.ok) throw new Error(`Telegram sendMessage: ${json?.description ?? res.status}`)
}

export const telegramDailyDigest = onSchedule(
  { schedule: '0 8 * * *', timeZone: 'Europe/Paris', region: 'europe-west1', timeoutSeconds: 120 },
  async () => {
    const db = getFirestore()
    const users = await db.collection('users').where('telegram.dailyDigest', '==', true).get()
    if (users.empty) return

    // L'inbox est globale (app mono-équipe) : compté une fois pour tous.
    const pendingInbox = await db
      .collection('telegramInbox')
      .where('status', '==', 'pending')
      .count()
      .get()
      .then((s) => s.data().count)
      .catch(() => 0)

    const since = Date.now() - 24 * 3600 * 1000
    for (const u of users.docs) {
      const tg = (u.data().telegram ?? {}) as { botToken?: string; chatId?: string }
      if (!tg.botToken || !tg.chatId) continue
      try {
        const runs = await db
          .collection(`users/${u.id}/workflowRuns`)
          .where('startedAt', '>=', since)
          .get()
        let ok = 0
        let errors = 0
        const failedNames: string[] = []
        runs.forEach((r) => {
          const d = r.data() as { status?: string; name?: string }
          if (d.status === 'error') {
            errors++
            if (d.name && !failedNames.includes(d.name)) failedNames.push(d.name)
          } else ok++
        })
        const text = buildDigestText({ ok, errors, failedNames, pendingInbox })
        if (text) await sendTelegram(tg.botToken, tg.chatId, text)
      } catch (err) {
        console.error('telegramDailyDigest: échec pour', u.id, err)
      }
    }
  },
)
