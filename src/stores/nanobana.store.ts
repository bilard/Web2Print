import { create } from 'zustand'
import type { GalleryImage, NanoBanaTab } from '@/features/nanobana/types'

interface NanoBanaState {
  tab: NanoBanaTab
  images: GalleryImage[]
  loading: boolean
  uploading: boolean
  generating: boolean
  generationError: string | null
  searchQuery: string
  selectedTag: string | null

  setTab: (tab: NanoBanaTab) => void
  setImages: (images: GalleryImage[]) => void
  addImage: (image: GalleryImage) => void
  removeImage: (id: string) => void
  setLoading: (v: boolean) => void
  setUploading: (v: boolean) => void
  setGenerating: (v: boolean) => void
  setGenerationError: (e: string | null) => void
  setSearchQuery: (q: string) => void
  setSelectedTag: (tag: string | null) => void
}

export const useNanoBanaStore = create<NanoBanaState>((set) => ({
  tab: 'gallery',
  images: [],
  loading: false,
  uploading: false,
  generating: false,
  generationError: null,
  searchQuery: '',
  selectedTag: null,

  setTab: (tab) => set({ tab }),
  setImages: (images) => set({ images }),
  addImage: (image) => set((s) => ({ images: [image, ...s.images] })),
  removeImage: (id) => set((s) => ({ images: s.images.filter((i) => i.id !== id) })),
  setLoading: (loading) => set({ loading }),
  setUploading: (uploading) => set({ uploading }),
  setGenerating: (generating) => set({ generating }),
  setGenerationError: (generationError) => set({ generationError }),
  setSearchQuery: (searchQuery) => set({ searchQuery }),
  setSelectedTag: (selectedTag) => set({ selectedTag }),
}))
