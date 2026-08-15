// La scène three.js du nuage 3D. Aucune dépendance à React ni au catalogue : elle reçoit
// des points déjà normalisés et des libellés déjà traduits.
//
// ⚠⚠ RENDU À LA DEMANDE, jamais de boucle `requestAnimationFrame` permanente : un onglet
// masqué gèle le rAF, et une tuile qui s'anime toute seule y resterait figée à mi-course —
// le module a déjà payé ce piège sur ses graphes 2D. Ici on rend quand la caméra bouge,
// quand la tuile est redimensionnée et au retour de l'onglet, et pas une frame de plus.
//
// ⚠⚠ `preserveDrawingBuffer` : sans lui le tampon est vidé sitôt rendu, et `html2canvas`
// (export PNG/PDF du tableau de bord) recopierait un carré VIDE à la place du nuage.
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import type { Scatter3DPoint } from './scatter3dData'

export interface Scatter3DTheme {
  /** Arêtes de la boîte et graduations : présentes, jamais concurrentes des points. */
  frame: string
  /** Encre des étiquettes d'axes. */
  ink: string
  /** Rampe de profondeur, du fond de l'axe Z vers son sommet. Une seule teinte, deux crans
   *  choisis POUR le fond du thème — jamais l'inverse automatique de l'autre thème. */
  rampLow: string
  rampHigh: string
}

export interface Scatter3DSceneOptions {
  canvas: HTMLCanvasElement
  points: readonly Scatter3DPoint[]
  /** Libellés déjà traduits, dans l'ordre X, Y, Z. */
  axisLabels: readonly [string, string, string]
  theme: Scatter3DTheme
}

const R = 1.25
/** Point de vue d'ouverture : trois quarts, légèrement en surplomb — l'angle où les trois
 *  axes se distinguent d'emblée. Sa NORME sert de distance de référence au cadrage. */
const HOME = new THREE.Vector3(2.6, 2.0, 3.0)

/** Étiquette texte toujours face à la caméra. Rendue dans un canvas 2D puis posée en sprite. */
function labelSprite(text: string, color: string, height: number): THREE.Sprite {
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')
  const font = 48
  canvas.width = 512
  canvas.height = 128
  if (ctx) {
    ctx.font = `600 ${font}px system-ui, sans-serif`
    ctx.fillStyle = color
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(text, canvas.width / 2, canvas.height / 2, canvas.width - 16)
  }
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
    map: texture, transparent: true, depthTest: false, depthWrite: false,
  }))
  sprite.scale.set(height * (canvas.width / canvas.height), height, 1)
  sprite.renderOrder = 10
  return sprite
}

/** Disque plein : sans lui, `PointsMaterial` dessine des CARRÉS, qui se lisent comme des
 *  cellules d'une grille et non comme des observations. */
function discTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = 64
  const ctx = canvas.getContext('2d')
  if (ctx) {
    ctx.fillStyle = '#fff'
    ctx.beginPath()
    ctx.arc(32, 32, 30, 0, Math.PI * 2)
    ctx.fill()
  }
  return new THREE.CanvasTexture(canvas)
}

export class Scatter3DScene {
  private renderer: THREE.WebGLRenderer
  private scene = new THREE.Scene()
  private camera: THREE.PerspectiveCamera
  private controls: OrbitControls
  private points: THREE.Points
  private raycaster = new THREE.Raycaster()
  private disposed = false
  private touched = false

  constructor({ canvas, points, axisLabels, theme }: Scatter3DSceneOptions) {
    this.renderer = new THREE.WebGLRenderer({
      canvas, alpha: true, antialias: true, preserveDrawingBuffer: true,
    })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
    this.renderer.outputColorSpace = THREE.SRGBColorSpace

    this.camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100)
    this.camera.position.copy(HOME)

    this.controls = new OrbitControls(this.camera, canvas)
    this.controls.enablePan = false
    // ⚠ Pas d'amortissement : il ne s'éteint qu'au fil des frames, donc il EXIGE une boucle
    // permanente — exactement ce que cette scène refuse.
    this.controls.enableDamping = false
    this.controls.minDistance = 2
    this.controls.maxDistance = 12
    this.controls.addEventListener('change', () => this.render())
    // ⚠⚠ Le retrait du cadrage automatique s'accroche à `start` (un GESTE), jamais à
    // `change` : ce dernier part aussi du `controls.update()` du cadrage lui-même, qui se
    // serait donc désarmé tout seul au premier redimensionnement.
    this.controls.addEventListener('start', () => { this.touched = true })

    this.scene.add(this.buildFrame(theme))
    // Chaque étiquette est posée au BOUT de son arête : c'est ce qui dit quel axe on tourne.
    // ⚠ Sur l'arête AVANT pour l'axe vertical : posée sur l'arête du fond, elle sortait du
    // cadre à la moitié des angles de vue.
    const at: [number, number, number][] = [
      [R + 0.4, -R, -R], [-R - 0.35, R + 0.2, R], [-R, -R, R + 0.4],
    ]
    axisLabels.forEach((text, i) => {
      const sprite = labelSprite(text, theme.ink, 0.22)
      sprite.position.set(...at[i])
      this.scene.add(sprite)
    })

    this.points = this.buildPoints(points, theme)
    this.scene.add(this.points)
    // ⚠ Le seuil est en unités de MONDE : les points vivent dans [-1, 1], un seuil par
    // défaut (1) attraperait le nuage entier au premier survol.
    this.raycaster.params.Points.threshold = 0.06
  }

  /** Boîte englobante : trois plans suffisent à donner la profondeur sans cage complète. */
  private buildFrame(theme: Scatter3DTheme): THREE.Object3D {
    const group = new THREE.Group()
    const material = new THREE.LineBasicMaterial({ color: new THREE.Color(theme.frame) })
    const box = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.BoxGeometry(2 * R, 2 * R, 2 * R)), material)
    group.add(box)
    // Quadrillage au sol : c'est lui qui donne l'assise, la boîte seule flotte.
    const grid = new THREE.GridHelper(2 * R, 8, theme.frame, theme.frame)
    grid.position.y = -R
    const gridMat = grid.material as THREE.Material
    gridMat.transparent = true
    gridMat.opacity = 0.5
    group.add(grid)
    return group
  }

  private buildPoints(points: readonly Scatter3DPoint[], theme: Scatter3DTheme): THREE.Points {
    const positions = new Float32Array(points.length * 3)
    const colors = new Float32Array(points.length * 3)
    const low = new THREE.Color(theme.rampLow)
    const high = new THREE.Color(theme.rampHigh)
    const color = new THREE.Color()
    points.forEach((p, i) => {
      positions[i * 3] = p.nx * R
      positions[i * 3 + 1] = p.ny * R
      positions[i * 3 + 2] = p.nz * R
      color.copy(low).lerp(high, p.depth)
      colors[i * 3] = color.r
      colors[i * 3 + 1] = color.g
      colors[i * 3 + 2] = color.b
    })
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))
    return new THREE.Points(geometry, new THREE.PointsMaterial({
      // ⚠ `sizeAttenuation` fait grossir les points proches : c'est ce qui rend la
      // profondeur perceptible sur un écran plat, bien plus que la position seule.
      size: 0.16, sizeAttenuation: true, vertexColors: true,
      map: discTexture(), transparent: true, alphaTest: 0.5,
    }))
  }

  /** Rang du point sous le curseur, ou `null`. Coordonnées relatives au canvas, en pixels. */
  pick(x: number, y: number, width: number, height: number): number | null {
    if (width === 0 || height === 0) return null
    this.raycaster.setFromCamera(
      new THREE.Vector2((x / width) * 2 - 1, -(y / height) * 2 + 1), this.camera)
    const hits = this.raycaster.intersectObject(this.points)
    return hits.length && hits[0].index !== undefined ? hits[0].index : null
  }

  /** ⚠ Une taille nulle est IGNORÉE : dimensionner le rendu à zéro le laisserait vide pour
   *  toujours — le rendu à la demande n'a pas de boucle pour s'en apercevoir ensuite. */
  resize(width: number, height: number): void {
    if (this.disposed || width === 0 || height === 0) return
    this.renderer.setSize(width, height, false)
    this.camera.aspect = width / height
    // ⚠ Une tuile ÉTROITE recadre par la largeur : à distance fixe, la boîte et ses
    // étiquettes d'axes sortaient du champ dès que le format passait sous le paysage.
    if (!this.touched) {
      const fit = Math.min(1.8, Math.max(1, 1.5 / this.camera.aspect))
      this.camera.position.copy(HOME).multiplyScalar(fit)
      this.controls.update()
    }
    this.camera.updateProjectionMatrix()
    this.render()
  }

  render(): void {
    if (this.disposed) return
    this.renderer.render(this.scene, this.camera)
  }

  dispose(): void {
    this.disposed = true
    this.controls.dispose()
    this.scene.traverse((obj) => {
      if (obj instanceof THREE.Points || obj instanceof THREE.LineSegments) obj.geometry.dispose()
      const material = (obj as { material?: THREE.Material | THREE.Material[] }).material
      for (const m of Array.isArray(material) ? material : material ? [material] : []) m.dispose()
    })
    this.renderer.dispose()
  }
}
