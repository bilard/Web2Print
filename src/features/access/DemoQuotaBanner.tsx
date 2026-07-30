import { AlertTriangle } from 'lucide-react'
import { t, type TranslationKey } from '@/lib/i18n'

/** Champ de quota concerné par le module hôte. */
type QuotaField = 'pimRows' | 'damAssets'

// PIM = plafond PAR BASE (rule `excel_data.totalRows`, pas cumulé) → « par base ».
// `hint` : action de sortie honnête. PIM se restaure en supprimant des lignes (le
// garde-fou lit le nombre de lignes réel → auto-cicatrisant). DAM NON : le compteur
// `usage.damAssets` est serveur-autoritaire et anti-reset → la suppression client ne
// le décrémente pas, seul l'admin relève le plafond.
// ⚠️ CLÉS, pas `t()` : objet évalué au chargement du module.
const LABELS: Record<QuotaField, { unit: TranslationKey; scope?: TranslationKey; hint: TranslationKey }> = {
  pimRows: { unit: 'ac.quota.rows', scope: 'ac.quota.perDb', hint: 'ac.quota.rowsHint' },
  damAssets: { unit: 'ac.quota.visuals', hint: 'ac.quota.hint' },
}

interface DemoQuotaBannerProps {
  /** Le plafond démo est-il atteint ? (l'appelant y intègre déjà `isDemo`). */
  reached: boolean
  /** Plafond du rôle pour ce champ (affiché dans le message). */
  limit: number
  /** Quota concerné : PIM (lignes) ou DAM (visuels) — pilote le libellé. */
  field: QuotaField
  className?: string
}

/**
 * Bandeau d'alerte persistant (présentationnel) affiché aux comptes « démo » quand
 * le plafond de données du rôle est ATTEINT. Complète les toasts transitoires émis
 * au moment de l'import : ici l'alerte reste visible tant que la limite est pleine,
 * y compris quand l'utilisateur revient sur la page.
 *
 * Purement présentationnel : `reached`/`limit` sont calculés par l'appelant car les
 * deux modules ont des sources différentes — PIM lit le nombre de lignes réel de la
 * base (rule `excel_data.totalRows`), DAM lit le compteur `usage.damAssets`.
 */
export function DemoQuotaBanner({ reached, limit, field, className }: DemoQuotaBannerProps) {
  if (!reached) return null

  const { unit, scope, hint } = LABELS[field]
  const scopeTxt = scope ? t('ac.quota.scopeSuffix', { scope: t(scope) }) : ''
  return (
    <div
      role="alert"
      className={`flex items-start gap-2.5 rounded-md border border-amber-500/30 bg-amber-500/10 px-3.5 py-2.5 ${className ?? ''}`}
    >
      <AlertTriangle className="mt-px h-4 w-4 shrink-0 text-amber-300" aria-hidden="true" />
      <div className="min-w-0 text-[12px] leading-snug">
        <p className="font-medium text-amber-200">
          {t('ac.quota.reached', { limit, unit: t(unit), scope: scopeTxt })}
        </p>
        <p className="text-amber-200/70">{t(hint)}</p>
      </div>
    </div>
  )
}
