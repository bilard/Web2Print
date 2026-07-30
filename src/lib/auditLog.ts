// Journal d'audit : enregistre QUI a fait QUOI QUAND. Fire-and-forget (ne bloque jamais
// l'action, n'échoue jamais visiblement) — calque le pattern de pipelineLog.ts.
import { addDoc, collection, serverTimestamp } from 'firebase/firestore'
import { db, auth } from '@/lib/firebase/config'

/** Entrée d'audit minimale fournie par l'appelant. */
export interface AuditInput {
  action: string // clé d'action, ex. 'access.role.assign' (voir AUDIT_ACTIONS)
  module: string // module concerné, ex. 'access' | 'library' | 'data' | 'workflows' | 'export'
  targetId?: string // id de la ressource touchée (user, projet, dataSet…)
  targetLabel?: string // libellé lisible de la ressource
  meta?: Record<string, unknown> // détails optionnels (avant/après, etc.)
}

/** Document tel que stocké dans Firestore `auditLog/{id}`. */
export interface AuditEntry extends AuditInput {
  id: string
  userId: string
  userEmail: string
  userName: string
  createdAt: Date | null
}

/** Liste canonique de TOUS les modules (pour le filtre « Type », même sans données). */
export const AUDIT_MODULES = ['access', 'auth', 'library', 'data', 'export', 'workflows', 'ai', 'settings'] as const

/** Module d'une clé d'action (`library.project.create` → `library` ; `workflow.run` → `workflows`). */
export function auditModuleOf(action: string): string {
  const head = action.split('.')[0]
  return head === 'workflow' ? 'workflows' : head
}

/** Action → CLÉ de traduction de son libellé (filtre « Quoi » et colonne Action).
 *  ⚠️ Ce sont des clés, pas du texte : le libellé se traduit à l'AFFICHAGE, alors
 *  que la clé d'action, elle, est persistée telle quelle dans le journal. */
export const AUDIT_ACTIONS: Record<string, string> = {
  'auth.login': 'aud.auth.login',
  'access.role.assign': 'aud.access.role.assign',
  'access.role.remove': 'aud.access.role.remove',
  'access.block': 'aud.access.block',
  'access.unblock': 'aud.access.unblock',
  'access.grant': 'aud.access.grant',
  'access.revoke': 'aud.access.revoke',
  'access.user.delete': 'aud.access.user.delete',
  'access.role.save': 'aud.access.role.save',
  'access.role.delete': 'aud.access.role.delete',
  'access.account.assign': 'aud.access.account.assign',
  'library.project.create': 'aud.library.project.create',
  'library.project.save': 'aud.library.project.save',
  'library.project.rename': 'aud.library.project.rename',
  'library.project.delete': 'aud.library.project.delete',
  'library.project.duplicate': 'aud.library.project.duplicate',
  'library.version.restore': 'aud.library.version.restore',
  'library.version.create': 'aud.library.version.create',
  'library.version.snapshot': 'aud.library.version.snapshot',
  'data.dataset.save': 'aud.data.dataset.save',
  'data.dataset.delete': 'aud.data.dataset.delete',
  'data.dataset.import': 'aud.data.dataset.import',
  'data.dataset.rename': 'aud.data.dataset.rename',
  'data.dataset.move': 'aud.data.dataset.move',
  'data.cell.edit': 'aud.data.cell.edit',
  'export.pdf': 'aud.export.pdf',
  'export.png': 'aud.export.png',
  'export.pptx': 'aud.export.pptx',
  'export.svg': 'aud.export.svg',
  'export.html': 'aud.export.html',
  'export.idml': 'aud.export.idml',
  'export.social': 'aud.export.social',
  'export.declines': 'aud.export.declines',
  'export.batch': 'aud.export.batch',
  'export.xlsx': 'aud.export.xlsx',
  'workflow.run': 'aud.workflow.run',
  'ai.completion': 'aud.ai.completion',
  'ai.workflow.generate': 'aud.ai.workflow.generate',
  'ai.imageGen': 'aud.ai.imageGen',
  'settings.theme': 'aud.settings.theme',
  'settings.locale': 'aud.settings.locale',
  'settings.ai.model': 'aud.settings.ai.model',
  'settings.ai.budget': 'aud.settings.ai.budget',
  'i18n.label.edit': 'aud.i18n.label.edit',
  'i18n.label.reset': 'aud.i18n.label.reset',
  'i18n.label.translate': 'aud.i18n.label.translate',
  'i18n.locale.toggle': 'aud.i18n.locale.toggle',
}

/**
 * Clé de traduction du libellé d'une action, ou `null` si l'action est inconnue.
 *
 * ⚠️ Ce module NE PEUT PAS traduire lui-même : `locale.store` importe
 * `recordAudit`, donc importer `lib/i18n` ici créerait un cycle
 * (auditLog → i18n → locale.store → auditLog), que `npm run cycles` refuse.
 * L'appelant traduit — il a de toute façon besoin d'un rendu réactif.
 */
export function auditActionKey(action: string): string | null {
  return AUDIT_ACTIONS[action] ?? null
}

// Mémoire en RAM du dernier log par clé, pour throttler les actions fréquentes (autosave).
const lastLoggedAt: Record<string, number> = {}

/** Comme recordAudit, mais ignore l'appel si la même `throttleKey` a déjà été loggée il y
 *  a moins de `minIntervalMs` (évite de noyer le journal avec l'autosave). */
export async function recordAuditThrottled(throttleKey: string, minIntervalMs: number, entry: AuditInput): Promise<void> {
  const now = Date.now()
  const prev = lastLoggedAt[throttleKey]
  if (prev && now - prev < minIntervalMs) return
  lastLoggedAt[throttleKey] = now
  await recordAudit(entry)
}

/** Enregistre une action d'audit. Ne lève jamais, ne bloque jamais l'appelant. */
export async function recordAudit(entry: AuditInput): Promise<void> {
  try {
    const u = auth.currentUser
    if (!u) return
    await addDoc(collection(db, 'auditLog'), {
      userId: u.uid,
      userEmail: u.email ?? '',
      userName: u.displayName ?? '',
      action: entry.action,
      module: entry.module,
      targetId: entry.targetId ?? null,
      targetLabel: entry.targetLabel ?? null,
      meta: entry.meta ?? null,
      createdAt: serverTimestamp(),
    })
  } catch {
    /* fire-and-forget : un échec de log ne doit jamais perturber l'utilisateur */
  }
}
