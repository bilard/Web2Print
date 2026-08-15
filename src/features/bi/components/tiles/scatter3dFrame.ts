// Le décor du nuage 3D : le trièdre des axes et les trois quadrillages.
//
// ⚠⚠ PAS de boîte fermée. Douze arêtes autour du nuage dessinent une cage : elles enferment
// les données, et celles du premier plan tirent l'œil hors du volume. Le décor se réduit donc
// au TRIÈDRE — les trois arêtes qui partent du coin du fond — et c'est le quadrillage, lui
// bien présent et coloré, qui porte la structure.
//
// ⚠⚠ La couleur du décor porte une INFORMATION, elle n'est pas là pour égayer : chaque arête
// prend la teinte de SA DIRECTION, chaque quadrillage celle des DEUX axes de son plan, et le
// nom de l'axe la même. On sait donc quel axe on regarde à tout moment, y compris après une
// rotation où les trois se ressemblent.
//
// ⚠ Les teintes des axes ne se prennent PAS dans la rampe des points (`viridis` : violet,
// bleu, vert, jaune) : cyan, rose et orange en sont absents, donc rien dans le décor ne peut
// se confondre avec une valeur mesurée.
import * as THREE from 'three'

export interface FrameColors {
  /** Teinte des trois axes, dans l'ordre X, Y, Z. */
  axes: readonly [string, string, string]
  /** Grisé du thème, mêlé aux teintes d'axes pour poser le quadrillage. */
  tint: string
  /** Part de grisé dans le quadrillage : `0` = teinte franche, `1` = gris pur. */
  gridDesaturation: number
  /** Opacité des trois arêtes du trièdre. */
  edgeOpacity: number
  /** Opacité du quadrillage du sol, puis des deux parois du fond. */
  gridOpacity: [number, number]
}

/** Repère du décor : les plans et le trièdre se placent tous depuis ce coin, au FOND. */
function corner(camera: THREE.Camera, r: number): { x: number; z: number } {
  return { x: camera.position.x >= 0 ? -r : r, z: camera.position.z >= 0 ? -r : r }
}

/** Les TROIS arêtes du coin, chacune teintée par la direction qu'elle suit. */
function axisTriad(colors: FrameColors): THREE.LineSegments {
  const tint: number[] = []
  const color = new THREE.Color()
  for (const hex of colors.axes) {
    color.set(hex)
    tint.push(color.r, color.g, color.b, color.r, color.g, color.b)
  }
  const geometry = new THREE.BufferGeometry()
  // Positions posées par `orientFrame` : elles dépendent du point de vue.
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(new Array(18).fill(0), 3))
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(tint, 3))
  const lines = new THREE.LineSegments(geometry, new THREE.LineBasicMaterial({
    vertexColors: true, transparent: true, opacity: colors.edgeOpacity,
  }))
  lines.userData.triad = true
  return lines
}

/** Un plan de quadrillage, teinté du MÉLANGE des deux axes qu'il porte. */
function gridPlane(
  r: number, rotation: THREE.Euler, position: THREE.Vector3,
  a: string, b: string, colors: FrameColors, opacity: number,
): THREE.GridHelper {
  const blend = new THREE.Color(a).lerp(new THREE.Color(b), 0.5)
    .lerp(new THREE.Color(colors.tint), colors.gridDesaturation)
  const grid = new THREE.GridHelper(2 * r, 8, blend, blend)
  grid.rotation.copy(rotation)
  grid.position.copy(position)
  const material = grid.material as THREE.Material
  material.transparent = true
  material.opacity = opacity
  material.depthWrite = false
  return grid
}

/** Trièdre + sol + deux parois. ⚠ Parois et trièdre sont ÉTIQUETÉS (`userData`) : c'est
 *  `orientFrame` qui les place, et il le refait à chaque changement de point de vue. */
export function buildFrame(r: number, colors: FrameColors): THREE.Object3D {
  const group = new THREE.Group()
  group.add(axisTriad(colors))
  const [x, y, z] = colors.axes
  const [floor, wall] = colors.gridOpacity
  group.add(gridPlane(r, new THREE.Euler(), new THREE.Vector3(0, -r, 0), x, z, colors, floor))
  const xy = gridPlane(r, new THREE.Euler(Math.PI / 2, 0, 0),
    new THREE.Vector3(0, 0, -r), x, y, colors, wall)
  xy.userData.wall = 'xy'
  group.add(xy)
  const yz = gridPlane(r, new THREE.Euler(0, 0, Math.PI / 2),
    new THREE.Vector3(-r, 0, 0), y, z, colors, wall)
  yz.userData.wall = 'yz'
  group.add(yz)
  return group
}

/**
 * Place les parois et le trièdre DERRIÈRE le nuage, selon le côté d'où l'on regarde.
 *
 * ⚠⚠ À décor fixe, tourner d'un quart de tour amenait une paroi DEVANT les données : son
 * quadrillage barrait les marqueurs et l'arête vive du premier plan tirait l'œil hors du
 * nuage. C'est la convention de tous les graphes 3D — on ne montre jamais la cage entière,
 * seulement le coin du fond. Appelé à chaque image ; quelques affectations, rien de plus.
 */
export function orientFrame(frame: THREE.Object3D, camera: THREE.Camera, r: number): void {
  const { x: cx, z: cz } = corner(camera, r)
  for (const child of frame.children) {
    if (child.userData.wall === 'xy') child.position.z = cz
    if (child.userData.wall === 'yz') child.position.x = cx
    if (!child.userData.triad) continue
    const position = (child as THREE.LineSegments).geometry.attributes.position
    // ⚠⚠ L'ORDRE des segments est celui des teintes posées à la construction — X, puis Y,
    // puis Z. Intervertis, l'arête verticale sortait en orange quand le nom de l'axe Y
    // s'affichait en rose : le décor démentait alors la légende qu'il est censé rappeler.
    // X au sol le long de la paroi du fond :
    position.setXYZ(0, -r, -r, cz)
    position.setXYZ(1, r, -r, cz)
    // Y, verticale au coin :
    position.setXYZ(2, cx, -r, cz)
    position.setXYZ(3, cx, r, cz)
    // Z au sol, le long de l'autre paroi :
    position.setXYZ(4, cx, -r, -r)
    position.setXYZ(5, cx, -r, r)
    position.needsUpdate = true
  }
}
