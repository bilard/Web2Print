// Les trois formes sous lesquelles un tableau sort d'ici : les CHIFFRES (classeur), l'IMAGE
// (ce qu'on voit), la PAGE (PDF).
//
// ⚠ Un classeur et une image ne servent pas le même besoin : le premier se recalcule, la
// seconde se colle dans une présentation. Les confondre sous un bouton unique obligerait à
// deviner lequel des deux on obtient.
import { useEffect, useRef, useState } from 'react'
import { Download, FileSpreadsheet, Image as ImageIcon, FileText, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { useTranslation } from '@/lib/i18n'

export function BiExportMenu({ onXlsx, onPng, onPdf }: {
  onXlsx: () => void
  onPng: () => Promise<void>
  onPdf: () => Promise<void>
}) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  // ⚠ La capture prend plusieurs secondes sur un grand tableau : sans témoin, on clique
  // trois fois et on lance trois captures concurrentes.
  const [busy, setBusy] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    window.addEventListener('mousedown', onDown)
    return () => window.removeEventListener('mousedown', onDown)
  }, [open])

  const run = async (fn: () => Promise<void>) => {
    setOpen(false)
    setBusy(true)
    try { await fn() } catch (e) {
      // ⚠ Une capture qui échoue en silence laisse croire à un téléchargement bloqué.
      toast.error(e instanceof Error ? e.message : t('bi.export.imageFailed'))
    } finally { setBusy(false) }
  }

  const item = 'w-full flex items-center gap-2 px-3 py-1.5 text-[12px] text-white/75 hover:bg-white/[0.06] hover:text-white text-left'

  return (
    <div ref={ref} className="relative">
      <button
        type="button" onClick={() => setOpen((v) => !v)} disabled={busy}
        title={t('bi.top.exportTitle')}
        className="inline-flex items-center gap-1.5 rounded-lg border border-white/[0.06] bg-well px-2.5 py-1 text-[12px] text-white/70 hover:text-white hover:border-white/15 transition-colors disabled:opacity-50"
      >
        {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
        {t('bi.top.export')}
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 w-56 py-1 rounded-lg border border-white/10 bg-surface-2 shadow-xl z-[60]">
          <button type="button" className={item} onClick={() => { setOpen(false); onXlsx() }}>
            <FileSpreadsheet className="w-3.5 h-3.5 text-white/40" />{t('bi.export.xlsx')}
          </button>
          <button type="button" className={item} onClick={() => void run(onPng)}>
            <ImageIcon className="w-3.5 h-3.5 text-white/40" />{t('bi.export.png')}
          </button>
          <button type="button" className={item} onClick={() => void run(onPdf)}>
            <FileText className="w-3.5 h-3.5 text-white/40" />{t('bi.export.pdf')}
          </button>
        </div>
      )}
    </div>
  )
}
