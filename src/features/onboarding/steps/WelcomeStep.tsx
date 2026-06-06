// src/features/onboarding/steps/WelcomeStep.tsx
import { Sparkles, KeyRound, Cpu, Plug, Compass } from 'lucide-react'

const ITEMS = [
  { icon: KeyRound, label: 'Clés IA', desc: 'Au moins une clé LLM pour faire fonctionner l\'app' },
  { icon: Cpu, label: 'Modèles & cascade', desc: 'Ordre des providers de raisonnement' },
  { icon: Plug, label: 'Connecteurs', desc: 'Google Drive, Telegram, Bright Data' },
  { icon: Compass, label: 'Visite guidée', desc: 'Découvrir l\'interface pas à pas' },
]

export function WelcomeStep() {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-indigo-500/30 to-fuchsia-500/20 flex items-center justify-center shrink-0">
          <Sparkles className="w-6 h-6 text-indigo-300" />
        </div>
        <div>
          <h3 className="text-lg font-semibold text-white">Bienvenue sur IBS-Studio</h3>
          <p className="text-xs text-white/50">Configurons votre espace en quelques étapes. Vous pourrez tout modifier plus tard dans les Réglages.</p>
        </div>
      </div>
      <div className="flex flex-col gap-2">
        {ITEMS.map(({ icon: Icon, label, desc }) => (
          <div key={label} className="flex items-center gap-3 bg-white/[0.03] rounded-xl p-3">
            <Icon className="w-4 h-4 text-indigo-300 shrink-0" />
            <div className="min-w-0">
              <p className="text-xs font-medium text-white/80">{label}</p>
              <p className="text-[11px] text-white/40">{desc}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
