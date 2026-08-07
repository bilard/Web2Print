import { useId } from 'react'
import type { ConfigField } from '../../types'
import { WEEKDAY_KEYS, WEEKDAY_SHORT_KEYS } from '../../runtime/cronLabels'
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
        <span className="text-[11px] text-amber-400/80 mt-1 flex items-start gap-2">
          <span className="flex-1">{t('wfn.columnNotInSheet')}</span>
          {/* Vider PLUTÔT que laisser : une valeur qui ne désigne rien fait deviner une
              colonne de remplacement au node — un mapping inventé vaut moins qu'un champ
              vide, qui laisse la détection choisir en connaissance de cause. */}
          <button type="button" onClick={() => onChange('')}
            className="shrink-0 underline decoration-dotted hover:text-amber-200">
            {t('wfn.clearColumn')}
          </button>
        </span>
      )}
    </>
  )
}

/** Séparateurs acceptés dans la chaîne stockée — le chevron typographique compris, parce
 *  que c'est celui que le journal des runs écrit et qu'on recopie naturellement. */
const LEVEL_SPLIT = /[>›»|,;/\n]/

/**
 * Plusieurs colonnes ORDONNÉES (niveaux de taxonomie, du plus large au plus fin). Stocké
 * en une chaîne « A > B > C » : le format reste lisible, éditable à la main, et compatible
 * avec les configs déjà saisies.
 *
 * Chaque niveau est un choix dans les colonnes RÉELLES : taper un nom de colonne de tête
 * revenait à parier sur son orthographe exacte, et une faute retombait en silence sur la
 * détection automatique.
 */
function ColumnListField({ value, onChange, columns = [] }: FieldProps) {
  const levels = String(value ?? '').split(LEVEL_SPLIT).map((s) => s.trim()).filter(Boolean)
  const commit = (next: string[]) => onChange(next.filter(Boolean).join(' > '))
  // Sans colonnes connues, aucun choix à proposer : on garde la saisie libre plutôt que
  // d'afficher une liste vide qui empêcherait toute configuration avant le premier run.
  if (columns.length === 0) {
    return <input type="text" className={inputCls} value={String(value ?? '')}
      onChange={(e) => onChange(e.target.value)} placeholder="UNIVERS > FAMILLE > SOUS_FAMILLE" />
  }
  const free = columns.filter((c) => !levels.includes(c))
  return (
    <div className="space-y-1.5">
      {levels.map((level, i) => (
        <div key={`${level}-${i}`} className="flex items-center gap-1">
          <span className="text-[10px] text-white/30 w-4 shrink-0 tabular-nums">{i + 1}.</span>
          <select className={inputCls} value={columns.includes(level) ? level : ''}
            onChange={(e) => commit(levels.map((l, j) => (j === i ? e.target.value : l)))}>
            {/* Une valeur qui ne désigne aucune colonne reste visible plutôt que d'être
                remplacée en douce par la première de la liste. */}
            {!columns.includes(level) && <option value="">{level} — introuvable</option>}
            {[level, ...free].filter((c) => columns.includes(c)).map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <button type="button" onClick={() => commit(levels.filter((_, j) => j !== i))}
            className="shrink-0 px-1.5 py-1 text-white/30 hover:text-red-400" title={t('wfn.level.remove')}>×</button>
          <button type="button" disabled={i === 0} title={t('wfn.level.up')}
            onClick={() => commit(levels.map((l, j) => (j === i - 1 ? levels[i] : j === i ? levels[i - 1] : l)))}
            className="shrink-0 px-1 py-1 text-white/30 hover:text-white disabled:opacity-20">↑</button>
        </div>
      ))}
      {free.length > 0 && (
        <select className={inputCls + ' text-white/50'} value=""
          onChange={(e) => e.target.value && commit([...levels, e.target.value])}>
          <option value="">{t('wfn.level.add')}</option>
          {free.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      )}
    </div>
  )
}

/**
 * Choix multiple parmi des options fixes. Stocké en « a,b,c » : lisible dans la config
 * sauvegardée, et un réglage qu'on peut relire sans outil.
 *
 * ⚠ Une valeur VIDE vaut « tout » côté node, jamais « rien » : un champ jamais touché ne
 * doit pas vider silencieusement l'export de la moitié de ses colonnes.
 */
function MultiSelectField({ field, value, onChange }: FieldProps) {
  const opts = field.options ?? []
  const raw = String(value ?? '').trim()
  const selected = raw ? new Set(raw.split(',').map((v) => v.trim()).filter(Boolean)) : new Set(opts.map((o) => o.value))
  const toggle = (v: string) => {
    const next = new Set(selected)
    if (next.has(v)) next.delete(v)
    else next.add(v)
    // On réécrit dans l'ORDRE des options, pas dans l'ordre des clics : c'est celui des
    // colonnes produites, et une config qui le respecte se relit sans surprise.
    onChange(opts.filter((o) => next.has(o.value)).map((o) => o.value).join(','))
  }
  return (
    <div className="grid grid-cols-2 gap-x-3 gap-y-1">
      {opts.map((o) => (
        <label key={o.value} className="flex items-center gap-1.5 text-[11px] text-white/70 cursor-pointer">
          <input type="checkbox" checked={selected.has(o.value)} onChange={() => toggle(o.value)}
            className="accent-indigo-500" />
          <span className="truncate">{o.labelKey ? t(o.labelKey) : o.label}</span>
        </label>
      ))}
    </div>
  )
}

/** Ordre d'AFFICHAGE : la semaine commence le lundi. Les valeurs restent celles de
 *  JavaScript (0 = dimanche), c'est ce que le moteur de créneau compare. */
const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0]

/**
 * Jours de la semaine en pastilles. Stocké « 1,2,3,4,5 » — même format qu'avant, donc les
 * cadences déjà réglées à la main restent valides.
 *
 * ⚠ Vide vaut « TOUS les jours », jamais « aucun » : une cadence sans aucun jour n'enverrait
 * plus rien, en silence. Les sept jours cochés se ramènent donc à vide, et retirer le
 * dernier jour y revient aussi — les deux états sont le même, autant n'en montrer qu'un.
 */
function WeekdaysField({ value, onChange }: FieldProps) {
  const picked = String(value ?? '')
    .split(/[,\s]+/).map(Number).filter((n) => Number.isInteger(n) && n >= 0 && n <= 6)
  const all = picked.length === 0
  const commit = (days: number[]) => {
    const kept = WEEK_ORDER.filter((d) => days.includes(d))
    onChange(kept.length === 0 || kept.length === 7 ? '' : kept.join(','))
  }
  // Quand rien n'est coché, les sept jours sont actifs : cliquer RETIRE ce jour-là, ce que
  // l'affichage laisse attendre puisque toutes les pastilles sont allumées.
  const toggle = (d: number) => {
    const base = all ? WEEK_ORDER : picked
    commit(base.includes(d) ? base.filter((x) => x !== d) : [...base, d])
  }
  return (
    <div className="space-y-1.5">
      <div className="flex gap-1">
        {WEEK_ORDER.map((d) => {
          const on = all || picked.includes(d)
          return (
            <button key={d} type="button" onClick={() => toggle(d)} aria-pressed={on}
              title={t(WEEKDAY_KEYS[d])}
              className={`flex-1 py-1.5 rounded text-[11px] font-medium border transition-colors ${
                on
                  // Vide = implicite : allumé, mais plus discret qu'un choix délibéré.
                  ? all
                    ? 'bg-indigo-500/15 border-indigo-500/30 text-indigo-200/70'
                    : 'bg-indigo-500/80 border-indigo-400 text-[#fff]'
                  : 'bg-background border-neutral-700 text-white/35 hover:text-white/70'
              }`}>
              {t(WEEKDAY_SHORT_KEYS[d]).replace(/\.$/, '')}
            </button>
          )
        })}
      </div>
      <div className="flex items-center gap-3 text-[11px]">
        <span className={all ? 'text-indigo-300/80' : 'text-white/35'}>
          {all ? t('wfn.weekdays.all') : t('wfn.weekdays.count', { n: picked.length })}
        </span>
        <button type="button" onClick={() => commit([1, 2, 3, 4, 5])}
          className="text-white/40 underline decoration-dotted hover:text-white">{t('wfn.weekdays.week')}</button>
        <button type="button" onClick={() => commit([6, 0])}
          className="text-white/40 underline decoration-dotted hover:text-white">{t('wfn.weekdays.weekend')}</button>
        <button type="button" onClick={() => onChange('')}
          className="text-white/40 underline decoration-dotted hover:text-white">{t('wfn.weekdays.every')}</button>
      </div>
    </div>
  )
}

export function ConfigFieldRenderer({ field, value, onChange, columns }: FieldProps) {
  switch (field.kind) {
    case 'weekdays':
      return <WeekdaysField field={field} value={value} onChange={onChange} />
    case 'time':
      // Sélecteur natif : même raison que le stepper des champs numériques — le contrôle
      // du système connaît le format de l'utilisateur mieux qu'un masque de saisie.
      return <input type="time" className={inputCls} value={String(value ?? '')} onChange={(e) => onChange(e.target.value)} />
    case 'multiSelect':
      return <MultiSelectField field={field} value={value} onChange={onChange} />
    case 'columnRef':
      return <ColumnField field={field} value={value} onChange={onChange} columns={columns} />
    case 'columnList':
      return <ColumnListField field={field} value={value} onChange={onChange} columns={columns} />
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
