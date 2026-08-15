// Ce qu'on peut faire du tableau de bord ENTIER : en créer un, partir d'un modèle, le
// projeter, le dupliquer, le supprimer.
//
// ⚠⚠ TOUT le secondaire tient ici. Le bandeau portait neuf boutons et passait à la ligne :
// la barre changeait de hauteur selon la largeur de la fenêtre, et l'écran sautait. Ne
// restent visibles que les gestes qu'on fait à chaque séance — le mode, l'export, la
// création par prompt.
//
// ⚠⚠ La suppression touche une donnée de l'ESPACE DE TRAVAIL : le tableau disparaît pour
// toute la société. La confirmation NOMME donc le tableau — « Supprimer ? » sur une liste de
// sept entrées dont six « Sans titre » ne dit rien de ce qu'on est en train de détruire.
// ⚠ Le renommage n'est PAS ici : le nom du bandeau (`BiDocTitle`) s'édite sur place, d'un
// clic. Deux chemins pour le même geste feraient douter du premier.
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Copy, LayoutTemplate, MoreHorizontal, Plus, Trash2, Tv } from 'lucide-react'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { useTranslation } from '@/lib/i18n'
import { useBoardCommands } from '../hooks/useBoardCommands'
import { TemplatesDialog } from '../templates/TemplatesDialog'
import type { Dashboard } from '../types'

export function BoardActionsMenu({ board, uid, canEdit, onDuplicated, onDeleted, onOpenBoard, onTv }: {
  board: Dashboard
  uid: string | null
  canEdit: boolean
  /** L'écran ouvre la copie tout de suite, sans attendre l'écho de la base. */
  onDuplicated: (id: string) => void
  /** L'écran choisit alors le tableau suivant — la liste, elle, se videra d'elle-même. */
  onDeleted: () => void
  /** Affiche un autre tableau (créé vierge, ou ouvert depuis un modèle). */
  onOpenBoard: (id: string) => void
  /** Passage en mode TV. ⚠ Reste offert SANS droit d'édition : projeter n'est pas modifier. */
  onTv: () => void
}) {
  const { t } = useTranslation()
  const { duplicate, remove, createBlank } = useBoardCommands(uid)
  const [templates, setTemplates] = useState(false)
  const [open, setOpen] = useState(false)
  const [confirming, setConfirming] = useState(false)
  // ⚠ Le geste est en cours : sans cet état, un double-clic lancerait deux suppressions, et
  // la seconde échouerait sur un document déjà parti (message d'erreur pour un succès).
  const [pending, setPending] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    window.addEventListener('mousedown', onDown)
    return () => window.removeEventListener('mousedown', onDown)
  }, [open])

  const onNew = async () => {
    setOpen(false)
    setPending(true)
    const id = await createBlank()
    setPending(false)
    if (id) onOpenBoard(id)
  }

  const onDuplicate = async () => {
    setOpen(false)
    setPending(true)
    const id = await duplicate(board)
    setPending(false)
    if (id) onDuplicated(id)
  }

  const onConfirmDelete = async () => {
    setPending(true)
    const ok = await remove(board)
    setPending(false)
    if (ok) { setConfirming(false); onDeleted() }
  }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button" onClick={() => setOpen((v) => !v)} disabled={pending}
        title={t('bi.board.menu')} aria-label={t('bi.board.menu')}
        className="inline-flex items-center rounded-lg border border-white/10 bg-well px-2 py-1.5 text-white/60 hover:text-white hover:border-white/20 disabled:opacity-40 transition-colors"
      >
        <MoreHorizontal className="w-3.5 h-3.5" />
      </button>

      {open && (
        <div className="absolute right-0 z-[60] mt-1 w-60 bg-surface border border-white/10 rounded-lg shadow-xl py-1">
          {canEdit && (
            <MenuItem icon={<Plus className="w-3.5 h-3.5" />} onClick={() => void onNew()}>
              {t('bi.new.button')}
            </MenuItem>
          )}
          {/* ⚠ Les modèles restent offerts SANS droit d'édition : la galerie sait elle-même
              n'offrir que l'ouverture de ce qui existe déjà. */}
          <MenuItem icon={<LayoutTemplate className="w-3.5 h-3.5" />}
            onClick={() => { setOpen(false); setTemplates(true) }}>
            {t('bi.tpl.browse')}
          </MenuItem>
          <MenuItem icon={<Tv className="w-3.5 h-3.5" />}
            onClick={() => { setOpen(false); onTv() }}>
            {t('bi.top.tv')}
          </MenuItem>
          {canEdit && <div className="my-1 border-t border-white/[0.06]" />}
          {canEdit && (
            <MenuItem icon={<Copy className="w-3.5 h-3.5" />} onClick={() => void onDuplicate()}>
              {t('bi.board.duplicate')}
            </MenuItem>
          )}
          {canEdit && (
            <MenuItem
              icon={<Trash2 className="w-3.5 h-3.5" />} danger
              onClick={() => { setOpen(false); setConfirming(true) }}
            >
              {t('bi.board.delete')}
            </MenuItem>
          )}
        </div>
      )}

      <TemplatesDialog open={templates} onOpenChange={setTemplates}
        onOpen={onOpenBoard} canEdit={canEdit} />

      <AlertDialog open={confirming} onOpenChange={(o) => !pending && setConfirming(o)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('bi.board.deleteTitle', { name: board.name })}</AlertDialogTitle>
            {/* ⚠ La phrase dit CE QUI PART et POUR QUI : le tableau est partagé, et la
                suppression ne se rattrape pas. */}
            <AlertDialogDescription>{t('bi.board.deleteWarning')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>{t('bi.board.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); void onConfirmDelete() }}
              disabled={pending}
              className="bg-red-600 hover:bg-red-700 text-[#fff]"
            >
              {pending ? t('bi.board.deleting') : t('bi.board.delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

function MenuItem({ icon, danger, onClick, children }: {
  icon: ReactNode
  danger?: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button" onClick={onClick}
      className={`w-full flex items-center gap-2 px-2.5 py-1.5 text-xs text-left transition-colors hover:bg-white/5 ${
        danger ? 'text-red-300 hover:text-red-200' : 'text-white/80'
      }`}
    >
      {icon}{children}
    </button>
  )
}
