// Mini-formulaire « accès connecté » d'un site (node Sites sources) : saisit
// email/mot de passe/URL de connexion et les écrit dans Firestore
// users/{uid}.siteCredentials[host] — lisible par soi seul (règles), JAMAIS dans le
// code/git. La moisson d'un site marqué `auth` passe alors par la CF fetchPageHtmlAuth.
import { useEffect, useState } from 'react'
import { doc, getDoc, setDoc, deleteField } from 'firebase/firestore'
import { Eye, EyeOff, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { db } from '@/lib/firebase/config'
import { useAuthStore } from '@/stores/auth.store'
import { t } from '@/lib/i18n'

export function SiteCredentialsForm({ host, hasCreds, onSaved, onCleared, onClose }: {
  /** Clé Firestore = domaine normalisé du site (doit matcher celui envoyé par la moisson). */
  host: string
  hasCreds: boolean
  onSaved: () => void
  onCleared: () => void
  onClose: () => void
}) {
  const uid = useAuthStore((s) => s.user?.uid)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loginUrl, setLoginUrl] = useState(`https://${host}/connexion`)
  const [visible, setVisible] = useState(false)
  const [busy, setBusy] = useState(false)

  // Pré-remplit depuis Firestore si des identifiants existent déjà (le user lit son doc).
  useEffect(() => {
    if (!uid || !hasCreds) return
    getDoc(doc(db, 'users', uid)).then((snap) => {
      const c = (snap.data()?.siteCredentials ?? {})[host] as { login?: string; password?: string; loginUrl?: string } | undefined
      if (c) { setEmail(c.login ?? ''); setPassword(c.password ?? ''); if (c.loginUrl) setLoginUrl(c.loginUrl) }
    }).catch(() => { /* champ absent → formulaire vierge */ })
  }, [uid, host, hasCreds])

  const save = async () => {
    if (!uid) return
    if (!email.trim() || !password) { toast.error('Email et mot de passe requis.'); return }
    setBusy(true)
    try {
      await setDoc(doc(db, 'users', uid), {
        siteCredentials: { [host]: { login: email.trim(), password, loginUrl: loginUrl.trim() || `https://${host}/connexion` } },
      }, { merge: true })
      toast.success(t('tst.ss.credsSaved', { host }))
      onSaved()
      onClose()
    } catch (e) {
      toast.error(t('tst.ss.credsSaveFailed', { message: e instanceof Error ? e.message : t('tst.ss.unknown') }))
    } finally {
      setBusy(false)
    }
  }

  const clear = async () => {
    if (!uid) return
    setBusy(true)
    try {
      await setDoc(doc(db, 'users', uid), { siteCredentials: { [host]: deleteField() } }, { merge: true })
      toast.success(t('tst.ss.credsRemoved', { host }))
      onCleared()
      onClose()
    } catch (e) {
      toast.error(t('tst.ss.failed', { message: e instanceof Error ? e.message : t('tst.ss.unknown') }))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="ml-6 mb-1 rounded-lg bg-well border border-emerald-500/20 p-2 flex flex-col gap-1.5">
      <p className="text-[10px] text-emerald-300/80">
        Accès connecté · <span className="font-mono">{host}</span> — identifiants chiffrés au repos, lisibles par toi seul.
      </p>
      <input
        value={email} onChange={(e) => setEmail(e.target.value)}
        placeholder="Login"
        autoComplete="off"
        className="bg-surface-2 border border-white/10 rounded px-2 py-1 text-xs text-white/80 focus:outline-none focus:border-emerald-500/50"
      />
      <div className="flex gap-1.5">
        <input
          type={visible ? 'text' : 'password'}
          value={password} onChange={(e) => setPassword(e.target.value)}
          placeholder="Mot de passe"
          className="flex-1 bg-surface-2 border border-white/10 rounded px-2 py-1 text-xs text-white/80 font-mono focus:outline-none focus:border-emerald-500/50"
        />
        <button onClick={() => setVisible((v) => !v)} className="text-white/30 hover:text-white/60 px-1" title={visible ? 'Masquer' : 'Afficher'}>
          {visible ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
        </button>
      </div>
      <input
        value={loginUrl} onChange={(e) => setLoginUrl(e.target.value)}
        placeholder="URL de connexion"
        className="bg-surface-2 border border-white/10 rounded px-2 py-1 text-[11px] text-white/60 font-mono focus:outline-none focus:border-emerald-500/50"
      />
      <div className="flex items-center justify-between gap-2 mt-0.5">
        {hasCreds ? (
          <button onClick={clear} disabled={busy} className="text-[10px] text-red-400/80 hover:text-red-300 disabled:opacity-40">
            Retirer l'accès
          </button>
        ) : <span />}
        <div className="flex items-center gap-1.5">
          <button onClick={onClose} disabled={busy} className="text-[10px] text-white/40 hover:text-white/70 px-2 py-1">Annuler</button>
          <button onClick={save} disabled={busy} className="flex items-center gap-1 text-[10px] bg-emerald-500 hover:bg-emerald-600 disabled:opacity-40 text-[#fff] px-2.5 py-1 rounded">
            {busy && <Loader2 className="w-3 h-3 animate-spin" />} Enregistrer
          </button>
        </div>
      </div>
    </div>
  )
}
