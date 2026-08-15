// Ce qu'on peut faire du tableau de bord ENTIER : le dupliquer, le supprimer.
//
// ⚠⚠ La suppression touche une donnée de l'ESPACE DE TRAVAIL : le tableau disparaît pour
// toute la société. La confirmation NOMME donc le tableau — « Supprimer ? » sur une liste de
// sept entrées dont six « Sans titre » ne dit rien de ce qu'on est en train de détruire.
// ⚠ Le renommage n'est PAS ici : le nom du bandeau (`BiDocTitle`) s'édite sur place, d'un
// clic. Deux chemins pour le même geste feraient douter du premier.
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Copy, MoreHorizontal, Trash2 } from 'lucide-react'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { useTranslation } from '@/lib/i18n'
import { useBoardCommands } from '../hooks/useBoardCommands'
import type { Dashboard } from '../types'

export function BoardActionsMenu({ board, uid, canEdit, onDuplicated, onDeleted }: {
  board: Dashboard
  uid: string | null
  canEdit: boolean
  /** L'écran ouvre la copie tout de suite, sans attendre l'écho de la base. */
  onDuplicated: (id: string) => void
  /** L'écran choisit alors le tableau suivant — la liste, elle, se videra d'elle-même. */
  onDeleted: () => void
}) {
  const { t } = useTranslation()
  const { duplicate, remove } = useBoardCommands(uid)
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

  if (!canEdit) return null

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
        <div className="absolute right-0 z-[60] mt-1 w-56 bg-surface border border-white/10 rounded-lg shadow-xl py-1">
          <MenuItem icon={<Copy className="w-3.5 h-3.5" />} onClick={() => void onDuplicate()}>
            {t('bi.board.duplicate')}
          </MenuItem>
          <MenuItem
            icon={<Trash2 className="w-3.5 h-3.5" />} danger
            onClick={() => { setOpen(false); setConfirming(true) }}
          >
            {t('bi.board.delete')}
          </MenuItem>
        </div>
      )}

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
