import { useState } from 'react'
import { Share, X } from 'lucide-react'
import { isIos, isStandalone } from '@/lib/pwaEnv'
import { t } from '@/lib/i18n'

const DISMISS_KEY = 'pulse_install_dismissed'

/** Bandeau iOS « Ajouter à l'écran d'accueil ». Affiché uniquement hors mode installé,
 *  sur iPhone/iPad, et tant que l'utilisateur ne l'a pas fermé. */
export function PulseInstallHint() {
  const [hidden, setHidden] = useState(() => {
    try {
      return localStorage.getItem(DISMISS_KEY) === '1'
    } catch {
      return false
    }
  })
  if (hidden || isStandalone() || !isIos()) return null

  const dismiss = () => {
    try {
      localStorage.setItem(DISMISS_KEY, '1')
    } catch {
      /* stockage indisponible */
    }
    setHidden(true)
  }

  return (
    <div className="pulse-card flex items-start gap-3 px-4 py-3" style={{ background: 'var(--pulse-accent-soft)', borderColor: 'transparent' }}>
      <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl" style={{ background: 'var(--pulse-accent)' }}>
        <Share size={17} color="#fff" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[14px] font-semibold">Installer Pulse</p>
        <p className="mt-0.5 text-[12px]" style={{ color: 'var(--pulse-text-2)' }}>
          Touchez <span className="font-medium" style={{ color: 'var(--pulse-text)' }}>Partager</span>, puis
          <span className="font-medium" style={{ color: 'var(--pulse-text)' }}>{t('pu.installHint')}</span>.
        </p>
      </div>
      <button onClick={dismiss} aria-label="Fermer" className="pulse-tap -mr-1 -mt-1 p-1" style={{ color: 'var(--pulse-text-3)' }}>
        <X size={16} />
      </button>
    </div>
  )
}
