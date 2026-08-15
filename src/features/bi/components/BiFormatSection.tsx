// La MISE EN FORME de la tuile sélectionnée : ce qui change son allure sans toucher aux
// champs qu'elle porte.
//
// ⚠⚠ Ces réglages existaient au contrat (`stacked`, `showTotals`) sans qu'aucune interface
// ne les pose : ils n'étaient donc atteignables que par un document écrit à la main. Un
// réglage enregistrable et inatteignable est un réglage mort.
//
// ⚠ Chaque bascule ne paraît que sur les visuels qu'elle CONCERNE : empiler un camembert ou
// coucher un tableau croisé ne veut rien dire, et une case sans effet se lit comme une panne.
import { useTranslation } from '@/lib/i18n'
import type { TranslationKey } from '@/lib/i18n'
import type { Tile, TileKind } from '../types'

type Flag = 'horizontal' | 'stacked' | 'showTotals'

const BARS = (kind: TileKind) => kind === 'bar'
const STACKABLE = (kind: TileKind) => kind === 'bar' || kind === 'area' || kind === 'line'

const FLAGS: { flag: Flag; labelKey: TranslationKey; hintKey: TranslationKey
  applies: (kind: TileKind) => boolean }[] = [
  { flag: 'horizontal', labelKey: 'bi.format.horizontal', hintKey: 'bi.format.horizontalHint',
    applies: BARS },
  { flag: 'stacked', labelKey: 'bi.format.stacked', hintKey: 'bi.format.stackedHint',
    applies: STACKABLE },
  { flag: 'showTotals', labelKey: 'bi.format.showTotals', hintKey: 'bi.format.showTotalsHint',
    applies: (kind) => kind === 'pivot' },
]

export function BiFormatSection({ tile, canEdit, onApply }: {
  tile: Tile | null
  canEdit: boolean
  onApply: (next: Tile) => void
}) {
  const { t } = useTranslation()
  const shown = tile ? FLAGS.filter((f) => f.applies(tile.kind)) : []
  // ⚠ Section ENTIÈREMENT masquée quand ce visuel n'a rien à régler : un intertitre suivi du
  // vide se lit comme un volet qui n'a pas fini de charger.
  if (!tile || shown.length === 0) return null

  const toggle = (flag: Flag) => {
    const options = { ...tile.options, [flag]: !tile.options?.[flag] }
    // ⚠ La clé est RETIRÉE quand elle retombe à faux, jamais laissée à `false` : le document
    // ne garde que ce qui s'écarte du défaut, et `parseDashboard` reste tolérant aux anciens.
    if (!options[flag]) delete options[flag]
    onApply({ ...tile, options })
  }

  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[10px] uppercase tracking-wide text-white/35">
        {t('bi.format.title')}
      </span>
      {shown.map(({ flag, labelKey, hintKey }) => {
        const on = tile.options?.[flag] === true
        return (
          <button
            key={flag} type="button" disabled={!canEdit} onClick={() => toggle(flag)}
            aria-pressed={on} title={t(hintKey)}
            className={`flex items-center justify-between gap-2 rounded border px-2 py-1.5 text-left
              text-[11px] transition-colors disabled:opacity-40 ${
              on
                ? 'border-indigo-500/50 bg-indigo-500/10 text-white'
                : 'border-white/10 bg-well text-white/60 enabled:hover:text-white'
            }`}
          >
            <span className="min-w-0 truncate">{t(labelKey)}</span>
            {/* Interrupteur sobre : la pastille dit l'état, le cadre dit qu'on peut cliquer. */}
            <span className={`h-3 w-6 shrink-0 rounded-full p-0.5 transition-colors ${
              on ? 'bg-indigo-500' : 'bg-white/15'
            }`}
            >
              <span className={`block h-2 w-2 rounded-full bg-[#fff] transition-transform ${
                on ? 'translate-x-3' : ''
              }`}
              />
            </span>
          </button>
        )
      })}
    </div>
  )
}
