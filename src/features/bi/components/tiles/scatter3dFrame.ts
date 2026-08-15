// Le décor du nuage 3D : la boîte et ses quadrillages.
//
// ⚠⚠ La couleur du cadre porte une INFORMATION, elle n'est pas là pour égayer : chaque arête
// prend la teinte de SA DIRECTION, et le nom de l'axe porte la même. On sait donc quel axe on
// regarde à tout moment, y compris après un demi-tour où les trois se ressemblent — un cadre
// uniformément gris obligeait à relire les étiquettes à chaque rotation.
//
// ⚠ Les teintes des axes ne se prennent PAS dans la rampe des points (`viridis` : violet,
// bleu, vert, jaune) : cyan, rose et orange en sont absents, donc rien dans le décor ne peut
// se confondre avec une valeur mesurée.
import * as THREE from 'three'

export interface FrameColors {
  /** Teinte des trois axes, dans l'ordre X, Y, Z. */
  axes: readonly [string, string, string]
  /** Opacité des arêtes de la boîte : présentes, jamais concurrentes des points. */
  edgeOpacity: number
  /**
   * Grisé du thème, mêlé aux teintes d'axes pour DÉSATURER le quadrillage.
   *
   * ⚠⚠ Sans lui, les mailles sortaient en rose et cyan francs et écrasaient les sphères :
   * on lisait la cage, plus le nuage.
   */
  tint: string
  /** Opacité du quadrillage du sol, puis des deux parois du fond. */
  gridOpacity: [number, number]
}

/** Les 12 arêtes du cube, chacune teintée par la direction qu'elle suit. */
function boxEdges(r: number, colors: FrameColors): THREE.LineSegments {
  const positions: number[] = []
  const tint: number[] = []
  const color = new THREE.Color()
  const push = (a: [number, number, number], b: [number, number, number], axis: 0 | 1 | 2) => {
    positions.push(...a, ...b)
    color.set(colors.axes[axis])
    tint.push(color.r, color.g, color.b, color.r, color.g, color.b)
  }
  for (const y of [-r, r]) {
    for (const z of [-r, r]) push([-r, y, z], [r, y, z], 0)
  }
  for (const x of [-r, r]) {
    for (const z of [-r, r]) push([x, -r, z], [x, r, z], 1)
  }
  for (const x of [-r, r]) {
    for (const y of [-r, r]) push([x, y, -r], [x, y, r], 2)
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(tint, 3))
  return new THREE.LineSegments(geometry, new THREE.LineBasicMaterial({
    vertexColors: true, transparent: true, opacity: colors.edgeOpacity,
  }))
}

/** Un plan de quadrillage, teinté du MÉLANGE des deux axes qu'il porte. */
function gridPlane(
  r: number, rotation: THREE.Euler, position: THREE.Vector3,
  a: string, b: string, tint: string, opacity: number,
): THREE.GridHelper {
  const blend = new THREE.Color(a).lerp(new THREE.Color(b), 0.5).lerp(new THREE.Color(tint), 0.62)
  const grid = new THREE.GridHelper(2 * r, 8, blend, blend)
  grid.rotation.copy(rotation)
  grid.position.copy(position)
  const material = grid.material as THREE.Material
  material.transparent = true
  material.opacity = opacity
  material.depthWrite = false
  return grid
}

/** Boîte + sol + deux parois. ⚠ Les parois sont ÉTIQUETÉES (`userData.wall`) pour qu'
 *  `orientWalls` puisse les renvoyer au fond à chaque changement de point de vue. */
export function buildFrame(r: number, colors: FrameColors): THREE.Object3D {
  const group = new THREE.Group()
  group.add(boxEdges(r, colors))
  const [x, y, z] = colors.axes
  const [floor, wall] = colors.gridOpacity
  const t = colors.tint
  group.add(gridPlane(r, new THREE.Euler(), new THREE.Vector3(0, -r, 0), x, z, t, floor))
  const xy = gridPlane(r, new THREE.Euler(Math.PI / 2, 0, 0), new THREE.Vector3(0, 0, -r), x, y, t, wall)
  xy.userData.wall = 'xy'
  group.add(xy)
  const yz = gridPlane(r, new THREE.Euler(0, 0, Math.PI / 2), new THREE.Vector3(-r, 0, 0), y, z, t, wall)
  yz.userData.wall = 'yz'
  group.add(yz)
  return group
}

/**
 * Renvoie les deux parois DERRIÈRE le nuage, selon le côté d'où l'on regarde.
 *
 * ⚠⚠ À parois fixes, tourner d'un quart de tour en amenait une DEVANT les données : son
 * quadrillage barrait les marqueurs et l'arête vive du premier plan tirait l'œil hors du
 * nuage. C'est la convention de tous les graphes 3D — on ne montre jamais la cage entière,
 * seulement le coin du fond. Appelé à chaque image ; deux affectations, rien de plus.
 */
export function orientWalls(frame: THREE.Object3D, camera: THREE.Camera, r: number): void {
  for (const child of frame.children) {
    if (child.userData.wall === 'xy') child.position.z = camera.position.z >= 0 ? -r : r
    if (child.userData.wall === 'yz') child.position.x = camera.position.x >= 0 ? -r : r
  }
}
