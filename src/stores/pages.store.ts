import { create } from 'zustand'

interface PageData {
  id: string
  label: string
  canvasJSON: string | null
  thumbnail: string | null
  width: number
  height: number
}

function makeId() {
  return `page_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
}

interface PagesState {
  pages: PageData[]
  currentPageIndex: number
  addPage: (width?: number, height?: number) => void
  deletePage: (id: string) => void
  setCurrentPage: (index: number) => void
  updatePage: (id: string, patch: Partial<PageData>) => void
  reorderPages: (from: number, to: number) => void
  initPages: (pages: PageData[]) => void
}

export const usePagesStore = create<PagesState>((set, get) => ({
  pages: [
    {
      id: makeId(),
      label: 'Page 1',
      canvasJSON: null,
      thumbnail: null,
      width: 1200,
      height: 900,
    },
  ],
  currentPageIndex: 0,

  addPage: (width, height) => {
    const { pages } = get()
    const last = pages[pages.length - 1]
    const w = width ?? last?.width ?? 1200
    const h = height ?? last?.height ?? 900
    const page: PageData = {
      id: makeId(),
      label: `Page ${pages.length + 1}`,
      canvasJSON: null,
      thumbnail: null,
      width: w,
      height: h,
    }
    set({ pages: [...pages, page], currentPageIndex: pages.length })
  },

  deletePage: (id) =>
    set((s) => {
      if (s.pages.length <= 1) return s
      const pages = s.pages.filter((p) => p.id !== id)
      const currentPageIndex = Math.min(s.currentPageIndex, pages.length - 1)
      return { pages, currentPageIndex }
    }),

  setCurrentPage: (index) => set({ currentPageIndex: index }),

  updatePage: (id, patch) =>
    set((s) => ({
      pages: s.pages.map((p) => (p.id === id ? { ...p, ...patch } : p)),
    })),

  reorderPages: (from, to) =>
    set((s) => {
      const pages = [...s.pages]
      const [moved] = pages.splice(from, 1)
      pages.splice(to, 0, moved)
      return { pages }
    }),

  initPages: (pages) => set({ pages, currentPageIndex: 0 }),
}))
