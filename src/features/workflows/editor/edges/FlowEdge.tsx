// src/features/workflows/editor/edges/FlowEdge.tsx
import { BaseEdge, getSmoothStepPath, type EdgeProps } from '@xyflow/react'

export function FlowEdge(props: EdgeProps) {
  const {
    id,
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    selected,
    markerEnd,
  } = props

  const [edgePath] = getSmoothStepPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
    borderRadius: 16,
  })

  const stroke = selected ? '#a5b4fc' : '#6366f1'

  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        markerEnd={markerEnd}
        style={{
          stroke,
          strokeWidth: selected ? 2.5 : 2,
          opacity: 0.9,
        }}
      />
      {/* Animated glowing dot following the path */}
      <circle r={3.5} fill="#a5b4fc" filter="url(#flow-glow)">
        <animateMotion dur="2.2s" repeatCount="indefinite" rotate="auto">
          <mpath href={`#${id}`} />
        </animateMotion>
      </circle>
    </>
  )
}

/** SVG defs (filter for the dot glow) — render once at the editor root. */
export function FlowEdgeDefs() {
  return (
    <svg style={{ position: 'absolute', width: 0, height: 0 }}>
      <defs>
        <filter id="flow-glow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="2" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
    </svg>
  )
}
