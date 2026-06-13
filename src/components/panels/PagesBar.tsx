import { Plus, X } from 'lucide-react'
import { usePagesStore } from '@/stores/pages.store'
import { usePageNavigation } from '@/features/editor/usePageNavigation'

export function PagesBar() {
  const { pages, currentPageIndex, addPage, deletePage } = usePagesStore()
  const { navigateToPage, saveCurrentPage } = usePageNavigation()

  const handlePageClick = async (idx: number) => {
    if (idx === currentPageIndex) return
    await navigateToPage(idx)
  }

  const handleAddPage = () => {
    saveCurrentPage()
    addPage()
  }

  const handleDelete = (e: React.MouseEvent, id: string, idx: number) => {
    e.stopPropagation()
    if (pages.length <= 1) return
    if (idx === currentPageIndex) {
      const target = idx > 0 ? idx - 1 : 1
      navigateToPage(Math.min(target, pages.length - 2)).then(() => deletePage(id))
    } else {
      deletePage(id)
    }
  }

  return (
    <div className="flex items-center gap-1.5 h-full overflow-x-auto scrollbar-none">
      {pages.map((page, idx) => {
        const active = idx === currentPageIndex
        return (
          <button
            key={page.id}
            onClick={() => handlePageClick(idx)}
            title={`Page ${idx + 1}`}
            className={`relative shrink-0 group w-7 h-9 rounded border overflow-hidden bg-white/5 flex items-center justify-center transition-all ${
              active
                ? 'border-indigo-500 opacity-100'
                : 'border-white/15 hover:border-white/35 opacity-55 hover:opacity-90'
            }`}
          >
            {page.thumbnail ? (
              <img src={page.thumbnail} alt={page.label} className="w-full h-full object-cover" />
            ) : (
              <div className="w-2.5 h-2.5 bg-white/15 rounded-sm" />
            )}

            {/* Numéro — affiché sur la page active, et au survol des autres */}
            <span
              className={`absolute bottom-0 right-0 px-0.5 rounded-tl bg-black/55 text-[8px] leading-[1.4] font-semibold ${
                active ? 'text-indigo-300 flex' : 'text-white/70 hidden group-hover:flex'
              }`}
            >
              {idx + 1}
            </span>

            {/* Suppression — au survol */}
            {pages.length > 1 && (
              <span
                role="button"
                tabIndex={-1}
                onClick={(e) => handleDelete(e, page.id, idx)}
                className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-red-500/80 hover:bg-red-500 rounded-full hidden group-hover:flex items-center justify-center transition-colors z-10"
              >
                <X className="w-2 h-2 text-[#fff]" />
              </span>
            )}
          </button>
        )
      })}

      {/* Ajouter une page */}
      <button
        onClick={handleAddPage}
        title="Ajouter une page (⌘↵)"
        className="shrink-0 w-7 h-9 border border-dashed border-white/15 hover:border-indigo-500/60 rounded flex items-center justify-center transition-colors text-white/25 hover:text-indigo-400"
      >
        <Plus className="w-3.5 h-3.5" />
      </button>
    </div>
  )
}
