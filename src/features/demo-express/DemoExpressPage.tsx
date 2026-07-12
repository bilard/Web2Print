// src/features/demo-express/DemoExpressPage.tsx
// Conteneur du wizard « Démo express » : formulaire (société + URL) →
// progression du pipeline d'ensemencement → panneau « Découvrez vos données ».
import { Sparkles } from 'lucide-react'
import { useDemoExpressStore } from '@/stores/demoExpress.store'
import { useModuleIntent } from '@/features/navigation/useModuleIntent'
import { useDemoExpress } from './useDemoExpress'
import { DemoExpressForm } from './components/DemoExpressForm'
import { DemoExpressProgress } from './components/DemoExpressProgress'
import { DemoExpressResult } from './components/DemoExpressResult'

export function DemoExpressPage() {
  const phase = useDemoExpressStore((s) => s.phase)
  const company = useDemoExpressStore((s) => s.company)
  const reset = useDemoExpressStore((s) => s.reset)
  const { run } = useDemoExpress()

  useModuleIntent('demo-express', (action) => {
    if (action === 'action:new') reset()
  })

  return (
    <div className="h-full overflow-auto bg-background">
      <div className="max-w-6xl mx-auto px-6 py-10">
        <header className="mb-8">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-lime-500/[0.12] flex items-center justify-center">
              <Sparkles className="w-5 h-5 text-lime-400" aria-hidden="true" />
            </div>
            <div>
              <h1 className="text-xl font-semibold text-white">Démo express</h1>
              <p className="text-sm text-white/50">
                {phase === 'form'
                  ? 'Le studio se remplit tout seul avec les produits et la charte du site d’un prospect.'
                  : `Démonstration pour ${company}`}
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
