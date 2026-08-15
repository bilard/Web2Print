// Le seuil d'alerte de la tuile sélectionnée.
//
// ⚠⚠ Le SENS est un choix explicite, jamais déduit du signe : « alerter au-dessus de 30 »
// et « alerter en dessous de 30 » surveillent des risques opposés, et se tromper de sens
// fait taire l'alerte exactement quand elle devrait sonner.
//
// ⚠ Champ vide = aucune alerte, et l'option disparaît du document. Garder un seuil à zéro
// ferait sonner toutes les tuiles positives.
import { useTranslation } from '@/lib/i18n'
import type { Tile } from '../types'

export function BiAlertField({ tile, canEdit, onApply }: {
  tile: Tile | null
  canEdit: boolean
  onApply: (next: Tile) => void
}) {
  const { t } = useTranslation()
  const alert = tile?.options?.alert
  const disabled = !tile || !canEdit

  const write = (next: { op: 'gt' | 'lt'; value: number } | undefined) => {
    if (!tile) return
    const options = { ...tile.options, alert: next }
    // ⚠ La clé est RETIRÉE, pas posée à `undefined` : Firestore refuse `undefined`, et
    // l'écriture échouerait en silence.
    if (!next) delete options.alert
    onApply({ ...tile, options })
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <span className="text-[10px] uppercase tracking-wide text-white/35">{t('bi.alert.title')}</span>
        {alert && !disabled && (
          <button type="button" onClick={() => write(undefined)}
            className="text-[10px] text-white/40 hover:text-white">
            {t('bi.alert.remove')}
          </button>
        )}
      </div>
      <div className="flex gap-1.5">
        <button
          type="button" disabled={disabled}
          onClick={() => write({ op: alert?.op === 'gt' ? 'lt' : 'gt', value: alert?.value ?? 0 })}
          className={`px-2 py-1 rounded text-[11px] border transition-colors disabled:opacity-40 ${
            alert?.op === 'lt'
              ? 'border-amber-500/50 bg-amber-500/10 text-amber-200'
              : 'border-white/10 bg-well text-white/60 hover:text-white'
          }`}
        >
          {alert?.op === 'lt' ? '<' : '>'}
        </button>
        <input
          type="number" inputMode="decimal" disabled={disabled}
          value={alert ? String(alert.value) : ''}
          placeholder={t('bi.alert.none')}
          onChange={(e) => {
            const v = e.target.value.trim()
            if (v === '') { write(undefined); return }
            const n = Number(v)
            // ⚠ Un texte illisible ne pose PAS un seuil à zéro : on ignore la frappe.
            if (Number.isFinite(n)) write({ op: alert?.op ?? 'gt', value: n })
          }}
          className="flex-1 min-w-0 rounded bg-well border border-white/10 px-2 py-1 text-[11px] text-white tabular-nums placeholder:text-white/25 focus:outline-none focus:border-indigo-500/60 disabled:opacity-40"
        />
      </div>
      <p className="text-[10px] text-white/25 leading-snug">{t('bi.alert.hint')}</p>
    </div>
  )
}
