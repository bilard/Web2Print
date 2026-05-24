import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Undo2, Redo2, Download, ChevronLeft, Loader2, Save, Film, Wand2, RotateCcw } from 'lucide-react'
import { useEditorStore } from '@/stores/editor.store'
import { useAuthStore } from '@/stores/auth.store'
import { globalUndo, globalRedo } from '@/features/editor/CanvasContainer'
import { globalSave } from '@/features/editor/useAutoSave'
import { ExportModal } from '@/features/export/ExportModal'
import { VideoModal } from '@/features/video/VideoModal'
import { EditorTaxonomyBreadcrumb } from './EditorTaxonomyBreadcrumb'
import { useHighlight } from '@/features/help/hooks/useHighlight'
import { useImageToSvgDecompose } from '@/features/svg/useImageToSvgDecompose'

export function EditorHeader() {
  const navigate = useNavigate()
  const { projectTitle, setProjectTitle, canUndo, canRedo, saveStatus } = useEditorStore()
  const user = useAuthStore((s) => s.user)
  const [editing, setEditing] = useState(false)
  const [titleDraft, setTitleDraft] = useState(projectTitle)
  const [modal, setModal] = useState<null | 'export' | 'video'>(null)
  const saveHighlight = useHighlight<HTMLButtonElement>('editor-header.save')
  const exportHighlight = useHighlight<HTMLButtonElement>('editor-header.export')
  const { canDecompose, isRunning: decomposing, run: runDecompose, hasDecomposition, undoDecompose } = useImageToSvgDecompose()

  const commitTitle = () => {
    setProjectTitle(titleDraft.trim() || 'Sans titre')
    setEditing(false)
  }

  return (
    <>
    <header className="h-12 bg-[#1a1a1a] border-b border-white/10 flex items-center px-3 gap-2 shrink-0 z-30">
      {/* Back */}
      <button
        onClick={() => navigate('/dashboard')}
        className="p-1.5 rounded-md text-white/40 hover:text-white hover:bg-white/10 transition-colors"
        title="Dashboard"
      >
        <ChevronLeft className="w-4 h-4" />
      </button>

      {/* Logo */}
      <div className="w-6 h-6 bg-indigo-500 rounded flex items-center justify-center shrink-0">
        <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
        </svg>
      </div>

      {/* Project title */}
      <div className="flex items-center min-w-0">
        {editing ? (
          <input
            autoFocus
            value={titleDraft}
            onChange={(e) => setTitleDraft(e.target.value)}
            onBlur={commitTitle}
            onKeyDown={(e) => { if (e.key === 'Enter') commitTitle(); if (e.key === 'Escape') { setTitleDraft(projectTitle); setEditing(false) } }}
            className="bg-white/10 border border-indigo-500 rounded px-2 py-0.5 text-sm text-white focus:outline-none w-48"
          />
        ) : (
          <button
            onClick={() => { setTitleDraft(projectTitle); setEditing(true) }}
            className="text-sm text-white/80 hover:text-white truncate max-w-[200px] px-1 py-0.5 rounded hover:bg-white/5 transition-colors"
          >
            {projectTitle}
          </button>
        )}
      </div>

      {/* Taxonomy breadcrumb */}
      <EditorTaxonomyBreadcrumb />

      {/* Save status — only show when saving */}
      {saveStatus === 'saving' && (
        <div className="flex items-center gap-1 text-xs ml-1">
          <Loader2 className="w-3 h-3 animate-spin text-white/40" />
          <span className="text-white/40 hidden sm:block">Sauvegarde...</span>
        </div>
      )}

      <div className="flex-1" />

      {/* Undo / Redo */}
      <button
        data-help-id="editor-header.undo"
        onClick={() => globalUndo?.()}
        disabled={!canUndo}
        className="p-1.5 rounded-md text-white/40 hover:text-white hover:bg-white/10 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
        title="Annuler (⌘Z)"
      >
        <Undo2 className="w-4 h-4" />
      </button>
      <button
        data-help-id="editor-header.redo"
        onClick={() => globalRedo?.()}
        disabled={!canRedo}
        className="p-1.5 rounded-md text-white/40 hover:text-white hover:bg-white/10 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
        title="Rétablir (⌘Y)"
      >
        <Redo2 className="w-4 h-4" />
      </button>

      <div className="w-px h-5 bg-white/10 mx-1" />

      {/* Save */}
      <button
        ref={saveHighlight.ref}
        onClick={() => globalSave?.()}
        disabled={saveStatus === 'saving'}
        className={`flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50 ${
          saveStatus === 'unsaved'
            ? 'bg-amber-500/20 hover:bg-amber-500/30 text-amber-400 hover:text-amber-300 border border-amber-500/30'
            : saveStatus === 'saved'
              ? 'bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-400 hover:text-emerald-300 border border-emerald-500/20'
              : 'bg-white/10 hover:bg-white/15 text-white/70 hover:text-white border border-transparent'
        } ${saveHighlight.className}`}
        title="Sauvegarder (⌘S)"
      >
        {saveStatus === 'saving' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
        <span className="hidden sm:block">Sauvegarder</span>
      </button>

      {canDecompose && !hasDecomposition && (
        <button
          onClick={() => { void runDecompose() }}
          disabled={decomposing}
          title="Détecter automatiquement les textes éditoriaux via Google Vision (skip zone produit centrale)."
          className="flex items-center gap-1.5 bg-pink-500/15 hover:bg-pink-500/25 border border-pink-500/30 text-pink-300 hover:text-pink-200 text-sm font-medium px-3 py-1.5 rounded-lg transition-colors disabled:opacity-60 disabled:cursor-wait"
        >
          {decomposing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Wand2 className="w-3.5 h-3.5" />}
          <span className="hidden sm:block">{decomposing ? 'Décompose…' : 'Décomposer'}</span>
        </button>
      )}

      {canDecompose && hasDecomposition && !decomposing && (
        <button
          onClick={() => undoDecompose()}
          title="Supprimer tous les Textbox de décomposition et restaurer l'image."
          className="flex items-center gap-1.5 bg-orange-500/15 hover:bg-orange-500/25 border border-orange-500/30 text-orange-300 hover:text-orange-200 text-sm font-medium px-3 py-1.5 rounded-lg transition-colors"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          <span className="hidden sm:block">Annuler décomposition</span>
        </button>
      )}

      <button
        onClick={() => setModal('video')}
        title="Générer une vidéo de la page"
        className="flex items-center gap-1.5 bg-white/5 hover:bg-white/10 border border-white/10 text-white text-sm font-medium px-3 py-1.5 rounded-lg transition-colors"
      >
        <Film className="w-3.5 h-3.5" />
        <span className="hidden sm:block">Vidéo</span>
      </button>

      {/* Export */}
      <button
        ref={exportHighlight.ref}
        onClick={() => setModal('export')}
        className={`flex items-center gap-1.5 bg-indigo-500 hover:bg-indigo-600 text-white text-sm font-medium px-3 py-1.5 rounded-lg transition-colors ${exportHighlight.className}`}
      >
        <Download className="w-3.5 h-3.5" />
        <span className="hidden sm:block">Exporter</span>
      </button>

      {/* Avatar */}
      {user?.photoURL && (
        <img src={user.photoURL} alt="" className="w-7 h-7 rounded-full ring-2 ring-white/10 ml-1" />
      )}
    </header>

    {modal === 'export' && <ExportModal onClose={() => setModal(null)} />}
    {modal === 'video' && <VideoModal onClose={() => setModal(null)} />}
    </>
  )
}
