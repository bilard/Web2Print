import { useMemo, useState } from 'react'
import { useStore } from '@xyflow/react'
import { ArrowRight, ArrowLeft, X, Link2, Trash2, AlertTriangle } from 'lucide-react'
import { useWorkflowStore } from '../persistence/workflow.store'
import { useRunContext } from '../runtime/runContext'
import { nodeRegistry } from '../registry'
import { ConfigFieldRenderer } from './configFields'
import type { Workflow, WorkflowNode, WorkflowEdge, NodeStatus } from '../types'
import { useTranslation, type TranslationKey } from '@/lib/i18n'

/**
 * Remonte récursivement les edges entrants pour collecter les colonnes
 * exposées par les nodes upstream (CSV csvSummary, IDML idmlSummary, etc.).
 * Permet à l'autocomplétion de proposer les bons noms de variables.
 */
function collectUpstreamColumns(wf: Workflow, nodeId: string, visited = new Set<string>()): string[] {
  if (visited.has(nodeId)) return []
  visited.add(nodeId)

  const cols = new Set<string>()
  const incomingEdges = wf.edges.filter((e) => e.target === nodeId)
  for (const e of incomingEdges) {
    const src = wf.nodes.find((n) => n.id === e.source)
    if (!src) continue
    const cfg = src.config as Record<string, unknown> | undefined
    // Cas Upload : csvSummary.columns directement disponible
    const csv = cfg?.csvSummary as { columns?: string[] } | undefined
    if (csv?.columns?.length) {
      for (const c of csv.columns) cols.add(c)
    }
    // Cas Import Google Sheets : en-têtes relus à la demande (bouton « Actualiser les
    // colonnes »), sans lancer le workflow. Une feuille source change de structure entre
    // deux runs — c'est la seule façon de le voir AVANT d'avoir tout recalculé.
    const sheetCols = cfg?.sheetColumns as string[] | undefined
    if (sheetCols?.length) {
      for (const c of sheetCols) cols.add(c)
    }
    // Sinon, remonte d'un cran (cas Pipe, Loop each, etc.)
    if (!csv?.columns?.length && !sheetCols?.length) {
      for (const c of collectUpstreamColumns(wf, src.id, visited)) cols.add(c)
    }
  }
  return Array.from(cols)
}

/**
 * Colonnes configurées que la feuille branchée ne porte PLUS.
 *
 * Une source renommée (« Famille » → « FAMILLE ») ou amputée d'une colonne laissait une
 * config qui pointait dans le vide : le node devinait alors une colonne de remplacement, et
 * on ne l'apprenait qu'en lisant le journal d'un run de vingt minutes. Le panneau le dit
 * maintenant d'un coup d'œil, et propose de tout vider — un champ vide laisse la détection
 * choisir en connaissance de cause, une valeur morte lui force la main.
 */
function StaleColumnsBanner({ node, spec, columns, onClear }: {
  node: WorkflowNode
  spec: { configSchema: { name: string; kind: string; label?: string; labelKey?: string }[] }
  columns: string[]
  onClear: (names: string[]) => void
}) {
  const { t } = useTranslation()
  // Aucune colonne connue = aucune affirmation possible : on se tait plutôt que d'alerter
  // sur une feuille qu'on n'a simplement pas encore lue.
  if (columns.length === 0) return null
  const cfg = node.config as Record<string, unknown>
  const stale = spec.configSchema.filter((f) => {
    if (f.kind !== 'columnRef') return false
    const v = String(cfg[f.name] ?? '').trim()
    return v !== '' && !columns.includes(v)
  })
  if (stale.length === 0) return null
  return (
    <div className="rounded border border-amber-500/30 bg-amber-500/[0.07] px-2.5 py-2 flex items-start gap-2">
      <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0">
        <p className="text-[11px] text-amber-200/90">
          {t('wfn.staleColumns', { count: stale.length, list: stale.map((f) => String(cfg[f.name])).join(' · ') })}
        </p>
        <button type="button" onClick={() => onClear(stale.map((f) => f.name))}
          className="text-[11px] text-amber-300 underline decoration-dotted hover:text-amber-100 mt-1">
          {t('wfn.clearStaleColumns', { count: stale.length })}
        </button>
      </div>
    </div>
  )
}

interface ConnectionsPanelProps {
  node: WorkflowNode
  wf: Workflow
  onRemoveEdge: (edgeId: string) => void
}

function ConnectionsPanel({ node, wf, onRemoveEdge }: ConnectionsPanelProps) {
  const { t } = useTranslation()
  const incoming = wf.edges.filter((e) => e.target === node.id)
  const outgoing = wf.edges.filter((e) => e.source === node.id)

  if (incoming.length === 0 && outgoing.length === 0) {
    return (
      <div className="pt-3 mt-3 border-t border-white/10">
        <h4 className="text-xs uppercase text-white/40 font-semibold mb-2">{t('wfn.connections')}</h4>
        <p className="text-[11px] text-white/30 italic">
          {t('nodeConfigPanel.noConnectionDrag')}
        </p>
      </div>
    )
  }

  const labelFor = (id: string) => {
    const n = wf.nodes.find((x) => x.id === id)
    if (!n) return id.slice(0, 8)
    const sp = nodeRegistry.get(n.type)
    return sp ? t(sp.labelKey) : n.type
  }

  const renderEdge = (e: WorkflowEdge, dir: 'in' | 'out') => {
    const otherId = dir === 'in' ? e.source : e.target
    const otherLabel = labelFor(otherId)
    const localPort = dir === 'in' ? e.targetHandle : e.sourceHandle
    const otherPort = dir === 'in' ? e.sourceHandle : e.targetHandle
    const Icon = dir === 'in' ? ArrowLeft : ArrowRight

    return (
      <div
        key={e.id}
        className="group flex items-center gap-1.5 px-2 py-1.5 rounded-md bg-well border border-white/10 hover:border-white/20 transition-colors"
      >
        <Icon className="w-3 h-3 text-white/40 shrink-0" />
        <div className="flex-1 min-w-0 text-[11px] leading-tight">
          <div className="text-white truncate" title={otherLabel}>
            {otherLabel}
          </div>
          <div className="text-white/40 font-mono text-[10px] truncate">
            {dir === 'in' ? (
              <>
                <span className="text-emerald-400/80">{otherPort}</span>
                <span className="text-white/30 mx-1">→</span>
                <span className="text-cyan-400/80">{localPort}</span>
              </>
            ) : (
              <>
                <span className="text-cyan-400/80">{localPort}</span>
                <span className="text-white/30 mx-1">→</span>
                <span className="text-emerald-400/80">{otherPort}</span>
              </>
            )}
          </div>
        </div>
        <button
          type="button"
          onClick={() => onRemoveEdge(e.id)}
          className="shrink-0 p-1 rounded text-white/30 hover:text-red-400 hover:bg-red-500/10 opacity-0 group-hover:opacity-100 transition-opacity"
          title={t('wfn.deleteConnection')}
          aria-label={t('wfn.deleteConnection')}
        >
          <X className="w-3 h-3" />
        </button>
      </div>
    )
  }

  return (
    <div className="pt-3 mt-3 border-t border-white/10 space-y-3">
      <h4 className="text-xs uppercase text-white/40 font-semibold">{t('wfn.connections')}</h4>
      {incoming.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-[10px] uppercase text-white/30 tracking-wider">
            Entrantes ({incoming.length})
          </p>
          <div className="space-y-1">{incoming.map((e) => renderEdge(e, 'in'))}</div>
        </div>
      )}
      {outgoing.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-[10px] uppercase text-white/30 tracking-wider">
            Sortantes ({outgoing.length})
          </p>
          <div className="space-y-1">{outgoing.map((e) => renderEdge(e, 'out'))}</div>
        </div>
      )}
    </div>
  )
}

interface EdgeDetailPanelProps {
  edge: WorkflowEdge
  wf: Workflow
  onRemove: () => void
}

function EdgeDetailPanel({ edge, wf, onRemove }: EdgeDetailPanelProps) {
  const { t } = useTranslation()
  const sourceNode = wf.nodes.find((n) => n.id === edge.source)
  const targetNode = wf.nodes.find((n) => n.id === edge.target)
  const sourceLabel = sourceNode
    ? (() => { const sp = nodeRegistry.get(sourceNode.type); return sp ? t(sp.labelKey) : sourceNode.type })()
    : edge.source
  const targetLabel = targetNode
    ? (() => { const sp = nodeRegistry.get(targetNode.type); return sp ? t(sp.labelKey) : targetNode.type })()
    : edge.target
  const sourceSpec = sourceNode ? nodeRegistry.get(sourceNode.type) : undefined
  const targetSpec = targetNode ? nodeRegistry.get(targetNode.type) : undefined
  const sourcePortType = sourceSpec?.outputs.find((p) => p.name === edge.sourceHandle)?.type
  const targetPortType = targetSpec?.inputs.find((p) => p.name === edge.targetHandle)?.type

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Link2 className="w-4 h-4 text-violet-400" />
        <div className="text-sm font-medium text-white">{t('wfn.connection')}</div>
      </div>

      {/* Source */}
      <div className="space-y-1.5">
        <p className="text-[10px] uppercase text-white/30 tracking-wider">{t('wfn.source')}</p>
        <div className="px-2 py-2 rounded-md bg-well border border-white/10">
          <div className="text-[12px] text-white truncate" title={sourceLabel}>
            {sourceLabel}
          </div>
          <div className="flex items-center gap-1.5 mt-0.5 text-[10px] font-mono">
            <span className="text-emerald-400/80">{edge.sourceHandle}</span>
            {sourcePortType && (
              <span className="text-white/30">
                : <span className="text-white/40">{sourcePortType}</span>
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Flèche descendante visuelle */}
      <div className="flex justify-center">
        <ArrowRight className="w-4 h-4 text-white/30 rotate-90" />
      </div>

      {/* Target */}
      <div className="space-y-1.5">
        <p className="text-[10px] uppercase text-white/30 tracking-wider">{t('wfn.target')}</p>
        <div className="px-2 py-2 rounded-md bg-well border border-white/10">
          <div className="text-[12px] text-white truncate" title={targetLabel}>
            {targetLabel}
          </div>
          <div className="flex items-center gap-1.5 mt-0.5 text-[10px] font-mono">
            <span className="text-cyan-400/80">{edge.targetHandle}</span>
            {targetPortType && (
              <span className="text-white/30">
                : <span className="text-white/40">{targetPortType}</span>
              </span>
            )}
          </div>
        </div>
      </div>

      <button
        type="button"
        onClick={onRemove}
        className="w-full flex items-center justify-center gap-1.5 px-2 py-2 mt-2 rounded-md bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 text-red-300 text-[12px] transition-colors"
      >
        <Trash2 className="w-3.5 h-3.5" />
        Supprimer la connexion
      </button>

      {sourcePortType && targetPortType && sourcePortType !== targetPortType && (
        <p className="text-[10px] text-amber-400/80 leading-snug">
          Type source <code className="text-amber-300">{sourcePortType}</code> ≠ cible{' '}
          <code className="text-amber-300">{targetPortType}</code>. Conversion implicite via{' '}
          <code>any</code>.
        </p>
      )}
    </div>
  )
}

// Constante de MODULE : la clé est stockée, la traduction se fait au rendu.
const RUN_STATUS_META: Record<NodeStatus, { labelKey: TranslationKey; color: string; dot: string }> = {
  pending: { labelKey: 'wfn.pending', color: 'text-white/60', dot: 'bg-neutral-500' },
  running: { labelKey: 'wfn.running', color: 'text-indigo-300', dot: 'bg-indigo-400' },
  success: { labelKey: 'wfn.done', color: 'text-emerald-300', dot: 'bg-emerald-400' },
  error: { labelKey: 'wfn.error', color: 'text-red-300', dot: 'bg-red-400' },
  skipped: { labelKey: 'wfn.skipped', color: 'text-white/60', dot: 'bg-neutral-600' },
}

/**
 * Onglet « Logs » du node sélectionné : statut d'exécution, bandeau d'avertissement
 * en cas de problème, puis le journal complet (tous niveaux) de la dernière exécution.
 * Réactif : se met à jour en direct pendant un run.
 */
function NodeLogsTab({ nodeId }: { nodeId: string }) {
  const { t } = useTranslation()
  const state = useRunContext((s) => s.nodeStates[nodeId])
  const status: NodeStatus = state?.status ?? 'pending'
  const meta = RUN_STATUS_META[status]
  const logs = state?.logs ?? []
  const problemCount = logs.filter((l) => l.level === 'warn' || l.level === 'error').length
  const hasProblem = status === 'error' || !!state?.error || problemCount > 0

  return (
    <div className="flex flex-col gap-2 h-full min-h-0">
      {/* Statut d'exécution */}
      <div className="flex items-center gap-2 shrink-0">
        <span className={`w-2 h-2 rounded-full ${meta.dot} ${status === 'running' ? 'animate-pulse' : ''}`} />
        <span className={`text-xs font-medium ${meta.color}`}>{t(meta.labelKey)}</span>
        {typeof state?.durationMs === 'number' && (
          <span className="text-[10px] text-white/40 tabular-nums">
            {(state.durationMs / 1000).toFixed(1)}s
          </span>
        )}
      </div>

      {/* Bandeau d'avertissement quand il y a un problème */}
      {hasProblem && (
        <div className="flex items-start gap-1.5 text-[11px] text-amber-300 bg-amber-500/10 border border-amber-500/30 rounded px-2 py-1.5 leading-snug">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          <span>
            {status === 'error'
              ? t('wfn.failed')
              : `${problemCount} avertissement${problemCount > 1 ? 's' : ''} pendant le traitement.`}
          </span>
        </div>
      )}

      {/* Message d'erreur principal */}
      {state?.error && (
        <p className="text-[11px] text-red-300 bg-red-500/10 border border-red-500/30 rounded px-2 py-1.5 leading-snug break-words">
          {state.error}
        </p>
      )}

      {/* Journal complet (tous niveaux) — occupe toute la hauteur restante */}
      {logs.length > 0 ? (
        <div className="space-y-1 flex-1 min-h-0 overflow-auto rounded-md bg-well border border-white/10 p-2">
          {logs.map((l, i) => (
            <div
              key={i}
              className={`text-[10px] font-mono leading-snug break-words flex gap-1.5 ${
                l.level === 'error' ? 'text-red-300' : l.level === 'warn' ? 'text-amber-300' : 'text-white/60'
              }`}
            >
              <span className="text-white/30 shrink-0">{new Date(l.ts).toLocaleTimeString()}</span>
              <span>{l.msg}</span>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-[11px] text-white/30 italic">
          {status === 'pending'
            ? t('wfn.noLog')
            : 'Aucun log.'}
        </p>
      )}
    </div>
  )
}

export function NodeConfigPanel() {
  const { t } = useTranslation()
  const selectedId = useStore((s) => {
    for (const n of s.nodeLookup.values()) {
      if ((n as any).selected) return (n as { id: string }).id
    }
    return undefined
  })
  const selectedEdgeId = useStore((s) => {
    const lookup = (s as any).edgeLookup as Map<string, any> | undefined
    if (!lookup) return undefined
    for (const [, e] of lookup) {
      if (e.selected) return e.id as string
    }
    return undefined
  })
  const wf = useWorkflowStore((s) => s.current)
  const upsertNode = useWorkflowStore((s) => s.upsertNode)
  const removeEdge = useWorkflowStore((s) => s.removeEdge)
  const [tab, setTab] = useState<'config' | 'logs'>('config')
  const selectedRunState = useRunContext((s) => (selectedId ? s.nodeStates[selectedId] : undefined))
  const logsHaveProblem =
    !!selectedRunState &&
    (selectedRunState.status === 'error' ||
      !!selectedRunState.error ||
      (selectedRunState.logs ?? []).some((l) => l.level === 'warn' || l.level === 'error'))

  const node = wf?.nodes.find((n) => n.id === selectedId)
  const spec = node ? nodeRegistry.get(node.type) : undefined
  const selectedEdge = wf?.edges.find((e) => e.id === selectedEdgeId)
  // Colonnes produites par les nodes amont au DERNIER run (sheet.columns des outputs) —
  // complète l'autocomplétion pour les nodes de calcul (compare-prices, list-products…)
  // dont les colonnes ne sont pas connues statiquement.
  const runNodeStates = useRunContext((s) => s.nodeStates)
  const availableColumns = useMemo(() => {
    if (!wf || !node) return []
    const cols: string[] = []
    const seen = new Set<string>()
    const add = (k: string) => {
      if (k && !seen.has(k)) {
        seen.add(k)
        cols.push(k)
      }
    }
    for (const c of collectUpstreamColumns(wf, node.id)) add(c)
    for (const e of wf.edges.filter((edge) => edge.target === node.id)) {
      // Colonnes déclarées statiquement par le node amont (dispo AVANT tout run).
      const src = wf.nodes.find((n) => n.id === e.source)
      const declared = src ? nodeRegistry.get(src.type)?.outputColumns : undefined
      if (declared) for (const c of declared) add(c)
      // Colonnes réelles produites au dernier run (inclut les dynamiques).
      const outputs = runNodeStates[e.source]?.outputs
      if (!outputs) continue
      for (const v of Object.values(outputs)) {
        const sheetCols = (v as { columns?: Array<{ key?: string; label?: string }> } | null)?.columns
        if (Array.isArray(sheetCols)) for (const col of sheetCols) add(col?.key || col?.label || '')
      }
    }
    return cols
  }, [wf, node, runNodeStates])

  // Priorité au node sélectionné si les deux le sont (cas peu probable).
  const showEdge = !node && !!selectedEdge

  return (
    // 440 px et non 384 : les lignes de « Sites sources » y empilent un domaine, trois
    // sélecteurs et neuf mesures — elles débordaient et repliaient les chiffres sur
    // quatre rangées.
    <aside data-tour="wf-inspector" className="w-[440px] border-l border-white/10 bg-surface-2 flex flex-col overflow-hidden p-4 h-full">
      <h3 className="text-xs uppercase text-white/40 font-semibold mb-3 shrink-0">
        {showEdge ? 'Connexion' : 'Configuration'}
      </h3>
      {showEdge && wf && selectedEdge ? (
        <EdgeDetailPanel
          edge={selectedEdge}
          wf={wf}
          onRemove={() => removeEdge(selectedEdge.id)}
        />
      ) : !node || !spec ? (
        <p className="text-sm text-white/40">
          {t('wfn.selectNode')}
        </p>
      ) : (
        <div className="flex flex-col min-h-0 flex-1 space-y-3">
          <div className="text-sm font-medium text-white shrink-0">{t(spec.labelKey)}</div>

          {/* Onglets Config / Logs */}
          <div className="flex items-center gap-1 border-b border-white/10 shrink-0">
            <button
              type="button"
              onClick={() => setTab('config')}
              className={`px-2.5 py-1.5 text-xs font-medium -mb-px border-b-2 transition-colors ${
                tab === 'config'
                  ? 'border-indigo-400 text-white'
                  : 'border-transparent text-white/40 hover:text-white/80'
              }`}
            >
              Configuration
            </button>
            <button
              type="button"
              onClick={() => setTab('logs')}
              className={`px-2.5 py-1.5 text-xs font-medium -mb-px border-b-2 transition-colors flex items-center gap-1.5 ${
                tab === 'logs'
                  ? 'border-indigo-400 text-white'
                  : 'border-transparent text-white/40 hover:text-white/80'
              }`}
            >
              Logs
              {logsHaveProblem && (
                <span
                  className="w-1.5 h-1.5 rounded-full bg-amber-400"
                  title={t('wfn.warning')}
                  aria-label={t('wfn.warning')}
                />
              )}
            </button>
          </div>

          {tab === 'config' ? (
            <div className="space-y-3 flex-1 min-h-0 overflow-y-auto">
              <StaleColumnsBanner node={node} spec={spec} columns={availableColumns}
                onClear={(names) => upsertNode({
                  ...node,
                  config: { ...(node.config as Record<string, unknown>), ...Object.fromEntries(names.map((n) => [n, ''])) },
                })} />
              {spec.ConfigComponent ? (
                <spec.ConfigComponent
                  config={node.config as never}
                  onChange={(c) => upsertNode({ ...node, config: c })}
                  availableColumns={availableColumns}
                />
              ) : (
                spec.configSchema.map((f) => {
                  // Un champ peut être rendu inutile par une CONNEXION (le port gagne
                  // sur la config locale) : `disabledWhen` reçoit donc le graphe.
                  const isWired = (port: string) => (wf?.edges ?? []).some((e) => e.target === node.id && e.targetHandle === port)
                  const off = f.disabledWhen?.(node.config as Record<string, unknown>, isWired) ?? false
                  return (
                  <label key={f.name} className={`block ${off ? 'opacity-40 pointer-events-none select-none' : ''}`}>
                    <span className="text-xs text-white/60 mb-1 block">
                      {f.labelKey ? t(f.labelKey) : f.label}{off ? <span className="text-[10px] text-amber-400/70 ml-2">— {f.disabledNoteKey ? t(f.disabledNoteKey) : f.disabledNote ?? t('wfn.noEffectHere')}</span> : null}
                    </span>
                    <ConfigFieldRenderer
                      field={f}
                      columns={availableColumns}
                      value={(node.config as Record<string, unknown>)[f.name]}
                      onChange={(v) =>
                        upsertNode({
                          ...node,
                          config: { ...(node.config as Record<string, unknown>), [f.name]: v },
                        })
                      }
                    />
                    {(f.helpKey || f.help) ? <span className="text-[11px] text-white/30 mt-1 block">{f.helpKey ? t(f.helpKey) : f.help}</span> : null}
                  </label>
                  )
                })
              )}
              {wf && <ConnectionsPanel node={node} wf={wf} onRemoveEdge={removeEdge} />}
            </div>
          ) : (
            <div className="flex-1 min-h-0">
              <NodeLogsTab nodeId={node.id} />
            </div>
          )}
        </div>
      )}
    </aside>
  )
}
