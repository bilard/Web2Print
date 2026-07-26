import { collection, doc, getDocs, getDoc, setDoc, deleteDoc, updateDoc, query, orderBy, where } from 'firebase/firestore'
import { db } from '@/lib/firebase/config'
import type { Workflow, WorkflowFolder } from '../types'
import type { UserWorkflowTemplate } from '../templates'
import { CURRENT_SCHEMA_VERSION, migrate } from './migrations'
import { syncWorkflowSchedule } from './scheduleSync'
import { stripUndefined } from '@/features/retail-promo/stripUndefined'

const col = (uid: string) => collection(db, 'users', uid, 'workflows')
const folderCol = (uid: string) => collection(db, 'users', uid, 'workflowFolders')
const templateCol = (uid: string) => collection(db, 'users', uid, 'workflowTemplates')

export async function listWorkflows(uid: string): Promise<Workflow[]> {
  const snap = await getDocs(query(col(uid), orderBy('updatedAt', 'desc')))
  return snap.docs.map((d) => migrate(d.data() as Workflow))
}

export async function getWorkflow(uid: string, id: string): Promise<Workflow | null> {
  const snap = await getDoc(doc(col(uid), id))
  if (!snap.exists()) return null
  return migrate(snap.data() as Workflow)
}

export async function saveWorkflow(uid: string, wf: Workflow): Promise<void> {
  const next: Workflow = { ...wf, schemaVersion: CURRENT_SCHEMA_VERSION, updatedAt: Date.now() }
  // Firestore rejette tout `undefined` (ex. config de node avec un champ optionnel
  // remis à undefined). On nettoie récursivement avant l'écriture — cf. reference
  // firestore setdoc undefined trap.
  await setDoc(doc(col(uid), wf.id), stripUndefined(next))
  await syncWorkflowSchedule(uid, wf).catch((e) => console.warn('syncWorkflowSchedule:', e))
}

export async function deleteWorkflow(uid: string, id: string): Promise<void> {
  await deleteDoc(doc(col(uid), id))
  // Nettoie le planning cron associé : sans ça, le scanner serveur boucle chaque
  // minute sur un orphelin (« Workflow introuvable ») sans jamais le purger.
  await deleteDoc(doc(db, 'workflowSchedules', id)).catch((e) => console.warn('deleteWorkflow/schedule:', e))
}

/** Déplace un workflow dans un dossier (ou l'en retire si folderId = null). */
export async function setWorkflowFolder(uid: string, workflowId: string, folderId: string | null): Promise<void> {
  await updateDoc(doc(col(uid), workflowId), { folderId, updatedAt: Date.now() })
}

// ---- Dossiers de regroupement ------------------------------------------------

export async function listFolders(uid: string): Promise<WorkflowFolder[]> {
  const snap = await getDocs(query(folderCol(uid), orderBy('name')))
  return snap.docs.map((d) => d.data() as WorkflowFolder)
}

export async function createFolder(uid: string, name: string): Promise<WorkflowFolder> {
  const folder: WorkflowFolder = {
    id: `wff_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    name: name.trim() || 'Dossier',
    createdAt: Date.now(),
  }
  await setDoc(doc(folderCol(uid), folder.id), folder)
  return folder
}

export async function renameFolder(uid: string, id: string, name: string): Promise<void> {
  await updateDoc(doc(folderCol(uid), id), { name: name.trim() || 'Dossier' })
}

/**
 * Supprime un dossier SANS supprimer les workflows : leurs `folderId` sont remis
 * à null (ils repassent en « Sans dossier »).
 */
export async function deleteFolder(uid: string, id: string): Promise<void> {
  const members = await getDocs(query(col(uid), where('folderId', '==', id)))
  await Promise.all(members.docs.map((d) => updateDoc(d.ref, { folderId: null, updatedAt: Date.now() })))
  await deleteDoc(doc(folderCol(uid), id))
}

// ---- Modèles personnalisés (users/{uid}/workflowTemplates) -------------------

/** Liste les modèles de l'utilisateur, du plus récemment modifié au plus ancien. */
export async function listUserTemplates(uid: string): Promise<UserWorkflowTemplate[]> {
  const snap = await getDocs(query(templateCol(uid), orderBy('updatedAt', 'desc')))
  return snap.docs.map((d) => d.data() as UserWorkflowTemplate)
}

/** Crée ou remplace un modèle (l'id pilote create vs update du graphe). */
export async function saveUserTemplate(uid: string, tpl: UserWorkflowTemplate): Promise<void> {
  await setDoc(doc(templateCol(uid), tpl.id), tpl)
}

/** Met à jour seulement les infos d'un modèle (nom / description / émoji). */
export async function updateUserTemplateMeta(
  uid: string,
  id: string,
  meta: { name: string; description: string; emoji: string },
): Promise<void> {
  await updateDoc(doc(templateCol(uid), id), {
    name: meta.name.trim() || 'Mon modèle',
    description: meta.description.trim(),
    emoji: meta.emoji.trim() || '⭐',
    updatedAt: Date.now(),
  })
}

export async function deleteUserTemplate(uid: string, id: string): Promise<void> {
  await deleteDoc(doc(templateCol(uid), id))
}

export function newWorkflow(uid: string): Workflow {
  const now = Date.now()
  return {
    id: `wf_${now}_${Math.random().toString(36).slice(2, 8)}`,
    schemaVersion: CURRENT_SCHEMA_VERSION,
    name: 'Untitled workflow',
    description: '',
    ownerId: uid,
    createdAt: now,
    updatedAt: now,
    nodes: [],
    edges: [],
  }
}
