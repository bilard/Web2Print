// Panneau de « Traduire et améliorer les fiches » : une LISTE DE PLANS, comme sur la carte
// « Enrichir les textes » dont il reprend la forme.
//
// ⚠ Une liste d'objets ne se rend pas depuis `configSchema` : le schéma générique n'en
// sait faire qu'une suite de cases et de zones de texte empilées, illisible dès qu'il y a
// deux champs et deux opérations. C'est cette bouillie qui a rendu la carte incompréhensible.
//
// ⚠ Et contrairement à la carte dont il reprend l'aspect, DEUX PLANS SUR LE MÊME CHAMP
// sont ici la manière normale de travailler : traduire puis améliorer, dans le même
// passage. Rien à désactiver, rien à relancer.
import { Plus, ArrowUp, ArrowDown, Trash2 } from 'lucide-react'
import { useTranslation } from '@/lib/i18n'
import type { RevisePlan, ReviseField, ReviseKind } from './catalogTextReviseTypes'

const INPUT = 'rounded border border-border bg-well px-2 py-1 text-xs text-white outline-none focus:border-accent'
const FIELDS: ReviseField[] = ['name', 'description']
const KINDS: ReviseKind[] = ['translate', 'improve']

/** ⚠ Générique sur la config ENTIÈRE de la carte : le panneau n'édite que `plans`, mais
 *  il reçoit et rend l'objet complet — le réduire à `{ plans }` effacerait le suivi, la
 *  portée et le plafond au premier clic. */
export function CatalogTextReviseConfigPanel<C extends { plans?: RevisePlan[] }>({ config, onChange }: {
  config: C
  onChange: (next: C) => void
}) {
  const { t } = useTranslation()
  const plans = config.plans ?? []
  const setPlans = (next: RevisePlan[]) => onChange({ ...config, plans: next })
  const setPlan = (i: number, patch: Partial<RevisePlan>) =>
    setPlans(plans.map((p, j) => (j === i ? { ...p, ...patch } : p)))
  const move = (i: number, d: number) => {
    const j = i + d
    if (j < 0 || j >= plans.length) return
    const next = [...plans]
    ;[next[i], next[j]] = [next[j], next[i]]
    setPlans(next)
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-white">{t('node.catalog-text-revise.plans')}</span>
        <button
          type="button"
          onClick={() => setPlans([...plans, { enabled: true, field: 'description', kind: 'translate', prompt: '' }])}
          className="flex items-center gap-1 rounded px-1.5 py-1 text-[11px] text-muted-foreground hover:bg-well hover:text-white"
        >
          <Plus className="h-3.5 w-3.5" />{t('node.catalog-text-revise.add')}
        </button>
      </div>

      {/* L'ORDRE COMPTE, ici : le prompt annonce les opérations dans cet ordre, et une
          réécriture placée après une traduction travaille sur le texte traduit. */}
      <p className="text-[11px] leading-snug text-muted-foreground">{t('node.catalog-text-revise.orderHint')}</p>

      {plans.map((plan, i) => (
        <div key={i} className="space-y-2 rounded-md border border-border bg-surface-2 p-2.5">
          <div className="flex items-center gap-1.5">
            <input
              type="checkbox" checked={plan.enabled} title={t('node.text-enrich.enabled')}
              onChange={(e) => setPlan(i, { enabled: e.target.checked })}
              className="h-3.5 w-3.5 accent-accent"
            />
            {/* Deux entrées seulement, et c'est un fait de la donnée : le catalogue relu
                ne porte que ces deux textes. C'est « Comparer catalogue » qui décide
                quelle colonne de la feuille alimente lequel. */}
            <select
              value={plan.field} onChange={(e) => setPlan(i, { field: e.target.value as ReviseField })}
              className={`${INPUT} min-w-0 flex-1`}
            >
              {FIELDS.map((f) => (
                <option key={f} value={f}>
                  {t(`node.catalog-text-revise.field.${f}` as 'node.catalog-text-revise.field.name')}
                </option>
              ))}
            </select>
            <select
              value={plan.kind} onChange={(e) => setPlan(i, { kind: e.target.value as ReviseKind })}
              className={INPUT}
            >
              {KINDS.map((k) => (
                <option key={k} value={k}>
                  {t(`node.catalog-text-revise.mode.${k}` as 'node.catalog-text-revise.mode.translate')}
                </option>
              ))}
            </select>
            <button type="button" onClick={() => move(i, -1)} className="rounded p-1 text-muted-foreground hover:bg-well hover:text-white">
              <ArrowUp className="h-3.5 w-3.5" />
            </button>
            <button type="button" onClick={() => move(i, 1)} className="rounded p-1 text-muted-foreground hover:bg-well hover:text-white">
              <ArrowDown className="h-3.5 w-3.5" />
            </button>
            <button
              type="button" className="rounded p-1 text-muted-foreground hover:bg-well hover:text-red-400"
              onClick={() => setPlans(plans.filter((_, j) => j !== i))}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>

          <textarea
            value={plan.prompt ?? ''} onChange={(e) => setPlan(i, { prompt: e.target.value })}
            placeholder={plan.kind === 'translate'
              ? t('node.catalog-text-revise.promptOptional')
              : t('node.catalog-text-revise.promptPlaceholder')}
            rows={3}
            // Une réécriture sans consigne laisse le modèle inventer un style et l'écrire
            // dans les fiches : la ligne se signale avant de partir, pas après.
            className={`w-full rounded border bg-well px-2 py-1.5 text-xs text-white outline-none focus:border-accent ${
              plan.enabled && plan.kind === 'improve' && !(plan.prompt ?? '').trim()
                ? 'border-amber-500/60' : 'border-border'
            }`}
          />
        </div>
      ))}
    </div>
  )
}
