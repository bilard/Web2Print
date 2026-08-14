// Nom du tableau de bord, éditable sur place.
//
// ⚠ L'écriture est confirmée par Entrée ou par la perte du focus, JAMAIS à chaque frappe :
// un `saveDashboard` par caractère saturerait Firestore et ferait clignoter la liste.
// ⚠ Échap restaure le nom d'origine — renommer par accident ne doit pas être irréversible.
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from '@/lib/i18n'

export function BiDocTitle({ name, canEdit, onRename }: {
  name: string
  canEdit: boolean
  onRename: (name: string) => void
}) {
  const { t } = useTranslation()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(name)
  const inputRef = useRef<HTMLInputElement>(null)

  // ⚠ Le nom peut changer sous nos pieds (écho Firestore, autre onglet) : la saisie repart
  // du nom courant à chaque ouverture, sinon elle réécrirait une valeur périmée.
  useEffect(() => { if (!editing) setDraft(name) }, [name, editing])
  useEffect(() => { if (editing) inputRef.current?.select() }, [editing])

  const commit = () => {
    setEditing(false)
    const next = draft.trim()
    // ⚠ Un nom vide est refusé par le contrat (`name: z.string().min(1)`) : l'écriture
    // échouerait après coup, donc on ne la tente pas.
    if (next && next !== name) onRename(next)
    else setDraft(name)
  }

  if (!canEdit || !editing) {
    return (
      <button
        type="button" disabled={!canEdit} onClick={() => setEditing(true)}
        title={canEdit ? t('bi.top.rename') : undefined}
        className="text-sm font-semibold text-white truncate max-w-[240px] text-left rounded px-1 -mx-1 hover:bg-white/5 disabled:hover:bg-transparent transition-colors"
      >
        {name}
      </button>
    )
  }

  return (
    <input
      ref={inputRef} value={draft} onChange={(e) => setDraft(e.target.value)}
      onBlur={commit} aria-label={t('bi.top.rename')}
      onKeyDown={(e) => {
        if (e.key === 'Enter') commit()
        if (e.key === 'Escape') { setDraft(name); setEditing(false) }
      }}
      className="text-sm font-semibold text-white bg-well border border-indigo-500/60 rounded px-1.5 py-0.5 w-[240px] focus:outline-none"
    />
  )
}
