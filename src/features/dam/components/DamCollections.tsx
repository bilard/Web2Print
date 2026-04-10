import { useState } from 'react'
import { Plus, Trash2, FolderOpen } from 'lucide-react'
import { useDamCollections } from '../hooks/useDamCollections'
import { useDamStore } from '../../../stores/dam.store'

export function DamCollections() {
  const { collections, loading, createCollection, deleteCollection } = useDamCollections()
  const { setSelectedCollection, setActiveTab } = useDamStore()
  const [newName, setNewName] = useState('')
  const [creating, setCreating] = useState(false)

  const handleCreate = async () => {
    if (!newName.trim()) return
    await createCollection(newName.trim())
    setNewName('')
    setCreating(false)
  }

  const handleOpenCollection = (id: string) => {
    setSelectedCollection(id)
    setActiveTab('my-images')
  }

  return (
    <div className="flex-1 overflow-y-auto p-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-medium text-white/70">Collections</h3>
        <button
          onClick={() => setCreating(true)}
          className="p-1.5 rounded-lg bg-indigo-500/20 text-indigo-400 hover:bg-indigo-500/30 transition"
        >
          <Plus className="w-4 h-4" />
        </button>
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
      ) : (
        <div className="grid grid-cols-2 gap-3">
          {collections.map((col) => (
            <div
              key={col.id}
              onClick={() => handleOpenCollection(col.id)}
              className="group relative bg-white/5 rounded-lg p-3 cursor-pointer hover:bg-white/10 transition"
            >
              <FolderOpen className="w-8 h-8 text-indigo-400/50 mb-2" />
              <div className="text-sm text-white/70 font-medium truncate">{col.name}</div>
              <div className="text-[10px] text-white/30">{col.assetIds.length} images</div>
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  deleteCollection(col.id)
                }}
                className="absolute top-2 right-2 p-1 rounded opacity-0 group-hover:opacity-100 text-white/30 hover:text-red-400 hover:bg-red-500/10 transition"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
