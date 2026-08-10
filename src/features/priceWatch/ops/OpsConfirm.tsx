// Confirmation destructive/irréversible du suivi (Arrêter, Suspendre) — un `AlertDialog`
// NON BLOQUANT : `window.confirm` gèle l'onglet ENTIER, intolérable sur un écran qui se
// repeint en continu (trois abonnements en direct + une horloge à la seconde). Même patron
// que `WatchManager.tsx` / `ConfirmDeleteDialog.tsx`.
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { useTranslation } from '@/lib/i18n'

export function OpsConfirm({ open, onOpenChange, title, description, actionLabel, onConfirm }: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description: string
  actionLabel: string
  onConfirm: () => void
}) {
  const { t } = useTranslation()
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t('ops.actions.confirm.cancel')}</AlertDialogCancel>
          <AlertDialogAction onClick={(e) => { e.preventDefault(); onConfirm() }} className="bg-rose-600 hover:bg-rose-700 text-[#fff]">
            {actionLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
