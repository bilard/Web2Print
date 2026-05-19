// src/features/workflows/editor/edges/FlowEdge.tsx
import { BaseEdge, getSmoothStepPath, type EdgeProps } from '@xyflow/react'
import { getPortColor } from '../../runtime/ports'

/**
 * Hash an edge id to a stable signed offset in pixels.
 * Used to spread parallel edges so their elbow columns don't overlap.
 */
function spreadOffset(id: string): number {
  let h = 0
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0
  // 7 distinct lanes spaced by ~22px → ±66px around the midpoint
  return ((Math.abs(h) % 7) - 3) * 22
}

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
    data,
  } = props

  const portType = (data as { portType?: string } | undefined)?.portType
  const baseColor = getPortColor(portType)
  const stroke = selected ? '#ffffff' : baseColor

  const centerX = (sourceX + targetX) / 2 + spreadOffset(id)
  const [edgePath] = getSmoothStepPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
    borderRadius: 16,
    centerX,
  })

  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        markerEnd="url(#flow-arrow)"
        style={{
          stroke,
          strokeWidth: selected ? 2.5 : 2,
          opacity: selected ? 1 : 0.85,
        }}
      />
      {/* Animated glowing dot following the path */}
      <circle r={3.5} fill={stroke} filter="url(#flow-glow)">
        <animateMotion dur="2.2s" repeatCount="indefinite" rotate="auto">
          <mpath href={`#${id}`} />
        </animateMotion>
      </circle>
    </>
  )
}

/** SVG defs (filter for the dot glow + arrow marker that inherits stroke). */
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
        {/*
          markerWidth/Height + viewBox are sized so that the arrow tip aligns at
          the end of the path. fill="context-stroke" makes the arrow inherit the
          color of the edge it terminates — supported in Chrome/Safari/Firefox.
        */}
        <marker
          id="flow-arrow"
          viewBox="0 0 10 10"
          refX="8"
          refY="5"
          markerUnits="strokeWidth"
          markerWidth="7"
          markerHeight="7"
          orient="auto-start-reverse"
        >
          <path d="M 0 0 L 10 5 L 0 10 z" fill="context-stroke" />
        </marker>
      </defs>
    </svg>
  )
}
