import { useEffect, useState, useCallback } from 'react'
import { Plus, Trash2, ArrowLeft, ImageIcon, LayoutGrid, List } from 'lucide-react'
import { doc, getDoc } from 'firebase/firestore'
import { db } from '../../../lib/firebase/config'
import { useDamCollections } from '../hooks/useDamCollections'
import { DamImageCard } from './DamImageCard'
import { DamMasonry } from './DamMasonry'
import type { DamImage } from '../types'
import type { DamCollection } from '../types'

function CollectionCard({
  col,
  onOpen,
  onDelete,
}: {
  col: DamCollection
  onOpen: () => void
  onDelete: () => void
}) {
  const [previews, setPreviews] = useState<string[]>([])

  useEffect(() => {
    const ids = (col.assetIds ?? []).slice(0, 4)
    if (ids.length === 0) return

    const load = async () => {
      const urls: string[] = []
      for (const id of ids) {
        try {
          const snap = await getDoc(doc(db, 'dam_assets', id))
          if (snap.exists()) urls.push(snap.data().thumbnailUrl ?? snap.data().previewUrl)
        } catch { /* skip */ }
      }
      setPreviews(urls)
    }
    load()
  }, [col.assetIds])

  const count = col.assetIds?.length ?? 0

  return (
    <div
      onClick={onOpen}
      className="group relative rounded-lg overflow-hidden cursor-pointer bg-white/5 hover:bg-white/10 transition"
    >
      {/* Preview mosaic */}
      <div className="aspect-[4/3] bg-[#111] relative overflow-hidden">
        {previews.length === 0 ? (
          <div className="w-full h-full flex items-center justify-center">
            <ImageIcon className="w-10 h-10 text-white/10" />
          </div>
        ) : previews.length === 1 ? (
          <img src={previews[0]} alt="" className="w-full h-full object-cover" />
        ) : (
          <div className="grid grid-cols-2 grid-rows-2 w-full h-full gap-px">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="overflow-hidden bg-[#111]">
                {previews[i] ? (
                  <img src={previews[i]} alt="" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full" />
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Info */}
      <div className="p-2.5">
        <div className="text-sm text-white/80 font-medium truncate">{col.name}</div>
        <div className="text-[10px] text-white/40 mt-0.5">
          {count} image{count !== 1 ? 's' : ''}
        </div>
      </div>

      {/* Delete */}
      <button
        onClick={(e) => {
          e.stopPropagation()
          onDelete()
        }}
        className="absolute top-2 right-2 p-1 rounded bg-black/50 opacity-0 group-hover:opacity-100 text-white/40 hover:text-red-400 hover:bg-red-500/20 transition"
      >
        <Trash2 className="w-3.5 h-3.5" />
      </button>
    </div>
  )
}

function CollectionRow({
  col,
  onOpen,
  onDelete,
}: {
  col: DamCollection
  onOpen: () => void
  onDelete: () => void
}) {
  const [previews, setPreviews] = useState<string[]>([])

  useEffect(() => {
    const ids = (col.assetIds ?? []).slice(0, 3)
    if (ids.length === 0) return

    const load = async () => {
      const urls: string[] = []
      for (const id of ids) {
        try {
          const snap = await getDoc(doc(db, 'dam_assets', id))
          if (snap.exists()) urls.push(snap.data().thumbnailUrl ?? snap.data().previewUrl)
        } catch { /* skip */ }
      }
      setPreviews(urls)
    }
    load()
  }, [col.assetIds])

  const count = col.assetIds?.length ?? 0

  return (
    <div
      onClick={onOpen}
      className="group flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer bg-white/5 hover:bg-white/10 transition"
    >
      {/* Mini previews */}
      <div className="flex -space-x-2 shrink-0">
        {previews.length === 0 ? (
          <div className="w-10 h-10 rounded bg-[#111] flex items-center justify-center">
            <ImageIcon className="w-4 h-4 text-white/10" />
          </div>
        ) : (
          previews.map((url, i) => (
            <img
              key={i}
              src={url}
              alt=""
              className="w-10 h-10 rounded object-cover border-2 border-[#1a1a1a]"
            />
          ))
        )}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="text-sm text-white/80 font-medium truncate">{col.name}</div>
        <div className="text-[10px] text-white/40">
          {count} image{count !== 1 ? 's' : ''}
        </div>
      </div>

      {/* Delete */}
      <button
        onClick={(e) => {
          e.stopPropagation()
          onDelete()
        }}
        className="p-1 rounded opacity-0 group-hover:opacity-100 text-white/30 hover:text-red-400 hover:bg-red-500/10 transition shrink-0"
      >
        <Trash2 className="w-3.5 h-3.5" />
      </button>
    </div>
  )
}

export function DamCollections() {
  const { collections, loading, createCollection, deleteCollection } = useDamCollections()
  const [newName, setNewName] = useState('')
  const [creating, setCreating] = useState(false)
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [colImages, setColImages] = useState<DamImage[]>([])
  const [loadingImages, setLoadingImages] = useState(false)

  const selected = collections.find((c) => c.id === selectedId)

  useEffect(() => {
    if (!selectedId || !selected) return

    const load = async () => {
      setLoadingImages(true)
      const promises = (selected.assetIds ?? []).map(async (id) => {
        const snap = await getDoc(doc(db, 'dam_assets', id))
        if (!snap.exists()) return null
        return { id: snap.id, ...snap.data() } as DamImage
      })
      const imgs = (await Promise.all(promises)).filter(Boolean) as DamImage[]
      setColImages(imgs)
      setLoadingImages(false)
    }

    load()
  }, [selectedId, selected])

  const handleCreate = useCallback(async () => {
    if (!newName.trim()) return
    await createCollection(newName.trim())
    setNewName('')
    setCreating(false)
  }, [newName, createCollection])

  // Vue détail d'une collection
  if (selectedId && selected) {
    return (
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="flex items-center gap-3 px-4 py-3 border-b border-white/5">
          <button
            onClick={() => setSelectedId(null)}
            className="p-1 rounded hover:bg-white/10 text-white/50 hover:text-white transition"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <h3 className="text-sm font-medium text-white/70">{selected.name}</h3>
          <span className="text-[10px] text-white/30">{selected.assetIds?.length ?? 0} images</span>
        </div>

        {loadingImages ? (
          <div className="flex-1 flex items-center justify-center text-white/30 text-sm">Chargement...</div>
        ) : colImages.length === 0 ? (
          <div className="flex-1 flex items-center justify-center text-white/30 text-sm">
            Aucune image dans cette collection
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto px-4 pb-4">
            <DamMasonry
              images={colImages}
              renderItem={(image) => (
                <DamImageCard
                  image={image}
                  collectionId={selectedId!}
                  onRemovedFromCollection={(id) => setColImages((prev) => prev.filter((i) => i.id !== id))}
                  onDeleted={(id) => setColImages((prev) => prev.filter((i) => i.id !== id))}
                />
              )}
            />
          </div>
        )}
      </div>
    )
  }

  // Vue liste des collections
  return (
    <div className="flex-1 overflow-y-auto p-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-medium text-white/70">Collections</h3>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setViewMode('grid')}
            className={`p-1.5 rounded transition ${viewMode === 'grid' ? 'bg-white/10 text-white/70' : 'text-white/30 hover:text-white/50'}`}
            title="Vue grille"
          >
            <LayoutGrid className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => setViewMode('list')}
            className={`p-1.5 rounded transition ${viewMode === 'list' ? 'bg-white/10 text-white/70' : 'text-white/30 hover:text-white/50'}`}
            title="Vue liste"
          >
            <List className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => setCreating(true)}
            className="p-1.5 rounded-lg bg-indigo-500/20 text-indigo-400 hover:bg-indigo-500/30 transition ml-1"
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>
      </div>

      {creating && (
        <div className="flex gap-2 mb-4">
          <input
            autoFocus
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
            placeholder="Nom de la collection"
            className="flex-1 bg-[#111] border border-white/10 rounded px-2 py-1.5 text-sm text-white placeholder:text-white/30 outline-none focus:border-indigo-500/50"
          />
          <button onClick={handleCreate} className="px-3 py-1.5 rounded bg-indigo-500 text-white text-sm hover:bg-indigo-600">
            OK
          </button>
          <button onClick={() => setCreating(false)} className="px-2 py-1.5 text-white/40 text-sm hover:text-white/60">
            ✕
          </button>
        </div>
      )}

      {loading ? (
        <div className="text-center text-white/30 text-sm py-8">Chargement...</div>
      ) : collections.length === 0 ? (
        <div className="text-center text-white/30 text-sm py-8">Aucune collection</div>
      ) : viewMode === 'grid' ? (
        <div className="grid grid-cols-3 gap-4">
          {collections.map((col) => (
            <CollectionCard
              key={col.id}
              col={col}
              onOpen={() => setSelectedId(col.id)}
              onDelete={() => deleteCollection(col.id)}
            />
          ))}
        </div>
      ) : (
        <div className="flex flex-col gap-1.5">
          {collections.map((col) => (
            <CollectionRow
              key={col.id}
              col={col}
              onOpen={() => setSelectedId(col.id)}
              onDelete={() => deleteCollection(col.id)}
            />
          ))}
        </div>
      )}
    </div>
  )
}
