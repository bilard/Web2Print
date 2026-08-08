// Panneau des plans de champs de la carte « Enrichir les textes ».
//
// Les réglages scalaires (projet, plafond, borne) restent au schéma générique : ici on ne
// rend que ce qu'il ne sait pas faire — une liste ORDONNÉE de plans. Contrôles en HTML
// brut, comme le reste du dossier : le panneau latéral fait quatre cents pixels, et les
// composants de formulaire du design system y sont trop hauts.
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react'
import { useTranslation } from '@/lib/i18n'
import { configProblem, type PlanConfig, type TextEnrichConfig } from '@/features/textEnrich/nodeConfig'
import type { EnrichKind } from '@/features/textEnrich/revision'

const KINDS: EnrichKind[] = ['translate', 'improve', 'structure']
const INPUT = 'h-7 rounded border border-border bg-well px-2 text-xs text-white outline-none focus:border-accent'

export function TextEnrichConfigPanel({
  config, onChange,
}: { config: TextEnrichConfig; onChange: (next: TextEnrichConfig) => void }) {
  const { t } = useTranslation()
  const problem = configProblem(config)

  const setPlan = (i: number, patch: Partial<PlanConfig>) => {
    onChange({ ...config, plans: config.plans.map((p, j) => (j === i ? { ...p, ...patch } : p)) })
  }
  const move = (i: number, delta: number) => {
    const to = i + delta
    if (to < 0 || to >= config.plans.length) return
    const next = [...config.plans]
    ;[next[i], next[to]] = [next[to], next[i]]
    onChange({ ...config, plans: next })
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-white">{t('node.text-enrich.plansTitle')}</span>
        <button
          type="button"
          className="flex items-center gap-1 rounded px-1.5 py-1 text-[11px] text-muted-foreground hover:bg-surface-2 hover:text-white"
          onClick={() => onChange({
            ...config,
            plans: [...config.plans, {
              enabled: true, key: '', kind: 'improve', minLength: 28, prompt: '', promptVersion: 'v1',
            }],
          })}
        >
          <Plus className="h-3.5 w-3.5" />
          {t('node.text-enrich.addPlan')}
        </button>
      </div>

      {/* ⚠ L'ordre est SIGNIFIANT : le moteur applique les plans dans l'ordre de la liste,
          et c'est lui seul qui garantit qu'on traduit avant d'étoffer. D'où les flèches. */}
      <p className="text-[11px] leading-snug text-muted-foreground">{t('node.text-enrich.orderHint')}</p>

      {config.plans.map((plan, i) => (
        <div key={i} className="space-y-2 rounded-md border border-border bg-surface-2 p-2.5">
          <div className="flex items-center gap-1.5">
            <input
              type="checkbox" checked={plan.enabled} title={t('node.text-enrich.enabled')}
              onChange={(e) => setPlan(i, { enabled: e.target.checked })}
              className="h-3.5 w-3.5 accent-accent"
            />
            <input
              value={plan.key} onChange={(e) => setPlan(i, { key: e.target.value })}
              placeholder={t('node.text-enrich.fieldKey')}
              className={`${INPUT} min-w-0 flex-1`}
            />
            <select
              value={plan.kind} onChange={(e) => setPlan(i, { kind: e.target.value as EnrichKind })}
              className={INPUT}
            >
              {KINDS.map((k) => (
                <option key={k} value={k}>
                  {t(`node.text-enrich.kind.${k}` as 'node.text-enrich.kind.translate')}
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
              onClick={() => onChange({ ...config, plans: config.plans.filter((_, j) => j !== i) })}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>

          <textarea
            value={plan.prompt} onChange={(e) => setPlan(i, { prompt: e.target.value })}
            placeholder={t('node.text-enrich.promptPlaceholder')}
            rows={3}
            className="w-full rounded border border-border bg-well px-2 py-1.5 text-xs text-white outline-none focus:border-accent"
          />

          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[11px] text-muted-foreground">
            <label className="flex items-center gap-1">
              {t('node.text-enrich.minLength')}
              {/* Le seuil ne veut rien dire pour une traduction : c'est la langue qui
                  décide, pas la longueur. Le champ reste visible mais inerte. */}
              <input
                type="number" value={plan.minLength} disabled={plan.kind === 'translate'}
                onChange={(e) => setPlan(i, { minLength: Number(e.target.value) || 0 })}
                className={`${INPUT} w-14 disabled:opacity-40`}
              />
            </label>
            <label className="flex items-center gap-1">
              {t('node.text-enrich.promptVersion')}
              <input
                value={plan.promptVersion} onChange={(e) => setPlan(i, { promptVersion: e.target.value })}
                className={`${INPUT} w-14`}
              />
            </label>
            <label className="flex items-center gap-1">
              <input
                type="checkbox" checked={!!plan.useTemplate} className="h-3.5 w-3.5 accent-accent"
                onChange={(e) => setPlan(i, { useTemplate: e.target.checked })}
              />
              {t('node.text-enrich.useTemplate')}
            </label>
            <label className="flex items-center gap-1">
              <input
                type="checkbox" checked={!!plan.includeEmpty} className="h-3.5 w-3.5 accent-accent"
                onChange={(e) => setPlan(i, { includeEmpty: e.target.checked })}
              />
              {t('node.text-enrich.includeEmpty')}
            </label>
          </div>
        </div>
      ))}

      <div className="grid grid-cols-3 gap-2">
        {(['brandField', 'refField', 'eanField'] as const).map((f) => (
          <label key={f} className="space-y-1 text-[11px] text-muted-foreground">
            <span className="block">{t(`node.text-enrich.${f}` as 'node.text-enrich.brandField')}</span>
            <input
              value={config[f]} onChange={(e) => onChange({ ...config, [f]: e.target.value })}
              className={`${INPUT} w-full`}
            />
          </label>
        ))}
      </div>

      {/* Le blocage est annoncé ICI, pas au lancement : un passage qui refuse de partir
          après un clic laisse chercher lequel des huit réglages était en cause. */}
      {problem && (
        <p className="text-[11px] leading-snug text-amber-400">
          {t(`run.textEnrich.problem.${problem}` as 'run.textEnrich.problem.no-project')}
        </p>
      )}
    </div>
  )
}
