// Action « Détourer toutes les images » — proposée sur le bloc IMAGE du panneau
// « Bloc sélectionné » : c'est là qu'on règle le visuel produit, donc là qu'on
// s'attend à pouvoir le détourer. Traitement en lot, interruptible.
import { Loader2, Scissors, Undo2, X } from 'lucide-react'
import { useCatalogCutout } from '../../useCatalogCutout'
import { t } from '@/lib/i18n'

export function CutoutAllImagesButton() {
  const { progress, cutoutAll, cancel, resetAll } = useCatalogCutout()
  const running = progress != null
  const pct = progress && progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0

  return (
    <div className="space-y-1.5 pt-1 border-t border-white/10">
      <div className="flex items-center gap-1.5">
        <button type="button" onClick={() => void cutoutAll()} disabled={running}
          title={t('cat.cutout.run')}
          className="flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-md bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-[#fff] text-[11px] font-medium">
          {running ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Scissors className="w-3.5 h-3.5" />}
          {running ? `Détourage… ${progress.done}/${progress.total}` : 'Détourer toutes les images'}
        </button>
        {running ? (
          <button type="button" onClick={cancel} title={t('cat.cutout.cancel')}
            className="p-1.5 rounded-md text-white/40 hover:text-white hover:bg-well">
            <X className="w-3.5 h-3.5" />
          </button>
        ) : (
          <button type="button" onClick={resetAll}
            title={t('cat.cutout.restore')}
            className="flex items-center gap-1 px-2 py-1.5 rounded-md border border-border bg-well text-[11px] text-white/70 hover:text-white hover:border-indigo-500">
            <Undo2 className="w-3.5 h-3.5" /> Repartir de zéro
          </button>
        )}
      </div>
      {running && (
        <div className="h-1 rounded-full bg-well overflow-hidden">
          <div className="h-full bg-indigo-500 transition-[width]" style={{ width: `${pct}%` }} />
        </div>
      )}
      <p className="text-[10px] text-white/35 leading-snug">
        {t('cat.cutout.hint')}
      </p>
    </div>
  )
}
