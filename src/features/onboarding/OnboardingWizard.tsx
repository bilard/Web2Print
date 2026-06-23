// src/features/onboarding/OnboardingWizard.tsx
import { useEffect } from 'react'
import { ChevronLeft } from 'lucide-react'
import { CloseButton } from '@/components/shared/CloseButton'
import { useAuthStore } from '@/stores/auth.store'
import { useAccessStore } from '@/stores/access.store'
import { areApiKeysHydrated, API_KEYS_HYDRATED_EVENT, API_KEYS_UPDATED_EVENT } from '@/features/settings/useApiKeysSync'
import { hasAnyLlmKey, ONBOARDING_DISMISS_KEY } from './onboardingKeys'
import { shouldAutoOpenOnboarding } from './onboardingGate'
import { useOnboardingStore, ONBOARDING_STEP_COUNT } from './onboarding.store'
import { completeOnboarding } from './completeOnboarding'
import { WelcomeStep } from './steps/WelcomeStep'
import { KeysStep } from './steps/KeysStep'
import { AiStep } from './steps/AiStep'
import { ConnectorsStep } from './steps/ConnectorsStep'
import { FinishStep, startDashboardTour } from './steps/FinishStep'

const STEP_TITLES = ['Bienvenue', 'Clés IA', 'Modèles', 'Connecteurs', 'Terminé']

export function OnboardingWizard() {
  const open = useOnboardingStore((s) => s.open)
  const step = useOnboardingStore((s) => s.step)
  const openWizard = useOnboardingStore((s) => s.openWizard)
  const closeWizard = useOnboardingStore((s) => s.closeWizard)
  const next = useOnboardingStore((s) => s.next)
  const prev = useOnboardingStore((s) => s.prev)
  const accessLoading = useAccessStore((s) => s.loading)
  const onboardingComplete = useAccessStore((s) => s.onboardingComplete)
  const setOnboardingComplete = useAccessStore((s) => s.setOnboardingComplete)
  const uid = useAuthStore((s) => s.user?.uid)

  // Auto-ouverture : réévalue à l'hydratation des clés / changement d'accès.
  useEffect(() => {
    const evaluate = () => {
      const dismissed = sessionStorage.getItem(ONBOARDING_DISMISS_KEY) === '1'
      if (shouldAutoOpenOnboarding({
        hydrated: areApiKeysHydrated(),
        accessLoading,
        onboardingComplete,
        hasLlmKey: hasAnyLlmKey(),
        dismissedThisSession: dismissed,
      })) {
        openWizard()
      }
    }
    evaluate()
    window.addEventListener(API_KEYS_HYDRATED_EVENT, evaluate)
    window.addEventListener(API_KEYS_UPDATED_EVENT, evaluate)
    return () => {
      window.removeEventListener(API_KEYS_HYDRATED_EVENT, evaluate)
      window.removeEventListener(API_KEYS_UPDATED_EVENT, evaluate)
    }
  }, [accessLoading, onboardingComplete, openWizard])

  if (!open) return null

  const isLast = step === ONBOARDING_STEP_COUNT - 1
  const keyReady = hasAnyLlmKey()
  // Étape 1 (Clés, index 1) bloque la progression tant qu'aucune clé n'existe.
  const nextDisabled = step === 1 && !keyReady

  const dismiss = () => {
    sessionStorage.setItem(ONBOARDING_DISMISS_KEY, '1')
    closeWizard()
  }

  const finish = async () => {
    if (uid) {
      await completeOnboarding(uid)
      setOnboardingComplete(true)
    }
    closeWizard()
  }

  const launchTour = async () => {
    await finish()
    startDashboardTour()
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4" role="dialog" aria-modal="true">
      <div className="w-full max-w-lg max-h-[88vh] flex flex-col bg-surface border border-white/10 rounded-2xl shadow-2xl overflow-hidden">
        {/* En-tête : progression + fermer */}
        <div className="p-4 border-b border-white/[0.06] flex items-center gap-3">
          <div className="flex-1 flex items-center gap-1.5">
            {STEP_TITLES.map((t, i) => (
              <div key={t} className="flex items-center gap-1.5">
                <span className={`w-6 h-6 rounded-full text-[10px] font-semibold flex items-center justify-center transition-colors ${
                  i === step ? 'bg-indigo-500 text-[#fff]' : i < step ? 'bg-indigo-500/30 text-indigo-200' : 'bg-white/5 text-white/30'
                }`}>{i + 1}</span>
                {i < STEP_TITLES.length - 1 && <span className={`w-4 h-px ${i < step ? 'bg-indigo-500/40' : 'bg-white/10'}`} />}
              </div>
            ))}
          </div>
          <CloseButton onClick={dismiss} title="Plus tard" className="shrink-0" />
        </div>

        {/* Contenu de l'étape */}
        <div className="flex-1 overflow-y-auto p-5">
          {step === 0 && <WelcomeStep />}
          {step === 1 && <KeysStep />}
          {step === 2 && <AiStep />}
          {step === 3 && <ConnectorsStep />}
          {step === 4 && <FinishStep onLaunchTour={launchTour} />}
        </div>

        {/* Pied : nav */}
        <div className="p-4 border-t border-white/[0.06] flex items-center justify-between gap-3">
          <button
            onClick={prev}
            disabled={step === 0}
            className="flex items-center gap-1 text-xs text-white/50 hover:text-white/80 disabled:opacity-30 disabled:cursor-not-allowed px-2 py-2 rounded-lg transition-colors"
          >
            <ChevronLeft className="w-3.5 h-3.5" /> Précédent
          </button>
          <div className="flex items-center gap-2">
            {!isLast && step >= 2 && (
              <button onClick={next} className="text-xs text-white/40 hover:text-white/70 px-3 py-2 rounded-lg transition-colors">
                Passer
              </button>
            )}
            {step === 1 && (
              <button onClick={dismiss} className="text-xs text-white/40 hover:text-white/70 px-3 py-2 rounded-lg transition-colors">
                Plus tard
              </button>
            )}
            {isLast ? (
              <button onClick={finish} className="text-xs font-medium bg-indigo-500 hover:bg-indigo-600 text-[#fff] px-4 py-2 rounded-lg transition-colors">
                Terminer
              </button>
            ) : (
              <button
                onClick={next}
                disabled={nextDisabled}
                title={nextDisabled ? 'Renseignez au moins une clé LLM' : undefined}
                className="text-xs font-medium bg-indigo-500 hover:bg-indigo-600 disabled:opacity-40 disabled:cursor-not-allowed text-[#fff] px-4 py-2 rounded-lg transition-colors"
              >
                Suivant
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
