// functions/src/access/onUserAccessChange.ts
// Trigger RBAC sur le doc users/{uid}. Deux notifications email :
//  (1) Nouvel utilisateur EN ATTENTE (doc créé, sans accessRoleId) → email à l'owner.
//  (2) Attribution d'un RÔLE (accessRoleId : vide → défini, user non bloqué)
//      → email de confirmation d'accès à l'utilisateur.
// Les deux mails partent du compte Google serveur de l'owner (voir ownerMailer).
import { onDocumentWritten } from 'firebase-functions/v2/firestore'
import { getFirestore } from 'firebase-admin/firestore'
import { logger } from 'firebase-functions/v2'
import { OWNER_EMAIL, sendAsOwner } from '../email/ownerMailer'

interface UserDoc {
  email?: string
  displayName?: string
  accessRoleId?: string | null
  accessBlocked?: boolean
}

const APP_URL = 'https://ibs-studio.com/dashboard'

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** Coquille HTML commune (carte sombre, accent indigo) survivant aux clients mail. */
function shell(title: string, inner: string, cta: { href: string; label: string }): string {
  return `<div style="font-family:system-ui,Segoe UI,Roboto,Arial,sans-serif;background:#0b0b0f;padding:24px">
  <div style="max-width:520px;margin:0 auto;background:#15151c;border:1px solid #26263a;border-radius:14px;overflow:hidden">
    <div style="background:#6366f1;padding:16px 22px;color:#ffffff;font-size:16px;font-weight:600">${escapeHtml(title)}</div>
    <div style="padding:22px;color:#e5e7eb;font-size:14px;line-height:1.6">
      ${inner}
      <a href="${cta.href}" style="display:inline-block;margin-top:20px;background:#6366f1;color:#ffffff;text-decoration:none;padding:11px 20px;border-radius:9px;font-size:14px;font-weight:600">${escapeHtml(cta.label)}</a>
    </div>
  </div>
</div>`
}

function adminPendingEmail(u: UserDoc): { subject: string; html: string } {
  const name = escapeHtml(u.displayName?.trim() || u.email || 'Utilisateur inconnu')
  const email = escapeHtml(u.email ?? '—')
  const inner = `<p style="margin:0 0 16px">Un nouvel utilisateur vient de se connecter et attend l'attribution d'un rôle.</p>
      <table style="width:100%;border-collapse:collapse">
        <tr><td style="padding:6px 0;color:#9ca3af">Nom</td><td style="padding:6px 0;text-align:right;color:#ffffff">${name}</td></tr>
        <tr><td style="padding:6px 0;color:#9ca3af">Email</td><td style="padding:6px 0;text-align:right;color:#ffffff">${email}</td></tr>
      </table>`
  return {
    subject: `Web2Print — nouvel utilisateur en attente : ${u.email ?? '?'}`,
    html: shell('Nouvel utilisateur en attente', inner, { href: APP_URL, label: "Ouvrir l'administration" }),
  }
}

function accessGrantedEmail(name: string, role: string): { subject: string; html: string } {
  const inner = `<p style="margin:0 0 14px">Bonjour ${escapeHtml(name)},</p>
      <p style="margin:0 0 14px">Votre accès à <strong style="color:#ffffff">Web2Print</strong> est désormais actif.</p>
      <p style="margin:0">Rôle attribué : <strong style="color:#ffffff">${escapeHtml(role)}</strong>.</p>`
  return {
    subject: 'Web2Print — votre accès est activé',
    html: shell('Accès activé ✅', inner, { href: APP_URL, label: 'Accéder à Web2Print' }),
  }
}

/** Nom lisible d'un rôle (repli si introuvable). */
async function roleName(roleId: string): Promise<string> {
  const snap = await getFirestore().doc(`roles/${roleId}`).get()
  return (snap.data()?.name as string | undefined)?.trim() || 'votre rôle'
}

export const onUserAccessChange = onDocumentWritten('users/{uid}', async (event) => {
  const beforeSnap = event.data?.before
  const afterSnap = event.data?.after
  const after = afterSnap?.data() as UserDoc | undefined
  if (!afterSnap?.exists || !after) return // suppression : rien à notifier

  const before = beforeSnap?.data() as UserDoc | undefined
  const beforeExists = beforeSnap?.exists ?? false
  const beforeRole = (before?.accessRoleId ?? '').trim()
  const afterRole = (after.accessRoleId ?? '').trim()

  try {
    // (1) Création d'un nouvel utilisateur en attente → notifier l'owner.
    if (!beforeExists && !afterRole && after.email && after.email !== OWNER_EMAIL) {
      const { subject, html } = adminPendingEmail(after)
      await sendAsOwner(OWNER_EMAIL, subject, html)
      logger.info(`[rbac-mail] owner notifié : nouvel inscrit ${after.email}`)
    }

    // (2) Attribution d'un rôle (vide → défini), user non bloqué → confirmer l'accès.
    if (beforeExists && !beforeRole && afterRole && !after.accessBlocked && after.email) {
      const role = await roleName(afterRole)
      const name = after.displayName?.trim() || after.email
      const { subject, html } = accessGrantedEmail(name, role)
      await sendAsOwner(after.email, subject, html)
      logger.info(`[rbac-mail] confirmation accès → ${after.email} (rôle « ${role} »)`)
    }
  } catch (err) {
    // Un email raté ne doit jamais bloquer le signup ni l'attribution du rôle.
    logger.error('[rbac-mail] échec envoi', err)
  }
})
