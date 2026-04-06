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
    <div className="flex items-center gap-2 px-4 h-full overflow-x-auto scrollbar-none">
      {pages.map((page, idx) => (
        <button
          key={page.id}
          onClick={() => handlePageClick(idx)}
          className={`relative shrink-0 group flex flex-col items-center gap-1 transition-all ${
            idx === currentPageIndex ? 'opacity-100' : 'opacity-55 hover:opacity-85'
          }`}
        >
          {/* Thumbnail */}
          <div
            className={`w-[42px] h-[46px] rounded border-2 overflow-hidden bg-white/5 flex items-center justify-center transition-colors ${
              idx === currentPageIndex
                ? 'border-indigo-500 shadow-[0_0_0_1px_rgba(99,102,241,0.3)]'
                : 'border-white/15 hover:border-white/35'
            }`}
          >
            {page.thumbnail ? (
              <img src={page.thumbnail} alt={page.label} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full bg-white/8 flex items-center justify-center">
                <div className="w-4 h-4 bg-white/10 rounded-sm" />
              </div>
            )}
          </div>

          {/* Page number */}
          <span
            className={`text-[9px] font-medium leading-none ${
              idx === currentPageIndex ? 'text-indigo-400' : 'text-white/30'
            }`}
          >
            {idx + 1}
          </span>

          {/* Delete button */}
          {pages.length > 1 && (
            <button
              onClick={(e) => handleDelete(e, page.id, idx)}
              className="absolute -top-1 -right-1 w-4 h-4 bg-red-500/80 hover:bg-red-500 rounded-full hidden group-hover:flex items-center justify-center transition-colors z-10"
            >
              <X className="w-2.5 h-2.5 text-white" />
            </button>
          )}
        </button>
      ))}

      {/* Add page */}
      <button
        onClick={handleAddPage}
        title="Ajouter une page (⌘↵)"
        className="shrink-0 w-[42px] h-[46px] border-2 border-dashed border-white/15 hover:border-indigo-500/60 rounded flex items-center justify-center transition-colors text-white/25 hover:text-indigo-400"
      >
        <Plus className="w-4 h-4" />
      </button>
    </div>
  )
}
