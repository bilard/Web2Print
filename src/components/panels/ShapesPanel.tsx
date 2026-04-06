import { useState } from 'react'
import { loadSVGFromString, Group } from 'fabric'
import type { FabricObject } from 'fabric'
import { globalFabricCanvas } from '@/features/editor/CanvasContainer'
import { syncToStore } from '@/features/editor/useAddObject'
import { useEditorStore } from '@/stores/editor.store'

interface Shape {
  id: string
  label: string
  svg: string
}

interface ShapeCategory {
  id: string
  label: string
  shapes: Shape[]
}

// ── Formes basiques ─────────────────────────────────────────────────────────

const BASIC_SHAPES: Shape[] = [
  {
    id: 'circle',
    label: 'Cercle',
    svg: '<svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="47" fill="#6366f1"/></svg>',
  },
  {
    id: 'rounded-rect',
    label: 'Rect arrondi',
    svg: '<svg viewBox="0 0 100 70"><rect x="2" y="2" width="96" height="66" rx="16" ry="16" fill="#6366f1"/></svg>',
  },
  {
    id: 'triangle',
    label: 'Triangle',
    svg: '<svg viewBox="0 0 100 100"><polygon points="50,5 97,95 3,95" fill="#6366f1"/></svg>',
  },
  {
    id: 'diamond',
    label: 'Losange',
    svg: '<svg viewBox="0 0 100 100"><polygon points="50,3 97,50 50,97 3,50" fill="#6366f1"/></svg>',
  },
  {
    id: 'pentagon',
    label: 'Pentagone',
    svg: '<svg viewBox="0 0 100 100"><polygon points="50,5 97,40 79,95 21,95 3,40" fill="#6366f1"/></svg>',
  },
  {
    id: 'hexagon',
    label: 'Hexagone',
    svg: '<svg viewBox="0 0 100 100"><polygon points="50,3 93,27 93,73 50,97 7,73 7,27" fill="#6366f1"/></svg>',
  },
  {
    id: 'octagon',
    label: 'Octogone',
    svg: '<svg viewBox="0 0 100 100"><polygon points="30,3 70,3 97,30 97,70 70,97 30,97 3,70 3,30" fill="#6366f1"/></svg>',
  },
  {
    id: 'star',
    label: 'Étoile',
    svg: '<svg viewBox="0 0 100 100"><polygon points="50,5 61,35 95,35 68,57 79,91 50,70 21,91 32,57 5,35 39,35" fill="#6366f1"/></svg>',
  },
  {
    id: 'semicircle',
    label: 'Demi-cercle',
    svg: '<svg viewBox="0 0 100 55"><path d="M3,50 A47,47 0 0,1 97,50 Z" fill="#6366f1"/></svg>',
  },
  {
    id: 'heart',
    label: 'Cœur',
    svg: '<svg viewBox="0 0 100 90"><path d="M50,80 C20,60 0,45 0,28 A25,25 0 0,1 50,20 A25,25 0 0,1 100,28 C100,45 80,60 50,80Z" fill="#6366f1"/></svg>',
  },
  {
    id: 'cross',
    label: 'Croix',
    svg: '<svg viewBox="0 0 100 100"><polygon points="35,0 65,0 65,35 100,35 100,65 65,65 65,100 35,100 35,65 0,65 0,35 35,35" fill="#6366f1"/></svg>',
  },
  {
    id: 'parallelogram',
    label: 'Parallélogramme',
    svg: '<svg viewBox="0 0 100 60"><polygon points="20,0 100,0 80,60 0,60" fill="#6366f1"/></svg>',
  },
]

// ── Étiquettes prix ─────────────────────────────────────────────────────────

const PRICE_SHAPES: Shape[] = [
  {
    id: 'price-tag-rect',
    label: 'Prix rectangle',
    svg: `<svg viewBox="0 0 160 80">
      <rect x="2" y="2" width="156" height="76" rx="8" fill="#FFD700" stroke="#E5C100" stroke-width="2"/>
      <text x="80" y="52" text-anchor="middle" font-size="36" font-weight="bold" fill="#1a1a1a" font-family="Arial">19,99</text>
      <text x="130" y="32" text-anchor="middle" font-size="16" font-weight="bold" fill="#1a1a1a" font-family="Arial">€</text>
    </svg>`,
  },
  {
    id: 'price-tag-round',
    label: 'Prix rond',
    svg: `<svg viewBox="0 0 120 120">
      <circle cx="60" cy="60" r="56" fill="#FFD700" stroke="#E5C100" stroke-width="2"/>
      <text x="60" y="68" text-anchor="middle" font-size="32" font-weight="bold" fill="#1a1a1a" font-family="Arial">9,99</text>
      <text x="95" y="45" text-anchor="middle" font-size="14" font-weight="bold" fill="#1a1a1a" font-family="Arial">€</text>
    </svg>`,
  },
  {
    id: 'price-bubble',
    label: 'Bulle prix',
    svg: `<svg viewBox="0 0 160 100">
      <path d="M10,5 Q5,5 5,10 L5,65 Q5,70 10,70 L50,70 L40,95 L70,70 L150,70 Q155,70 155,65 L155,10 Q155,5 150,5 Z" fill="#FFD700" stroke="#E5C100" stroke-width="2"/>
      <text x="80" y="48" text-anchor="middle" font-size="30" font-weight="bold" fill="#1a1a1a" font-family="Arial">22,99</text>
      <text x="135" y="32" font-size="14" font-weight="bold" fill="#1a1a1a" font-family="Arial">DT</text>
    </svg>`,
  },
  {
    id: 'price-splash',
    label: 'Prix splash',
    svg: `<svg viewBox="0 0 140 140">
      <polygon points="70,2 82,30 108,10 96,40 128,35 106,56 135,65 105,72 128,95 98,84 100,115 78,95 70,128 62,95 40,115 42,84 12,95 35,72 5,65 34,56 12,35 44,40 32,10 58,30" fill="#FF4444" stroke="#CC0000" stroke-width="1.5"/>
      <text x="70" y="72" text-anchor="middle" font-size="26" font-weight="bold" fill="#ffffff" font-family="Arial">-50%</text>
    </svg>`,
  },
  {
    id: 'price-arrow',
    label: 'Prix flèche',
    svg: `<svg viewBox="0 0 180 70">
      <polygon points="0,5 155,5 175,35 155,65 0,65" fill="#FFD700" stroke="#E5C100" stroke-width="2"/>
      <text x="80" y="44" text-anchor="middle" font-size="28" font-weight="bold" fill="#1a1a1a" font-family="Arial">14,99€</text>
    </svg>`,
  },
  {
    id: 'price-ribbon',
    label: 'Ruban prix',
    svg: `<svg viewBox="0 0 200 60">
      <polygon points="15,0 185,0 200,30 185,60 15,60 0,30" fill="#FFD700"/>
      <polygon points="0,30 15,0 15,60" fill="#E5C100"/>
      <polygon points="200,30 185,0 185,60" fill="#E5C100"/>
      <text x="100" y="40" text-anchor="middle" font-size="24" font-weight="bold" fill="#1a1a1a" font-family="Arial">PRIX CHOC</text>
    </svg>`,
  },
]

// ── Badges remise ───────────────────────────────────────────────────────────

const BADGE_SHAPES: Shape[] = [
  {
    id: 'badge-percent-circle',
    label: 'Badge % rond',
    svg: `<svg viewBox="0 0 120 120">
      <circle cx="60" cy="60" r="56" fill="#E53E3E"/>
      <text x="60" y="55" text-anchor="middle" font-size="32" font-weight="bold" fill="#ffffff" font-family="Arial">30%</text>
      <text x="60" y="78" text-anchor="middle" font-size="13" fill="#ffffff" font-family="Arial">d'économie</text>
    </svg>`,
  },
  {
    id: 'badge-percent-burst',
    label: 'Badge % éclat',
    svg: `<svg viewBox="0 0 130 130">
      <polygon points="65,2 76,25 98,12 90,38 118,38 100,55 122,70 97,72 108,98 82,85 75,112 62,88 45,108 42,82 18,90 30,68 5,60 28,47 10,30 38,30 28,8 52,22" fill="#E53E3E"/>
      <text x="65" y="62" text-anchor="middle" font-size="28" font-weight="bold" fill="#ffffff" font-family="Arial">-20%</text>
    </svg>`,
  },
  {
    id: 'badge-offre',
    label: 'OFFRE',
    svg: `<svg viewBox="0 0 120 120">
      <circle cx="60" cy="60" r="56" fill="#2563EB"/>
      <text x="60" y="55" text-anchor="middle" font-size="18" font-weight="bold" fill="#ffffff" font-family="Arial" letter-spacing="3">OFFRE</text>
      <text x="60" y="78" text-anchor="middle" font-size="14" fill="#ffffff" font-family="Arial">SPÉCIALE</text>
    </svg>`,
  },
  {
    id: 'badge-new',
    label: 'Nouveau',
    svg: `<svg viewBox="0 0 120 120">
      <polygon points="60,2 72,28 100,14 92,42 125,45 100,60 120,85 92,78 88,108 65,88 60,120 55,88 32,108 28,78 0,85 20,60 -5,45 28,42 20,14 48,28" fill="#F59E0B"/>
      <text x="60" y="62" text-anchor="middle" font-size="17" font-weight="bold" fill="#1a1a1a" font-family="Arial">NEW</text>
    </svg>`,
  },
  {
    id: 'badge-gratuit',
    label: 'Gratuit',
    svg: `<svg viewBox="0 0 130 70">
      <rect x="2" y="2" width="126" height="66" rx="33" fill="#10B981"/>
      <text x="65" y="44" text-anchor="middle" font-size="22" font-weight="bold" fill="#ffffff" font-family="Arial">GRATUIT</text>
    </svg>`,
  },
  {
    id: 'badge-promo',
    label: 'PROMO',
    svg: `<svg viewBox="0 0 130 50">
      <rect x="2" y="2" width="126" height="46" rx="6" fill="#E53E3E"/>
      <text x="65" y="34" text-anchor="middle" font-size="24" font-weight="bold" fill="#ffffff" font-family="Arial" letter-spacing="4">PROMO</text>
    </svg>`,
  },
  {
    id: 'badge-best',
    label: 'Meilleur prix',
    svg: `<svg viewBox="0 0 130 130">
      <path d="M65,2 L78,45 L122,45 L86,70 L100,115 L65,88 L30,115 L44,70 L8,45 L52,45 Z" fill="#F59E0B" stroke="#D97706" stroke-width="1.5"/>
      <text x="65" y="68" text-anchor="middle" font-size="12" font-weight="bold" fill="#1a1a1a" font-family="Arial">MEILLEUR</text>
      <text x="65" y="84" text-anchor="middle" font-size="14" font-weight="bold" fill="#1a1a1a" font-family="Arial">PRIX</text>
    </svg>`,
  },
  {
    id: 'badge-speech-red',
    label: 'Bulle remise',
    svg: `<svg viewBox="0 0 140 110">
      <path d="M70,5 C110,5 135,25 135,50 C135,75 110,95 70,95 C55,95 42,92 32,87 L10,105 L20,82 C10,74 5,63 5,50 C5,25 30,5 70,5 Z" fill="#E53E3E"/>
      <text x="70" y="50" text-anchor="middle" font-size="28" font-weight="bold" fill="#ffffff" font-family="Arial">-30%</text>
      <text x="70" y="72" text-anchor="middle" font-size="12" fill="#ffffff" font-family="Arial">d'économie</text>
    </svg>`,
  },
]

// ── Bannières & rubans ──────────────────────────────────────────────────────

const BANNER_SHAPES: Shape[] = [
  {
    id: 'banner-horizontal',
    label: 'Bannière H',
    svg: `<svg viewBox="0 0 220 50">
      <rect x="0" y="0" width="220" height="50" fill="#2563EB"/>
      <text x="110" y="34" text-anchor="middle" font-size="20" font-weight="bold" fill="#ffffff" font-family="Arial" letter-spacing="2">OFFRE SPÉCIALE</text>
    </svg>`,
  },
  {
    id: 'banner-vertical',
    label: 'Bannière V',
    svg: `<svg viewBox="0 0 50 180">
      <rect x="0" y="0" width="50" height="180" fill="#2563EB"/>
      <text x="25" y="100" text-anchor="middle" font-size="18" font-weight="bold" fill="#ffffff" font-family="Arial" letter-spacing="4" transform="rotate(-90,25,100)">OFFRE</text>
    </svg>`,
  },
  {
    id: 'banner-ribbon-fold',
    label: 'Ruban plié',
    svg: `<svg viewBox="0 0 240 70">
      <polygon points="0,10 20,0 20,50 0,60" fill="#1E40AF"/>
      <polygon points="240,10 220,0 220,50 240,60" fill="#1E40AF"/>
      <rect x="12" y="0" width="216" height="50" fill="#2563EB"/>
      <polygon points="12,50 12,70 30,50" fill="#1E3A8A"/>
      <polygon points="228,50 228,70 210,50" fill="#1E3A8A"/>
    </svg>`,
  },
  {
    id: 'banner-corner',
    label: 'Coin bannière',
    svg: `<svg viewBox="0 0 120 120">
      <polygon points="0,0 120,0 0,120" fill="#E53E3E"/>
      <text x="30" y="40" text-anchor="middle" font-size="13" font-weight="bold" fill="#ffffff" font-family="Arial" transform="rotate(-45,35,35)">PROMO</text>
    </svg>`,
  },
  {
    id: 'banner-wave',
    label: 'Bannière vague',
    svg: `<svg viewBox="0 0 220 60">
      <path d="M0,10 Q55,0 110,10 Q165,20 220,10 L220,50 Q165,60 110,50 Q55,40 0,50 Z" fill="#2563EB"/>
    </svg>`,
  },
  {
    id: 'banner-flag',
    label: 'Drapeau',
    svg: `<svg viewBox="0 0 160 70">
      <polygon points="0,0 140,0 160,35 140,70 0,70" fill="#E53E3E"/>
      <rect x="0" y="0" width="6" height="70" fill="#B91C1C"/>
    </svg>`,
  },
  {
    id: 'banner-diagonal',
    label: 'Bande diagonale',
    svg: `<svg viewBox="0 0 200 200">
      <polygon points="120,0 200,0 200,80 80,200 0,200 0,120" fill="#E53E3E" opacity="0.9"/>
    </svg>`,
  },
  {
    id: 'banner-tab',
    label: 'Onglet',
    svg: `<svg viewBox="0 0 140 50">
      <path d="M0,0 L120,0 L140,25 L120,50 L0,50 Z" fill="#2563EB"/>
    </svg>`,
  },
]

// ── Cadres & encadrements ───────────────────────────────────────────────────

const FRAME_SHAPES: Shape[] = [
  {
    id: 'frame-rounded',
    label: 'Cadre arrondi',
    svg: `<svg viewBox="0 0 200 260">
      <rect x="4" y="4" width="192" height="252" rx="20" ry="20" fill="none" stroke="#1E3A8A" stroke-width="8"/>
    </svg>`,
  },
  {
    id: 'frame-double',
    label: 'Double cadre',
    svg: `<svg viewBox="0 0 200 260">
      <rect x="2" y="2" width="196" height="256" rx="16" fill="none" stroke="#1E3A8A" stroke-width="4"/>
      <rect x="10" y="10" width="180" height="240" rx="12" fill="none" stroke="#1E3A8A" stroke-width="2"/>
    </svg>`,
  },
  {
    id: 'frame-shadow',
    label: 'Cadre ombré',
    svg: `<svg viewBox="0 0 210 270">
      <rect x="10" y="10" width="196" height="256" rx="16" fill="#00000020"/>
      <rect x="4" y="4" width="196" height="256" rx="16" fill="#ffffff" stroke="#1E3A8A" stroke-width="4"/>
    </svg>`,
  },
  {
    id: 'frame-product',
    label: 'Cadre produit',
    svg: `<svg viewBox="0 0 200 280">
      <rect x="4" y="4" width="192" height="272" rx="18" fill="#ffffff" stroke="#1E3A8A" stroke-width="6"/>
      <rect x="4" y="200" width="192" height="76" rx="0" fill="#F3F4F6"/>
      <path d="M4,200 L196,200" stroke="#E5E7EB" stroke-width="1"/>
    </svg>`,
  },
  {
    id: 'frame-circle',
    label: 'Cadre cercle',
    svg: `<svg viewBox="0 0 160 160">
      <circle cx="80" cy="80" r="74" fill="none" stroke="#1E3A8A" stroke-width="6"/>
    </svg>`,
  },
  {
    id: 'frame-ticket',
    label: 'Ticket',
    svg: `<svg viewBox="0 0 200 100">
      <path d="M16,2 L184,2 Q198,2 198,16 L198,34 Q185,34 185,50 Q185,66 198,66 L198,84 Q198,98 184,98 L16,98 Q2,98 2,84 L2,66 Q15,66 15,50 Q15,34 2,34 L2,16 Q2,2 16,2 Z" fill="#ffffff" stroke="#D1D5DB" stroke-width="2" stroke-dasharray="4,4"/>
    </svg>`,
  },
]

// ── Formes décoratives / splash ─────────────────────────────────────────────

const DECO_SHAPES: Shape[] = [
  {
    id: 'splash-star',
    label: 'Éclat 12pts',
    svg: `<svg viewBox="0 0 120 120">
      <polygon points="60,2 68,30 90,8 82,36 112,28 96,52 120,60 96,68 112,92 82,84 90,112 68,90 60,118 52,90 30,112 38,84 8,92 24,68 0,60 24,52 8,28 38,36 30,8 52,30" fill="#F59E0B"/>
    </svg>`,
  },
  {
    id: 'splash-ink',
    label: 'Tache',
    svg: `<svg viewBox="0 0 140 120">
      <path d="M70,5 Q95,2 110,20 Q130,38 125,60 Q122,80 100,95 Q85,105 65,100 Q40,108 25,90 Q8,75 10,55 Q5,35 25,20 Q42,8 70,5 Z" fill="#6366f1"/>
    </svg>`,
  },
  {
    id: 'splash-burst-16',
    label: 'Burst 16pts',
    svg: `<svg viewBox="0 0 120 120">
      <polygon points="60,0 66,22 78,4 72,26 92,14 80,34 102,28 86,42 110,44 90,52 112,60 90,68 110,76 86,78 102,92 80,86 92,106 72,94 78,116 66,98 60,120 54,98 42,116 48,94 28,106 40,86 18,92 34,78 10,76 30,68 8,60 30,52 10,44 34,42 18,28 40,34 28,14 48,26 42,4 54,22" fill="#E53E3E"/>
    </svg>`,
  },
  {
    id: 'arrow-curved',
    label: 'Flèche courbe',
    svg: `<svg viewBox="0 0 120 80">
      <path d="M10,60 Q10,20 60,20 L60,5 L115,40 L60,75 L60,60 Q30,60 30,60 Z" fill="#6366f1"/>
    </svg>`,
  },
  {
    id: 'lightning-bolt',
    label: 'Éclair',
    svg: '<svg viewBox="0 0 60 100"><polygon points="35,0 10,48 28,48 20,100 50,45 32,45 55,0" fill="#F59E0B"/></svg>',
  },
  {
    id: 'ribbon-bookmark',
    label: 'Signet',
    svg: `<svg viewBox="0 0 60 120">
      <polygon points="0,0 60,0 60,110 30,90 0,110" fill="#E53E3E"/>
    </svg>`,
  },
  {
    id: 'circle-ring',
    label: 'Anneau',
    svg: `<svg viewBox="0 0 120 120">
      <circle cx="60" cy="60" r="54" fill="none" stroke="#6366f1" stroke-width="10"/>
    </svg>`,
  },
  {
    id: 'wave-divider',
    label: 'Séparateur vague',
    svg: `<svg viewBox="0 0 200 40">
      <path d="M0,20 Q25,0 50,20 Q75,40 100,20 Q125,0 150,20 Q175,40 200,20 L200,40 L0,40 Z" fill="#6366f1"/>
    </svg>`,
  },
]

// ── Catégories ──────────────────────────────────────────────────────────────

const CATEGORIES: ShapeCategory[] = [
  { id: 'basic', label: 'Basiques', shapes: BASIC_SHAPES },
  { id: 'price', label: 'Prix', shapes: PRICE_SHAPES },
  { id: 'badge', label: 'Badges', shapes: BADGE_SHAPES },
  { id: 'banner', label: 'Bannières', shapes: BANNER_SHAPES },
  { id: 'frame', label: 'Cadres', shapes: FRAME_SHAPES },
  { id: 'deco', label: 'Déco', shapes: DECO_SHAPES },
]

// ── Ajout au canvas ─────────────────────────────────────────────────────────

async function addShapeToCanvas(shape: Shape) {
  const canvas = globalFabricCanvas
  if (!canvas) return

  const id = `shape_${Date.now()}`
  const vt = canvas.viewportTransform ?? [1, 0, 0, 1, 0, 0]
  const zoom = canvas.getZoom()
  const docX = (canvas.getWidth() / 2 - vt[4]) / zoom
  const docY = (canvas.getHeight() / 2 - vt[5]) / zoom

  try {
    const { objects } = await loadSVGFromString(shape.svg)
    const nonNull = objects.filter(Boolean) as FabricObject[]
    if (nonNull.length === 0) return

    const obj: FabricObject =
      nonNull.length === 1 ? nonNull[0] : new Group(nonNull)

    const targetSize = 160
    const w = obj.width ?? 100
    const h = obj.height ?? 100
    const scale = Math.min(targetSize / w, targetSize / h)

    obj.set({
      left: docX - (w * scale) / 2,
      top: docY - (h * scale) / 2,
      scaleX: scale,
      scaleY: scale,
      data: { id, type: 'path', name: shape.label },
    })

    canvas.add(obj)
    canvas.setActiveObject(obj)
    canvas.requestRenderAll()
    syncToStore(canvas)
    useEditorStore.getState().setSelectedObjectId(id)
    obj.on('modified', () => syncToStore(canvas))
    obj.on('moving', () => syncToStore(canvas))
    obj.on('scaling', () => syncToStore(canvas))
    obj.on('rotating', () => syncToStore(canvas))
  } catch (err) {
    console.error('Error loading SVG shape:', err)
  }
}

// ── Composant ───────────────────────────────────────────────────────────────

export function ShapesPanel() {
  const [activeCategory, setActiveCategory] = useState('basic')

  const category = CATEGORIES.find((c) => c.id === activeCategory) ?? CATEGORIES[0]

  return (
    <div className="p-3 flex flex-col gap-3">
      {/* Category tabs */}
      <div className="flex flex-wrap gap-1">
        {CATEGORIES.map((cat) => (
          <button
            key={cat.id}
            onClick={() => setActiveCategory(cat.id)}
            className={`px-2.5 py-1 rounded-md text-[10px] font-medium transition-all ${
              activeCategory === cat.id
                ? 'bg-indigo-500/20 text-indigo-400 border border-indigo-500/30'
                : 'bg-white/5 text-white/40 border border-transparent hover:bg-white/10 hover:text-white/60'
            }`}
          >
            {cat.label}
          </button>
        ))}
      </div>

      {/* Shapes grid */}
      <div className="grid grid-cols-3 gap-1.5">
        {category.shapes.map((shape) => (
          <button
            key={shape.id}
            onClick={() => addShapeToCanvas(shape)}
            title={shape.label}
            className="flex flex-col items-center gap-1 p-2 bg-white/5 hover:bg-white/10 border border-white/10 hover:border-indigo-500/50 rounded-lg transition-all group aspect-square"
          >
            <div
              className="flex-1 w-full flex items-center justify-center [&>svg]:w-full [&>svg]:h-full [&>svg]:max-w-[48px] [&>svg]:max-h-[48px]"
              dangerouslySetInnerHTML={{ __html: shape.svg }}
            />
            <span className="text-[8px] text-white/30 group-hover:text-white/60 transition-colors leading-none truncate w-full text-center">
              {shape.label}
            </span>
          </button>
        ))}
      </div>

      <p className="text-[9px] text-white/20 text-center">
        {category.shapes.length} formes · Cliquer pour ajouter
      </p>
    </div>
  )
}
