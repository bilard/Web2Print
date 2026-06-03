import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { FileText, Shapes, Download, Workflow, Sparkles } from 'lucide-react'
import { FirebaseError } from 'firebase/app'
import { useAuthStore } from '@/stores/auth.store'
import { useSignInWithGoogle } from '@/features/auth/useAuth'

const FEATURES = [
  { icon: FileText, label: 'Import PDF & IDML', desc: 'Vos fichiers print, prêts à éditer' },
  { icon: Shapes, label: 'SVG éditable', desc: 'Décomposition intelligente par blocs' },
  { icon: Download, label: 'Export multi-format', desc: 'PDF, PPTX, images haute définition' },
  { icon: Workflow, label: 'Workflows IA', desc: 'Automatisez scraping, design et envoi' },
] as const

function errorMessage(err: unknown): string {
  if (err instanceof FirebaseError) {
    switch (err.code) {
      case 'auth/popup-closed-by-user':
      case 'auth/cancelled-popup-request':
        return 'Connexion annulée.'
      case 'auth/popup-blocked':
        return 'La fenêtre de connexion a été bloquée par le navigateur. Autorisez les pop-ups puis réessayez.'
      case 'auth/network-request-failed':
        return 'Problème de réseau. Vérifiez votre connexion et réessayez.'
      case 'auth/unauthorized-domain':
        return "Ce domaine n'est pas autorisé pour la connexion. Contactez l'administrateur."
      default:
        return 'La connexion a échoué. Réessayez dans un instant.'
    }
  }
  return 'Une erreur inattendue est survenue.'
}

export default function LoginPage() {
  const user = useAuthStore((s) => s.user)
  const navigate = useNavigate()
  const signIn = useSignInWithGoogle()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (user) navigate('/dashboard', { replace: true })
  }, [user, navigate])

  const handleSignIn = async () => {
    setError(null)
    setLoading(true)
    try {
      await signIn()
    } catch (err) {
      console.error('Erreur connexion Google', err)
      setError(errorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#0f0f0f] grid lg:grid-cols-[1.1fr_1fr]">
      {/* Colonne gauche — vitrine brandée */}
      <aside className="relative hidden lg:flex flex-col justify-between overflow-hidden p-12 text-white">
        <div className="absolute inset-0 bg-gradient-to-br from-indigo-600 via-indigo-900 to-[#0f0f0f]" />
        <div className="absolute -top-40 -left-40 w-[32rem] h-[32rem] rounded-full bg-indigo-500/30 blur-3xl" />
        <div
          className="absolute inset-0 opacity-[0.07]"
          style={{
            backgroundImage:
              'linear-gradient(to right, #fff 1px, transparent 1px), linear-gradient(to bottom, #fff 1px, transparent 1px)',
            backgroundSize: '40px 40px',
          }}
        />

        <div className="relative flex items-center gap-2.5">
          <div className="w-9 h-9 bg-white/15 backdrop-blur rounded-lg flex items-center justify-center">
            <svg viewBox="0 0 24 24" className="w-5 h-5 text-white">
              <path
                d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                fill="none"
              />
            </svg>
          </div>
          <span className="text-lg font-semibold tracking-tight">Web2Print</span>
        </div>

        <div className="relative max-w-md">
          <h2 className="text-4xl font-bold leading-tight">
            Créez, importez,
            <br />
            exportez en un flux.
          </h2>
          <p className="mt-4 text-white/60">
            L'éditeur graphique professionnel qui transforme vos fichiers print et vos données en
            créations prêtes à diffuser.
          </p>

          <ul className="mt-10 space-y-5">
            {FEATURES.map(({ icon: Icon, label, desc }) => (
              <li key={label} className="flex items-start gap-3.5">
                <div className="mt-0.5 w-9 h-9 shrink-0 rounded-lg bg-white/10 backdrop-blur flex items-center justify-center">
                  <Icon className="w-4 h-4 text-indigo-200" />
                </div>
                <div>
                  <p className="font-medium text-white">{label}</p>
                  <p className="text-sm text-white/50">{desc}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <p className="relative text-xs text-white/40">app.hyperframe.ai</p>
      </aside>

      {/* Colonne droite — connexion */}
      <main className="flex items-center justify-center p-6 sm:p-10">
        <div className="w-full max-w-sm">
          {/* Logo mobile (colonne gauche masquée) */}
          <div className="lg:hidden flex items-center gap-2.5 mb-10">
            <div className="w-9 h-9 bg-indigo-500 rounded-lg flex items-center justify-center">
              <svg viewBox="0 0 24 24" className="w-5 h-5 text-white">
                <path
                  d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  fill="none"
                />
              </svg>
            </div>
            <span className="text-lg font-semibold text-white tracking-tight">Web2Print</span>
          </div>

          <div className="bg-[#1a1a1a] border border-white/10 rounded-2xl p-8 shadow-2xl">
            <div className="flex items-center gap-2 text-indigo-400">
              <Sparkles className="w-4 h-4" />
              <span className="text-xs font-medium uppercase tracking-wider">Espace de travail</span>
            </div>
            <h1 className="mt-3 text-2xl font-bold text-white">Bienvenue</h1>
            <p className="mt-1.5 text-sm text-white/50">Connectez-vous pour accéder à vos projets.</p>

            <button
              onClick={handleSignIn}
              disabled={loading}
              className="mt-8 w-full flex items-center justify-center gap-3 bg-white text-gray-800 font-medium py-3 px-4 rounded-lg hover:bg-gray-100 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
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
              {loading ? 'Connexion…' : 'Se connecter avec Google'}
            </button>

            {error && (
              <p className="mt-3 text-sm text-red-400" role="alert">
                {error}
              </p>
            )}

            <div className="mt-6 flex items-center gap-3 text-white/20">
              <span className="h-px flex-1 bg-white/10" />
              <span className="text-xs">connexion sécurisée</span>
              <span className="h-px flex-1 bg-white/10" />
            </div>

            <p className="mt-6 text-xs text-white/30 text-center leading-relaxed">
              En vous connectant, vous acceptez nos conditions d'utilisation et notre politique de
              confidentialité.
            </p>
          </div>
        </div>
      </main>
    </div>
  )
}
