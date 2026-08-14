// Une commande ANNONCÉE mais pas encore livrée : visible, désactivée, et qui le DIT.
//
// ⚠⚠ Jamais un bouton qui « ne fait rien » : un clic sans effet se lit comme une panne, et
// un bouton absent laisse croire que la fonction n'existera pas. L'infobulle porte la seule
// information utile — c'est prévu, ce n'est pas là.
import type { ReactNode } from 'react'
import { useTranslation } from '@/lib/i18n'

export function BiSoonButton({ label, icon, iconOnly = false }: {
  /** Libellé DÉJÀ traduit — le composant ne connaît pas le catalogue de ses appelants. */
  label: string
  icon?: ReactNode
  /** Rail de vues : l'icône seule, le libellé passe dans l'infobulle. */
  iconOnly?: boolean
}) {
  const { t } = useTranslation()
  const hint = `${label} — ${t('bi.top.soon')}`
  return (
    <button
      type="button" disabled title={hint} aria-label={hint}
      className={iconOnly
        ? 'w-8 h-8 grid place-items-center rounded-lg text-white/20 cursor-not-allowed'
        : 'inline-flex items-center gap-1.5 rounded-lg border border-white/[0.06] bg-well px-2.5 py-1 text-[11.5px] text-white/25 cursor-not-allowed'}
    >
      {icon}
      {!iconOnly && label}
    </button>
  )
}
