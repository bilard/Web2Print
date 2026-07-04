// src/features/catalog/components/steps/PageStyleCard.tsx
// Carte « Éléments de page » : gestionnaire des éléments hors fiches — bandeau
// taxonomie, pied de page (folio/nom), affiches d'ouverture, couverture et 4e.
// Réglages BORNÉS (visibilité + échelles via variables CSS), le gabarit et
// l'export restent intouchables — même contrat que « Style des fiches ».
import { LayoutTemplate, RotateCcw } from 'lucide-react'
import { DEFAULT_PAGE_STYLE, type CatalogPageStyle, type CatalogPlan } from '../../catalogTypes'

interface Props {
  plan: CatalogPlan
  setPlan: (plan: CatalogPlan) => void
}

type BoolKey = { [K in keyof CatalogPageStyle]: CatalogPageStyle[K] extends boolean ? K : never }[keyof CatalogPageStyle]
type NumKey = { [K in keyof CatalogPageStyle]: CatalogPageStyle[K] extends number ? K : never }[keyof CatalogPageStyle]

interface Group {
  title: string
  toggles: { key: BoolKey; label: string }[]
  sliders: { key: NumKey; label: string; min: number; max: number; step: number; unit?: string }[]
}

const GROUPS: Group[] = [
  {
    title: 'Bandeau taxonomie',
    toggles: [{ key: 'showHeader', label: 'Afficher' }],
    sliders: [{ key: 'headerScale', label: 'Taille', min: 0.7, max: 1.5, step: 0.05 }],
  },
  {
    title: 'Pied de page',
    toggles: [{ key: 'showFooter', label: 'Afficher' }, { key: 'showFooterName', label: 'Nom du catalogue' }],
    sliders: [{ key: 'folioScale', label: 'Folio', min: 0.7, max: 1.5, step: 0.05 }],
  },
  {
    title: "Ouvertures d'univers",
    toggles: [
      { key: 'showOpenerNum', label: 'Numéro XXL' },
      { key: 'showOpenerChip', label: 'Chip chapitre' },
      { key: 'showOpenerCount', label: 'Compteur produits' },
      { key: 'showOpenerPanel', label: 'Panneau familles' },
    ],
    sliders: [{ key: 'openerTitleScale', label: 'Titre & numéro', min: 0.7, max: 1.5, step: 0.05 }],
  },
  {
    title: 'Couverture',
    toggles: [
      { key: 'showCoverBaseline', label: 'Bandeau baseline' },
      { key: 'showCoverSubtitle', label: 'Sous-titre' },
      { key: 'showCoverRule', label: 'Filet accent' },
    ],
    sliders: [
      { key: 'coverTitleScale', label: 'Titres', min: 0.7, max: 1.5, step: 0.05 },
      { key: 'coverOverlay', label: 'Assombrissement visuel', min: 0, max: 80, step: 5, unit: '%' },
    ],
  },
  {
    title: '4e de couverture',
    toggles: [{ key: 'showBackRule', label: 'Filet accent' }],
    sliders: [{ key: 'backScale', label: 'Textes', min: 0.7, max: 1.5, step: 0.05 }],
  },
]

function sliderLabel(value: number, unit?: string): string {
  return unit ? `${value}${unit}` : `${Math.round(value * 100)}%`
}

export function PageStyleCard({ plan, setPlan }: Props) {
  const style: CatalogPageStyle = { ...DEFAULT_PAGE_STYLE, ...plan.pageStyle }
  const patch = (p: Partial<CatalogPageStyle>) => setPlan({ ...plan, pageStyle: { ...style, ...p } })

  return (
    <section className="rounded-lg border border-border bg-surface p-4 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-white">
          <LayoutTemplate className="w-4 h-4 text-indigo-400" /> Éléments de page
          <span className="text-xs font-normal text-muted-foreground">— bandeau, folio, ouvertures, couvertures ; la mise en page reste préservée</span>
        </h3>
        <button type="button" onClick={() => setPlan({ ...plan, pageStyle: { ...DEFAULT_PAGE_STYLE } })}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs text-muted-foreground hover:text-white hover:bg-surface-2"
          title="Revenir aux éléments par défaut">
          <RotateCcw className="w-3.5 h-3.5" /> Réinitialiser
        </button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {GROUPS.map((g) => (
          <div key={g.title} className="rounded-md bg-surface-2/50 border border-border/60 p-3 space-y-2 min-w-0">
            <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{g.title}</div>
            <div className="flex flex-col gap-1.5">
              {g.toggles.map(({ key, label }) => (
                <label key={key} className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer select-none">
                  <input type="checkbox" checked={style[key]} onChange={(e) => patch({ [key]: e.target.checked } as Partial<CatalogPageStyle>)}
                    className="accent-indigo-600" />
                  {label}
                </label>
              ))}
            </div>
            {g.sliders.map(({ key, label, min, max, step, unit }) => (
              <label key={key} className="flex flex-col gap-1 text-xs text-muted-foreground">
                <span className="flex items-center justify-between">
                  {label}
                  <span className="tabular-nums text-white">{sliderLabel(style[key], unit)}</span>
                </span>
                <input type="range" min={min} max={max} step={step} value={style[key]}
                  onChange={(e) => patch({ [key]: Number(e.target.value) } as Partial<CatalogPageStyle>)}
                  className="w-full accent-indigo-500" />
              </label>
            ))}
          </div>
        ))}
      </div>
    </section>
  )
}
