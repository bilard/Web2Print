// Popup « source modifiée » : liste les PUBLICATIONS reliées à la base ouverte.
// Catalogues = toujours à jour (relecture auto à l'ouverture) : ils n'ouvrent JAMAIS
// le popup à eux seuls — sans fiche promo à rafraîchir, il n'y a rien à décider.
// Fiches promo = instantanés → cases à cocher + mise à jour explicite par canal.
// S'il n'y a AUCUNE publication reliée, le popup se ferme sans s'afficher.
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { BookOpen, CheckCircle2, DatabaseZap, Loader2, Tag } from 'lucide-react'
import { toast } from 'sonner'
import { CloseButton } from '@/components/shared/CloseButton'
import { listLinkedPublications, refreshPromos, type LinkedPublications, type SourceIdent } from './linkedPublications'
import { t } from '@/lib/i18n'

interface Props {
  ident: SourceIdent
  open: boolean
  onClose: () => void
}

export function SourceSyncModal({ ident, open, onClose }: Props) {
  const [pubs, setPubs] = useState<LinkedPublications | null>(null)
  const [checked, setChecked] = useState<Set<string>>(new Set())
  const [running, setRunning] = useState(false)

  useEffect(() => {
    if (!open) { setPubs(null); return }
    let cancelled = false
    void listLinkedPublications(ident).then((p) => {
      if (cancelled) return
      if (p.catalogs.length === 0 && p.promos.length === 0) { onClose(); return } // rien de relié
      setPubs(p)
      setChecked(new Set(p.promos.map((x) => x.id))) // tout coché par défaut
    }).catch(() => onClose())
    return () => { cancelled = true }
  }, [open])

  // AUCUNE décision à prendre = AUCUNE interruption. Les catalogues lisent la
  // source EN DIRECT ; seules les fiches promo sont des instantanés à
  // rafraîchir. Sans promo reliée, il n'y a rien à demander ni même à
  // annoncer : signaler « tout va bien » interromprait tout autant.
  useEffect(() => {
    if (!open || !pubs || pubs.promos.length > 0) return
    onClose()
  }, [open, pubs, onClose])

  if (!open || !pubs || pubs.promos.length === 0) return null

  const toggle = (id: string) => setChecked((s) => {
    const next = new Set(s)
    if (next.has(id)) next.delete(id); else next.add(id)
    return next
  })

  const run = async () => {
    setRunning(true)
    try {
      await refreshPromos(ident, [...checked])
      toast.success(`${checked.size} fiche(s) mise(s) à jour depuis la source`)
      onClose()
    } catch (e) {
      toast.error(String((e as Error).message))
    } finally { setRunning(false) }
  }

  return createPortal(
    <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="w-[520px] max-w-[95vw] bg-background border border-white/10 rounded-xl shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <header className="flex items-center justify-between px-5 py-4 border-b border-white/[0.06]">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-indigo-500/10 flex items-center justify-center"><DatabaseZap className="w-5 h-5 text-indigo-400" /></div>
            <div>
              <p className="text-sm font-medium text-white">{t('pi.sourceChanged')}</p>
              <p className="text-[11px] text-white/40">{t('pi.pickChannels')}</p>
            </div>
          </div>
          <CloseButton onClick={onClose} title="Plus tard" />
        </header>

        <div className="p-5 flex flex-col gap-4 max-h-[60vh] overflow-y-auto">
          {pubs.catalogs.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-white/40">Catalogues</p>
              {pubs.catalogs.map((c) => (
                <div key={c.id} className="flex items-center gap-2.5 rounded-lg bg-white/[0.03] px-3 py-2">
                  <BookOpen className="w-4 h-4 text-indigo-300 shrink-0" />
                  <span className="text-sm text-white truncate flex-1">{c.name}</span>
                  <span className="flex items-center gap-1 text-[11px] text-emerald-400 shrink-0">
                    <CheckCircle2 className="w-3.5 h-3.5" /> à jour automatiquement
                  </span>
                </div>
              ))}
            </div>
          )}

          {pubs.promos.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-white/40">{t('pi.promoCards')}</p>
              {pubs.promos.map((p) => (
                <label key={p.id} className="flex items-center gap-2.5 rounded-lg bg-white/[0.03] px-3 py-2 cursor-pointer hover:bg-white/[0.06]">
                  <input type="checkbox" checked={checked.has(p.id)} onChange={() => toggle(p.id)} className="accent-indigo-600 w-4 h-4" />
                  <Tag className="w-4 h-4 text-fuchsia-300 shrink-0" />
                  <span className="text-sm text-white truncate">{p.name}</span>
                </label>
              ))}
              <p className="text-[10px] text-white/30 leading-relaxed">{t('pi.customKept')}</p>
            </div>
          )}
        </div>

        <footer className="flex items-center justify-end gap-2 px-5 py-4 border-t border-white/[0.06]">
          <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm text-white/60 hover:text-white hover:bg-white/5">Plus tard</button>
          {pubs.promos.length > 0 && (
            <button onClick={() => void run()} disabled={running || checked.size === 0}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-[#fff] text-sm font-medium">
              {running ? <Loader2 className="w-4 h-4 animate-spin" /> : <DatabaseZap className="w-4 h-4" />}
              Mettre à jour {checked.size > 0 ? `(${checked.size})` : ''}
            </button>
          )}
        </footer>
      </div>
    </div>,
    document.body,
  )
}
