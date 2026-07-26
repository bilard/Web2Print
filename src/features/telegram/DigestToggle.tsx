// Opt-in au digest Telegram quotidien (08:00) : flag users/{uid}.telegram.dailyDigest.
// Écriture ciblée en merge — le deep-merge de setDoc préserve botToken/chatId,
// et réciproquement le sync de la config ne touche pas ce flag.
import { useEffect, useState } from 'react'
import { doc, getDoc, setDoc } from 'firebase/firestore'
import { db } from '@/lib/firebase/config'
import { useAuthStore } from '@/stores/auth.store'

export function DigestToggle() {
  const uid = useAuthStore((s) => s.user?.uid)
  const [enabled, setEnabled] = useState<boolean | null>(null)

  useEffect(() => {
    if (!uid) return
    let cancelled = false
    getDoc(doc(db, 'users', uid))
      .then((snap) => {
        if (!cancelled) setEnabled(Boolean(snap.data()?.telegram?.dailyDigest))
      })
      .catch(() => {
        if (!cancelled) setEnabled(false)
      })
    return () => {
      cancelled = true
    }
  }, [uid])

  const toggle = (next: boolean) => {
    setEnabled(next)
    if (uid) {
      void setDoc(doc(db, 'users', uid), { telegram: { dailyDigest: next } }, { merge: true })
    }
  }

  return (
    <label className="flex items-start gap-2 px-2 py-2 rounded-md border border-white/10 bg-white/[0.03] cursor-pointer hover:bg-white/[0.05] transition-colors">
      <input
        type="checkbox"
        checked={enabled === true}
        disabled={enabled === null}
        onChange={(e) => toggle(e.target.checked)}
        className="accent-indigo-500 mt-0.5"
      />
      <span className="flex-1">
        <span className="block text-[12px] text-white/80">Digest quotidien (08:00)</span>
        <span className="block text-[10px] text-neutral-500 leading-snug mt-0.5">
          Chaque matin, un résumé des dernières 24 h sur ce chat : workflows réussis/en échec et
          messages Telegram en attente. Rien n'est envoyé s'il ne s'est rien passé.
        </span>
      </span>
    </label>
  )
}
