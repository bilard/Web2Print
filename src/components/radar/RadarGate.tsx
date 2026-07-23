import { useEffect, useState, type ReactNode } from 'react'
import { toast } from 'sonner'
import { useAuthStore } from '@/stores/auth.store'
import { completeRadarRedirect, signInForRadar } from '@/features/priceWatch/radar/radarAuth'

/** Glyphe radar : arcs concentriques + balayage. */
function RadarGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 100 100" className={className} fill="none" stroke="#fff" strokeWidth={7} strokeLinecap="round">
      <path d="M50 50 m-34 0 a34 34 0 1 0 68 0" opacity="0.5" />
      <path d="M50 50 m-20 0 a20 20 0 1 0 40 0" opacity="0.8" />
      <path d="M50 50 L80 26" />
      <circle cx="50" cy="50" r="4" fill="#fff" stroke="none" />
    </svg>
  )
}

function Splash({ children }: { children: ReactNode }) {
  return (
    <div className="radar-root radar-safe-x flex min-h-[100dvh] flex-col items-center justify-center gap-6 text-center">
      <div className="grid h-16 w-16 place-items-center rounded-[20px]" style={{ background: 'var(--radar-accent)' }}>
        <RadarGlyph className="h-9 w-9" />
      </div>
      {children}
    </div>
  )
}

/** Gating de la PWA : connexion Google robuste puis accès à tout utilisateur connecté
 *  (la veille est stockée sous users/{uid} → chacun ne voit que ses propres suivis). */
export function RadarGate({ children }: { children: ReactNode }) {
  const user = useAuthStore((s) => s.user)
  const authLoading = useAuthStore((s) => s.loading)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    void completeRadarRedirect()
  }, [])

  const onSignIn = async () => {
    setBusy(true)
    try {
      await signInForRadar()
    } catch {
      toast.error('Connexion impossible. Réessayez.')
    } finally {
      setBusy(false)
    }
  }

  if (authLoading) {
    return (
      <Splash>
        <div className="h-6 w-6 rounded-full border-2 radar-spin" style={{ borderColor: 'var(--radar-accent)', borderTopColor: 'transparent' }} />
      </Splash>
    )
  }

  if (!user) {
    return (
      <Splash>
        <div>
          <h1 className="radar-rounded text-[28px] font-bold">radarPrice</h1>
          <p className="mt-1 text-[14px]" style={{ color: 'var(--radar-text-2)' }}>Ta veille tarifaire, en direct.</p>
        </div>
        <button
          onClick={onSignIn}
          disabled={busy}
          className="radar-tap rounded-full px-6 py-3 text-[15px] font-semibold"
          style={{ background: 'var(--radar-text)', color: '#000' }}
        >
          {busy ? 'Connexion…' : 'Se connecter avec Google'}
        </button>
      </Splash>
    )
  }

  return <>{children}</>
}
