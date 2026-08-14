// Zone de dépôt d'un champ — Axe, Valeurs, Légende, Info-bulles, Filtres du visuel.
//
// ⚠⚠ EMPLACEMENT SEULEMENT à ce stade : le geste (glisser un champ, changer son agrégation
// d'un clic) appartient au constructeur. La zone est donc VIDE et le dit, plutôt que
// d'afficher des puces figées qui feraient croire à un réglage déjà en place.
import type { ReactNode } from 'react'
import { useTranslation } from '@/lib/i18n'
import { BiEyebrow } from './BiPanel'

export function BiFieldWell({ label, children }: {
  /** Libellé DÉJÀ traduit — c'est lui que le constructeur reprendra tel quel. */
  label: string
  /** Les puces de champ, quand le constructeur les posera. Vide = l'invite de dépôt. */
  children?: ReactNode
}) {
  const { t } = useTranslation()
  return (
    <div>
      <BiEyebrow>{label}</BiEyebrow>
      <div
        aria-label={label}
        className="mt-1.5 min-h-[34px] rounded-lg border border-dashed border-white/[0.14] bg-well p-1.5 flex flex-col gap-1"
      >
        {children ?? (
          <span className="px-1 py-0.5 text-[11px] text-white/25">{t('bi.well.drop')}</span>
        )}
      </div>
    </div>
  )
}
