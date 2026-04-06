import { useState } from 'react'
import { Plus, Trash2, Pencil, Check, X } from 'lucide-react'
import { usePaletteStore, savePaletteToFirestore } from '@/stores/palette.store'
import type { PaletteColor, PaletteGradient } from '@/stores/palette.store'
import type { GradientConfig } from '@/stores/editor.store'
import { gradientToCss } from '@/components/shared/GradientPicker'

function ColorSwatch({ item, onApply }: { item: PaletteColor; onApply?: (color: string) => void }) {
  const { removeColor, updateColor } = usePaletteStore()
  const [editing, setEditing] = useState(false)
  const [editName, setEditName] = useState(item.name)
  const [editColor, setEditColor] = useState(item.color)

  const save = () => {
    updateColor(item.id, { name: editName, color: editColor })
    savePaletteToFirestore()
    setEditing(false)
  }

  if (editing) {
    return (
      <div className="flex items-center gap-1.5 bg-white/5 rounded-md p-1.5">
        <input type="color" value={editColor} onChange={(e) => setEditColor(e.target.value)}
          className="w-7 h-7 rounded cursor-pointer bg-transparent border border-white/20 p-0 shrink-0" />
        <input type="text" value={editName} onChange={(e) => setEditName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && save()}
          className="flex-1 bg-white/5 border border-white/10 rounded px-1.5 py-0.5 text-[10px] text-white min-w-0" />
        <button onClick={save} className="text-green-400 hover:text-green-300 p-0.5"><Check className="w-3 h-3" /></button>
        <button onClick={() => setEditing(false)} className="text-white/30 hover:text-white/50 p-0.5"><X className="w-3 h-3" /></button>
      </div>
    )
  }

  return (
    <div className="group flex items-center gap-2 hover:bg-white/5 rounded-md px-1.5 py-1 transition-colors">
      <button onClick={() => onApply?.(item.color)} title="Appliquer"
        className="w-7 h-7 rounded border border-white/20 shrink-0 hover:scale-110 transition-transform"
        style={{ backgroundColor: item.color }} />
      <div className="flex-1 min-w-0">
        <p className="text-[11px] text-white/70 truncate">{item.name}</p>
        <p className="text-[9px] text-white/30 font-mono uppercase">{item.color}</p>
      </div>
      <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
        <button onClick={() => { setEditName(item.name); setEditColor(item.color); setEditing(true) }}
          className="p-1 text-white/30 hover:text-white/60"><Pencil className="w-3 h-3" /></button>
        <button onClick={() => { removeColor(item.id); savePaletteToFirestore() }}
          className="p-1 text-white/30 hover:text-red-400"><Trash2 className="w-3 h-3" /></button>
      </div>
    </div>
  )
}

function GradientSwatch({ item, onApply }: { item: PaletteGradient; onApply?: (g: GradientConfig) => void }) {
  const { removeGradient, updateGradient } = usePaletteStore()
  const [editing, setEditing] = useState(false)
  const [editName, setEditName] = useState(item.name)

  const save = () => {
    updateGradient(item.id, { name: editName })
    savePaletteToFirestore()
    setEditing(false)
  }

  return (
    <div className="group flex items-center gap-2 hover:bg-white/5 rounded-md px-1.5 py-1 transition-colors">
      <button onClick={() => onApply?.(item.gradient)} title="Appliquer"
        className="w-7 h-7 rounded border border-white/20 shrink-0 hover:scale-110 transition-transform"
        style={{ background: gradientToCss(item.gradient) }} />
      <div className="flex-1 min-w-0">
        {editing ? (
          <div className="flex items-center gap-1">
            <input type="text" value={editName} onChange={(e) => setEditName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && save()}
              className="flex-1 bg-white/5 border border-white/10 rounded px-1.5 py-0.5 text-[10px] text-white min-w-0" />
            <button onClick={save} className="text-green-400 hover:text-green-300 p-0.5"><Check className="w-3 h-3" /></button>
            <button onClick={() => setEditing(false)} className="text-white/30 hover:text-white/50 p-0.5"><X className="w-3 h-3" /></button>
          </div>
        ) : (
          <p className="text-[11px] text-white/70 truncate">{item.name}</p>
        )}
        <p className="text-[9px] text-white/30">
          {item.gradient.type === 'linear' ? 'Linéaire' : 'Radial'} &bull; {item.gradient.stops.length} stops
        </p>
      </div>
      {!editing && (
        <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
          <button onClick={() => { setEditName(item.name); setEditing(true) }}
            className="p-1 text-white/30 hover:text-white/60"><Pencil className="w-3 h-3" /></button>
          <button onClick={() => { removeGradient(item.id); savePaletteToFirestore() }}
            className="p-1 text-white/30 hover:text-red-400"><Trash2 className="w-3 h-3" /></button>
        </div>
      )}
    </div>
  )
}

function AddColorForm({ onAdd }: { onAdd: (color: string, name: string) => void }) {
  const [open, setOpen] = useState(false)
  const [color, setColor] = useState('#6366f1')
  const [name, setName] = useState('')

  if (!open) {
    return (
      <button onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 w-full py-1.5 px-2 text-[10px] text-white/40 hover:text-white/60 bg-white/5 hover:bg-white/10 border border-dashed border-white/10 rounded transition-colors">
        <Plus className="w-3 h-3" /> Ajouter une couleur
      </button>
    )
  }

  const submit = () => {
    onAdd(color, name || color)
    setColor('#6366f1')
    setName('')
    setOpen(false)
  }

  return (
    <div className="flex items-center gap-1.5 bg-white/5 rounded-md p-1.5">
      <input type="color" value={color} onChange={(e) => setColor(e.target.value)}
        className="w-7 h-7 rounded cursor-pointer bg-transparent border border-white/20 p-0 shrink-0" />
      <input type="text" value={name} onChange={(e) => setName(e.target.value)}
        placeholder="Nom (optionnel)" onKeyDown={(e) => e.key === 'Enter' && submit()}
        className="flex-1 bg-white/5 border border-white/10 rounded px-1.5 py-0.5 text-[10px] text-white placeholder:text-white/20 min-w-0" />
      <button onClick={submit} className="text-green-400 hover:text-green-300 p-0.5"><Check className="w-3.5 h-3.5" /></button>
      <button onClick={() => setOpen(false)} className="text-white/30 hover:text-white/50 p-0.5"><X className="w-3.5 h-3.5" /></button>
    </div>
  )
}

function AddGradientForm({ onAdd }: { onAdd: (g: GradientConfig, name: string) => void }) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [color1, setColor1] = useState('#6366f1')
  const [color2, setColor2] = useState('#ec4899')
  const [type, setType] = useState<'linear' | 'radial'>('linear')

  if (!open) {
    return (
      <button onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 w-full py-1.5 px-2 text-[10px] text-white/40 hover:text-white/60 bg-white/5 hover:bg-white/10 border border-dashed border-white/10 rounded transition-colors">
        <Plus className="w-3 h-3" /> Ajouter un dégradé
      </button>
    )
  }

  const submit = () => {
    const gradient: GradientConfig = {
      type,
      angle: 90,
      stops: [{ offset: 0, color: color1 }, { offset: 1, color: color2 }],
    }
    onAdd(gradient, name || `${color1} → ${color2}`)
    setName('')
    setColor1('#6366f1')
    setColor2('#ec4899')
    setOpen(false)
  }

  return (
    <div className="flex flex-col gap-1.5 bg-white/5 rounded-md p-2">
      <div className="flex items-center gap-1.5">
        <input type="color" value={color1} onChange={(e) => setColor1(e.target.value)}
          className="w-6 h-6 rounded cursor-pointer bg-transparent border border-white/20 p-0 shrink-0" />
        <span className="text-[10px] text-white/20">→</span>
        <input type="color" value={color2} onChange={(e) => setColor2(e.target.value)}
          className="w-6 h-6 rounded cursor-pointer bg-transparent border border-white/20 p-0 shrink-0" />
        <div className="flex gap-0.5 ml-1">
          {(['linear', 'radial'] as const).map((t) => (
            <button key={t} onClick={() => setType(t)}
              className={`px-1.5 py-0.5 text-[9px] rounded border transition-colors ${
                type === t ? 'bg-indigo-500/20 border-indigo-500/50 text-indigo-400' : 'bg-white/5 border-white/10 text-white/30'
              }`}>
              {t === 'linear' ? 'Lin.' : 'Rad.'}
            </button>
          ))}
        </div>
      </div>
      <div className="flex items-center gap-1.5">
        <input type="text" value={name} onChange={(e) => setName(e.target.value)}
          placeholder="Nom (optionnel)" onKeyDown={(e) => e.key === 'Enter' && submit()}
          className="flex-1 bg-white/5 border border-white/10 rounded px-1.5 py-0.5 text-[10px] text-white placeholder:text-white/20 min-w-0" />
        <button onClick={submit} className="text-green-400 hover:text-green-300 p-0.5"><Check className="w-3.5 h-3.5" /></button>
        <button onClick={() => setOpen(false)} className="text-white/30 hover:text-white/50 p-0.5"><X className="w-3.5 h-3.5" /></button>
      </div>
    </div>
  )
}

export function PalettePanel() {
  const { colors, gradients, addColor, addGradient } = usePaletteStore()

  return (
    <div className="p-3 flex flex-col gap-4">
      {/* Couleurs du projet */}
      <section>
        <h4 className="text-[10px] text-white/40 uppercase tracking-wider mb-2">Couleurs du projet</h4>
        <div className="flex flex-col gap-1">
          {colors.length === 0 && (
            <p className="text-[10px] text-white/20 italic py-2">Aucune couleur enregistrée</p>
          )}
          {colors.map((c) => (
            <ColorSwatch key={c.id} item={c} />
          ))}
        </div>
        <div className="mt-2">
          <AddColorForm onAdd={(color, name) => { addColor(color, name); savePaletteToFirestore() }} />
        </div>
      </section>

      {/* Dégradés du projet */}
      <section>
        <h4 className="text-[10px] text-white/40 uppercase tracking-wider mb-2">Dégradés du projet</h4>
        <div className="flex flex-col gap-1">
          {gradients.length === 0 && (
            <p className="text-[10px] text-white/20 italic py-2">Aucun dégradé enregistré</p>
          )}
          {gradients.map((g) => (
            <GradientSwatch key={g.id} item={g} />
          ))}
        </div>
        <div className="mt-2">
          <AddGradientForm onAdd={(gradient, name) => { addGradient(gradient, name); savePaletteToFirestore() }} />
        </div>
      </section>

      {/* Info */}
      <p className="text-[9px] text-white/15 leading-relaxed">
        Les couleurs et dégradés sont sauvegardés automatiquement avec le projet.
      </p>
    </div>
  )
}
