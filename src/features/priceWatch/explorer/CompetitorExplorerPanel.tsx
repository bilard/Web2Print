// Écran « Concurrents » du PIM : choix du suivi de veille, puis exploration site par
// site. Volontairement plein cadre (comme la fiche produit) — la comparaison visuelle
// F1 ↔ concurrent a besoin de largeur.
import { useEffect, useState } from 'react'
import { X, Store, Maximize2, Minimize2 } from 'lucide-react'
import { useWatchList } from '../useCatalogReport'
import { WatchSelector } from '../dashboard/WatchSelector'
import { CompetitorExplorer } from './CompetitorExplorer'
import { useTranslation } from '@/lib/i18n'

export function CompetitorExplorerPanel({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation()
  const watches = useWatchList()
  const [watchId, setWatchId] = useState<string | null>(null)
  // Plein écran APPLICATIF (overlay), pas l'API Fullscreen du navigateur : celle-ci
  // masque aussi la barre d'onglets du navigateur et se quitte par un raccourci que
  // l'utilisateur ne devine pas. Ici, Échap suffit et le bouton reste visible.
  const [full, setFull] = useState(false)
  useEffect(() => {
    if (!full) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setFull(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [full])

  // Défaut = le suivi le plus récemment mis à jour (useWatchList trie déjà), et on ne
  // bascule que si le choix courant a disparu.
  useEffect(() => {
    if (watches.length === 0) { setWatchId(null); return }
    if (!watchId || !watches.some((w) => w.watchId === watchId)) setWatchId(watches[0].watchId)
  }, [watches, watchId])

  return (
    <div className={full
      ? 'fixed inset-0 z-50 bg-background flex flex-col overflow-hidden'
      : 'flex-1 min-w-0 bg-well flex flex-col overflow-hidden'}>
      <div className="h-11 border-b border-white/10 flex items-center gap-2 px-3 shrink-0">
        <Store className="w-4 h-4 text-white/30" />
        <h2 className="text-[13px] font-medium text-white/70">{t('pwx.concurrentsResultatsDuScraping')}</h2>
        <div className="ml-auto flex items-center gap-2">
          {watches.length > 0 && (
            <WatchSelector watches={watches} value={watchId ?? ''} onChange={setWatchId} />
          )}
          <button type="button" onClick={() => setFull((f) => !f)}
            className="p-1.5 text-white/30 hover:text-white/60 hover:bg-white/[0.06] rounded-md transition-colors"
            title={t(full ? 'pwx.fullscreenExit' : 'pwx.fullscreen')}>
            {full ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>
          <button type="button" onClick={onClose}
            className="p-1.5 text-white/30 hover:text-white/60 hover:bg-white/[0.06] rounded-md transition-colors"
            title={t('pluginToken.close')}>
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Pas de scroll ici : l'explorateur garde son en-tête fixe et ne fait défiler
          que sa liste. Un `overflow-auto` à ce niveau ferait glisser tout l'écran. */}
      <div className="flex-1 min-h-0">
        <CompetitorExplorer watchId={watchId} workflowId={watches.find((w) => w.watchId === watchId)?.workflowId} />
      </div>
    </div>
  )
}
