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
//
// ⚠⚠ CE QUI REND UN NUAGE 3D LISIBLE tient en trois choses, et aucune n'est décorative :
// les TIGES qui relient chaque point au sol (sans elles, un point flotte à une hauteur
// indéterminable sur un écran plat), les GRADUATIONS aux extrémités des axes (sans elles,
// on voit une forme mais aucune valeur) et les GRILLES de fond (elles donnent l'assise).
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js'
import { rampAt } from './scatter3dRamp'
import type { Scatter3DPoint } from './scatter3dData'

export interface Scatter3DTheme {
  /** Arêtes de la boîte et grilles : présentes, jamais concurrentes des points. */
  frame: string
  /** Encre des étiquettes d'axes. */
  ink: string
  /** Encre des graduations — plus pâle que les noms d'axes : on lit le nom, on consulte
   *  la borne. */
  inkDim: string
  /** Rampe de profondeur, du fond de l'axe Z vers son sommet (cf. `scatter3dRamp`). */
  ramp: readonly string[]
  /**
   * Force du halo lumineux autour des points. `0` = aucun.
   *
   * ⚠ Nul sur fond clair : un halo n'éclaire que ce qui est plus sombre que lui, et sur du
   * blanc il ne fait que délaver les points au lieu de les faire ressortir.
   */
  bloom: number
}

/** Un axe tel qu'il s'AFFICHE : son nom et ses deux bornes, déjà traduits et formatés. */
export interface Scatter3DAxisView {
  label: string
  min: string
  max: string
}

/**
 * La scène naît VIDE : son contenu (les points) et ses axes arrivent ensuite par
 * `setPoints` / `setAxes`. C'est ce qui permet à un changement de filtre de remplacer le
 * nuage sans refaire ni le contexte WebGL ni le point de vue.
 */
export interface Scatter3DSceneOptions {
  canvas: HTMLCanvasElement
  theme: Scatter3DTheme
}

const R = 1.25
/** Point de vue d'ouverture : trois quarts, légèrement en surplomb — l'angle où les trois
 *  axes se distinguent d'emblée. Sa NORME sert de distance de référence au cadrage. */
const HOME = new THREE.Vector3(2.7, 1.55, 3.1)
/**
 * Au-delà, plus de tiges : ⚠ mille tiges ne sont plus des repères, c'est une forêt qui
 * cache le nuage — et le nuage dense se lit alors par sa densité, pas point par point.
 */
const MAX_STEMS = 150

/** Ancrage horizontal d'une étiquette : vers où le texte se développe depuis son point. */
type Anchor = 'center' | 'left' | 'right'

/**
 * Étiquette texte toujours face à la caméra.
 *
 * `frac` = part de la HAUTEUR du canevas que le texte doit occuper, quelle que soit la
 * distance de la caméra.
 *
 * ⚠⚠ La largeur est MESURÉE, jamais fixe. Vu à l'écran : à canevas fixe, un sprite centré
 * posé au bord gauche du volume débordait de la moitié de sa largeur et se faisait rogner
 * par le cadre — « Produits appariés » s'affichait « oduits appariés ».
 */
function labelSprite(text: string, color: string, frac: number, anchor: Anchor): THREE.Sprite {
  const canvas = document.createElement('canvas')
  const font = 48
  const pad = 8
  const probe = canvas.getContext('2d')
  const typeface = `600 ${font}px system-ui, sans-serif`
  if (probe) probe.font = typeface
  const width = Math.ceil((probe?.measureText(text).width ?? text.length * font * 0.55) + pad * 2)
  canvas.width = Math.max(width, 8)
  canvas.height = Math.round(font * 1.6)
  const ctx = canvas.getContext('2d')
  if (ctx) {
    ctx.font = typeface
    ctx.fillStyle = color
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(text, canvas.width / 2, canvas.height / 2)
  }
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
    map: texture, transparent: true, depthTest: false, depthWrite: false,
  }))
  // ⚠⚠ Aucune échelle FIXE ici : `sizeLabels` la recalcule à chaque rendu depuis la distance
  // caméra, pour que le texte garde la même taille À L'ÉCRAN. Un sprite à taille de monde
  // fixe rapetissait avec le cadrage — sur une tuile large, les graduations devenaient
  // illisibles alors qu'elles portent les seules VALEURS du visuel.
  sprite.userData = { frac, aspect: canvas.width / canvas.height }
  // `center` déplace l'ancre DANS le sprite : à gauche du volume on développe vers
  // l'intérieur, à droite vers l'extérieur — jamais par-dessus la boîte.
  sprite.center.set(anchor === 'center' ? 0.5 : anchor === 'left' ? 0 : 1, 0.5)
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

/** Où se posent le nom et les deux bornes de chaque axe, et vers où leur texte se développe.
 *  Chaque axe prend une arête DIFFÉRENTE : sur la même, les textes se chevauchent. */
// ⚠⚠ Les bornes sont rentrées à 88 % de l'arête, jamais posées sur le COIN : trois axes s'y
// rejoignent, et trois bornes au même endroit se chevauchaient — vu à l'écran, le minimum de
// X passait par-dessus celui de Y.
const T = R * 0.75
const AXIS_ANCHORS: { name: [number, number, number]; min: [number, number, number]
  max: [number, number, number]; anchor: Anchor }[] = [
  // X — arête avant-basse. Le nom passe SOUS les bornes pour ne pas les croiser.
  { name: [0, -R - 0.19, R], min: [-T, -R - 0.07, R + 0.02], max: [T, -R - 0.07, R + 0.02],
    anchor: 'center' },
  // Y — arête ARRIÈRE-gauche, verticale. ⚠ Arrière et non avant : sur l'arête avant, ses
  // bornes tombaient dans le même coin que celles de X et se chevauchaient.
  { name: [-R - 0.03, R + 0.15, -R], min: [-R - 0.05, -T, -R], max: [-R - 0.05, T, -R],
    anchor: 'right' },
  // Z — arête droite-basse, en profondeur. Textes développés vers l'extérieur.
  { name: [R + 0.07, -R - 0.16, 0], min: [R + 0.07, -R - 0.03, T], max: [R + 0.07, -R - 0.03, -T],
    anchor: 'left' },
]

export class Scatter3DScene {
  private renderer: THREE.WebGLRenderer
  private scene = new THREE.Scene()
  private camera: THREE.PerspectiveCamera
  private controls: OrbitControls
  /**
   * Les points sont des SPHÈRES instanciées, pas des pastilles plates.
   *
   * ⚠⚠ C'est ce qui donne le volume : une sphère éclairée porte un reflet et un côté
   * ombré, et l'œil en tire immédiatement sa position dans l'espace — un disque plat de
   * couleur unie ne dit rien d'autre que sa place à l'écran. `InstancedMesh` rend les
   * milliers de sphères en UN appel de dessin.
   */
  private points: THREE.InstancedMesh
  private composer: EffectComposer | null = null
  private bloomPass: UnrealBloomPass | null = null
  /** Tiges vers le sol + leur pied. `null` = nuage trop dense pour en porter. */
  private stems: THREE.LineSegments | null = null
  private feet: THREE.Points | null = null
  private labels: THREE.Sprite[] = []
  private lastPoints: readonly Scatter3DPoint[] | null = null
  private lastAxes: readonly Scatter3DAxisView[] | null = null
  private theme: Scatter3DTheme
  private disc = discTexture()
  private raycaster = new THREE.Raycaster()
  private disposed = false
  private touched = false

  constructor({ canvas, theme }: Scatter3DSceneOptions) {
    this.theme = theme
    this.renderer = new THREE.WebGLRenderer({
      canvas, alpha: true, antialias: true, preserveDrawingBuffer: true,
    })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
    this.renderer.outputColorSpace = THREE.SRGBColorSpace
    // ⚠ Pas d'ombres portées : essayées, elles ne se voyaient sur AUCUN des deux thèmes —
    // noyées dans le fond en sombre, trop diffuses en clair — pour le coût d'une carte
    // d'ombre à chaque image. Les tiges et leur pied posent déjà chaque point au sol, et
    // bien plus lisiblement.
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.renderer.toneMappingExposure = 1.15

    this.camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100)
    this.camera.position.copy(HOME)

    this.controls = new OrbitControls(this.camera, canvas)
    // ⚠ Visée légèrement SOUS le centre du volume : les étiquettes du bas (nom de l'axe X et
    // bornes de l'arête avant) descendent plus bas que la boîte, et centrer sur le volume
    // les faisait sortir du cadre — alors qu'il reste de l'air au-dessus.
    this.controls.target.set(0, -0.1, 0)
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

    this.scene.add(this.buildLights())
    this.scene.add(this.buildFrame(theme))
    this.points = this.buildPoints([], theme)
    this.scene.add(this.points)
    // ⚠ Le seuil est en unités de MONDE : les points vivent dans [-1, 1], un seuil par
    // défaut (1) attraperait le nuage entier au premier survol.
    this.raycaster.params.Points.threshold = 0.07
    if (theme.bloom > 0) this.buildComposer(theme.bloom)
  }

  /**
   * Chaîne de rendu avec halo lumineux.
   *
   * ⚠⚠ `preserveDrawingBuffer` tient toujours : c'est le RENDERER qui le porte, et le
   * dernier passage écrit dans son canevas — l'export PNG/PDF du tableau continue donc de
   * recopier l'image. Vérifié au navigateur, pas déduit.
   * ⚠ Seuil haut : seuls les crans vifs de la rampe débordent. Un seuil bas ferait luire
   * jusqu'aux arêtes de la boîte, et le halo cesserait de désigner les points.
   */
  private buildComposer(strength: number): void {
    const composer = new EffectComposer(this.renderer)
    composer.addPass(new RenderPass(this.scene, this.camera))
    const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), strength, 0.4, 0.72)
    composer.addPass(bloom)
    composer.addPass(new OutputPass())
    this.composer = composer
    this.bloomPass = bloom
  }

  /**
   * L'éclairage : une clé en surplomb qui porte les ombres, un remplissage froid pour que le
   * côté sombre des sphères ne soit pas noir, un contre-jour qui détache leur silhouette.
   *
   * ⚠ Trois sources, pas une : sous une lumière unique, toutes les sphères prennent le même
   * reflet au même endroit et le nuage redevient un semis de pastilles identiques.
   */
  private buildLights(): THREE.Object3D {
    const group = new THREE.Group()
    group.add(new THREE.AmbientLight(0xffffff, 0.85))
    const key = new THREE.DirectionalLight(0xffffff, 2.2)
    key.position.set(3.2, 5.5, 2.6)
    group.add(key)
    const fill = new THREE.DirectionalLight(0x9db4ff, 0.7)
    fill.position.set(-4, 1.5, -2)
    group.add(fill)
    const rim = new THREE.DirectionalLight(0xffffff, 0.9)
    rim.position.set(-1.5, 2, -5)
    group.add(rim)
    return group
  }

  /** Boîte, sol et parois du fond. Les grilles donnent l'assise : sans elles, les points
   *  flottent dans un cadre vide et rien ne dit à quelle profondeur. */
  private buildFrame(theme: Scatter3DTheme): THREE.Object3D {
    const group = new THREE.Group()
    group.add(new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.BoxGeometry(2 * R, 2 * R, 2 * R)),
      new THREE.LineBasicMaterial({ color: new THREE.Color(theme.frame) })))
    // Sol franc, parois plus discrètes : en tournant, une paroi passe devant le nuage et ne
    // doit jamais concurrencer les points.
    const grids: [THREE.Euler, THREE.Vector3, number][] = [
      [new THREE.Euler(), new THREE.Vector3(0, -R, 0), 0.55],
      [new THREE.Euler(Math.PI / 2, 0, 0), new THREE.Vector3(0, 0, -R), 0.28],
      [new THREE.Euler(0, 0, Math.PI / 2), new THREE.Vector3(-R, 0, 0), 0.28],
    ]
    for (const [rotation, position, opacity] of grids) {
      const grid = new THREE.GridHelper(2 * R, 8, theme.frame, theme.frame)
      grid.rotation.copy(rotation)
      grid.position.copy(position)
      const material = grid.material as THREE.Material
      material.transparent = true
      material.opacity = opacity
      material.depthWrite = false
      group.add(grid)
    }
    return group
  }

  /**
   * Les sphères, en UNE instance de maillage.
   *
   * ⚠ Le rayon décroît avec le nombre de points : à vingt sphères on veut des billes qu'on
   * distingue, à deux mille des grains qui laissent voir la densité. Un rayon fixe donne
   * soit un semis illisible, soit une bouillie.
   */
  private buildPoints(points: readonly Scatter3DPoint[], theme: Scatter3DTheme): THREE.InstancedMesh {
    const radius = points.length <= 40 ? 0.055 : points.length <= 400 ? 0.038 : 0.026
    const detail = points.length <= 200 ? 20 : 10
    const mesh = new THREE.InstancedMesh(
      new THREE.SphereGeometry(radius, detail, Math.round(detail * 0.7)),
      // `emissiveIntensity` donne au halo de quoi s'accrocher sans délaver la couleur ;
      // `roughness` basse pose le reflet qui fait lire le volume.
      new THREE.MeshStandardMaterial({ roughness: 0.32, metalness: 0.08, emissive: 0x000000 }),
      Math.max(points.length, 1),
    )
    mesh.count = points.length
    const matrix = new THREE.Matrix4()
    const color = new THREE.Color()
    points.forEach((p, i) => {
      matrix.setPosition(p.nx * R, p.ny * R, p.nz * R)
      mesh.setMatrixAt(i, matrix)
      mesh.setColorAt(i, color.set(rampAt(theme.ramp, p.depth)))
    })
    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
    return mesh
  }

  /**
   * Tiges vers le sol et pied de chaque point.
   *
   * ⚠⚠ C'est LE repère de profondeur d'un nuage 3D : sans tige, deux points superposés à
   * l'écran sont indiscernables — l'un peut être au fond en haut, l'autre devant en bas.
   */
  private buildStems(points: readonly Scatter3DPoint[]): void {
    if (points.length === 0 || points.length > MAX_STEMS) return
    const segments = new Float32Array(points.length * 6)
    const feet = new Float32Array(points.length * 3)
    points.forEach((p, i) => {
      const x = p.nx * R
      const z = p.nz * R
      segments.set([x, p.ny * R, z, x, -R, z], i * 6)
      feet.set([x, -R + 0.002, z], i * 3)
    })
    // ⚠ La tige porte la couleur DE SON POINT et s'éteint vers le sol : uniformément
    // colorée, elle concurrence le point ; uniformément grise, on ne sait plus quelle tige
    // appartient à quel point dans un nuage serré.
    const stemColors = new Float32Array(points.length * 6)
    const footColors = new Float32Array(points.length * 3)
    const top = new THREE.Color()
    const ground = new THREE.Color(this.theme.frame)
    points.forEach((p, i) => {
      top.set(rampAt(this.theme.ramp, p.depth))
      stemColors.set([top.r, top.g, top.b], i * 6)
      const foot = top.clone().lerp(ground, 0.55)
      stemColors.set([foot.r, foot.g, foot.b], i * 6 + 3)
      footColors.set([foot.r, foot.g, foot.b], i * 3)
    })
    const stemGeometry = new THREE.BufferGeometry()
    stemGeometry.setAttribute('position', new THREE.BufferAttribute(segments, 3))
    stemGeometry.setAttribute('color', new THREE.BufferAttribute(stemColors, 3))
    this.stems = new THREE.LineSegments(stemGeometry, new THREE.LineBasicMaterial({
      vertexColors: true, transparent: true, opacity: 0.7,
    }))
    this.scene.add(this.stems)

    const footGeometry = new THREE.BufferGeometry()
    footGeometry.setAttribute('position', new THREE.BufferAttribute(feet, 3))
    footGeometry.setAttribute('color', new THREE.BufferAttribute(footColors, 3))
    this.feet = new THREE.Points(footGeometry, new THREE.PointsMaterial({
      vertexColors: true, size: 0.075, sizeAttenuation: true,
      map: this.disc, transparent: true, opacity: 0.8, alphaTest: 0.5,
    }))
    this.scene.add(this.feet)
  }

  private clearStems(): void {
    for (const object of [this.stems, this.feet]) {
      if (!object) continue
      this.scene.remove(object)
      object.geometry.dispose()
      ;(object.material as THREE.Material).dispose()
    }
    this.stems = null
    this.feet = null
  }

  /**
   * Remplace le nuage SANS refaire la scène.
   *
   * ⚠⚠ C'est ce qui laisse à l'utilisateur son point de vue quand un filtre change les
   * chiffres. Reconstruire la scène entière recréerait aussi un contexte WebGL — le
   * navigateur en plafonne le nombre — et ramènerait la caméra à l'angle d'origine au
   * milieu d'une exploration.
   */
  setPoints(points: readonly Scatter3DPoint[]): void {
    // ⚠ Même nuage = rien à faire : à la création, le composant repose son contenu, et sans
    // cette garde la géométrie serait bâtie deux fois à chaque montage.
    if (this.disposed || points === this.lastPoints) return
    this.lastPoints = points
    this.scene.remove(this.points)
    this.points.geometry.dispose()
    ;(this.points.material as THREE.Material).dispose()
    this.points.dispose()
    this.clearStems()
    this.points = this.buildPoints(points, this.theme)
    this.scene.add(this.points)
    this.buildStems(points)
    this.render()
  }

  /** Nomme et GRADUE les trois axes. Sans bornes, on voit une forme et aucune valeur. */
  setAxes(axes: readonly [Scatter3DAxisView, Scatter3DAxisView, Scatter3DAxisView]): void {
    if (this.disposed || axes === this.lastAxes) return
    this.lastAxes = axes
    for (const sprite of this.labels) {
      this.scene.remove(sprite)
      sprite.material.map?.dispose()
      sprite.material.dispose()
    }
    this.labels = []
    axes.forEach((axis, i) => {
      const at = AXIS_ANCHORS[i]
      // ⚠ Le NOM est toujours centré sur son arête, quel que soit l'ancrage des bornes :
      // c'est le plus long des trois textes, et développé d'un seul côté il sortait du cadre
      // sur une tuile étroite — « Écart médian (%) » s'affichait « Écart médian ( ».
      const parts: [string, [number, number, number], number, string, Anchor][] = [
        [axis.label, at.name, 0.05, this.theme.ink, 'center'],
        [axis.min, at.min, 0.038, this.theme.inkDim, at.anchor],
        [axis.max, at.max, 0.038, this.theme.inkDim, at.anchor],
      ]
      for (const [text, position, frac, color, anchor] of parts) {
        if (!text) continue
        const sprite = labelSprite(text, color, frac, anchor)
        sprite.position.set(...position)
        this.scene.add(sprite)
        this.labels.push(sprite)
      }
    })
    this.render()
  }

  /** Rang du point sous le curseur, ou `null`. Coordonnées relatives au canvas, en pixels. */
  pick(x: number, y: number, width: number, height: number): number | null {
    if (width === 0 || height === 0) return null
    this.raycaster.setFromCamera(
      new THREE.Vector2((x / width) * 2 - 1, -(y / height) * 2 + 1), this.camera)
    // ⚠⚠ `instanceId`, jamais `index` : les points sont des sphères INSTANCIÉES, et `index`
    // y désigne le triangle touché dans la géométrie partagée — le même pour toutes. Il
    // aurait donc rendu un rang qui n'a rien à voir avec le point survolé.
    const hits = this.raycaster.intersectObject(this.points)
    return hits.length && hits[0].instanceId !== undefined ? hits[0].instanceId : null
  }

  /** ⚠ Une taille nulle est IGNORÉE : dimensionner le rendu à zéro le laisserait vide pour
   *  toujours — le rendu à la demande n'a pas de boucle pour s'en apercevoir ensuite. */
  resize(width: number, height: number): void {
    if (this.disposed || width === 0 || height === 0) return
    this.renderer.setSize(width, height, false)
    this.composer?.setSize(width, height)
    this.camera.aspect = width / height
    // ⚠ Une tuile ÉTROITE recadre par la largeur : à distance fixe, la boîte et ses
    // étiquettes d'axes sortaient du champ dès que le format passait sous le paysage.
    if (!this.touched) {
      const fit = Math.min(1.9, Math.max(1.28, 1.5 / this.camera.aspect))
      this.camera.position.copy(HOME).multiplyScalar(fit).add(this.controls.target)
      this.controls.update()
    }
    this.camera.updateProjectionMatrix()
    this.render()
  }

  /**
   * Rend aux étiquettes leur taille d'ÉCRAN, depuis leur distance à la caméra.
   *
   * ⚠ Recalculé à chaque image : la distance change au zoom molette comme au recadrage
   * d'une tuile, et une taille figée redeviendrait illisible dans les deux cas.
   */
  private sizeLabels(): void {
    const k = 2 * Math.tan((this.camera.fov * Math.PI) / 360)
    for (const sprite of this.labels) {
      const { frac, aspect } = sprite.userData as { frac: number; aspect: number }
      const height = k * this.camera.position.distanceTo(sprite.position) * frac
      sprite.scale.set(height * aspect, height, 1)
    }
  }

  render(): void {
    if (this.disposed) return
    this.sizeLabels()
    if (this.composer) this.composer.render()
    else this.renderer.render(this.scene, this.camera)
  }

  dispose(): void {
    this.disposed = true
    this.controls.dispose()
    this.bloomPass?.dispose()
    this.composer?.dispose()
    this.disc.dispose()
    this.scene.traverse((obj) => {
      if (obj instanceof THREE.Points || obj instanceof THREE.LineSegments) obj.geometry.dispose()
      const material = (obj as { material?: THREE.Material | THREE.Material[] }).material
      for (const m of Array.isArray(material) ? material : material ? [material] : []) m.dispose()
    })
    this.renderer.dispose()
  }
}
