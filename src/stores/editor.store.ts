import { create } from 'zustand'

export interface ShadowConfig {
  color: string
  blur: number
  offsetX: number
  offsetY: number
}

export interface GradientStop {
  offset: number  // 0-1
  color: string
}

export interface GradientConfig {
  type: 'linear' | 'radial'
  angle: number
  stops: GradientStop[]
}

export interface CanvasObjectProps {
  id: string
  type: 'rect' | 'ellipse' | 'text' | 'image' | 'path' | 'line' | 'group' | 'polygon' | 'triangle' | 'star' | 'arrow' | 'hexagon' | 'diamond' | 'callout'
  name: string
  visible: boolean
  locked: boolean
  x: number
  y: number
  width: number
  height: number
  fill: string
  stroke: string
  strokeWidth: number
  strokeDashArray?: number[]
  strokeLineCap?: 'butt' | 'round' | 'square'
  strokeLineJoin?: 'miter' | 'round' | 'bevel'
  opacity: number
  angle: number
  flipX: boolean
  flipY: boolean
  cornerRadius?: number
  shadow?: ShadowConfig | null
  // Fill type
  fillType?: 'solid' | 'gradient' | 'image' | 'none'
  gradient?: GradientConfig | null
  fillImage?: string | null
  fillImageName?: string | null
  // Effects
  blendMode?: string
  // Aspect ratio
  lockAspectRatio?: boolean
  // Text props
  fontSize?: number
  fontFamily?: string
  fontWeight?: string
  fontStyle?: string
  textAlign?: string
  text?: string
  underline?: boolean
  linethrough?: boolean
  charSpacing?: number
  lineHeight?: number
  textColor?: string
  textTransform?: 'none' | 'uppercase' | 'lowercase' | 'capitalize'
  // Hiérarchie groupes
  children?: CanvasObjectProps[]
  parentId?: string
  // 3D animation (Animation3DPanel)
  animation3D?: import('@/features/animation3d/types').Animation3DConfig | null
}

interface EditorState {
  projectId: string | null
  projectTitle: string
  titleLoaded: boolean  // true once title has been set from Firestore or navigation
  selectedObjectId: string | null
  selectedObjectIds: string[]
  canvasObjects: CanvasObjectProps[]
  canUndo: boolean
  canRedo: boolean
  saveStatus: 'saved' | 'saving' | 'unsaved' | 'idle'
  assetsVersion: number
  idmlSourceFileName: string | null
  setProjectId: (id: string | null) => void
  setProjectTitle: (title: string) => void
  setTitleLoaded: (v: boolean) => void
  setSelectedObjectId: (id: string | null) => void
  setSelectedObjectIds: (ids: string[]) => void
  setCanvasObjects: (objects: CanvasObjectProps[]) => void
  updateObject: (id: string, props: Partial<CanvasObjectProps>) => void
  setCanUndo: (v: boolean) => void
  setCanRedo: (v: boolean) => void
  setSaveStatus: (status: 'saved' | 'saving' | 'unsaved' | 'idle') => void
  bumpAssetsVersion: () => void
  setIdmlSourceFileName: (name: string | null) => void
}

export const useEditorStore = create<EditorState>((set) => ({
  projectId: null,
  projectTitle: 'Sans titre',
  titleLoaded: false,
  selectedObjectId: null,
  selectedObjectIds: [],
  canvasObjects: [],
  canUndo: false,
  canRedo: false,
  saveStatus: 'idle',
  assetsVersion: 0,
  idmlSourceFileName: null,

  setProjectId: (id) => set({ projectId: id, titleLoaded: false, idmlSourceFileName: null }),
  setProjectTitle: (title) => set({ projectTitle: title, titleLoaded: true }),
  setTitleLoaded: (v) => set({ titleLoaded: v }),
  setSelectedObjectId: (id) => set({ selectedObjectId: id }),
  setSelectedObjectIds: (ids) => set({ selectedObjectIds: ids }),
  setCanvasObjects: (objects) => set({ canvasObjects: objects }),
  updateObject: (id, props) =>
    set((s) => ({
      canvasObjects: s.canvasObjects.map((o) => (o.id === id ? { ...o, ...props } : o)),
    })),
  setCanUndo: (canUndo) => set({ canUndo }),
  setCanRedo: (canRedo) => set({ canRedo }),
  setSaveStatus: (saveStatus) => set({ saveStatus }),
  bumpAssetsVersion: () => set((s) => ({ assetsVersion: s.assetsVersion + 1 })),
  setIdmlSourceFileName: (name) => set({ idmlSourceFileName: name }),
}))
