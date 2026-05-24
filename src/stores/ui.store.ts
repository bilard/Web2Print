import { create } from 'zustand'
import type { GradientConfig } from './editor.store'
import { DEFAULT_RELIEF, type ReliefConfig } from '@/features/animation3d/types'

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
  // --- Print : repères et fonds perdus (vocabulaire InDesign) ---
  dpi: number
  bleedMm: number
  safeAreaMm: number
  cropMarkLengthMm: number
  cropMarkOffsetMm: number
  showPrintMarks: boolean
  showSafeArea: boolean
  showRegistrationMarks: boolean
  // Traits de coupe
  cropStroke: number
  cropColor: string
  // Repères de fond perdu (rectangle bleed)
  bleedStroke: number
  bleedColor: string
  // Repères de montage (hirondelles)
  regRadiusMm: number
  regStroke: number
  regColor: string
  regOffsetMm: number   // décalage additionnel depuis la position auto (mm)
  // Zone de sécurité
  safeStroke: number
  safeColor: string
  safeDash: number   // longueur d'un tiret (px)
  safeGap: number    // espacement entre tirets (px)
  setDpi: (dpi: number) => void
  setBleedMm: (mm: number) => void
  setSafeAreaMm: (mm: number) => void
  setCropMarkLengthMm: (mm: number) => void
  setCropMarkOffsetMm: (mm: number) => void
  setShowPrintMarks: (v: boolean) => void
  setShowSafeArea: (v: boolean) => void
  setShowRegistrationMarks: (v: boolean) => void
  setCropStroke: (v: number) => void
  setCropColor: (v: string) => void
  setBleedStroke: (v: number) => void
  setBleedColor: (v: string) => void
  setRegRadiusMm: (v: number) => void
  setRegStroke: (v: number) => void
  setRegColor: (v: string) => void
  setRegOffsetMm: (v: number) => void
  setSafeStroke: (v: number) => void
  setSafeColor: (v: string) => void
  setSafeDash: (v: number) => void
  setSafeGap: (v: number) => void
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
  // 3D animation overlay
  particlesOverlayActive: boolean
  setParticlesOverlayActive: (active: boolean) => void
  flip3DActive: boolean
  flip3DConfig: { duration: number; loop: boolean; intensity: number }
  setFlip3D: (active: boolean, config?: { duration: number; loop: boolean; intensity: number }) => void
  // Relief 3D (Three.js extruded mesh + manual lighting)
  relief3DActive: boolean
  relief3DConfig: ReliefConfig
  setRelief3D: (active: boolean, config?: ReliefConfig) => void
  updateRelief3DConfig: (patch: Partial<ReliefConfig>) => void
  updateReliefLighting: (patch: Partial<ReliefConfig['lighting']>) => void
  autoPlayAnimations: boolean
  setAutoPlayAnimations: (v: boolean) => void
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
  setZoom: (zoom) => set({ zoom: Math.min(2000, Math.max(1, zoom)) }),
  setGridVisible: (gridVisible) => set({ gridVisible }),
  setSnapEnabled: (snapEnabled) => set({ snapEnabled }),
  setCanvasSize: (w, h, bg) =>
    set((s) => ({ canvasWidth: w, canvasHeight: h, canvasBg: bg ?? s.canvasBg })),
  setCanvasBgType: (canvasBgType) => set({ canvasBgType }),
  setCanvasBgGradient: (canvasBgGradient) => set({ canvasBgGradient }),
  setCanvasBgImage: (canvasBgImage) => set({ canvasBgImage }),

  // --- Print defaults (vocabulaire InDesign : repères et fonds perdus) ---
  dpi: 300,
  bleedMm: 2,
  safeAreaMm: 2,
  cropMarkLengthMm: 3.5,
  cropMarkOffsetMm: 1,
  showPrintMarks: true,
  showSafeArea: true,
  showRegistrationMarks: true,
  // Épaisseurs/couleurs par défaut alignées sur le rendu actuel.
  cropStroke: 1,
  cropColor: '#ffffff',
  bleedStroke: 1,
  bleedColor: '#ffffff',
  regRadiusMm: 2.5,
  regStroke: 1,
  regColor: '#ffffff',
  regOffsetMm: 0,
  safeStroke: 0.6,
  safeColor: '#ef4444',
  safeDash: 4,
  safeGap: 3,
  setDpi: (dpi) => set({ dpi: Math.max(72, Math.min(600, dpi)) }),
  setBleedMm: (bleedMm) => set({ bleedMm: Math.max(0, Math.min(10, bleedMm)) }),
  setSafeAreaMm: (safeAreaMm) => set({ safeAreaMm: Math.max(0, Math.min(30, safeAreaMm)) }),
  setCropMarkLengthMm: (cropMarkLengthMm) => set({ cropMarkLengthMm: Math.max(2, Math.min(10, cropMarkLengthMm)) }),
  setCropMarkOffsetMm: (cropMarkOffsetMm) => set({ cropMarkOffsetMm: Math.max(0, Math.min(3, cropMarkOffsetMm)) }),
  setShowPrintMarks: (showPrintMarks) => set({ showPrintMarks }),
  setShowSafeArea: (showSafeArea) => set({ showSafeArea }),
  setShowRegistrationMarks: (showRegistrationMarks) => set({ showRegistrationMarks }),
  setCropStroke: (cropStroke) => set({ cropStroke: Math.max(0.25, Math.min(5, cropStroke)) }),
  setCropColor: (cropColor) => set({ cropColor }),
  setBleedStroke: (bleedStroke) => set({ bleedStroke: Math.max(0.25, Math.min(5, bleedStroke)) }),
  setBleedColor: (bleedColor) => set({ bleedColor }),
  setRegRadiusMm: (regRadiusMm) => set({ regRadiusMm: Math.max(1, Math.min(8, regRadiusMm)) }),
  setRegStroke: (regStroke) => set({ regStroke: Math.max(0.25, Math.min(5, regStroke)) }),
  setRegColor: (regColor) => set({ regColor }),
  setRegOffsetMm: (regOffsetMm) => set({ regOffsetMm: Math.max(-10, Math.min(30, regOffsetMm)) }),
  setSafeStroke: (safeStroke) => set({ safeStroke: Math.max(0.25, Math.min(5, safeStroke)) }),
  setSafeColor: (safeColor) => set({ safeColor }),
  setSafeDash: (safeDash) => set({ safeDash: Math.max(0.5, Math.min(30, safeDash)) }),
  setSafeGap: (safeGap) => set({ safeGap: Math.max(0.5, Math.min(30, safeGap)) }),

  activeTool: 'select',
  setActiveTool: (tool) => set({ activeTool: tool }),
  rightPanels: [
    { id: 'page',         collapsed: false },
    { id: 'print',        collapsed: true },
    { id: 'data',         collapsed: true },
    { id: 'layers',       collapsed: true },
    { id: 'images',       collapsed: true },
    { id: 'palette',      collapsed: true },
    { id: 'assets',       collapsed: true },
    { id: 'animation3d',  collapsed: true },
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

  // 3D animation overlay
  particlesOverlayActive: false,
  setParticlesOverlayActive: (active) => set({ particlesOverlayActive: active }),
  flip3DActive: false,
  flip3DConfig: { duration: 3, loop: true, intensity: 1 },
  setFlip3D: (active, config) => set((s) => ({
    flip3DActive: active,
    flip3DConfig: config ?? s.flip3DConfig,
  })),
  relief3DActive: false,
  relief3DConfig: DEFAULT_RELIEF,
  setRelief3D: (active, config) => set((s) => ({
    relief3DActive: active,
    relief3DConfig: config ?? s.relief3DConfig,
  })),
  updateRelief3DConfig: (patch) => set((s) => ({
    relief3DConfig: { ...s.relief3DConfig, ...patch },
  })),
  updateReliefLighting: (patch) => set((s) => ({
    relief3DConfig: { ...s.relief3DConfig, lighting: { ...s.relief3DConfig.lighting, ...patch } },
  })),
  autoPlayAnimations: false,
  setAutoPlayAnimations: (v) => set({ autoPlayAnimations: v }),
}))
