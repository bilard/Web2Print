import { useId } from 'react'
import type { ConfigField } from '../../types'
import { t } from '@/lib/i18n'

interface FieldProps {
  field: ConfigField
  value: unknown
  onChange: (next: unknown) => void
  /** En-têtes réellement produits par les nodes amont. Vide tant qu'aucun run ni aucune
   *  déclaration statique ne les a fait connaître — on n'affirme alors rien. */
  columns?: string[]
}

const inputCls = 'w-full bg-background border border-neutral-700 rounded px-2 py-1.5 text-sm text-white focus:border-indigo-500 outline-none'

/**
 * Champ désignant une COLONNE de la feuille branchée. Saisie libre — le nom peut être
 * connu avant tout run — mais assistée : la liste des en-têtes réels est proposée à la
 * frappe, et un nom qui ne désigne aucune colonne connue est signalé.
 *
 * Pourquoi : quand le fichier source est renommé (« Famille » → « FAMILLE »), rien à
 * l'écran ne disait que la config pointait désormais dans le vide. La résolution du node
 * rattrape le coup en devinant, mais silencieusement à l'écran — on découvrait l'écart
 * dans le journal du run, une fois les vingt minutes de comparaison passées.
 */
function ColumnField({ field, value, onChange, columns = [] }: FieldProps) {
  const listId = useId()
  const asked = String(value ?? '').trim()
  const unknown = asked !== '' && columns.length > 0 && !columns.includes(asked)
  return (
    <>
      <input type="text" list={columns.length > 0 ? listId : undefined}
        className={`${inputCls} ${unknown ? 'border-amber-500/60' : ''}`}
        value={String(value ?? '')} onChange={(e) => onChange(e.target.value)}
        placeholder={field.helpKey ? t(field.helpKey) : field.help} />
      {columns.length > 0 && (
        <datalist id={listId}>{columns.map((c) => <option key={c} value={c} />)}</datalist>
      )}
      {unknown && (
        <span className="text-[11px] text-amber-400/80 mt-1 block">{t('wfn.columnNotInSheet')}</span>
      )}
    </>
  )
}

export function ConfigFieldRenderer({ field, value, onChange, columns }: FieldProps) {
  switch (field.kind) {
    case 'columnRef':
      return <ColumnField field={field} value={value} onChange={onChange} columns={columns} />
    case 'text':
    case 'expression':
      return <input type="text" className={inputCls} value={String(value ?? '')} onChange={(e) => onChange(e.target.value)} placeholder={field.helpKey ? t(field.helpKey) : field.help} />
    case 'textarea':
      return <textarea className={inputCls + ' min-h-[80px]'} value={String(value ?? '')} onChange={(e) => onChange(e.target.value)} />
    case 'number': {
      // Autorise le champ vide et l'édition : ne PAS forcer Number('')→0 (sinon impossible
      // de vider/modifier). Vide = '' ; sinon le nombre. Le runtime fait Number(x)||0.
      const numVal = value === '' || value === null || value === undefined ? '' : (value as number)
      return (
        <input
          type="number"
          className={inputCls}
          value={numVal}
          onChange={(e) => onChange(e.target.value === '' ? '' : Number(e.target.value))}
        />
      )
    }
    case 'checkbox':
      return <input type="checkbox" checked={Boolean(value)} onChange={(e) => onChange(e.target.checked)} />
    case 'select':
      return (
        <select className={inputCls} value={String(value ?? '')} onChange={(e) => onChange(e.target.value)}>
          {(field.options ?? []).map((o) => (
            <option key={o.value} value={o.value}>
              {o.labelKey ? t(o.labelKey) : o.label}
            </option>
          ))}
        </select>
      )
    default:
      return <span className="text-xs text-red-400">Unknown field kind: {(field as any).kind}</span>
  }
}
