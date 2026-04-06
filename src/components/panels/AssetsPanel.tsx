import { useEffect, useState } from 'react'
import { ref, listAll, getDownloadURL } from 'firebase/storage'
import { storage } from '@/lib/firebase/config'
import { useEditorStore } from '@/stores/editor.store'
import { ImageIcon, Type, Loader2, RefreshCw, X } from 'lucide-react'

interface AssetItem {
  name: string
  url: string
  fullPath: string
}

function useProjectAssets() {
  const projectId = useEditorStore((s) => s.projectId)
  const assetsVersion = useEditorStore((s) => s.assetsVersion)
  const [images, setImages] = useState<AssetItem[]>([])
  const [fonts, setFonts] = useState<AssetItem[]>([])
  const [loading, setLoading] = useState(false)

  const load = async () => {
    if (!projectId) return
    setLoading(true)
    try {
      const [imgResult, fontResult] = await Promise.allSettled([
        listAll(ref(storage, `projects/${projectId}/links`)),
        listAll(ref(storage, `projects/${projectId}/fonts`)),
      ])

      // Images
      if (imgResult.status === 'fulfilled') {
        const items = await Promise.all(
          imgResult.value.items.map(async (item) => {
            try {
              const url = await getDownloadURL(item)
              return { name: item.name, url, fullPath: item.fullPath }
            } catch {
              return { name: item.name, url: '', fullPath: item.fullPath }
            }
          })
        )
        setImages(items)
      }

      // Fonts
      if (fontResult.status === 'fulfilled') {
        const items = fontResult.value.items.map((item) => ({
          name: item.name,
          url: '',
          fullPath: item.fullPath,
        }))
        setFonts(items)
      }
    } catch (err) {
      console.warn('[Assets] Error loading:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [projectId, assetsVersion]) // eslint-disable-line react-hooks/exhaustive-deps

  return { images, fonts, loading, reload: load }
}

/** Parse font storage name: "Family__weight__style.ext" */
function parseFontName(name: string): { family: string; weight: string; style: string } {
  const base = name.replace(/\.[^.]+$/, '')
  const parts = base.split('__')
  return {
    family: parts[0] || name,
    weight: parts[1] || '400',
    style: parts[2] || 'normal',
  }
}

export function AssetsPanel() {
  const { images, fonts, loading, reload } = useProjectAssets()
  const [tab, setTab] = useState<'images' | 'fonts'>('images')
  const [lightbox, setLightbox] = useState<AssetItem | null>(null)

  return (
    <div className="flex flex-col h-full">
      {/* Tabs + refresh */}
      <div className="flex items-center gap-1 px-3 pt-2 pb-1">
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
      <div className="flex-1 overflow-y-auto px-3 pb-3">
        {loading && (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-5 h-5 animate-spin text-white/20" />
          </div>
        )}

        {!loading && tab === 'images' && (
          images.length === 0 ? (
            <p className="text-xs text-white/20 text-center py-6">Aucune image</p>
          ) : (
            <div className="grid grid-cols-2 gap-2 pt-1">
              {images.map((img) => (
                <div
                  key={img.fullPath}
                  className="group relative rounded-lg overflow-hidden bg-white/5 border border-white/5 hover:border-white/15 transition-colors cursor-grab active:cursor-grabbing"
                  draggable={!!img.url}
                  onDragStart={(e) => {
                    if (!img.url) return
                    e.dataTransfer.setData('application/x-asset-image', JSON.stringify({ url: img.url, name: img.name }))
                    e.dataTransfer.effectAllowed = 'copy'
                  }}
                  onClick={() => img.url && setLightbox(img)}
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
                  <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent px-1.5 py-1">
                    <p className="text-[9px] text-white/70 truncate">{img.name}</p>
                  </div>
                </div>
              ))}
            </div>
          )
        )}

        {!loading && tab === 'fonts' && (
          fonts.length === 0 ? (
            <p className="text-xs text-white/20 text-center py-6">Aucune font</p>
          ) : (
            <div className="flex flex-col gap-1.5 pt-1">
              {fonts.map((f) => {
                const parsed = parseFontName(f.name)
                return (
                  <div key={f.fullPath} className="flex items-center gap-2.5 px-2.5 py-2.5 rounded-lg bg-white/5 border border-white/5">
                    <span
                      className="text-lg text-white/50 shrink-0 leading-none"
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
                        className="text-xs text-white/70 truncate"
                        style={{
                          fontFamily: `"${parsed.family}", sans-serif`,
                          fontWeight: parsed.weight,
                          fontStyle: parsed.style !== 'normal' ? parsed.style : undefined,
                        }}
                      >
                        {parsed.family}
                      </p>
                      <p className="text-[10px] text-white/30">{parsed.weight} {parsed.style !== 'normal' ? parsed.style : ''}</p>
                    </div>
                  </div>
                )
              })}
            </div>
          )
        )}
      </div>

      {/* Lightbox */}
      {lightbox && (
        <div
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-8"
          onClick={() => setLightbox(null)}
        >
          <button
            onClick={() => setLightbox(null)}
            className="absolute top-4 right-4 p-2 text-white/50 hover:text-white bg-black/40 hover:bg-black/60 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
          <div className="relative max-w-full max-h-full" onClick={(e) => e.stopPropagation()}>
            <img
              src={lightbox.url}
              alt={lightbox.name}
              className="max-w-full max-h-[85vh] object-contain rounded-lg shadow-2xl"
            />
            <p className="text-center text-xs text-white/50 mt-3">{lightbox.name}</p>
          </div>
        </div>
      )}
    </div>
  )
}
