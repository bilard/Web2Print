// API HTTP lecture seule pour le plugin InDesign. Auth = token personnel
// (Bearer w2p_…). On ne stocke que le hash du token (doc-id de pluginTokens).
import { onRequest } from 'firebase-functions/v2/https'
import { initializeApp, getApps } from 'firebase-admin/app'
import { getFirestore, FieldValue } from 'firebase-admin/firestore'
import {
  hashToken, parseRoute, projectDataset, firstSheetColumns, projectRow, type Sheet,
} from './pluginApiCore'

if (!getApps().length) initializeApp()

function bearer(req: { header(n: string): string | undefined }): string | null {
  const h = req.header('Authorization') ?? ''
  const m = h.match(/^Bearer\s+(.+)$/i)
  return m ? m[1].trim() : null
}

async function loadSheets(db: FirebaseFirestore.Firestore, uid: string, docId: string): Promise<Sheet[] | null> {
  const meta = await db.doc(`excel_data/${docId}`).get()
  if (!meta.exists || meta.data()?.userId !== uid) return null // garde-fou propriété
  const inline = meta.data()?.sheets
  if (typeof inline === 'string') return JSON.parse(inline) as Sheet[]
  const payload = await db.doc(`excel_data_payload/${docId}`).get()
  if (!payload.exists) return null
  return JSON.parse(payload.data()?.json ?? '[]') as Sheet[]
}

export const pluginApi = onRequest(
  { region: 'europe-west1', timeoutSeconds: 30, memory: '256MiB', maxInstances: 5, cors: true },
  async (req, res) => {
    if (req.method !== 'GET') { res.status(405).json({ error: 'GET attendu' }); return }

    const token = bearer(req)
    if (!token) { res.status(401).json({ error: 'Token manquant' }); return }

    const db = getFirestore()
    const tokRef = db.doc(`pluginTokens/${hashToken(token)}`)
    const tok = await tokRef.get()
    const data = tok.data()
    if (!tok.exists || !data?.uid || data.revoked === true) {
      res.status(401).json({ error: 'Token invalide ou révoqué' }); return
    }
    const uid = data.uid as string
    // best-effort, ne bloque pas la réponse
    tokRef.update({ lastUsedAt: FieldValue.serverTimestamp() }).catch(() => {})

    const route = parseRoute(req.path)
    try {
      if (route.kind === 'list') {
        const snap = await db.collection('excel_data').where('userId', '==', uid).get()
        const datasets = snap.docs.map((d) => projectDataset(d.id, d.data()))
        res.status(200).json({ datasets }); return
      }
      if (route.kind === 'columns') {
        const sheets = await loadSheets(db, uid, route.docId)
        if (!sheets) { res.status(404).json({ error: 'Dataset introuvable' }); return }
        res.status(200).json({ columns: firstSheetColumns(sheets) }); return
      }
      if (route.kind === 'row') {
        const sheets = await loadSheets(db, uid, route.docId)
        if (!sheets) { res.status(404).json({ error: 'Dataset introuvable' }); return }
        const i = Number.parseInt(String(req.query.i ?? '0'), 10) || 0
        res.status(200).json(projectRow(sheets, i)); return
      }
      res.status(404).json({ error: 'Route inconnue' })
    } catch (err) {
      console.error('pluginApi: erreur', { path: req.path, err })
      res.status(500).json({ error: 'Erreur interne' })
    }
  },
)
