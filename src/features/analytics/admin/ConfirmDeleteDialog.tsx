// Dialogue de confirmation destructive partagé par les trois suppressions
// de l'onglet Analytics (vider tout, purger mes visites, supprimer le résultat).
import type { ReactNode } from 'react'
import { Loader2 } from 'lucide-react'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { t } from '@/lib/i18n'

export function ConfirmDeleteDialog({
  open,
  onOpenChange,
  title,
  description,
  actionLabel,
  pending,
  onConfirm,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description: ReactNode
  actionLabel: string
  pending: boolean
  onConfirm: () => void
}) {
  return (
    <AlertDialog open={open} onOpenChange={(o) => !pending && onOpenChange(o)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>{t('an.annuler')}</AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => { e.preventDefault(); onConfirm() }}
            disabled={pending}
            className="bg-red-600 hover:bg-red-700 text-[#fff]"
          >
            {pending ? <><Loader2 className="w-4 h-4 animate-spin" /> Suppression…</> : actionLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
