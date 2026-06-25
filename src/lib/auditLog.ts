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

/** Libellés FR des actions (pour le filtre QUOI et l'affichage). Étendre au besoin. */
export const AUDIT_ACTIONS: Record<string, string> = {
  'auth.login': 'Connexion',
  'access.role.assign': 'Rôle attribué',
  'access.role.remove': 'Rôle retiré',
  'access.block': 'Compte bloqué',
  'access.unblock': 'Compte débloqué',
  'access.grant': 'Permission accordée',
  'access.revoke': 'Permission révoquée',
  'access.user.delete': 'Utilisateur supprimé',
  'access.role.save': 'Rôle enregistré',
  'access.role.delete': 'Rôle supprimé',
  'library.project.create': 'Projet créé',
  'library.project.save': 'Projet enregistré',
  'library.project.delete': 'Projet supprimé',
  'data.dataset.save': 'DataSet enregistré',
  'data.dataset.delete': 'DataSet supprimé',
  'data.dataset.import': 'DataSet importé',
  'export.run': 'Export',
  'workflow.run': 'Workflow exécuté',
}

/** Libellé lisible d'une action (clé inconnue → la clé brute). */
export function auditActionLabel(action: string): string {
  return AUDIT_ACTIONS[action] ?? action
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
