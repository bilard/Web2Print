// L'opérateur d'un filtre du visuel, et sa valeur quand il en demande une.
//
// ⚠⚠ Le jeu d'opérateurs proposé suit le TYPE de la colonne : `>` sur un libellé compare des
// nombres qui n'existent pas (`matches` fait `Number(v)`), et ne retiendrait jamais rien —
// en silence. Les comparaisons ne sont donc offertes que sur une colonne numérique ou de date.
import { useTranslation, type TranslationKey } from '@/lib/i18n'
import { BiChipOption, BiChipPopover } from './BiChipPopover'
import type { FieldKind } from '../registry/types'
import type { FilterClause } from '../types'

type Op = FilterClause['op']

/** Opérateurs SANS valeur à saisir : la puce n'affiche alors aucun champ. */
const NO_VALUE: readonly Op[] = ['empty', 'notEmpty']

const TEXT_OPS: Op[] = ['eq', 'ne', 'contains', 'empty', 'notEmpty']
const NUMBER_OPS: Op[] = ['eq', 'ne', 'gt', 'gte', 'lt', 'lte', 'empty', 'notEmpty']

function opsFor(kind: FieldKind | undefined): Op[] {
  return kind === 'number' || kind === 'date' ? NUMBER_OPS : TEXT_OPS
}

const opLabelKey = (op: Op): TranslationKey => `bi.filter.op.${op}` as TranslationKey

export function BiFilterMenu({ filter, kind, disabled, onChange }: {
  filter: FilterClause
  /** Type de la colonne filtrée. Absent = colonne inconnue de la feuille active. */
  kind: FieldKind | undefined
  disabled: boolean
  onChange: (patch: Partial<FilterClause>) => void
}) {
  const { t } = useTranslation()
  const needsValue = !NO_VALUE.includes(filter.op)

  return (
    <>
      <BiChipPopover label={t(opLabelKey(filter.op))} title={t('bi.filter.op')} disabled={disabled}>
        {(close) => opsFor(kind).map((op) => (
          <BiChipOption
            key={op} label={t(opLabelKey(op))} active={op === filter.op}
            onPick={() => {
              // ⚠ La valeur est LARGUÉE en passant à un opérateur qui n'en veut pas : une
              // valeur fantôme reviendrait au prochain changement d'opérateur.
              onChange(NO_VALUE.includes(op) ? { op, value: undefined } : { op })
              close()
            }}
          />
        ))}
      </BiChipPopover>

      {needsValue && (
        <input
          type={kind === 'number' ? 'number' : 'text'}
          value={filter.value === undefined || filter.value === null ? '' : String(filter.value)}
          onChange={(e) => onChange({
            value: kind === 'number' && e.target.value !== '' ? Number(e.target.value) : e.target.value,
          })}
          disabled={disabled}
          placeholder={t('bi.filter.value')} aria-label={t('bi.filter.value')}
          className="w-[64px] shrink-0 rounded bg-white/[0.06] px-1 py-0.5 text-[10px] text-white/80 placeholder:text-white/25 focus:outline-none focus:bg-white/10 disabled:opacity-50"
        />
      )}
    </>
  )
}
