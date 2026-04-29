import { create } from 'zustand'
import type { GradientConfig } from './editor.store'

export type CanvasBgType = 'solid' | 'gradient' | 'image'
export type ActiveTool = 'select' | 'text' | 'rect' | 'ellipse' | 'line' | 'image' | 'hand' | 'zoom'
type LeftPanelId = 'elements' | 'text' | 'nanobana' | 'shapes' | 'palette' | 'layers' | 'assets'

interface UIState {
  rightPanelOpen: boolean
  activeLeftPanel: LeftPanelId | null
  toggleLeftPanel: (id: LeftPanelId) => void
  settingsOpen: boolean
  zoom: number
  gridVisible: boolean
  snapEnabled: boolean
  canvasWidth: number
  canvasHeight: number
  canvasBg: string
  canvasBgType: CanvasBgType
  canvasBgGradient: GradientConfig
  canvasBgImage: string | null
  // --- Print ---
  dpi: number
  bleedMm: number
  safeAreaMm: number
  cropMarkLengthMm: number
  cropMarkOffsetMm: number
  showPrintMarks: boolean
  showSafeArea: boolean
  showRegistrationMarks: boolean
  setDpi: (dpi: number) => void
  setBleedMm: (mm: number) => void
  setSafeAreaMm: (mm: number) => void
  setCropMarkLengthMm: (mm: number) => void
  setCropMarkOffsetMm: (mm: number) => void
  setShowPrintMarks: (v: boolean) => void
  setShowSafeArea: (v: boolean) => void
  setShowRegistrationMarks: (v: boolean) => void
  setRightPanelOpen: (open: boolean) => void
  setSettingsOpen: (open: boolean) => void
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
  damPickerOpen: boolean
  setDamPickerOpen: (open: boolean) => void
  damPickerMode: 'insert' | 'replace' | 'fill'
  damPickerTargetId: string | null
  openDamPickerForReplace: (targetId: string) => void
  openDamPickerForFill: (targetId: string) => void
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
  setZoom: (zoom) => set({ zoom: Math.min(400, Math.max(10, zoom)) }),
  setGridVisible: (gridVisible) => set({ gridVisible }),
  setSnapEnabled: (snapEnabled) => set({ snapEnabled }),
  setCanvasSize: (w, h, bg) =>
    set((s) => ({ canvasWidth: w, canvasHeight: h, canvasBg: bg ?? s.canvasBg })),
  setCanvasBgType: (canvasBgType) => set({ canvasBgType }),
  setCanvasBgGradient: (canvasBgGradient) => set({ canvasBgGradient }),
  setCanvasBgImage: (canvasBgImage) => set({ canvasBgImage }),

  // --- Print defaults ---
  dpi: 300,
  bleedMm: 2,
  safeAreaMm: 2,
  cropMarkLengthMm: 3.5,
  cropMarkOffsetMm: 1,
  showPrintMarks: true,
  showSafeArea: true,
  showRegistrationMarks: true,
  setDpi: (dpi) => set({ dpi: Math.max(72, Math.min(600, dpi)) }),
  setBleedMm: (bleedMm) => set({ bleedMm: Math.max(0, Math.min(10, bleedMm)) }),
  setSafeAreaMm: (safeAreaMm) => set({ safeAreaMm: Math.max(0, Math.min(30, safeAreaMm)) }),
  setCropMarkLengthMm: (cropMarkLengthMm) => set({ cropMarkLengthMm: Math.max(2, Math.min(10, cropMarkLengthMm)) }),
  setCropMarkOffsetMm: (cropMarkOffsetMm) => set({ cropMarkOffsetMm: Math.max(0, Math.min(10, cropMarkOffsetMm)) }),
  setShowPrintMarks: (showPrintMarks) => set({ showPrintMarks }),
  setShowSafeArea: (showSafeArea) => set({ showSafeArea }),
  setShowRegistrationMarks: (showRegistrationMarks) => set({ showRegistrationMarks }),

  activeTool: 'select',
  setActiveTool: (tool) => set({ activeTool: tool }),
  rightPanels: [
    { id: 'page',    collapsed: false },
    { id: 'print',   collapsed: true },
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

  damPickerOpen: false,
  setDamPickerOpen: (damPickerOpen) =>
    damPickerOpen
      ? set({ damPickerOpen })
      : set({ damPickerOpen, damPickerMode: 'insert', damPickerTargetId: null }),
  damPickerMode: 'insert',
  damPickerTargetId: null,
  openDamPickerForReplace: (targetId) =>
    set({ damPickerOpen: true, damPickerMode: 'replace', damPickerTargetId: targetId }),
  openDamPickerForFill: (targetId) =>
    set({ damPickerOpen: true, damPickerMode: 'fill', damPickerTargetId: targetId }),

}))
