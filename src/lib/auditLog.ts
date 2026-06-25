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
  'library.project.save': 'Projet modifié',
  'library.project.rename': 'Projet renommé',
  'library.project.delete': 'Projet supprimé',
  'library.project.duplicate': 'Projet dupliqué',
  'library.version.restore': 'Version restaurée',
  'library.version.create': 'Version créée',
  'library.version.snapshot': 'Snapshot auto',
  'data.dataset.save': 'DataSet enregistré',
  'data.dataset.delete': 'DataSet supprimé',
  'data.dataset.import': 'DataSet importé',
  'data.dataset.rename': 'DataSet renommé',
  'data.dataset.move': 'DataSet déplacé',
  'export.pdf': 'Export PDF',
  'export.png': 'Export PNG',
  'export.pptx': 'Export PPTX',
  'export.svg': 'Export SVG',
  'export.html': 'Export HTML',
  'export.idml': 'Export IDML',
  'export.social': 'Export pack social',
  'export.declines': 'Pages déclinées',
  'export.batch': 'Export par lot (fusion)',
  'export.xlsx': 'Export Excel (XLSX)',
  'workflow.run': 'Workflow exécuté',
  'ai.completion': 'IA — complétion de colonne',
  'ai.workflow.generate': 'IA — génération de workflow',
  'settings.theme': 'Thème changé',
  'settings.ai.model': 'Modèle IA par défaut',
  'settings.ai.budget': 'Budget IA mensuel',
}

/** Libellé lisible d'une action (clé inconnue → la clé brute). */
export function auditActionLabel(action: string): string {
  return AUDIT_ACTIONS[action] ?? action
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
