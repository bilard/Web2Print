import { useState, useCallback } from 'react'
import { Home, Users, Clock, Star, Search, ChevronRight } from 'lucide-react'
import { GDriveFileList } from './GDriveFileList'
import type { DriveSection, GDriveFile } from './types'

const NAV: { id: DriveSection; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: 'my-drive', label: 'Mon Drive',         icon: Home },
  { id: 'shared',   label: 'Partagés avec moi', icon: Users },
  { id: 'recent',   label: 'Récents',            icon: Clock },
  { id: 'starred',  label: 'Suivis',             icon: Star },
]

interface FolderCrumb {
  id: string
  name: string
}

export function GDrivePanel() {
  const [section, setSection] = useState<DriveSection>('my-drive')
  const [search, setSearch] = useState('')
  const [folderStack, setFolderStack] = useState<FolderCrumb[]>([])

  const currentFolder = folderStack[folderStack.length - 1] ?? null
  const sectionLabel = NAV.find((n) => n.id === section)?.label ?? ''

  const handleSectionChange = useCallback((id: DriveSection) => {
    setSection(id)
    setSearch('')
    setFolderStack([])
  }, [])

  const handleFolderOpen = useCallback((file: GDriveFile) => {
    setFolderStack((stack) => [...stack, { id: file.id, name: file.name }])
    setSearch('')
  }, [])

  const handleCrumbClick = useCallback((index: number) => {
    // index = -1 → return to section root
    setFolderStack((stack) => (index < 0 ? [] : stack.slice(0, index + 1)))
    setSearch('')
  }, [])

  return (
    <div className="flex gap-8" style={{ minHeight: 'calc(100vh - 200px)' }}>
      {/* Left sidebar */}
      <aside className="w-52 shrink-0 flex flex-col gap-4">
        {/* Drive logo + account */}
        <div className="flex items-center gap-2.5">
          <svg viewBox="0 0 87.3 78" className="w-8 h-8 shrink-0">
            <path d="M6.6 66.85l3.85 6.65c.8 1.4 1.95 2.5 3.3 3.3l13.75-23.8H1.1c0 1.55.4 3.1 1.2 4.5z" fill="#0066da"/>
            <path d="M43.65 25L29.9 1.2C28.55 2 27.4 3.1 26.6 4.5L1.2 48.5c-.8 1.4-1.2 2.95-1.2 4.5h27.5z" fill="#00ac47"/>
            <path d="M73.55 76.8c1.35-.8 2.5-1.9 3.3-3.3l1.6-2.75 7.65-13.25c.8-1.4 1.2-2.95 1.2-4.5H59.8l5.85 11.65z" fill="#ea4335"/>
            <path d="M43.65 25L57.4 1.2C56.05.4 54.5 0 52.95 0H34.35c-1.55 0-3.1.4-4.45 1.2z" fill="#00832d"/>
            <path d="M59.8 53H27.5L13.75 76.8c1.35.8 2.9 1.2 4.45 1.2h50.9c1.55 0 3.1-.4 4.45-1.2z" fill="#2684fc"/>
            <path d="M73.4 26.5l-12.7-22c-.8-1.4-1.95-2.5-3.3-3.3L43.65 25 59.8 53h27.45c0-1.55-.4-3.1-1.2-4.5z" fill="#ffba00"/>
          </svg>
          <span className="text-base font-medium text-white/70">Drive</span>
        </div>

        {/* Nav */}
        <nav className="flex flex-col gap-0.5">
          {NAV.map(({ id, label, icon: Icon }) => {
            const isActive = section === id && folderStack.length === 0
            return (
              <button
                key={id}
                onClick={() => handleSectionChange(id)}
                className={`flex items-center gap-3 px-4 py-2 rounded-full text-sm transition-colors text-left ${
                  isActive
                    ? 'bg-blue-500/15 text-blue-300 font-medium'
                    : 'text-white/50 hover:bg-white/[0.05] hover:text-white/70'
                }`}
              >
                <Icon className="w-4 h-4 shrink-0" />
                <span className="truncate">{label}</span>
              </button>
            )
          })}
        </nav>

      </aside>

      {/* Content */}
      <div className="flex-1 min-w-0 flex flex-col gap-4">
        {/* Search */}
        <div className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={currentFolder ? `Rechercher dans ${currentFolder.name}` : 'Rechercher dans Drive'}
            className="w-full bg-white/[0.05] border border-white/[0.08] rounded-2xl pl-11 pr-4 py-2.5 text-sm text-white placeholder:text-white/25 focus:outline-none focus:border-blue-500/30 focus:bg-white/[0.07] transition-all"
          />
        </div>

        {/* Breadcrumb */}
        {folderStack.length > 0 && (
          <nav aria-label="Fil d'Ariane" className="flex items-center gap-1 text-sm flex-wrap">
            <button
              onClick={() => handleCrumbClick(-1)}
              className="text-white/50 hover:text-white transition-colors px-1"
            >
              {sectionLabel}
            </button>
            {folderStack.map((crumb, i) => {
              const isLast = i === folderStack.length - 1
              return (
                <div key={crumb.id} className="flex items-center gap-1">
                  <ChevronRight className="w-3.5 h-3.5 text-white/25" />
                  {isLast ? (
                    <span className="text-white font-medium px-1 truncate max-w-[260px]" title={crumb.name}>
                      {crumb.name}
                    </span>
                  ) : (
                    <button
                      onClick={() => handleCrumbClick(i)}
                      className="text-white/50 hover:text-white transition-colors px-1 truncate max-w-[200px]"
                      title={crumb.name}
                    >
                      {crumb.name}
                    </button>
                  )}
                </div>
              )
            })}
          </nav>
        )}

        {/* File list */}
        <GDriveFileList
          section={section}
          search={search}
          parentId={currentFolder?.id ?? null}
          onFolderOpen={handleFolderOpen}
        />
      </div>
    </div>
  )
}
