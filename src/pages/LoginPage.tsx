import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { FileText, Shapes, Database, Table, Download, Workflow, Sparkles } from 'lucide-react'
import { FirebaseError } from 'firebase/app'
import { useAuthStore } from '@/stores/auth.store'
import { useSignInWithGoogle } from '@/features/auth/useAuth'
import { useTranslation, type TranslationKey } from '@/lib/i18n'
import { LocaleSwitcher } from '@/components/shared/LocaleSwitcher'

/** Les libellés ne sont plus du texte mais des CLÉS : le rendu les traduit. */
const FEATURES = [
  { icon: FileText, key: 'import' },
  { icon: Shapes, key: 'svg' },
  { icon: Database, key: 'pim' },
  { icon: Table, key: 'merge' },
  { icon: Download, key: 'export' },
  { icon: Workflow, key: 'workflows' },
] as const

/** Code d'erreur Firebase → clé de traduction (jamais du texte en dur). */
function errorKey(err: unknown): TranslationKey {
  if (err instanceof FirebaseError) {
    switch (err.code) {
      case 'auth/popup-closed-by-user':
      case 'auth/cancelled-popup-request':
        return 'login.error.cancelled'
      case 'auth/popup-blocked':
        return 'login.error.popupBlocked'
      case 'auth/network-request-failed':
        return 'login.error.network'
      case 'auth/unauthorized-domain':
        return 'login.error.unauthorizedDomain'
      default:
        return 'login.error.generic'
    }
  }
  return 'login.error.unexpected'
}

export default function LoginPage() {
  const user = useAuthStore((s) => s.user)
  const navigate = useNavigate()
  const signIn = useSignInWithGoogle()
  const { t } = useTranslation()
  const [loading, setLoading] = useState(false)
  // On mémorise la CLÉ, pas le message : un changement de langue re-traduit
  // l'erreur déjà affichée au lieu de la figer dans la langue d'origine.
  const [errorK, setErrorK] = useState<TranslationKey | null>(null)

  useEffect(() => {
    if (user) navigate('/dashboard', { replace: true })
  }, [user, navigate])

  const handleSignIn = async () => {
    setErrorK(null)
    setLoading(true)
    try {
      await signIn()
    } catch (err) {
      console.error('Erreur connexion Google', err)
      setErrorK(errorKey(err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-background grid lg:grid-cols-[1.1fr_1fr]">
      {/* Colonne gauche — vitrine brandée */}
      {/* Vitrine brandée : panneau VOLONTAIREMENT sombre dans les deux thèmes → blancs littéraux */}
      <aside className="relative hidden lg:flex flex-col justify-center gap-8 overflow-hidden p-12 text-[#fff]">
        <div className="absolute inset-0 bg-gradient-to-br from-indigo-600 via-indigo-900 to-[#242424]" />
        <div className="absolute -top-40 -left-40 w-[32rem] h-[32rem] rounded-full bg-indigo-500/30 blur-3xl" />
        <div
          className="absolute inset-0 opacity-[0.07]"
          style={{
            backgroundImage:
              'linear-gradient(to right, #fff 1px, transparent 1px), linear-gradient(to bottom, #fff 1px, transparent 1px)',
            backgroundSize: '40px 40px',
          }}
        />

        <div className="relative flex items-center">
          <img src="/logo.png" alt="IBS Studio" className="h-48 w-auto object-contain" />
        </div>

        <div className="relative max-w-md">
          <div className="inline-flex items-center gap-2 rounded-full border border-[#fff]/15 bg-[#fff]/5 px-3 py-1 text-xs font-medium text-[#fff]/70">
            <span className="w-1.5 h-1.5 rounded-full bg-indigo-400" />
            {t('login.badge')}
          </div>
          <h2 className="mt-5 text-4xl font-bold leading-tight">
            {t('login.headline.line1')}
            <br />
            {t('login.headline.line2')}
          </h2>
          <p className="mt-4 text-[#fff]/60">{t('login.tagline')}</p>

          <ul className="mt-7 space-y-3.5">
            {FEATURES.map(({ icon: Icon, key }) => (
              <li key={key} className="flex items-start gap-3.5">
                <div className="mt-0.5 w-9 h-9 shrink-0 rounded-lg bg-[#fff]/10 backdrop-blur flex items-center justify-center">
                  <Icon className="w-4 h-4 text-[#c7d2fe]" />
                </div>
                <div>
                  <p className="font-medium text-[#fff]">{t(`login.feature.${key}.label`)}</p>
                  <p className="text-sm text-[#fff]/50">{t(`login.feature.${key}.desc`)}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </aside>

      {/* Colonne droite — connexion */}
      <main className="flex items-center justify-center p-6 sm:p-10">
        <div className="w-full max-w-sm">
          {/* Logo mobile (colonne gauche masquée) */}
          <div className="lg:hidden flex items-center mb-10">
            <img src="/logo.png" alt="IBS Studio" className="h-56 w-auto object-contain" />
          </div>

          <div className="bg-surface border border-white/10 rounded-2xl p-8 shadow-2xl">
            <div className="flex items-center gap-2 text-indigo-400">
              <Sparkles className="w-4 h-4" />
              <span className="text-xs font-medium uppercase tracking-wider">{t('login.workspace')}</span>
              <LocaleSwitcher className="ml-auto" />
            </div>
            <h1 className="mt-3 text-2xl font-bold text-white">{t('login.welcome')}</h1>
            <p className="mt-1.5 text-sm text-white/50">{t('login.subtitle')}</p>

            <button
              onClick={handleSignIn}
              disabled={loading}
              className="mt-8 w-full flex items-center justify-center gap-3 bg-[#fff] text-gray-800 font-medium py-3 px-4 rounded-lg border border-[#d1d5db]/60 hover:bg-[#f3f4f6] transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {loading ? (
                <span className="w-5 h-5 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
              ) : (
                <svg viewBox="0 0 24 24" className="w-5 h-5">
                  <path
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                    fill="#4285F4"
                  />
                  <path
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                    fill="#34A853"
                  />
                  <path
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"
                    fill="#FBBC05"
                  />
                  <path
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                    fill="#EA4335"
                  />
                </svg>
              )}
              {loading ? t('login.cta.loading') : t('login.cta')}
            </button>

            {errorK && (
              <p className="mt-3 text-sm text-red-400" role="alert">
                {t(errorK)}
              </p>
            )}

            <div className="mt-6 flex items-center gap-3 text-white/20">
              <span className="h-px flex-1 bg-white/10" />
              <span className="text-xs">{t('login.secure')}</span>
              <span className="h-px flex-1 bg-white/10" />
            </div>

            <p className="mt-6 text-xs text-white/30 text-center leading-relaxed">
              {t('login.legal')}
            </p>
          </div>
        </div>
      </main>
    </div>
  )
}
