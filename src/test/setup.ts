// Setup global pour les tests Vitest.
// Ajouter ici les mocks ou polyfills globaux si besoin.

// Polyfill DOMMatrix — requis par pdfjs-dist (canvas.js) dans l'env jsdom/Node.
if (typeof globalThis.DOMMatrix === 'undefined') {
  ;(globalThis as unknown as Record<string, unknown>).DOMMatrix = class DOMMatrix {
    a = 1; b = 0; c = 0; d = 1; e = 0; f = 0
    m11 = 1; m12 = 0; m13 = 0; m14 = 0
    m21 = 0; m22 = 1; m23 = 0; m24 = 0
    m31 = 0; m32 = 0; m33 = 1; m34 = 0
    m41 = 0; m42 = 0; m43 = 0; m44 = 1
    is2D = true; isIdentity = true
    constructor(_init?: string | number[]) {}
    invertSelf() { return this }
    multiplySelf() { return this }
    preMultiplySelf() { return this }
    translateSelf() { return this }
    scaleSelf() { return this }
    scale3dSelf() { return this }
    rotateSelf() { return this }
    rotateFromVectorSelf() { return this }
    rotateAxisAngleSelf() { return this }
    skewXSelf() { return this }
    skewYSelf() { return this }
    flipX() { return this }
    flipY() { return this }
    inverse() { return this }
    multiply() { return this }
    translate() { return this }
    scale() { return this }
    scale3d() { return this }
    rotate() { return this }
    rotateFromVector() { return this }
    rotateAxisAngle() { return this }
    skewX() { return this }
    skewY() { return this }
    transformPoint() { return { x: 0, y: 0, z: 0, w: 1 } }
    toFloat32Array() { return new Float32Array(16) }
    toFloat64Array() { return new Float64Array(16) }
    toJSON() { return {} }
    toString() { return 'matrix(1, 0, 0, 1, 0, 0)' }
    static fromMatrix() { return new DOMMatrix() }
    static fromFloat32Array() { return new DOMMatrix() }
    static fromFloat64Array() { return new DOMMatrix() }
  }
}

// Polyfill localStorage — Node 22+ expose un `localStorage` natif expérimental
// indisponible sans `--localstorage-file`, qui masque celui de jsdom → `localStorage`
// est `undefined` dans les tests. On force un Storage en mémoire fonctionnel
// (réinitialisé par fichier de test grâce à l'isolation des modules Vitest).
{
  const mem = new Map<string, string>()
  const storage: Storage = {
    get length() { return mem.size },
    clear() { mem.clear() },
    getItem(key: string) { return mem.has(key) ? mem.get(key)! : null },
    setItem(key: string, value: string) { mem.set(key, String(value)) },
    removeItem(key: string) { mem.delete(key) },
    key(index: number) { return Array.from(mem.keys())[index] ?? null },
  }
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: storage })
}

export {}
