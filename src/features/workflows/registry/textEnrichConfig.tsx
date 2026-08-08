// Panneau de config de la carte « Enrichir les textes ».
//
// ⚠ IL REND TOUT, y compris les réglages scalaires que `configSchema` déclare déjà.
// `NodeConfigPanel` choisit l'un OU l'autre : dès qu'un `ConfigComponent` existe, la liste
// générique du schéma n'est PAS rendue. Un panneau qui ne s'occuperait que des plans
// laisserait donc le projet PIM, le plafond et la borne invisibles — la carte serait
// impossible à régler, et rien ne le signalerait.
//
// Le `configSchema` reste déclaré côté node malgré ça : il porte le `required` que lit le
// pré-vol du workflow, et prompt-to-flow y lit les champs remplissables. Les deux vues
// écrivent le même objet, il n'y a donc pas deux états — seulement deux libellés.
//
// Contrôles en HTML brut, comme le reste du dossier : le panneau latéral fait quatre cents
// pixels, et les composants de formulaire du design system y sont trop hauts.
import { useEffect, useState } from 'react'
import { ArrowDown, ArrowUp, Loader2, Plus, Trash2 } from 'lucide-react'
import { useTranslation } from '@/lib/i18n'
import { listPimProjects, type PimProjectSummary } from '@/features/merge/pimSource'
import { getWorkspaceUid } from '@/features/access/useWorkspaceUid'
import { configProblem, type PlanConfig, type TextEnrichConfig } from '@/features/textEnrich/nodeConfig'
import type { EnrichKind } from '@/features/textEnrich/revision'

const KINDS: EnrichKind[] = ['translate', 'improve', 'structure']
const INPUT = 'h-7 rounded border border-border bg-well px-2 text-xs text-white outline-none focus:border-accent'

/**
 * Choisir une colonne plutôt que la taper.
 *
 * Une clé mal orthographiée ne produit AUCUNE erreur : le passage compte tout « hors
 * périmètre » et annonce « rien à traiter » — un succès parfaitement propre, et
 * parfaitement vide. Sur une feuille de quatorze colonnes aux en-têtes inconnus d'avance,
 * c'est la panne la plus probable.
 *
 * ⚠ DÉFINI HORS DU COMPOSANT. Déclaré à l'intérieur, il serait recréé à chaque rendu :
 * React démonterait le champ à chaque frappe et le focus sauterait au premier caractère.
 */
function ColumnField({ value, onPick, cols, placeholder, className }: {
  value: string
  onPick: (v: string) => void
  /** Colonnes de la feuille branchée. Vide = saisie libre (mode PIM). */
  cols: string[]
  placeholder?: string
  className?: string
}) {
  if (cols.length === 0) {
    return (
      <input value={value} onChange={(e) => onPick(e.target.value)} placeholder={placeholder}
        className={`${INPUT} ${className ?? ''}`} />
    )
  }
  return (
    <select value={value} onChange={(e) => onPick(e.target.value)} className={`${INPUT} ${className ?? ''}`}>
      <option value="">{placeholder ?? '—'}</option>
      {/* Une colonne réglée qui a disparu de la feuille reste proposée, suivie d'un
          astérisque : la retirer du menu changerait le réglage en silence. */}
      {!cols.includes(value) && value !== '' && <option value={value}>{value} *</option>}
      {cols.map((c) => <option key={c} value={c}>{c}</option>)}
    </select>
  )
}

export function TextEnrichConfigPanel({
  config, onChange, availableColumns,
}: {
  config: TextEnrichConfig
  onChange: (next: TextEnrichConfig) => void
  /** Colonnes de la feuille branchée en amont. Vide = pas de feuille (mode PIM). */
  availableColumns?: string[]
}) {
  const { t } = useTranslation()
  const problem = configProblem(config, availableColumns != null && availableColumns.length > 0)
  const [projects, setProjects] = useState<PimProjectSummary[]>([])
  const [loading, setLoading] = useState(true)
  // ⚠ Des colonnes connues = une feuille est branchée. C'est le seul signal dont dispose
  // un panneau de config : il ne voit pas le graphe.
  const cols = availableColumns ?? []
  const fromSheet = cols.length > 0

  useEffect(() => {
    // Inutile quand une feuille alimente la carte : le projet PIM ne sert alors à rien,
    // et lire la collection pour rien coûte une requête à chaque ouverture du panneau.
    if (fromSheet) { setLoading(false); return }
    let alive = true
    const uid = getWorkspaceUid()
    if (!uid) { setLoading(false); return }
    listPimProjects(uid)
      .then((list) => { if (alive) setProjects(list) })
      // Un échec de liste ne doit pas rendre la carte inutilisable : on retombe sur la
      // saisie libre de l'identifiant, qui marche toujours.
      .catch(() => undefined)
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [fromSheet])

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
      {/* Le projet se CHOISIT : son identifiant est un doc Firestore, que personne ne
          connaît de mémoire. Saisie libre en repli, si la liste ne charge pas. */}
      <label className={`block space-y-1 text-[11px] text-muted-foreground ${fromSheet ? 'opacity-40' : ''}`}>
        <span className="flex items-center gap-1.5">
          {t('node.text-enrich.projectId')}
          {loading && !fromSheet && <Loader2 className="h-3 w-3 animate-spin" />}
          {fromSheet && <span className="text-amber-400/80">— {t('node.text-enrich.sheetWins')}</span>}
        </span>
        {projects.length > 0 ? (
          <select
            value={config.projectId} onChange={(e) => onChange({ ...config, projectId: e.target.value })}
            className={`${INPUT} w-full`}
          >
            <option value="">{t('node.text-enrich.pickProject')}</option>
            {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        ) : (
          <input
            value={config.projectId} onChange={(e) => onChange({ ...config, projectId: e.target.value })}
            className={`${INPUT} w-full`}
          />
        )}
      </label>

      <div className="grid grid-cols-2 gap-2">
        <label className="space-y-1 text-[11px] text-muted-foreground">
          <span className="block">{t('node.text-enrich.capUsd')}</span>
          <input
            type="number" min={0} step={1} value={config.capUsd}
            onChange={(e) => onChange({ ...config, capUsd: Number(e.target.value) || 0 })}
            className={`${INPUT} w-full`}
          />
        </label>
        <label className="space-y-1 text-[11px] text-muted-foreground">
          <span className="block">{t('node.text-enrich.maxUnits')}</span>
          <input
            type="number" min={1} step={100} value={config.maxUnits}
            onChange={(e) => onChange({ ...config, maxUnits: Number(e.target.value) || 1 })}
            className={`${INPUT} w-full`}
          />
        </label>
      </div>

      <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-[11px] text-muted-foreground">
        <label className="flex items-center gap-1.5">
          <input
            type="checkbox" checked={config.withNote} className="h-3.5 w-3.5 accent-accent"
            onChange={(e) => onChange({ ...config, withNote: e.target.checked })}
          />
          {t('node.text-enrich.withNote')}
        </label>
        <label className="flex items-center gap-1.5">
          <input
            type="checkbox" checked={config.dryRun} className="h-3.5 w-3.5 accent-accent"
            onChange={(e) => onChange({ ...config, dryRun: e.target.checked })}
          />
          {t('node.text-enrich.dryRun')}
        </label>
      </div>

      <div className="h-px bg-border" />
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

      {/* Les flèches ne servent QUE de confort de lecture depuis qu'un même champ ne peut
          plus porter deux plans dans un passage : l'ordre ne décide plus rien. */}
      <p className="text-[11px] leading-snug text-muted-foreground">{t('node.text-enrich.orderHint')}</p>

      {config.plans.map((plan, i) => (
        <div key={i} className="space-y-2 rounded-md border border-border bg-surface-2 p-2.5">
          <div className="flex items-center gap-1.5">
            <input
              type="checkbox" checked={plan.enabled} title={t('node.text-enrich.enabled')}
              onChange={(e) => setPlan(i, { enabled: e.target.checked })}
              className="h-3.5 w-3.5 accent-accent"
            />
            <ColumnField
              value={plan.key} onPick={(v) => setPlan(i, { key: v })} cols={cols}
              placeholder={t('node.text-enrich.fieldKey')} className="min-w-0 flex-1"
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
            <ColumnField value={config[f]} onPick={(v) => onChange({ ...config, [f]: v })}
              cols={cols} className="w-full" />
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
