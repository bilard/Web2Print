// src/features/onboarding/steps/KeysStep.tsx
import { ApiKeyRow } from '@/components/shared/ApiKeyRow'
import { API_KEYS } from '@/lib/apiKeys'
import { LLM_KEY_IDS, RECOMMENDED_KEY_IDS } from '../onboardingKeys'

const KEY_CONFIGS = LLM_KEY_IDS.map((id) => API_KEYS.find((k) => k.id === id)!).filter(Boolean)

export function KeysStep() {
  return (
    <div className="flex flex-col gap-3">
      <div>
        <h3 className="text-base font-semibold text-white">Vos clés IA</h3>
        <p className="text-xs text-white/50 mt-0.5">
          IBS-Studio fonctionne avec votre propre clé LLM. Renseignez-en <span className="text-white/70 font-medium">au moins une</span> pour continuer.
        </p>
      </div>
      <div className="flex flex-col gap-2">
        {KEY_CONFIGS.map((cfg) => (
          <div key={cfg.id} className="relative">
            {RECOMMENDED_KEY_IDS.has(cfg.id) && (
              <span className="absolute -top-1.5 right-2 z-10 text-[9px] px-1.5 py-0.5 rounded bg-indigo-500/25 text-indigo-200 border border-indigo-500/30">
                recommandé
              </span>
            )}
            <ApiKeyRow id={cfg.id} label={cfg.label} description={cfg.description} placeholder="Collez votre clé API…" />
          </div>
        ))}
      </div>
    </div>
  )
}
