// Étape 5 du wizard « Catalogue studio » : export PDF écran (léger, aperçu web) ou
// print pro (DPI + fond perdu + traits de coupe). Barre de progression pendant l'export.
import { useState } from 'react'
import { Download, Loader2 } from 'lucide-react'
import { useCatalogStore } from '@/stores/catalog.store'
import { useCatalogPages } from '../../useCatalogPages'
import { useCatalogExport } from '../../useCatalogExport'
import { t } from '@/lib/i18n'

function slug(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'catalogue'
}

const cardClass = 'rounded-lg border border-border bg-surface p-5 space-y-3'
const inputClass = 'px-3 py-1.5 rounded-md bg-surface-2 text-sm text-white outline-none focus:ring-1 focus:ring-indigo-600'
const buttonClass = 'flex items-center gap-2 px-4 py-2 rounded-md bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed text-[#fff] text-sm font-medium'

export function StepExport() {
  const name = useCatalogStore((s) => s.name)
  const { pages, ctx } = useCatalogPages()
  const { exporting, progress, exportPdf } = useCatalogExport()
  const [fileName, setFileName] = useState(() => `${slug(name)}.pdf`)
  const [dpi, setDpi] = useState<150 | 300>(300)
  const [bleedMm, setBleedMm] = useState(3)

  const disabled = exporting || pages.length === 0 || !ctx

  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="max-w-2xl mx-auto space-y-5">
        <p className="text-sm text-muted-foreground">
          {pages.length === 0 ? 'Aucune page à exporter — vérifiez la sélection et la structure.' : `${pages.length} page${pages.length > 1 ? 's' : ''} prête${pages.length > 1 ? 's' : ''} à exporter.`}
        </p>

        <div className="space-y-1.5">
          <label className="block text-xs font-medium text-muted-foreground">Nom du fichier</label>
          <input value={fileName} onChange={(e) => setFileName(e.target.value)} className={`${inputClass} w-full`} />
        </div>

        <div className={cardClass}>
          <h3 className="text-sm font-semibold text-white">{t('cat.export.screenPdf')}</h3>
          <p className="text-xs text-muted-foreground">Fichier léger (150 dpi), sans fond perdu ni traits de coupe — pour partage ou aperçu web.</p>
          <button
            onClick={() => void exportPdf(pages, ctx!, { mode: 'screen', dpi: 150, bleedMm: 0, fileName })}
            disabled={disabled}
            className={buttonClass}
          >
            {exporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
            Exporter en PDF écran
          </button>
        </div>

        <div className={cardClass}>
          <h3 className="text-sm font-semibold text-white">PDF print pro</h3>
          <div className="flex items-center gap-6">
            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-muted-foreground">{t('cat.export.resolution')}</label>
              <select value={dpi} onChange={(e) => setDpi(Number(e.target.value) as 150 | 300)} className={inputClass}>
                <option value={150}>150 dpi</option>
                <option value={300}>300 dpi</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-muted-foreground">Fond perdu (mm)</label>
              <input
                type="number"
                min={0}
                step={0.5}
                value={bleedMm}
                onChange={(e) => setBleedMm(Number(e.target.value))}
                className={`${inputClass} w-24`}
              />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">Des traits de coupe sont ajoutés aux 4 coins de chaque page dès que le fond perdu dépasse 1 mm.</p>
          <button
            onClick={() => void exportPdf(pages, ctx!, { mode: 'print', dpi, bleedMm, fileName })}
            disabled={disabled}
            className={buttonClass}
          >
            {exporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
            Exporter en PDF print pro
          </button>
        </div>

        {exporting && (
          <div className="space-y-1.5">
            <div className="h-2 rounded-full bg-surface-2 overflow-hidden">
              <div className="h-full bg-indigo-600 transition-[width]" style={{ width: `${progress}%` }} />
            </div>
            <p className="text-xs text-muted-foreground tabular-nums">{progress}%</p>
          </div>
        )}
      </div>
    </div>
  )
}
