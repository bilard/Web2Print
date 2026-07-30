import { useEffect, useState, type ReactNode } from 'react'
import { toast } from 'sonner'
import { useAuthStore } from '@/stores/auth.store'
import { useIsAdmin, useAccessLoading } from '@/features/access/useAccess'
import { useSignOut } from '@/features/auth/useAuth'
import { completePulseRedirect, signInForPulse } from '@/features/analytics/pulseAuth'
import { t } from '@/lib/i18n'

function Splash({ children }: { children: ReactNode }) {
  return (
    <div className="pulse-root pulse-safe-x flex min-h-[100dvh] flex-col items-center justify-center gap-6 text-center">
      <div className="grid h-16 w-16 place-items-center rounded-[20px]" style={{ background: 'var(--pulse-accent)' }}>
        <svg viewBox="0 0 100 100" className="h-9 w-9" fill="none" stroke="#fff" strokeWidth={8} strokeLinecap="round" strokeLinejoin="round">
          <path d="M8 55 H30 L40 30 L54 74 L62 46 L68 55 H92" />
        </svg>
      </div>
      {children}
    </div>
  )
}

/** Gating de la PWA : connexion Google robuste puis contrôle admin (les règles
 *  Firestore n'autorisent la lecture de `analyticsEvents` qu'aux admins). */
export function PulseGate({ children }: { children: ReactNode }) {
  const user = useAuthStore((s) => s.user)
  const authLoading = useAuthStore((s) => s.loading)
  const isAdmin = useIsAdmin()
  const accessLoading = useAccessLoading()
  const signOut = useSignOut()
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    void completePulseRedirect()
  }, [])

  const onSignIn = async () => {
    setBusy(true)
    try {
      await signInForPulse()
    } catch {
      toast.error(t('tst.signInFailed'))
    } finally {
      setBusy(false)
    }
  }

  if (authLoading || (user && accessLoading)) {
    return (
      <Splash>
        <div className="h-6 w-6 rounded-full border-2 pulse-spin" style={{ borderColor: 'var(--pulse-accent)', borderTopColor: 'transparent' }} />
      </Splash>
    )
  }

  if (!user) {
    return (
      <Splash>
        <div>
          <h1 className="pulse-rounded text-[28px] font-bold">Pulse</h1>
          <p className="mt-1 text-[14px]" style={{ color: 'var(--pulse-text-2)' }}>Le trafic d'ibs-studio.com, en direct.</p>
        </div>
        <button
          onClick={onSignIn}
          disabled={busy}
          className="pulse-tap rounded-full px-6 py-3 text-[15px] font-semibold"
          style={{ background: 'var(--pulse-text)', color: '#000' }}
        >
          {busy ? 'Connexion…' : 'Se connecter avec Google'}
        </button>
      </Splash>
    )
  }

  if (!isAdmin) {
    return (
      <Splash>
        <div>
          <h1 className="pulse-rounded text-[22px] font-bold">{t('pu.restricted')}</h1>
          <p className="mt-1 max-w-[260px] text-[14px]" style={{ color: 'var(--pulse-text-2)' }}>
            Ce tableau de bord est réservé aux administrateurs.
          </p>
        </div>
        <button onClick={() => void signOut()} className="pulse-tap text-[14px] font-semibold" style={{ color: 'var(--pulse-accent-2)' }}>
          Changer de compte
        </button>
      </Splash>
    )
  }

  return <>{children}</>
}
