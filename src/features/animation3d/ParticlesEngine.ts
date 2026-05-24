import * as THREE from 'three'

export interface ParticlesEngineOptions {
  canvas: HTMLCanvasElement
  width: number
  height: number
  count?: number
  color?: number  // hex
}

export class ParticlesEngine {
  private renderer: THREE.WebGLRenderer
  private scene: THREE.Scene
  private camera: THREE.PerspectiveCamera
  private particles: THREE.Points
  private positions: Float32Array
  private speeds: Float32Array
  private phases: Float32Array
  private radii: Float32Array
  private count: number
  private startTime = performance.now()
  private rafId: number | null = null
  private disposed = false

  constructor(opts: ParticlesEngineOptions) {
    const { canvas, width, height, count = 180, color = 0xFFD60A } = opts
    this.count = count

    this.renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true })
    this.renderer.setSize(width, height, false)
    this.renderer.setPixelRatio(window.devicePixelRatio || 1)

    this.scene = new THREE.Scene()
    this.camera = new THREE.PerspectiveCamera(38, width / height, 0.1, 100)
    this.camera.position.set(0, 0, 6)
    this.camera.lookAt(0, 0, 0)

    // Seeded PRNG (mulberry32) so positions are deterministic
    let seed = 0x9E3779B9
    const rand = () => {
      seed = (seed + 0x6D2B79F5) | 0
      let t = seed
      t = Math.imul(t ^ (t >>> 15), t | 1)
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    }

    this.positions = new Float32Array(count * 3)
    this.speeds = new Float32Array(count)
    this.phases = new Float32Array(count)
    this.radii = new Float32Array(count)
    for (let i = 0; i < count; i++) {
      this.radii[i] = 1.8 + rand() * 2.4
      this.phases[i] = rand() * Math.PI * 2
      this.speeds[i] = 0.3 + rand() * 0.7
      this.positions[i * 3 + 0] = Math.cos(this.phases[i]) * this.radii[i]
      this.positions[i * 3 + 1] = (rand() - 0.5) * 3.2
      this.positions[i * 3 + 2] = Math.sin(this.phases[i]) * this.radii[i]
    }

    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(this.positions, 3))
    const mat = new THREE.PointsMaterial({
      color,
      size: 0.07,
      transparent: true,
      opacity: 0.9,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })
    this.particles = new THREE.Points(geo, mat)
    this.scene.add(this.particles)

    this.scene.add(new THREE.AmbientLight(0xffffff, 0.4))
  }

  start() {
    if (this.rafId !== null) return
    const loop = () => {
      if (this.disposed) return
      const t = (performance.now() - this.startTime) / 1000
      const pos = this.particles.geometry.attributes.position.array as Float32Array
      for (let i = 0; i < this.count; i++) {
        const a = this.phases[i] + t * this.speeds[i] * 0.4
        pos[i * 3 + 0] = Math.cos(a) * this.radii[i]
        pos[i * 3 + 2] = Math.sin(a) * this.radii[i]
      }
      this.particles.geometry.attributes.position.needsUpdate = true
      this.particles.rotation.y = t * 0.1
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
    this.particles.geometry.dispose()
    ;(this.particles.material as THREE.Material).dispose()
    this.renderer.dispose()
  }
}
