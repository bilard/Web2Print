import { useEffect, useMemo, useState } from 'react'
import { UserPlus, Search, Building2 } from 'lucide-react'
import { toast } from 'sonner'
import { listUsers, updateUserAccount, type ManagedUser } from '@/features/access/usersApi'
import { DEFAULT_ACCOUNT_ID } from '@/features/i18n/accountI18nApi'
import { recordAudit } from '@/lib/auditLog'
import { t } from '@/lib/i18n'

/**
 * Rattache un compte EXISTANT à la société, par autocomplétion sur le nom ou
 * l'e-mail.
 *
 * ⚠️ Réservé à l'administrateur global : il lit TOUS les comptes (requête non
 * filtrée sur `users`, refusée en bloc pour quiconque d'autre) et `accountId`
 * est exclu des champs délégués par `firestore.rules` — un administrateur
 * d'entreprise ne peut pas aspirer le compte d'un tiers.
 *
 * Le champ de recherche de la liste, lui, filtre les membres DÉJÀ rattachés :
 * y taper le nom de quelqu'un qui n'est pas encore dans la société ne pouvait
 * rien donner, d'où ce second champ, explicitement d'ajout.
 */
export function CompanyMemberPicker({ accountId, onAdded }: { accountId: string; onAdded: () => void }) {
  const [all, setAll] = useState<ManagedUser[]>([])
  const [q, setQ] = useState('')
  const [busy, setBusy] = useState<string | null>(null)

  useEffect(() => { void listUsers().then(setAll) }, [accountId])

  /** Comptes rattachés AILLEURS (ceux d'ici sont déjà dans la liste en dessous). */
  const candidates = useMemo(() => {
    const needle = q.trim().toLowerCase()
    if (!needle) return []
    return all
      .filter((u) => (u.accountId || DEFAULT_ACCOUNT_ID) !== accountId)
      .filter((u) => `${u.displayName} ${u.email}`.toLowerCase().includes(needle))
      .slice(0, 8)
  }, [all, q, accountId])

  const attach = async (u: ManagedUser) => {
    setBusy(u.uid)
    const before = u.accountId || DEFAULT_ACCOUNT_ID
    try {
      await updateUserAccount(u.uid, accountId)
      recordAudit({
        action: 'access.account.assign', module: 'access',
        targetId: u.uid, targetLabel: u.email, meta: { before, after: accountId },
      })
      toast.success(t('co.memberAdded', { name: u.displayName || u.email }))
      setQ('')
      setAll((prev) => prev.map((x) => (x.uid === u.uid ? { ...x, accountId } : x)))
      onAdded()
    } catch (e) {
      toast.error(t('co.memberAddFailed'))
      console.warn('[CompanyMemberPicker] rattachement refusé:', e)
    } finally { setBusy(null) }
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/25" aria-hidden="true" />
        <input
          value={q} onChange={(e) => setQ(e.target.value)}
          placeholder={t('co.addMemberPlaceholder')}
          className="w-full bg-white/[0.04] border border-white/10 rounded-lg pl-8 pr-3 py-2 text-sm text-white placeholder:text-white/30"
        />
      </div>

      {q.trim() && (
        <div className="rounded-xl border border-white/[0.06] bg-white/[0.015] overflow-hidden">
          {candidates.length === 0 ? (
            <p className="text-[11px] text-white/25 px-3 py-2.5">{t('co.noCandidate')}</p>
          ) : candidates.map((u) => (
            <button key={u.uid} onClick={() => void attach(u)} disabled={busy === u.uid}
              className="w-full flex items-center gap-2.5 px-3 py-2 text-left border-b border-white/[0.05] last:border-0 hover:bg-white/[0.03] disabled:opacity-40 transition-colors">
              {u.photoURL
                ? <img src={u.photoURL} alt="" className="w-6 h-6 rounded-full shrink-0" />
                : <span className="w-6 h-6 rounded-full bg-white/[0.06] flex items-center justify-center text-[10px] text-white/40 shrink-0">
                    {(u.displayName || u.email).charAt(0).toUpperCase()}
                  </span>}
              <span className="min-w-0">
                <span className="block text-[12px] text-white/85 truncate">{u.displayName || u.email}</span>
                <span className="block text-[10px] text-white/35 truncate">{u.email}</span>
              </span>
              {/* Rattaché ailleurs : le déplacer le retire de son ancienne société. */}
              <span className="ml-auto flex items-center gap-1 text-[10px] text-white/30 shrink-0">
                <Building2 className="w-3 h-3" />{u.accountId || DEFAULT_ACCOUNT_ID}
              </span>
              <UserPlus className="w-3.5 h-3.5 text-indigo-300 shrink-0" aria-hidden="true" />
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
