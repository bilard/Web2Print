import { useState } from 'react'
import { Loader2, AlertCircle } from 'lucide-react'
import { useGoogleDrive } from './useGoogleDrive'

export function GDriveConnect() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { connectDrive } = useGoogleDrive()

  const handleConnect = async () => {
    setLoading(true)
    setError(null)
    try {
      await connectDrive()
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Connexion échouée'
      setError(msg)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex flex-col items-center gap-6 py-16 px-8 text-center">
      {/* Google Drive gradient icon */}
      <div className="w-20 h-20 rounded-2xl flex items-center justify-center"
        style={{ background: 'linear-gradient(135deg, rgba(66,133,244,0.2), rgba(52,168,83,0.2), rgba(251,188,5,0.2))' }}
      >
        <svg viewBox="0 0 87.3 78" className="w-10 h-10">
          <path d="M6.6 66.85l3.85 6.65c.8 1.4 1.95 2.5 3.3 3.3l13.75-23.8H1.1c0 1.55.4 3.1 1.2 4.5z" fill="#0066da"/>
          <path d="M43.65 25L29.9 1.2C28.55 2 27.4 3.1 26.6 4.5L1.2 48.5c-.8 1.4-1.2 2.95-1.2 4.5h27.5z" fill="#00ac47"/>
          <path d="M73.55 76.8c1.35-.8 2.5-1.9 3.3-3.3l1.6-2.75 7.65-13.25c.8-1.4 1.2-2.95 1.2-4.5H59.8l5.85 11.65z" fill="#ea4335"/>
          <path d="M43.65 25L57.4 1.2C56.05.4 54.5 0 52.95 0H34.35c-1.55 0-3.1.4-4.45 1.2z" fill="#00832d"/>
          <path d="M59.8 53H27.5L13.75 76.8c1.35.8 2.9 1.2 4.45 1.2h50.9c1.55 0 3.1-.4 4.45-1.2z" fill="#2684fc"/>
          <path d="M73.4 26.5l-12.7-22c-.8-1.4-1.95-2.5-3.3-3.3L43.65 25 59.8 53h27.45c0-1.55-.4-3.1-1.2-4.5z" fill="#ffba00"/>
        </svg>
      </div>

      <div>
        <h2 className="text-lg font-semibold text-white/80">Google Drive</h2>
        <p className="text-sm text-white/30 mt-1 max-w-xs leading-relaxed">
          Connectez votre Drive pour accéder à vos documents Docs, Sheets, Slides et plus.
        </p>
      </div>

      {error && (
        <div className="flex items-center gap-2 text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2 max-w-xs text-left">
          <AlertCircle className="w-3.5 h-3.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <button
        onClick={handleConnect}
        disabled={loading}
        className="flex items-center gap-2.5 bg-white hover:bg-white/90 text-gray-800 font-medium text-sm px-6 py-2.5 rounded-xl transition-colors disabled:opacity-50 shadow-sm"
      >
        {loading ? (
          <Loader2 className="w-4 h-4 animate-spin text-gray-600" />
        ) : (
          <svg viewBox="0 0 24 24" className="w-4 h-4" xmlns="http://www.w3.org/2000/svg">
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
          </svg>
        )}
        Connecter avec Google
      </button>
    </div>
  )
}
