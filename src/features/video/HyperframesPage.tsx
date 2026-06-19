import { useState } from 'react'
import { FileCode2, Sparkles } from 'lucide-react'
import { VideoModal } from './VideoModal'
import { UserAnimationsList } from './UserAnimationsList'
import { useModuleIntent } from '@/features/navigation/useModuleIntent'

interface Props {
  embedded?: boolean
}

export function HyperframesPage({ embedded = false }: Props) {
  const [open, setOpen] = useState(false)

  useModuleIntent('hyperframes', (action) => {
    if (action === 'action:generate') setOpen(true)
    else if (action === 'action:list')
      document.querySelector<HTMLElement>('[data-hf-section="list"]')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  })

  return (
    <div className={`flex flex-col h-full ${embedded ? '' : 'min-h-screen bg-background'}`}>
      <header className="flex items-center justify-between px-6 py-4 border-b border-white/10 bg-background">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-fuchsia-500/15 border border-fuchsia-500/30 flex items-center justify-center">
            <FileCode2 className="w-4 h-4 text-fuchsia-300" />
          </div>
          <div>
            <h1 className="text-base font-semibold text-white tracking-tight">Animations HTML</h1>
            <p className="text-[11px] text-white/40">
              Génère une animation HTML/CSS/JS à partir de la page éditeur courante — livraison ≈ 5 s, ZIP prêt à ouvrir.
            </p>
          </div>
        </div>
        <button
          onClick={() => setOpen(true)}
          className="flex items-center gap-2 bg-indigo-500 hover:bg-indigo-600 text-[#fff] text-sm font-medium px-3.5 py-2 rounded-lg transition-colors"
        >
          <Sparkles className="w-3.5 h-3.5" />
          Générer une animation
        </button>
      </header>

      <div data-hf-section="list">
        <UserAnimationsList />
      </div>

      {open && <VideoModal source="standalone" onClose={() => setOpen(false)} />}
    </div>
  )
}
