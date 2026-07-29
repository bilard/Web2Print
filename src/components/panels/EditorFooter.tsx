import { ZoomIn, ZoomOut, Grid3X3, Magnet, Settings2, Link2 } from 'lucide-react'
import { useUIStore } from '@/stores/ui.store'
import { canvasPxToMm } from '@/features/print/dimensions'
import { PagesBar } from './PagesBar'
import { ModuleNavDrawer } from '@/features/navigation/ModuleNavDrawer'
import { NotificationBell } from '@/features/navigation/NotificationBell'
import { useTranslation } from '@/lib/i18n'

export function EditorFooter() {
  const { t } = useTranslation()
  const {
    zoom, setZoom, gridVisible, setGridVisible, snapEnabled, setSnapEnabled,
    canvasWidth, canvasHeight,
    rightPanels, setRightPanels, setRightPanelOpen,
    showMergeBadges, setShowMergeBadges,
  } = useUIStore()

  const openPagePanel = () => {
    setRightPanelOpen(true)
    setRightPanels(
      rightPanels.map((p) => (p.id === 'page' ? { ...p, collapsed: false } : p)),
    )
  }

  const divider = <div className="w-px h-5 bg-white/10 shrink-0" />

  return (
    <footer data-tour="footer" className="shrink-0 bg-surface border-t border-white/10 z-20">
      <div className="h-11 flex items-center gap-2.5 px-3">
        {/* Menus (intégrés ici sur l'éditeur ; FAB flottants ailleurs) */}
        <div data-tour="editor-nav" className="flex items-center gap-0.5 shrink-0">
          <ModuleNavDrawer variant="inline" />
          <NotificationBell variant="inline" />
        </div>

        {divider}

        {/* Vignettes des pages — défilent dans l'espace central */}
        <div className="flex-1 min-w-0">
          <PagesBar />
        </div>

        {divider}

        {/* Contrôles — zoom + dimensions + grille/snap (icônes) */}
        <div className="flex items-center gap-1.5 shrink-0">
          <div className="flex items-center">
            <button data-help-id="editor-footer.zoom-out"
              onClick={() => setZoom(zoom - Math.max(1, Math.round(zoom * 0.1)))}
              title={t('editor.zoomOut')}
              className="p-1 rounded text-white/30 hover:text-white hover:bg-white/10 transition-colors">
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            <button data-help-id="editor-footer.zoom-reset"
              onClick={() => setZoom(100)}
              title={t('editor.zoomReset')}
              className="text-xs text-white/50 hover:text-white w-11 text-center font-mono hover:bg-white/5 rounded py-0.5 transition-colors">
              {zoom}%
            </button>
            <button data-help-id="editor-footer.zoom-in"
              onClick={() => setZoom(zoom + Math.max(1, Math.round(zoom * 0.1)))}
              title={t('editor.zoomIn')}
              className="p-1 rounded text-white/30 hover:text-white hover:bg-white/10 transition-colors">
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Dimensions de la page — ouvre le panel PAGE dans le sidebar */}
          <button data-help-id="editor-footer.page-settings"
            onClick={openPagePanel}
            className="flex items-center gap-1.5 text-xs font-mono px-2 py-1 rounded transition-colors text-white/30 hover:text-white hover:bg-white/10"
            title={t('editor.pageSettings')}>
            <Settings2 className="w-3 h-3" />
            {Math.round(canvasPxToMm(canvasWidth))}×{Math.round(canvasPxToMm(canvasHeight))} mm
          </button>

          <button data-help-id="editor-footer.grid"
            onClick={() => setGridVisible(!gridVisible)}
            title={t('editor.grid')}
            aria-pressed={gridVisible}
            className={`p-1 rounded transition-colors ${gridVisible ? 'text-indigo-400 bg-indigo-500/10' : 'text-white/30 hover:text-white hover:bg-white/10'}`}>
            <Grid3X3 className="w-3.5 h-3.5" />
          </button>

          <button data-help-id="editor-footer.snap"
            onClick={() => setSnapEnabled(!snapEnabled)}
            title={t('editor.snap')}
            aria-pressed={snapEnabled}
            className={`p-1 rounded transition-colors ${snapEnabled ? 'text-indigo-400 bg-indigo-500/10' : 'text-white/30 hover:text-white hover:bg-white/10'}`}>
            <Magnet className="w-3.5 h-3.5" />
          </button>

          <button
            onClick={() => setShowMergeBadges(!showMergeBadges)}
            title={t('editor.idmlConnectors')}
            aria-pressed={showMergeBadges}
            className={`p-1 rounded transition-colors ${showMergeBadges ? 'text-indigo-400 bg-indigo-500/10' : 'text-white/30 hover:text-white hover:bg-white/10'}`}
          >
            <Link2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </footer>
  )
}
