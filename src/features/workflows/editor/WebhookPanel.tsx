// Webhook entrant du workflow : bouton dans le header de l'éditeur ouvrant un
// popover pour activer/désactiver l'URL de déclenchement externe (Zapier, ERP,
// curl). Config dans workflowWebhooks/{workflowId} ; la Function workflowWebhook
// valide le secret et exécute le workflow côté serveur (mêmes nodes que le cron).
import { useEffect, useRef, useState } from 'react'
import { deleteDoc, doc, onSnapshot, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore'
import { Webhook, Copy, RefreshCcw, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { db } from '@/lib/firebase/config'
import { useAuthStore } from '@/stores/auth.store'

// URL stable de la Function v2 (Cloud Run), même forme que telegramWebhook.
const WEBHOOK_BASE = 'https://workflowwebhook-4cs64afhba-ew.a.run.app'

interface WebhookDoc {
  uid: string
  secret: string
  enabled: boolean
  lastStatus?: string
}

function newSecret(): string {
  const bytes = new Uint8Array(24)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}

export function WebhookPanel({ workflowId }: { workflowId: string }) {
  const uid = useAuthStore((s) => s.user?.uid)
  const [cfg, setCfg] = useState<WebhookDoc | null>(null)
  const [open, setOpen] = useState(false)
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => onSnapshot(doc(db, 'workflowWebhooks', workflowId),
    (s) => setCfg(s.exists() ? (s.data() as WebhookDoc) : null),
    (err) => console.warn('[webhook] écoute Firestore interrompue :', err.message)), [workflowId])

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  if (!uid) return null

  const url = `${WEBHOOK_BASE}?id=${workflowId}`
  const ref = doc(db, 'workflowWebhooks', workflowId)

  const enable = async () => {
    const secret = cfg?.secret ?? newSecret()
    await setDoc(ref, { uid, secret, enabled: true, createdAt: serverTimestamp() }, { merge: true })
    // Bascule optimiste : ne pas dépendre du listener pour afficher l'URL + secret.
    setCfg((prev) => ({ ...(prev ?? { uid, secret }), secret, enabled: true }))
    toast.success('Webhook activé.')
  }
  const disable = () => updateDoc(ref, { enabled: false })
  const regenerate = async () => {
    await updateDoc(ref, { secret: newSecret() })
    toast.success('Secret régénéré — mets à jour tes intégrations.')
  }
  const remove = async () => {
    await deleteDoc(ref)
    setOpen(false)
  }
  const copy = (text: string, label: string) => {
    void navigator.clipboard.writeText(text).then(() => toast.success(`${label} copié.`))
  }

  return (
    <div ref={panelRef} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className={`px-3 py-1.5 rounded flex items-center gap-2 text-sm transition-colors ${
          cfg?.enabled
            ? 'bg-emerald-500/15 border border-emerald-500/30 text-emerald-200'
            : 'bg-white/[0.06] hover:bg-white/[0.1] text-white/80'
        }`}
        title="Déclencher ce workflow depuis l'extérieur (URL + secret)"
      >
        <Webhook className="w-4 h-4" /> Webhook
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-96 z-50 bg-surface-2 border border-white/10 rounded-xl shadow-2xl p-4 space-y-3">
          <div className="text-[12px] font-medium text-white/70">Webhook entrant</div>
          {!cfg?.enabled ? (
            <>
              <p className="text-[11px] text-white/40 leading-snug">
                Génère une URL secrète pour déclencher ce workflow depuis l'extérieur
                (Zapier, ERP, curl…). Exécution côté serveur, visible dans l'historique des runs.
              </p>
              <button
                onClick={enable}
                className="w-full px-3 py-2 rounded-md bg-indigo-500 hover:bg-indigo-600 text-[#fff] text-sm"
              >
                Activer le webhook
              </button>
            </>
          ) : (
            <>
              <div>
                <div className="text-[10px] text-white/35 mb-1">URL (POST)</div>
                <div className="flex items-center gap-1.5">
                  <code className="flex-1 text-[10px] text-white/70 bg-well rounded px-2 py-1.5 truncate">{url}</code>
                  <button onClick={() => copy(url, 'URL')} className="p-1.5 rounded text-white/40 hover:text-white/80 hover:bg-white/[0.06]" title="Copier l'URL">
                    <Copy className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
              <div>
                <div className="text-[10px] text-white/35 mb-1">Header <code>X-Webhook-Secret</code></div>
                <div className="flex items-center gap-1.5">
                  <code className="flex-1 text-[10px] text-white/70 bg-well rounded px-2 py-1.5 truncate">{cfg.secret}</code>
                  <button onClick={() => copy(cfg.secret, 'Secret')} className="p-1.5 rounded text-white/40 hover:text-white/80 hover:bg-white/[0.06]" title="Copier le secret">
                    <Copy className="w-3.5 h-3.5" />
                  </button>
                  <button onClick={regenerate} className="p-1.5 rounded text-white/40 hover:text-amber-300 hover:bg-white/[0.06]" title="Régénérer le secret">
                    <RefreshCcw className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
              <p className="text-[10px] text-white/30 leading-snug">
                Exemple : <code>curl -X POST -H "X-Webhook-Secret: …" "{`${WEBHOOK_BASE}?id=…`}"</code>
                {cfg.lastStatus ? ` · Dernier déclenchement : ${cfg.lastStatus}` : ''}
              </p>
              <div className="flex items-center justify-between pt-1">
                <button onClick={disable} className="text-[11px] text-white/40 hover:text-white/70">
                  Désactiver
                </button>
                <button onClick={remove} className="flex items-center gap-1 text-[11px] text-white/30 hover:text-red-400">
                  <Trash2 className="w-3 h-3" /> Supprimer
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}
