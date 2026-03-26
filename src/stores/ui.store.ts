import { create } from 'zustand'
import type { GradientConfig } from './editor.store'

export type CanvasBgType = 'solid' | 'gradient' | 'image'
export type ActiveTool = 'select' | 'text' | 'rect' | 'ellipse' | 'line' | 'image' | 'hand' | 'zoom'
export type LeftPanelId = 'elements' | 'text' | 'nanobana' | 'shapes' | 'palette' | 'layers' | 'assets'

interface UIState {
  rightPanelOpen: boolean
  activeLeftPanel: LeftPanelId | null
  toggleLeftPanel: (id: LeftPanelId) => void
  settingsOpen: boolean
  pageSettingsOpen: boolean
  zoom: number
  gridVisible: boolean
  snapEnabled: boolean
  canvasWidth: number
  canvasHeight: number
  canvasBg: string
  canvasBgType: CanvasBgType
  canvasBgGradient: GradientConfig
  canvasBgImage: string | null
  setRightPanelOpen: (open: boolean) => void
  setSettingsOpen: (open: boolean) => void
  setPageSettingsOpen: (open: boolean) => void
  setZoom: (zoom: number) => void
  setGridVisible: (v: boolean) => void
  setSnapEnabled: (v: boolean) => void
  setCanvasSize: (w: number, h: number, bg?: string) => void
  setCanvasBgType: (t: CanvasBgType) => void
  setCanvasBgGradient: (g: GradientConfig) => void
  setCanvasBgImage: (url: string | null) => void
  activeTool: ActiveTool
  setActiveTool: (tool: ActiveTool) => void
  rightPanels: { id: string; collapsed: boolean }[]
  setRightPanels: (panels: { id: string; collapsed: boolean }[]) => void
  toggleRightPanel: (id: string) => void
}

const DEFAULT_BG_GRADIENT: GradientConfig = {
  type: 'linear',
  angle: 180,
  stops: [
    { offset: 0, color: '#6366f1' },
    { offset: 1, color: '#ec4899' },
  ],
}

export const useUIStore = create<UIState>((set, get) => ({
  rightPanelOpen: true,
  activeLeftPanel: 'elements',
  toggleLeftPanel: (id) =>
    set((s) => ({ activeLeftPanel: s.activeLeftPanel === id ? null : id })),
  settingsOpen: false,
  pageSettingsOpen: false,
  zoom: 100,
  gridVisible: false,
  snapEnabled: false,
  canvasWidth: 1200,
  canvasHeight: 900,
  canvasBg: '#ffffff',
  canvasBgType: 'solid',
  canvasBgGradient: DEFAULT_BG_GRADIENT,
  canvasBgImage: null,

  setRightPanelOpen: (open) => set({ rightPanelOpen: open }),
  setSettingsOpen: (open) => set({ settingsOpen: open }),
  setPageSettingsOpen: (open) => set({ pageSettingsOpen: open }),
  setZoom: (zoom) => set({ zoom: Math.min(400, Math.max(10, zoom)) }),
  setGridVisible: (gridVisible) => set({ gridVisible }),
  setSnapEnabled: (snapEnabled) => set({ snapEnabled }),
  setCanvasSize: (w, h, bg) =>
    set((s) => ({ canvasWidth: w, canvasHeight: h, canvasBg: bg ?? s.canvasBg })),
  setCanvasBgType: (canvasBgType) => set({ canvasBgType }),
  setCanvasBgGradient: (canvasBgGradient) => set({ canvasBgGradient }),
  setCanvasBgImage: (canvasBgImage) => set({ canvasBgImage }),

  activeTool: 'select',
  setActiveTool: (tool) => set({ activeTool: tool }),
  rightPanels: [
    { id: 'data',    collapsed: true },
    { id: 'layers',  collapsed: true },
    { id: 'images',  collapsed: true },
    { id: 'palette', collapsed: true },
    { id: 'assets',  collapsed: true },
  ],
  setRightPanels: (panels) => set({ rightPanels: panels }),
  toggleRightPanel: (id) =>
    set((s) => ({
      rightPanels: s.rightPanels.map((p) =>
        p.id === id ? { ...p, collapsed: !p.collapsed } : p
      ),
    })),
}))
