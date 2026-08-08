import { useEffect, useMemo, useRef, useState } from 'react'
import { doc, onSnapshot } from 'firebase/firestore'
import { Workflow as WorkflowIcon, AlertTriangle, Maximize2, ZoomIn, ZoomOut } from 'lucide-react'
import { db } from '@/lib/firebase/config'
import { getWorkflow } from '@/features/workflows/persistence/workflowsApi'
import { useWorkspaceUid } from '@/features/access/useWorkspaceUid'
import { summarizeRun, logsOfNode, STALE_RUN_MS, type RunLiveDoc } from '@/features/priceWatch/radar/runLive'
import { RadarRunStatus } from './RadarRunStatus'
import { RadarRunLogs } from './RadarRunLogs'
import type { Workflow } from '@/features/workflows/types'
import { graphLayout, NODE_W, NODE_H } from './radarWorkflowLayout'
import { nodeSkin, statusColor, statusLabel } from './radarWorkflowNodes'
import { t } from '@/lib/i18n'

/**
 * Le graphe du workflow dans la PWA : lecture, état live et navigation tactile.
 *
 * ⚠️ SVG à la main, PAS ReactFlow : la bibliothèque d'édition pèse plusieurs
 * centaines de kilo-octets pour du glisser-déposer dont une vue mobile n'a aucun
 * usage. Zoom et déplacement tiennent en une transformation du `viewBox`.
 */

/**
 * Dernier run serveur : le document ENTIER, pas seulement les pastilles.
 *
 * ⚠ Il portait déjà le statut global, l'heure de démarrage, le déclencheur et surtout les
 * MESSAGES ; la vue n'en gardait que `nodeStates` et jetait le reste. Un node rouge sans
 * message ne se diagnostique pas depuis un téléphone — il fallait ouvrir un ordinateur.
 * Rien ne coûte de plus : c'est le même abonnement.
 */
function useRunLive(workflowId: string | null, uid: string | null): RunLiveDoc | null {
  const [live, setLive] = useState<RunLiveDoc | null>(null)
  useEffect(() => {
    if (!workflowId || !uid) { setLive(null); return }
    return onSnapshot(doc(db, 'users', uid, 'workflowRunsLive', workflowId), (snap) => {
      setLive((snap.data() as RunLiveDoc | undefined) ?? null)
    }, () => setLive(null))
  }, [workflowId, uid])
  return live
}

export function RadarWorkflowGraph({ workflowId }: { workflowId: string | null }) {
  const [wf, setWf] = useState<Workflow | null>(null)
  const [error, setError] = useState(false)
  const [selected, setSelected] = useState<string | null>(null)
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const drag = useRef<{ x: number; y: number; px: number; py: number; moved: boolean } | null>(null)
  // ⚠️ Hook et non lecture ponctuelle : la PWA monte souvent AVANT que l'accès
  // soit hydraté. Lu une seule fois, l'uid était null et rien ne se chargeait.
  const uid = useWorkspaceUid()
  const live = useRunLive(workflowId, uid)
  const run = useMemo(() => summarizeRun(live, Date.now()), [live])
  // ⚠ Même péremption que l'éditeur : un run interrompu laisse ses nodes « en cours » à
  // vie, et sur mobile on décide de ne PAS relancer sur la foi de cet affichage.
  const stale = live?.status === 'running' && !!live.startedAt && Date.now() - live.startedAt > STALE_RUN_MS
  const states = stale ? {} : (live?.nodeStates ?? {})
  const logs = live?.logs ?? []

  useEffect(() => {
    if (!workflowId || !uid) { setWf(null); return }
    let cancelled = false
    void getWorkflow(uid, workflowId)
      .then((w) => { if (!cancelled) { setWf(w); setError(false) } })
      .catch(() => { if (!cancelled) setError(true) })
    return () => { cancelled = true }
  }, [workflowId, uid])

  const layout = useMemo(() => (wf ? graphLayout(wf.nodes) : null), [wf])

  if (error) {
    return (
      <section className="radar-card radar-in px-5 py-8 text-center text-[13px] flex items-center justify-center gap-2"
        style={{ color: 'var(--radar-text-2)' }}>
        <AlertTriangle size={15} /> {t('rd.wf.unavailable')}
      </section>
    )
  }
  if (!wf || !layout) {
    const msg = workflowId ? t('rd.wf.missing') : t('rd.wf.none')
    return (
      <section className="radar-card radar-in px-5 py-8 text-center text-[13px]" style={{ color: 'var(--radar-text-2)' }}>
        {uid ? msg : t('rd.wf.loading')}
      </section>
    )
  }

  // Fenêtre visible : le zoom rétrécit le viewBox autour de son centre, le
  // déplacement le translate. Aucune matrice à composer, aucun état à resynchroniser.
  const vw = layout.width / zoom
  const vh = layout.height / zoom
  const vx = (layout.width - vw) / 2 + pan.x
  const vy = (layout.height - vh) / 2 + pan.y
  const sel = selected ? wf.nodes.find((n) => n.id === selected) : null

  const onDown = (e: React.PointerEvent<SVGSVGElement>) => {
    drag.current = { x: e.clientX, y: e.clientY, px: pan.x, py: pan.y, moved: false }
    e.currentTarget.setPointerCapture(e.pointerId)
  }
  const onMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const d = drag.current
    if (!d) return
    // Le déplacement du doigt est converti dans l'échelle du viewBox : sinon le
    // graphe glisse plus vite que le doigt dès qu'on est zoomé.
    const k = vw / e.currentTarget.clientWidth
    const dx = e.clientX - d.x
    const dy = e.clientY - d.y
    if (Math.abs(dx) + Math.abs(dy) > 4) d.moved = true
    setPan({ x: d.px - dx * k, y: d.py - dy * k })
  }
  const onUp = () => { drag.current = null }
  const reset = () => { setZoom(1); setPan({ x: 0, y: 0 }) }

  return (
    <section className="radar-card radar-in px-4 py-4">
      <div className="mb-3 flex items-center gap-2">
        <WorkflowIcon size={16} color="var(--radar-accent-2)" />
        <h2 className="text-[15px] font-semibold truncate">{wf.name || t('rd.wf.title')}</h2>
        <span className="ml-auto flex items-center gap-1 shrink-0">
          {([[ZoomOut, () => setZoom((z) => Math.max(1, z - 0.4)), t('rd.wf.zoomOut')],
             [ZoomIn, () => setZoom((z) => Math.min(4, z + 0.4)), t('rd.wf.zoomIn')],
             [Maximize2, reset, t('rd.wf.fit')]] as const).map(([Icon, onClick, label]) => (
            <button key={label} onClick={onClick} aria-label={label} title={label}
              className="p-1.5 rounded-lg"
              style={{ color: 'var(--radar-text-2)', background: 'rgba(255,255,255,0.05)' }}>
              <Icon size={14} />
            </button>
          ))}
        </span>
      </div>

      <div className="mb-3"><RadarRunStatus run={run} /></div>

      <div className="w-full overflow-hidden rounded-xl" style={{ background: 'rgba(0,0,0,0.22)' }}>
        <svg viewBox={`${vx} ${vy} ${vw} ${vh}`} className="w-full h-auto block touch-none select-none"
          role="img" aria-label={t('rd.wf.title')}
          onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}>
          <defs>
            <marker id="rd-arrow" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto">
              <path d="M0,0 L7,3.5 L0,7 z" fill="rgba(110,231,183,0.75)" />
            </marker>
          </defs>

          {wf.edges.map((e) => {
            const a = layout.pos.get(e.source)
            const b = layout.pos.get(e.target)
            if (!a || !b) return null   // arête orpheline (node supprimé) : ignorée
            const x1 = a.x + NODE_W, y1 = a.y + NODE_H / 2
            const x2 = b.x, y2 = b.y + NODE_H / 2
            const mid = (x1 + x2) / 2
            const lit = selected === e.source || selected === e.target
            return (
              <path key={e.id} d={`M ${x1} ${y1} C ${mid} ${y1}, ${mid} ${y2}, ${x2} ${y2}`}
                fill="none" markerEnd="url(#rd-arrow)"
                stroke={lit ? 'rgba(129,140,248,0.95)' : 'rgba(110,231,183,0.45)'}
                strokeWidth={lit ? 3 : 2} />
            )
          })}

          {wf.nodes.map((n) => {
            const p = layout.pos.get(n.id)
            if (!p) return null
            const skin = nodeSkin(n.type)
            const live = statusColor(states[n.id])
            const isSel = selected === n.id
            return (
              <g key={n.id} style={{ cursor: 'pointer' }}
                onPointerUp={(e) => {
                  // Un glissement ne doit pas sélectionner : sur mobile, déplacer
                  // le graphe finissait sinon toujours par ouvrir une fiche.
                  if (drag.current?.moved) return
                  e.stopPropagation()
                  setSelected(isSel ? null : n.id)
                }}>
                <rect x={p.x} y={p.y} width={NODE_W} height={NODE_H} rx={16}
                  fill={isSel ? 'rgba(99,102,241,0.18)' : 'rgba(255,255,255,0.045)'}
                  stroke={live ?? (isSel ? '#818cf8' : 'rgba(255,255,255,0.14)')}
                  strokeWidth={live || isSel ? 2.5 : 1} />
                {/* Liseré de teinte : identifie la famille du node d'un coup d'œil,
                    sans dépendre d'un libellé qu'on peut couper. */}
                <rect x={p.x} y={p.y} width={5} height={NODE_H} rx={2.5} fill={skin.accent} opacity={0.9} />
                <circle cx={p.x + 30} cy={p.y + NODE_H / 2} r={15} fill={skin.accent} opacity={0.16} />
                <text x={p.x + 30} y={p.y + NODE_H / 2 + 6} textAnchor="middle" fontSize={17} fill={skin.accent}>
                  {skin.glyph}
                </text>
                <text x={p.x + 54} y={p.y + NODE_H / 2 + 5} fontSize={14} fontWeight={500} fill="rgba(255,255,255,0.88)">
                  {skin.label.length > 17 ? `${skin.label.slice(0, 16)}…` : skin.label}
                </text>
                {live && <circle cx={p.x + NODE_W - 12} cy={p.y + 12} r={5} fill={live} />}
              </g>
            )
          })}
        </svg>
      </div>

      {/* Détail du node touché : c'est ce qui rend le graphe utile sur mobile —
          les libellés y sont trop courts pour tout dire. */}
      {sel ? (
        <div className="mt-3 rounded-xl px-3 py-2.5 text-[12px]" style={{ background: 'rgba(255,255,255,0.04)' }}>
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full shrink-0" style={{ background: nodeSkin(sel.type).accent }} />
            <b className="truncate">{nodeSkin(sel.type).label}</b>
            <span className="ml-auto shrink-0" style={{ color: statusColor(states[sel.id]) ?? 'var(--radar-text-3)' }}>
              {statusLabel(states[sel.id])}
            </span>
          </div>
          <p className="mt-1 font-mono text-[10px]" style={{ color: 'var(--radar-text-3)' }}>{sel.type}</p>
          {(live?.nodeConnectors?.[sel.id] ?? []).length > 0 && (
            <p className="mt-1 text-[10px]" style={{ color: 'var(--radar-text-3)' }}>
              {(live?.nodeConnectors?.[sel.id] ?? []).join(' · ')}
            </p>
          )}
          {/* Les messages de CE node : c'est la réponse à « pourquoi est-il rouge ? »,
              qu'une pastille seule ne donnera jamais. */}
          {logsOfNode(logs, sel.id).length > 0 && (
            <div className="mt-2 space-y-1 max-h-40 overflow-y-auto">
              {logsOfNode(logs, sel.id).map((l, i) => (
                <div key={`${l.ts}-${i}`} className="text-[10px] leading-snug"
                  style={{ color: l.level === 'error' ? '#fb7185' : l.level === 'warn' ? '#fbbf24' : 'var(--radar-text-3)' }}>
                  {l.msg}
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        <p className="mt-2 text-center text-[11px]" style={{ color: 'var(--radar-text-3)' }}>
          {t('rd.wf.hint', { nodes: wf.nodes.length, links: wf.edges.length })}
        </p>
      )}

      <RadarRunLogs logs={logs} />
    </section>
  )
}
