import { create } from 'zustand'
import type { Project, Product, Source } from '@/features/pim/types'

interface PimState {
  /** Liste des projets de l'utilisateur (chargée à la connexion). */
  projects: Project[]
  /** Projet actuellement ouvert (null si vue dashboard). */
  currentProjectId: string | null
  /** Produits master du projet courant, paginés. */
  products: Product[]
  /** Sources sélectionnées dans la col 2 ; vide = vue globale projet. */
  selectedSourceIds: string[]
  /** Filtre taxonomique multi-niveaux (chemin sélectionné). */
  taxonomyNavFilter: string[]
  /** Recherche dans la table principale. */
  searchQuery: string
  /** Produit ouvert dans la fiche (sheet). */
  openProductId: string | null

  // Actions projets
  setProjects: (p: Project[]) => void
  setCurrentProjectId: (id: string | null) => void
  upsertProject: (project: Project) => void
  removeProject: (id: string) => void

  // Actions produits
  setProducts: (p: Product[]) => void
  upsertProducts: (products: Product[]) => void
  removeProduct: (id: string) => void

  // Actions sources
  upsertSource: (projectId: string, source: Source) => void
  removeSource: (projectId: string, sourceId: string) => void

  // Sélection / filtres
  setSelectedSourceIds: (ids: string[]) => void
  toggleSelectedSource: (id: string) => void
  setTaxonomyNavFilter: (path: string[]) => void
  setSearchQuery: (q: string) => void
  setOpenProductId: (id: string | null) => void
}

export const usePimStore = create<PimState>((set) => ({
  projects: [],
  currentProjectId: null,
  products: [],
  selectedSourceIds: [],
  taxonomyNavFilter: [],
  searchQuery: '',
  openProductId: null,

  setProjects: (projects) => set({ projects }),
  setCurrentProjectId: (currentProjectId) =>
    set({ currentProjectId, selectedSourceIds: [], taxonomyNavFilter: [], openProductId: null }),
  upsertProject: (project) =>
    set((s) => {
      const idx = s.projects.findIndex((p) => p.id === project.id)
      const projects = idx >= 0
        ? s.projects.map((p, i) => (i === idx ? project : p))
        : [...s.projects, project]
      return { projects }
    }),
  removeProject: (id) => set((s) => ({ projects: s.projects.filter((p) => p.id !== id) })),

  setProducts: (products) => set({ products }),
  upsertProducts: (incoming) =>
    set((s) => {
      const map = new Map(s.products.map((p) => [p._id, p]))
      for (const p of incoming) map.set(p._id, p)
      return { products: Array.from(map.values()) }
    }),
  removeProduct: (id) =>
    set((s) => ({ products: s.products.filter((p) => p._id !== id) })),

  upsertSource: (projectId, source) =>
    set((s) => ({
      projects: s.projects.map((p) => {
        if (p.id !== projectId) return p
        const idx = p.sources.findIndex((src) => src.id === source.id)
        const sources = idx >= 0
          ? p.sources.map((src, i) => (i === idx ? source : src))
          : [...p.sources, source]
        return { ...p, sources }
      }),
    })),
  removeSource: (projectId, sourceId) =>
    set((s) => ({
      projects: s.projects.map((p) =>
        p.id === projectId ? { ...p, sources: p.sources.filter((src) => src.id !== sourceId) } : p,
      ),
    })),

  setSelectedSourceIds: (selectedSourceIds) => set({ selectedSourceIds, openProductId: null }),
  toggleSelectedSource: (id) =>
    set((s) => ({
      selectedSourceIds: s.selectedSourceIds.includes(id)
        ? s.selectedSourceIds.filter((x) => x !== id)
        : [...s.selectedSourceIds, id],
      openProductId: null,
    })),
  setTaxonomyNavFilter: (taxonomyNavFilter) => set({ taxonomyNavFilter, openProductId: null }),
  setSearchQuery: (searchQuery) => set({ searchQuery }),
  setOpenProductId: (openProductId) => set({ openProductId }),
}))
