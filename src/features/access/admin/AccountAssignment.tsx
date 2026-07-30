import { useState } from 'react'
import { Building2, Check } from 'lucide-react'
import { toast } from 'sonner'
import { useTranslation } from '@/lib/i18n'
import { recordAudit } from '@/lib/auditLog'
import { updateUserAccount, type ManagedUser } from '@/features/access/usersApi'
import { DEFAULT_ACCOUNT_ID } from '@/features/i18n/accountI18nApi'

interface AccountAssignmentProps {
  user: ManagedUser
  /** Comptes déjà utilisés — évite d'inventer un identifiant à chaque fois. */
  knownAccounts: string[]
  onSaved: () => void
}

/**
 * Rattachement d'un utilisateur à un COMPTE (entreprise).
 *
 * Le compte porte le vocabulaire d'interface partagé : deux personnes du même
 * client doivent voir les mêmes mots. Le champ est libre plutôt qu'une liste
 * fermée — il n'y a pas de collection de comptes à administrer, un compte
 * existe dès qu'on y rattache quelqu'un. Les identifiants déjà employés sont
 * proposés en autocomplétion pour éviter les doublons de frappe
 * (« acme » / « Acme » donneraient deux vocabulaires distincts).
 */
export function AccountAssignment({ user, knownAccounts, onSaved }: AccountAssignmentProps) {
  const { t } = useTranslation()
  const current = user.accountId || DEFAULT_ACCOUNT_ID
  const [value, setValue] = useState(current)
  const [saving, setSaving] = useState(false)
  const dirty = value.trim() !== current

  async function save() {
    setSaving(true)
    try {
      const next = value.trim() || DEFAULT_ACCOUNT_ID
      await updateUserAccount(user.uid, next)
      recordAudit({
        action: 'access.account.assign',
        module: 'access',
        targetId: user.uid,
        targetLabel: user.email,
        meta: { before: current, after: next },
      })
      toast.success(t('ac.account.saved'))
      onSaved()
    } catch (e) {
      toast.error(t('ac.account.failed'))
      console.warn('[AccountAssignment] rattachement refusé:', e)
    } finally {
      setSaving(false)
    }
  }

  const listId = `accounts-${user.uid}`

  return (
    <div>
      <p className="text-[10px] font-semibold text-white/35 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
        <Building2 className="w-3 h-3" />
        {t('ac.account.title')}
      </p>
      <div className="flex items-center gap-2">
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && dirty) void save() }}
          list={listId}
          placeholder={DEFAULT_ACCOUNT_ID}
          aria-label={t('ac.account.title')}
          className="flex-1 min-w-0 bg-well border border-white/10 rounded-md px-2 py-1 text-[12px] text-white focus:border-indigo-500 outline-none"
        />
        <datalist id={listId}>
          {knownAccounts.map((id) => <option key={id} value={id} />)}
        </datalist>
        <button
          type="button"
          onClick={() => void save()}
          disabled={!dirty || saving}
          className="flex items-center gap-1 text-[11px] px-2.5 py-1.5 rounded-lg bg-indigo-500 text-[#fff] disabled:opacity-30 transition-colors"
        >
          <Check className="w-3.5 h-3.5" />
          {t('ac.account.apply')}
        </button>
      </div>
      <p className="text-[10px] text-white/30 mt-1">{t('ac.account.hint')}</p>
    </div>
  )
}
