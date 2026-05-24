import * as THREE from 'three'
import type { ReliefConfig } from './types'

export interface Relief3DEngineOptions {
  canvas: HTMLCanvasElement
  width: number
  height: number
  texture: HTMLImageElement   // captured PNG of the Fabric object
  config: ReliefConfig
}

/**
 * Three.js engine that turns a 2D snapshot into a real 3D extruded volume
 * with manual lighting. Architecture:
 *   - An ExtrudeGeometry plate (rounded rect + bevel) provides the volume
 *     and side faces — uses a neutral MeshStandardMaterial.
 *   - Two textured planes are pinned just outside the extrusion (front and
 *     back) and carry the captured PNG with transparency, so the snapshot
 *     reads cleanly without fighting ExtrudeGeometry's UV layout.
 *   - DirectionalLight + AmbientLight are fully driven by ReliefConfig.lighting.
 */
export class Relief3DEngine {
  private renderer: THREE.WebGLRenderer
  private scene: THREE.Scene
  private camera: THREE.PerspectiveCamera
  private group: THREE.Group | null = null
  private dirLight: THREE.DirectionalLight
  private ambient: THREE.AmbientLight
  private texture: THREE.Texture
  private aspect: number
  private rafId: number | null = null
  private disposed = false
  private startTime = performance.now()
  private config: ReliefConfig
  private sideMaterial: THREE.MeshStandardMaterial
  private frontMaterial: THREE.MeshStandardMaterial
  private backMaterial: THREE.MeshStandardMaterial

  constructor(opts: Relief3DEngineOptions) {
    const { canvas, width, height, texture: img, config } = opts
    this.config = config
    this.aspect = img.naturalWidth / img.naturalHeight || 1

    this.renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true })
    this.renderer.setSize(width, height, false)
    this.renderer.setPixelRatio(window.devicePixelRatio || 1)
    this.renderer.outputColorSpace = THREE.SRGBColorSpace

    this.scene = new THREE.Scene()
    this.camera = new THREE.PerspectiveCamera(35, width / height, 0.1, 100)
    this.camera.position.set(0, 0, 3.2)
    this.camera.lookAt(0, 0, 0)

    this.ambient = new THREE.AmbientLight(0xffffff, config.lighting.ambientIntensity)
    this.scene.add(this.ambient)

    this.dirLight = new THREE.DirectionalLight(0xffffff, config.lighting.directionalIntensity)
    this.dirLight.position.set(
      config.lighting.dirPosX,
      config.lighting.dirPosY,
      config.lighting.dirPosZ,
    )
    this.scene.add(this.dirLight)

    this.sideMaterial = new THREE.MeshStandardMaterial({
      color: 0xe5e5e5,
      roughness: 0.55,
      metalness: 0.15,
    })

    this.texture = new THREE.Texture(img)
    this.texture.colorSpace = THREE.SRGBColorSpace
    this.texture.anisotropy = this.renderer.capabilities.getMaxAnisotropy?.() ?? 4
    this.texture.needsUpdate = true

    // depthTest:false + renderOrder:999 (set on mesh below) lets the textured
    // face render on top of the volume without z-fighting. depthWrite:false
    // means it doesn't write to the depth buffer either. DoubleSide so the
    // texture is visible from front AND back (back view shows the natural
    // mirror, like a shopfront window).
    this.frontMaterial = new THREE.MeshStandardMaterial({
      map: this.texture,
      transparent: true,
      alphaTest: 0.02,
      roughness: 0.5,
      metalness: 0.05,
      side: THREE.DoubleSide,
      depthTest: false,
      depthWrite: false,
    })
    this.backMaterial = this.frontMaterial

    this.applyConfig()
  }

  /** Build the extruded volume + textured front/back planes. */
  private buildGroup() {
    if (this.group) {
      this.scene.remove(this.group)
      this.group.traverse((obj) => {
        if (obj instanceof THREE.Mesh) {
          obj.geometry.dispose()
        }
      })
      this.group = null
    }

    const { depth, bevel } = this.config
    const longSide = 1.6
    const w = this.aspect >= 1 ? longSide : longSide * this.aspect
    const h = this.aspect >= 1 ? longSide / this.aspect : longSide
    const d = Math.max(0.01, depth / 100)
    const b = Math.max(0, Math.min(bevel / 100, d * 0.45, Math.min(w, h) * 0.2))

    // Rounded rectangle silhouette
    const shape = new THREE.Shape()
    const r = Math.min(0.06, Math.min(w, h) * 0.08)
    shape.moveTo(-w / 2 + r, -h / 2)
    shape.lineTo(w / 2 - r, -h / 2)
    shape.quadraticCurveTo(w / 2, -h / 2, w / 2, -h / 2 + r)
    shape.lineTo(w / 2, h / 2 - r)
    shape.quadraticCurveTo(w / 2, h / 2, w / 2 - r, h / 2)
    shape.lineTo(-w / 2 + r, h / 2)
    shape.quadraticCurveTo(-w / 2, h / 2, -w / 2, h / 2 - r)
    shape.lineTo(-w / 2, -h / 2 + r)
    shape.quadraticCurveTo(-w / 2, -h / 2, -w / 2 + r, -h / 2)

    const volumeGeom = new THREE.ExtrudeGeometry(shape, {
      depth: d,
      bevelEnabled: b > 0.001,
      bevelSegments: 4,
      bevelSize: b,
      bevelThickness: b,
      curveSegments: 16,
    })
    volumeGeom.translate(0, 0, -d / 2)

    const volume = new THREE.Mesh(volumeGeom, this.sideMaterial)
    volume.renderOrder = 0

    // Textured front face — PlaneGeometry has well-defined normal (+Z) and
    // standard UV layout (matches HTML image with Texture.flipY=true). The
    // alphaTest on frontMaterial discards transparent corners of the snapshot.
    const faceGeom = new THREE.PlaneGeometry(w, h)
    const frontFace = new THREE.Mesh(faceGeom, this.frontMaterial)
    frontFace.position.z = d / 2 + 0.01
    frontFace.renderOrder = 999

    const group = new THREE.Group()
    group.add(volume)
    group.add(frontFace)
    group.rotation.x = (this.config.rotX * Math.PI) / 180
    group.rotation.y = (this.config.rotY * Math.PI) / 180

    this.scene.add(group)
    this.group = group
  }

  applyConfig() {
    const lc = this.config.lighting
    this.ambient.intensity = lc.ambientIntensity
    this.ambient.color.set(lc.ambientColor)
    this.dirLight.intensity = lc.directionalIntensity
    this.dirLight.color.set(lc.directionalColor)
    this.dirLight.position.set(lc.dirPosX, lc.dirPosY, lc.dirPosZ)

    if (!this.group) {
      this.buildGroup()
    }
  }

  updateConfig(next: ReliefConfig) {
    const geometryChanged =
      next.depth !== this.config.depth || next.bevel !== this.config.bevel
    this.config = next
    if (geometryChanged) {
      this.buildGroup()
    } else if (this.group) {
      this.group.rotation.x = (next.rotX * Math.PI) / 180
      this.group.rotation.y = (next.rotY * Math.PI) / 180
    }
    this.applyConfig()
  }

  setRotation(rotX: number, rotY: number) {
    if (!this.group) return
    this.group.rotation.x = (rotX * Math.PI) / 180
    this.group.rotation.y = (rotY * Math.PI) / 180
  }

  start() {
    if (this.rafId !== null) return
    const loop = () => {
      if (this.disposed) return
      if (this.config.autoRotate && this.group) {
        const t = (performance.now() - this.startTime) / 1000
        this.group.rotation.y = (this.config.rotY * Math.PI) / 180 + t * 0.4
      }
      this.renderer.render(this.scene, this.camera)
      this.rafId = requestAnimationFrame(loop)
    }
    this.rafId = requestAnimationFrame(loop)
  }

  stop() {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId)
      this.rafId = null
    }
  }

  resize(width: number, height: number) {
    this.renderer.setSize(width, height, false)
    this.camera.aspect = width / height
    this.camera.updateProjectionMatrix()
  }

  dispose() {
    this.disposed = true
    this.stop()
    if (this.group) {
      this.group.traverse((obj) => {
        if (obj instanceof THREE.Mesh) obj.geometry.dispose()
      })
    }
    this.sideMaterial.dispose()
    this.frontMaterial.dispose()
    this.texture.dispose()
    this.renderer.dispose()
  }
}
