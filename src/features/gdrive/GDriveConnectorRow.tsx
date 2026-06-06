import { useState } from 'react'
import { Loader2, CheckCircle2, XCircle, LogOut } from 'lucide-react'
import { GDriveLogo } from '@/features/ai/providerLogos'
import { useGoogleDrive } from '@/features/gdrive/useGoogleDrive'
import { useGDriveStore } from '@/stores/gdrive.store'
import { useGDriveSettings } from '@/features/gdrive/useGDriveSettings'

export function GDriveConnectorRow() {
  const { connected, accountEmail } = useGDriveStore()
  const { connectDrive, disconnect: runtimeDisconnect } = useGoogleDrive()
  const { savedEmail, loading, saveSettings, clearSettings } = useGDriveSettings()
  const [connecting, setConnecting] = useState(false)

  const handleConnect = async () => {
    setConnecting(true)
    try {
      await connectDrive()
      const email = useGDriveStore.getState().accountEmail
      if (email) await saveSettings(email)
    } finally {
      setConnecting(false)
    }
  }

  const handleDisconnect = async () => {
    runtimeDisconnect()
    await clearSettings()
  }

  const displayEmail = accountEmail ?? savedEmail
  const isConnected = connected

  return (
    <div className="bg-white/[0.03] rounded-xl p-3 flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <GDriveLogo />
          <div>
            <div className="flex items-center gap-1.5">
              <p className="text-xs font-medium text-white/70">Google Drive</p>
              {loading
                ? <Loader2 className="w-3 h-3 text-white/20 animate-spin" />
                : isConnected
                  ? <CheckCircle2 className="w-3 h-3 text-green-400" />
                  : savedEmail
                    ? <XCircle className="w-3 h-3 text-amber-400" />
                    : <XCircle className="w-3 h-3 text-white/20" />}
            </div>
            <p className="text-[10px] text-white/30">Accès aux fichiers Google Sheets</p>
          </div>
        </div>
        {(isConnected || savedEmail) && (
          <button onClick={handleDisconnect} title="Déconnecter" className="text-white/20 hover:text-red-400 transition-colors p-1 rounded hover:bg-white/5">
            <LogOut className="w-3 h-3" />
          </button>
        )}
      </div>

      {isConnected ? (
        <div className="text-[10px] text-green-400/70 font-mono bg-white/5 rounded-lg px-2.5 py-1.5 truncate">
          {displayEmail}
        </div>
      ) : savedEmail ? (
        <button
          onClick={handleConnect}
          disabled={connecting}
          className="flex items-center justify-center gap-2 text-xs bg-white/5 hover:bg-white/10 text-amber-300/60 rounded-lg px-3 py-1.5 transition-colors disabled:opacity-50"
        >
          {connecting && <Loader2 className="w-3 h-3 animate-spin" />}
          {connecting ? 'Connexion...' : `Reconnecter ${savedEmail}`}
        </button>
      ) : (
        <button
          onClick={handleConnect}
          disabled={connecting}
          className="flex items-center justify-center gap-2 text-xs bg-white/5 hover:bg-white/10 text-white/60 rounded-lg px-3 py-1.5 transition-colors disabled:opacity-50"
        >
          {connecting && <Loader2 className="w-3 h-3 animate-spin" />}
          {connecting ? 'Connexion...' : 'Connecter Google Drive'}
        </button>
      )}
    </div>
  )
}
