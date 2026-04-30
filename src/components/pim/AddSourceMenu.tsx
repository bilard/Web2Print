import { useState, useRef, useEffect } from 'react'
import { Plus, Upload, Globe, Edit3, ChevronDown } from 'lucide-react'

interface Props {
  onPickImport: () => void
  onPickScrape: () => void
  onPickManual: () => void
}

export function AddSourceMenu({ onPickImport, onPickScrape, onPickManual }: Props) {
  const [open, setOpen] = useState(false)
  const wrapper = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => {
      if (!wrapper.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [open])

  const choose = (fn: () => void) => () => { fn(); setOpen(false) }

  return (
    <div ref={wrapper} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-center gap-1.5 px-2 py-1.5 bg-indigo-500/15 hover:bg-indigo-500/25 border border-indigo-500/25 rounded-md text-[12px] text-indigo-200 transition-colors"
      >
        <Plus className="w-3.5 h-3.5" />
        Source
        <ChevronDown className="w-3 h-3 opacity-70" />
      </button>
      {open && (
        <div className="absolute z-20 mt-1 w-full bg-[#1a1a1a] border border-white/10 rounded-md shadow-lg py-1">
          <button onClick={choose(onPickImport)} className="w-full flex items-center gap-2 px-3 py-1.5 text-[12px] text-white/70 hover:bg-white/[0.06] hover:text-white">
            <Upload className="w-3.5 h-3.5 opacity-60" /> Importer un fichier
          </button>
          <button onClick={choose(onPickScrape)} className="w-full flex items-center gap-2 px-3 py-1.5 text-[12px] text-white/70 hover:bg-white/[0.06] hover:text-white">
            <Globe className="w-3.5 h-3.5 opacity-60" /> Scraper une URL
          </button>
          <button onClick={choose(onPickManual)} className="w-full flex items-center gap-2 px-3 py-1.5 text-[12px] text-white/70 hover:bg-white/[0.06] hover:text-white">
            <Edit3 className="w-3.5 h-3.5 opacity-60" /> Saisir manuellement
          </button>
        </div>
      )}
    </div>
  )
}
