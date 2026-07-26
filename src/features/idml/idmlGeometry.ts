// Géométrie IDML : matrices de transformation et conversion des tracés.
//
// InDesign empile les transformations (page → spread → groupe → objet) : la
// position réelle d'un objet ne se lit nulle part, elle se compose. D'où
// `mulMat` puis `decompose`, qui redonne échelle et rotation exploitables.
//
// Les PathPoints portent un ancrage et DEUX poignées de Bézier ; quand elles
// coïncident avec l'ancrage le segment est droit, sinon il faut une cubique.
// C'est ce que `pathPointsToSvg` traduit.
//
// Module pur : ni DOM applicatif, ni état.
import { directChildren } from './idmlXml'

export type Mat = [number, number, number, number, number, number]

export function parseTf(val: string): Mat {
  const p = val.trim().split(/\s+/).map(Number)
  if (p.length === 6 && p.every((n) => !isNaN(n))) return p as Mat
  return [1, 0, 0, 1, 0, 0]
}

export function mulMat(a: Mat, b: Mat): Mat {
  return [
    a[0]*b[0]+a[2]*b[1], a[1]*b[0]+a[3]*b[1],
    a[0]*b[2]+a[2]*b[3], a[1]*b[2]+a[3]*b[3],
    a[0]*b[4]+a[2]*b[5]+a[4], a[1]*b[4]+a[3]*b[5]+a[5],
  ]
}

export function tfPoint(x: number, y: number, m: Mat): { x: number; y: number } {
  return { x: m[0]*x + m[2]*y + m[4], y: m[1]*x + m[3]*y + m[5] }
}

export function decompose(m: Mat) {
  return {
    scaleX: Math.sqrt(m[0]*m[0] + m[1]*m[1]),
    scaleY: Math.sqrt(m[2]*m[2] + m[3]*m[3]),
    angle: Math.atan2(m[1], m[0]) * (180 / Math.PI),
    tx: m[4], ty: m[5],
  }
}

// ─── Bézier Path points ──────────────────────────────────────────────────────

export interface PathPoint {
  anchor: [number, number]
  leftDir: [number, number]
  rightDir: [number, number]
}

function parseXY(val: string | null, fallback: [number, number]): [number, number] {
  if (!val) return fallback
  const p = val.trim().split(/\s+/).map(Number)
  return [isNaN(p[0]) ? fallback[0] : p[0], isNaN(p[1]) ? fallback[1] : p[1]]
}

export function parsePathPoints(el: Element): PathPoint[] {
  const points: PathPoint[] = []
  // Only look in direct PathGeometry, not in nested child elements (Image, etc.)
  const propsArr = directChildren(el, 'Properties')
  let pts: ArrayLike<Element> = []
  if (propsArr.length > 0) {
    const geomArr = directChildren(propsArr[0], 'PathGeometry')
    if (geomArr.length > 0) {
      pts = geomArr[0].getElementsByTagName('PathPointType')
    }
  }
  if (pts.length === 0) {
    pts = el.getElementsByTagName('PathPointType')
  }
  for (let i = 0; i < pts.length; i++) {
    const anchorAttr = pts[i].getAttribute('Anchor')
    const anchor = parseXY(anchorAttr, [0, 0])
    const leftDir = parseXY(pts[i].getAttribute('LeftDirection'), anchor)
    const rightDir = parseXY(pts[i].getAttribute('RightDirection'), anchor)
    points.push({ anchor, leftDir, rightDir })
  }
  return points
}

/**
 * Generates SVG path data from IDML PathPoints, centered at bounding box center.
 * Uses cubic Bézier curves (C) when LeftDirection/RightDirection differ from anchor.
 */
export function pathPointsToSvg(points: PathPoint[]): string {
  if (points.length < 2) return ''

  const xs = points.map(p => p.anchor[0])
  const ys = points.map(p => p.anchor[1])
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2
  const cy = (Math.min(...ys) + Math.max(...ys)) / 2

  const fx = (x: number) => (x - cx).toFixed(3)
  const fy = (y: number) => (y - cy).toFixed(3)

  let d = `M ${fx(points[0].anchor[0])} ${fy(points[0].anchor[1])}`

  for (let i = 0; i < points.length; i++) {
    const curr = points[i]
    const next = points[(i + 1) % points.length]

    const cp1 = curr.rightDir
    const cp2 = next.leftDir
    const dest = next.anchor

    const isStraight =
      cp1[0] === curr.anchor[0] && cp1[1] === curr.anchor[1] &&
      cp2[0] === dest[0] && cp2[1] === dest[1]

    if (isStraight) {
      d += ` L ${fx(dest[0])} ${fy(dest[1])}`
    } else {
      d += ` C ${fx(cp1[0])} ${fy(cp1[1])} ${fx(cp2[0])} ${fy(cp2[1])} ${fx(dest[0])} ${fy(dest[1])}`
    }
  }

  return d + ' Z'
}
