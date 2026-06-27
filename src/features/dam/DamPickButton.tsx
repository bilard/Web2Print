// src/features/dam/DamPickButton.tsx
// Bouton « Choisir dans le DAM » : ouvre le picker Google Drive et écrit le
// webViewLink de l'asset choisi (référence stable, ré-résolue à l'affichage par
// driveAssets). Réutilise le picker existant des workflows.
import { useState } from 'react'
import { FolderOpen } from 'lucide-react'
import { GDrivePickerModal } from '@/features/gdrive/GDrivePickerModal'
import { driveWebViewLink } from './driveAssets'

interface Props {
  /** Reçoit le(s) webViewLink(s) Drive sélectionné(s), joints par retour-ligne. */
  onPick: (webViewLink: string) => void
}

export function DamPickButton({ onPick }: Props) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); setOpen(true) }}
        className="shrink-0 p-1 rounded text-white/40 hover:text-indigo-300 hover:bg-indigo-500/10 transition-colors"
        title="Choisir des images dans le DAM (Google Drive)"
      >
        <FolderOpen className="h-3.5 w-3.5" />
      </button>
      {open && (
        <GDrivePickerModal
          open={open}
          onClose={() => setOpen(false)}
          mimeFilter="all"
          multiple
          title="Choisir des images dans le DAM"
          onPick={(file) => { onPick(driveWebViewLink(file.id)); setOpen(false) }}
          onPickMultiple={(files) => { onPick(files.map((f) => driveWebViewLink(f.id)).join('\n')); setOpen(false) }}
        />
      )}
    </>
  )
}
