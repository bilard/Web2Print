import { useEffect, useMemo, useState } from 'react'
import { ArrowLeft, ImageIcon, Type, Loader2, RefreshCw } from 'lucide-react'
import { doc, getDoc } from 'firebase/firestore'
import { db } from '@/lib/firebase/config'
import { useDamStore } from '@/stores/dam.store'
import { useProjectAssets, parseFontName, type AssetItem } from '@/features/assets/useProjectAssets'
import type { DamImage } from '../types'
import type { ProjectData } from '@/types/project'

/** Load an image and return its natural dimensions. */
function loadImageDimensions(url: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => resolve({ width: img.naturalWidth || 0, height: img.naturalHeight || 0 })
    img.onerror = () => resolve({ width: 0, height: 0 })
    img.src = url
  })
}

/** Stable id from a storage full path. */
function assetIdFromPath(path: string): string {
  return `proj_${path.replace(/[/.]/g, '_')}`
}

/** Build a DamImage-compatible object from a project storage asset. */
async function buildDamImageFromAsset(asset: AssetItem): Promise<DamImage> {
  const { width, height } = await loadImageDimensions(asset.url)
  const orientation: DamImage['orientation'] =
    width === height ? 'square' : width > height ? 'landscape' : 'portrait'
  return {
    id: assetIdFromPath(asset.fullPath),
    sourceProvider: 'project',
    sourceId: asset.fullPath,
    sourceUrl: asset.url,
    thumbnailUrl: asset.url,
    previewUrl: asset.url,
    fullUrl: asset.url,
    width: width || 1,
    height: height || 1,
    photographer: '',
    photographerUrl: '',
    description: asset.name,
    tags: [],
    color: '#111111',
    orientation,
  }
}

function useProjectMeta(projectId: string | null) {
  const [project, setProject] = useState<ProjectData | null>(null)

  useEffect(() => {
    if (!projectId) {
      setProject(null)
      return
    }
    let cancelled = false
    ;(async () => {
      try {
        const snap = await getDoc(doc(db, 'projects', projectId))
        if (!cancelled && snap.exists()) {
          setProject({ ...snap.data(), id: snap.id } as ProjectData)
        }
      } catch (err) {
        console.warn('[DamProjectAssets] fetch project meta failed:', err)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [projectId])

  return project
}

export function DamProjectAssets() {
  const selectedProjectId = useDamStore((s) => s.selectedProjectId)
  const setSelectedProjectId = useDamStore((s) => s.setSelectedProjectId)
  const openLightbox = useDamStore((s) => s.openLightbox)

  const project = useProjectMeta(selectedProjectId)
  const { images, fonts, loading, reload } = useProjectAssets(selectedProjectId)
  const [tab, setTab] = useState<'images' | 'fonts'>('images')

  const title = useMemo(
    () => project?.title || 'Projet',
    [project]
  )

  const handleImageClick = async (asset: AssetItem) => {
    if (!asset.url) return
    const damImage = await buildDamImageFromAsset(asset)
    openLightbox(damImage)
  }

  if (!selectedProjectId) return null

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Sub-header */}
      <div className="flex items-center gap-3 px-6 py-3 border-b border-white/5">
        <button
          onClick={() => setSelectedProjectId(null)}
          className="p-1 rounded hover:bg-white/10 text-white/50 hover:text-white transition"
          title="Retour aux projets"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <h3 className="text-sm font-medium text-white/80 truncate">{title}</h3>

        {/* Tabs */}
        <div className="flex items-center gap-1 ml-4">
          <button
            onClick={() => setTab('images')}
            className={`flex items-center gap-1.5 text-[11px] px-2.5 py-1.5 rounded-md transition-colors ${
              tab === 'images'
                ? 'bg-indigo-500/20 text-indigo-300'
                : 'text-white/40 hover:text-white/70 hover:bg-white/5'
            }`}
          >
            <ImageIcon className="w-3.5 h-3.5" />
            Images ({images.length})
          </button>
          <button
            onClick={() => setTab('fonts')}
            className={`flex items-center gap-1.5 text-[11px] px-2.5 py-1.5 rounded-md transition-colors ${
              tab === 'fonts'
                ? 'bg-indigo-500/20 text-indigo-300'
                : 'text-white/40 hover:text-white/70 hover:bg-white/5'
            }`}
          >
            <Type className="w-3.5 h-3.5" />
            Fonts ({fonts.length})
          </button>
        </div>

        <div className="flex-1" />
        <button
          onClick={reload}
          disabled={loading}
          className="p-1.5 text-white/30 hover:text-white/70 rounded-md hover:bg-white/5 transition-colors"
          title="Rafraichir"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        {loading && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-5 h-5 animate-spin text-white/20" />
          </div>
        )}

        {!loading && tab === 'images' && (
          images.length === 0 ? (
            <p className="text-sm text-white/30 text-center py-12">Aucune image</p>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
              {images.map((img) => (
                <div
                  key={img.fullPath}
                  className="group relative rounded-lg overflow-hidden bg-white/5 border border-white/5 hover:border-white/15 transition-colors cursor-grab active:cursor-grabbing"
                  draggable={!!img.url}
                  onDragStart={(e) => {
                    if (!img.url) return
                    e.dataTransfer.setData(
                      'application/x-asset-image',
                      JSON.stringify({ url: img.url, name: img.name })
                    )
                    e.dataTransfer.effectAllowed = 'copy'
                  }}
                  onClick={() => handleImageClick(img)}
                >
                  {img.url ? (
                    <img
                      src={img.url}
                      alt={img.name}
                      className="w-full aspect-square object-cover pointer-events-none"
                      loading="lazy"
                    />
                  ) : (
                    <div className="w-full aspect-square flex items-center justify-center">
                      <ImageIcon className="w-6 h-6 text-white/10" />
                    </div>
                  )}
                  <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent px-2 py-1.5">
                    <p className="text-[10px] text-white/70 truncate">{img.name}</p>
                  </div>
                </div>
              ))}
            </div>
          )
        )}

        {!loading && tab === 'fonts' && (
          fonts.length === 0 ? (
            <p className="text-sm text-white/30 text-center py-12">Aucune font</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {fonts.map((f) => {
                const parsed = parseFontName(f.name)
                return (
                  <div
                    key={f.fullPath}
                    className="flex items-center gap-3 px-3 py-3 rounded-lg bg-white/5 border border-white/5 hover:border-white/15 transition cursor-grab active:cursor-grabbing"
                    draggable={!!f.url}
                    onDragStart={(e) => {
                      if (!f.url) return
                      e.dataTransfer.setData(
                        'application/x-asset-font',
                        JSON.stringify({
                          family: parsed.family,
                          weight: parsed.weight,
                          style: parsed.style,
                          url: f.url,
                        })
                      )
                      e.dataTransfer.effectAllowed = 'copy'
                    }}
                    title="Glisser sur un texte du canvas pour appliquer la font"
                  >
                    <span
                      className="text-2xl text-white/60 shrink-0 leading-none"
                      style={{
                        fontFamily: `"${parsed.family}", sans-serif`,
                        fontWeight: parsed.weight,
                        fontStyle: parsed.style !== 'normal' ? parsed.style : undefined,
                      }}
                    >
                      Ag
                    </span>
                    <div className="min-w-0 flex-1">
                      <p
                        className="text-sm text-white/80 truncate"
                        style={{
                          fontFamily: `"${parsed.family}", sans-serif`,
                          fontWeight: parsed.weight,
                          fontStyle: parsed.style !== 'normal' ? parsed.style : undefined,
                        }}
                      >
                        {parsed.family}
                      </p>
                      <p className="text-[10px] text-white/40">
                        {parsed.weight} {parsed.style !== 'normal' ? parsed.style : ''}
                      </p>
                    </div>
                  </div>
                )
              })}
            </div>
          )
        )}
      </div>
    </div>
  )
}
