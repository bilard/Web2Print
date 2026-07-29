import { Sparkles } from 'lucide-react'
import { useOnboardingStore } from './onboarding.store'
import { useTranslation } from '@/lib/i18n'

/** Variante `banner` (Réglages) ou `item` (drawer de nav). Ouvre le wizard à l'étape 0. */
export function ResumeSetupButton({ variant = 'banner' }: { variant?: 'banner' | 'item' }) {
  const { t } = useTranslation()
  const openWizard = useOnboardingStore((s) => s.openWizard)
  if (variant === 'item') {
    return (
      <button
        onClick={openWizard}
        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left text-white/70 hover:text-white hover:bg-white/[0.06] transition-colors"
      >
        <Sparkles className="w-4 h-4 text-indigo-300 shrink-0" />
        <span className="text-sm font-medium">{t('setup.configure')}</span>
      </button>
    )
  }
  return (
    <button
      onClick={openWizard}
      className="w-full flex items-center gap-3 bg-gradient-to-r from-indigo-500/15 to-fuchsia-500/10 border border-indigo-500/25 rounded-xl px-4 py-3 hover:from-indigo-500/25 transition-colors text-left"
    >
      <Sparkles className="w-5 h-5 text-indigo-300 shrink-0" />
      <div className="min-w-0">
        <p className="text-sm font-medium text-white">{t('setup.wizard')}</p>
        <p className="text-[11px] text-white/50">{t('setup.resume')}</p>
      </div>
    </button>
  )
}
