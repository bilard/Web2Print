import { useEffect, useState } from 'react'
import { Sparkles, X, CheckCircle2, KeyRound } from 'lucide-react'
import { ApiKeyRow } from '@/components/shared/ApiKeyRow'
import { API_KEYS } from '@/lib/apiKeys'
import { areApiKeysHydrated, API_KEYS_HYDRATED_EVENT, API_KEYS_UPDATED_EVENT } from '@/features/settings/useApiKeysSync'
import { LLM_KEY_IDS, RECOMMENDED_KEY_IDS, hasAnyLlmKey, ONBOARDING_DISMISS_KEY } from './onboardingKeys'

const KEY_CONFIGS = LLM_KEY_IDS.map((id) => API_KEYS.find((k) => k.id === id)!).filter(Boolean)

/**
 * Wizard d'onboarding affiché à l'ouverture quand AUCUNE clé LLM n'est configurée
 * (« sinon rien ne va fonctionner »). Monté dans le Dashboard après les gardes
 * d'accès, il ne concerne donc que les utilisateurs déjà approuvés.
 */
export function OnboardingKeysWizard() {
  const [open, setOpen] = useState(false)

  // Décide de l'ouverture une fois les clés hydratées depuis Firestore (sinon flash
  // pour tout user de retour dont les clés vivent côté serveur). On lit le booléen
  // synchrone ET on écoute les events — selon que le wizard monte avant/après.
  useEffect(() => {
    const evaluate = () => {
      if (!areApiKeysHydrated()) return
      const dismissed = sessionStorage.getItem(ONBOARDING_DISMISS_KEY) === '1'
      setOpen(!dismissed && !hasAnyLlmKey())
    }
    evaluate()
    window.addEventListener(API_KEYS_HYDRATED_EVENT, evaluate)
    window.addEventListener(API_KEYS_UPDATED_EVENT, evaluate)
    return () => {
      window.removeEventListener(API_KEYS_HYDRATED_EVENT, evaluate)
      window.removeEventListener(API_KEYS_UPDATED_EVENT, evaluate)
    }
  }, [])

  if (!open) return null

  const dismiss = () => {
    sessionStorage.setItem(ONBOARDING_DISMISS_KEY, '1')
    setOpen(false)
  }
  const keyReady = hasAnyLlmKey()

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4" role="dialog" aria-modal="true">
      <div className="w-full max-w-lg max-h-[88vh] flex flex-col bg-[#1a1a1a] border border-white/10 rounded-2xl shadow-2xl overflow-hidden">
        {/* En-tête */}
        <div className="p-5 border-b border-white/[0.06] flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500/30 to-fuchsia-500/20 flex items-center justify-center shrink-0">
            <Sparkles className="w-5 h-5 text-indigo-300" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-base font-semibold text-white">Configurez vos clés IA</h2>
            <p className="text-xs text-white/50 mt-0.5">
              IBS-Studio fonctionne avec votre propre clé LLM (génération d'images, raisonnement,
              scraping). Renseignez-en <span className="text-white/70 font-medium">au moins une</span> pour démarrer.
            </p>
          </div>
          <button onClick={dismiss} title="Plus tard" className="text-white/30 hover:text-white/70 transition-colors p-1 rounded hover:bg-white/5 shrink-0">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Liste des clés LLM */}
        <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-2">
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

        {/* Pied */}
        <div className="p-4 border-t border-white/[0.06] flex items-center justify-between gap-3">
          <span className={`inline-flex items-center gap-1.5 text-[11px] ${keyReady ? 'text-green-400' : 'text-amber-400/80'}`}>
            {keyReady
              ? <><CheckCircle2 className="w-3.5 h-3.5" /> Au moins une clé configurée</>
              : <><KeyRound className="w-3.5 h-3.5" /> Aucune clé pour l'instant</>}
          </span>
          <div className="flex items-center gap-2">
            <button onClick={dismiss} className="text-xs text-white/50 hover:text-white/80 px-3 py-2 rounded-lg transition-colors">
              Plus tard
            </button>
            <button
              onClick={() => setOpen(false)}
              disabled={!keyReady}
              className="text-xs font-medium bg-indigo-500 hover:bg-indigo-600 disabled:opacity-40 disabled:cursor-not-allowed text-white px-4 py-2 rounded-lg transition-colors"
            >
              Terminer
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
