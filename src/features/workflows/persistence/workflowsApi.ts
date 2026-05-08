// src/features/workflows/persistence/workflowsApi.ts
import { collection, doc, getDocs, getDoc, setDoc, deleteDoc, query, orderBy } from 'firebase/firestore'
import { db } from '@/lib/firebase/config'
import type { Workflow } from '../types'
import { CURRENT_SCHEMA_VERSION, migrate } from './migrations'

const col = (uid: string) => collection(db, 'users', uid, 'workflows')

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
  await setDoc(doc(col(uid), wf.id), next)
}

export async function deleteWorkflow(uid: string, id: string): Promise<void> {
  await deleteDoc(doc(col(uid), id))
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
