import { useEffect, useState } from 'react'
import { Search, X } from 'lucide-react'

interface Props {
  value: string
  onChange: (v: string) => void
}

export function LayerSearchBar({ value, onChange }: Props) {
  const [local, setLocal] = useState(value)

  useEffect(() => {
    const t = setTimeout(() => {
      if (local !== value) onChange(local)
    }, 150)
    return () => clearTimeout(t)
  }, [local, value, onChange])

  useEffect(() => { setLocal(value) }, [value])

  return (
    <div className="relative px-3 py-2">
      <Search className="absolute left-5 top-1/2 -translate-y-1/2 w-3 h-3 text-white/30 pointer-events-none" />
      <input
        value={local}
        onChange={(e) => setLocal(e.target.value)}
        placeholder="Rechercher dans les calques"
        className="w-full text-xs bg-black/30 border border-white/10 rounded px-6 py-1 text-white/80 outline-none focus:border-indigo-500/60 placeholder:text-white/25"
      />
      {local && (
        <button
          onClick={() => { setLocal(''); onChange('') }}
          className="absolute right-4 top-1/2 -translate-y-1/2 p-0.5 text-white/30 hover:text-white/60"
          title="Effacer"
        >
          <X className="w-3 h-3" />
        </button>
      )}
    </div>
  )
}
