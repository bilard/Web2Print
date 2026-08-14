// Une carte de modèle : son intitulé, ce qu'il montre, la source dont il a besoin, et le
// geste. ⚠ Source INDISPONIBLE = la carte le DIT et donne le geste à faire, au lieu de créer
// un tableau qui s'afficherait vide.
import type { ComponentType } from 'react'
import { AlertTriangle, ArrowRight, Loader2, Plus } from 'lucide-react'
import { useTranslation } from '@/lib/i18n'
import { getSource } from '../registry/sources'
import type { DashboardTemplate } from './types'
import type { TemplateAvailability } from './useTemplateAvailability'

export interface TemplateCardProps {
  tpl: DashboardTemplate
  icon: ComponentType<{ className?: string }>
  availability: TemplateAvailability
  /** Identifiant du tableau déjà créé pour ce modèle : la carte propose alors de l'OUVRIR. */
  existingId: string | null
  busy: boolean
  /** Droit d'édition : sans lui, CRÉER est refusé par les règles Firestore — OUVRIR reste dû. */
  canEdit: boolean
  onCreate: () => void
  onOpen: (id: string) => void
}

export function TemplateCard({
  tpl, icon: Icon, availability, existingId, busy, canEdit, onCreate, onOpen,
}: TemplateCardProps) {
  const { t } = useTranslation()
  const sources = tpl.sources.map((s) => t(getSource(s).labelKey)).join(' · ')
  // ⚠ Un rôle en consultation seule garde le droit d'OUVRIR ce qui existe : seul le geste de
  // création lui est fermé, et il l'est AVANT le clic plutôt que par un refus de Firestore.
  const blocked = !existingId && (!availability.ready || !canEdit)
  const action = () => (existingId ? onOpen(existingId) : onCreate())

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-white/10 bg-surface p-4">
      <div className="flex items-start gap-3">
        <span className="rounded-lg bg-indigo-500/15 p-2 text-indigo-400">
          <Icon className="w-4 h-4" />
        </span>
        <div className="min-w-0">
          <h3 className="text-sm font-medium text-white truncate">{t(tpl.nameKey)}</h3>
          <p className="text-xs text-white/45 mt-0.5">{t('bi.tpl.needs', { sources })}</p>
        </div>
      </div>

      <p className="text-xs text-white/60 leading-relaxed flex-1">{t(tpl.descKey)}</p>

      {blocked && availability.ready === false && availability.reasonKey && (
        <p className="flex items-start gap-1.5 text-[11px] text-amber-400/90 leading-relaxed">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-px" />
          {t(availability.reasonKey)}
        </p>
      )}

      <button
        onClick={action}
        disabled={blocked || busy}
        className={`inline-flex items-center justify-center gap-1.5 text-xs rounded-lg px-3 py-1.5 transition-colors ${
          blocked
            ? 'bg-well text-white/35 cursor-not-allowed'
            : 'bg-indigo-500 hover:bg-indigo-600 text-[#fff]'
        }`}
      >
        {busy
          ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
          : existingId ? <ArrowRight className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
        {t(existingId ? 'bi.tpl.open' : 'bi.tpl.create')}
      </button>
    </div>
  )
}
