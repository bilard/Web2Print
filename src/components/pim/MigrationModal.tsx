// src/components/pim/MigrationModal.tsx
import { useState } from 'react'
import { collection, getDocs, query, where, doc, updateDoc } from 'firebase/firestore'
import { db, auth } from '@/lib/firebase/config'
import { migrateLegacyBdd } from '@/features/pim/migration/migrateLegacyBdd'
import { saveProjectHeader, saveProducts } from '@/features/pim/usePimFirebase'
import { Loader2, CheckCircle2, AlertTriangle, X } from 'lucide-react'
import { toast } from 'sonner'

interface Props { open: boolean; onClose: () => void }

interface DryRunRow {
  docId: string
  fileName: string
  sheets: number
  productsAfter: number
  needsDedup: number
}

export function MigrationModal({ open, onClose }: Props) {
  const [phase, setPhase] = useState<'idle' | 'dry-run' | 'preview' | 'running' | 'done'>('idle')
  const [rows, setRows] = useState<DryRunRow[]>([])
  const [error, setError] = useState<string | null>(null)

  if (!open) return null

  const runDryRun = async () => {
    setPhase('dry-run')
    setError(null)
    try {
      const user = auth.currentUser
      if (!user) throw new Error('Non authentifié')
      const q = query(collection(db, 'excel_data'), where('userId', '==', user.uid))
      const snap = await getDocs(q)
      const now = Date.now()
      const out: DryRunRow[] = []
      for (const d of snap.docs) {
        const data = d.data()
        if (data.migratedTo) continue
        const sheets = JSON.parse(data.sheets ?? '[]')
        const result = migrateLegacyBdd(
          { docId: d.id, fileName: data.fileName ?? 'Sans nom', path: data.path ?? [], sheets },
          { now },
        )
        out.push({
          docId: d.id,
          fileName: data.fileName ?? 'Sans nom',
          sheets: sheets.length,
          productsAfter: result.products.length,
          needsDedup: result.stats.needsDedup,
        })
      }
      setRows(out)
      setPhase('preview')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setPhase('idle')
    }
  }

  const runMigration = async () => {
    setPhase('running')
    try {
      const user = auth.currentUser
      if (!user) throw new Error('Non authentifié')
      const now = Date.now()
      for (const r of rows) {
        const ref = doc(db, 'excel_data', r.docId)
        const snap = await getDocs(query(collection(db, 'excel_data'), where('userId', '==', user.uid)))
        const legacyData = snap.docs.find((d) => d.id === r.docId)?.data()
        if (!legacyData) continue
        const sheets = JSON.parse(legacyData.sheets ?? '[]')
        const result = migrateLegacyBdd(
          { docId: r.docId, fileName: legacyData.fileName, path: legacyData.path ?? [], sheets },
          { now },
        )
        await saveProjectHeader(result.project)
        await saveProducts(r.docId, result.products)
        await updateDoc(ref, { migratedTo: r.docId, migratedAt: now })
      }
      setPhase('done')
      toast.success(`${rows.length} BDD migrées vers le PIM`)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setPhase('preview')
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
      <div className="bg-[#1a1a1a] border border-white/10 rounded-lg w-full max-w-2xl max-h-[80vh] flex flex-col">
        <header className="px-4 py-3 border-b border-white/10 flex items-center justify-between">
          <h2 className="text-sm font-medium text-white/85">Migrer mes BDD vers le PIM</h2>
          <button onClick={onClose} className="p-1 hover:bg-white/10 rounded text-white/40 hover:text-white/70">
            <X className="w-4 h-4" />
          </button>
        </header>

        <div className="px-4 py-4 overflow-y-auto flex-1">
          {phase === 'idle' && (
            <>
              <p className="text-[12px] text-white/60 mb-3">
                Cette opération convertit toutes vos bases existantes en projets PIM avec produits master.
                Les données legacy ne sont <strong>pas supprimées</strong> ; elles sont marquées <code>migratedTo</code>.
              </p>
              <button
                onClick={runDryRun}
                className="px-3 py-1.5 bg-indigo-500 hover:bg-indigo-600 rounded-md text-[12px] text-white"
              >
                Lancer le dry-run
              </button>
            </>
          )}

          {phase === 'dry-run' && (
            <p className="flex items-center gap-2 text-white/60"><Loader2 className="w-4 h-4 animate-spin" /> Analyse en cours…</p>
          )}

          {phase === 'preview' && (
            <>
              <table className="w-full text-[12px] text-white/70">
                <thead className="text-[10px] uppercase text-white/30">
                  <tr><th className="text-left py-1">Nom</th><th>Sheets</th><th>Produits</th><th>À dédup</th></tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.docId} className="border-t border-white/5">
                      <td className="py-1">{r.fileName}</td>
                      <td className="text-center">{r.sheets}</td>
                      <td className="text-center">{r.productsAfter}</td>
                      <td className="text-center text-amber-400/80">{r.needsDedup || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {rows.length === 0 && <p className="text-white/40 text-[12px]">Aucune BDD à migrer.</p>}
              {rows.length > 0 && (
                <button
                  onClick={runMigration}
                  className="mt-4 px-3 py-1.5 bg-emerald-500 hover:bg-emerald-600 rounded-md text-[12px] text-white"
                >
                  Confirmer la migration
                </button>
              )}
            </>
          )}

          {phase === 'running' && (
            <p className="flex items-center gap-2 text-white/60"><Loader2 className="w-4 h-4 animate-spin" /> Écriture en cours…</p>
          )}

          {phase === 'done' && (
            <p className="flex items-center gap-2 text-emerald-400"><CheckCircle2 className="w-4 h-4" /> Migration terminée.</p>
          )}

          {error && (
            <p className="mt-3 flex items-start gap-2 text-red-400 text-[12px]">
              <AlertTriangle className="w-4 h-4 shrink-0" /> {error}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
