// Conteneur du wizard « Démo express » : formulaire (société + URL) →
// progression du pipeline d'ensemencement → panneau « Découvrez vos données ».
import { Sparkles } from 'lucide-react'
import { useDemoExpressStore } from '@/stores/demoExpress.store'
import { useModuleIntent } from '@/features/navigation/useModuleIntent'
import { useDemoExpress } from './useDemoExpress'
import { DemoExpressForm } from './components/DemoExpressForm'
import { DemoExpressProgress } from './components/DemoExpressProgress'
import { DemoExpressResult } from './components/DemoExpressResult'
import { t } from '@/lib/i18n'

export function DemoExpressPage() {
  const phase = useDemoExpressStore((s) => s.phase)
  const company = useDemoExpressStore((s) => s.company)
  const reset = useDemoExpressStore((s) => s.reset)
  const { run } = useDemoExpress()

  const setFormVolume = useDemoExpressStore((s) => s.setFormVolume)
  useModuleIntent('demo-express', (action) => {
    if (action === 'action:new') reset()
    // « Scraper N produits » (menu) : nouveau formulaire avec la volumétrie préremplie.
    const m = /^action:new:(\d+)$/.exec(action)
    if (m) {
      reset()
      setFormVolume(Number(m[1]))
    }
  })

  return (
    <div className="h-full overflow-auto bg-background">
      <div className="max-w-screen-2xl mx-auto px-8 py-10">
        <header className="sticky top-0 z-30 -mx-8 px-8 pt-8 pb-4 mb-4 bg-background border-b border-white/[0.06]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-lime-500/[0.12] flex items-center justify-center">
              <Sparkles className="w-5 h-5 text-lime-400" aria-hidden="true" />
            </div>
            <div>
              <h1 className="text-xl font-semibold text-white">{t('de.title')}</h1>
              <p className="text-sm text-white/50">
                {phase === 'form'
                  ? t('de.pageLead')
                  : t('de.pageFor', { company })}
              </p>
            </div>
          </div>
        </header>

        {phase === 'form' && <DemoExpressForm onLaunch={run} />}
        {phase !== 'form' && <DemoExpressProgress />}
        {phase === 'done' && <DemoExpressResult />}
      </div>
    </div>
  )
}
