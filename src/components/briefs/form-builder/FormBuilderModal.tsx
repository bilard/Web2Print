import { useEffect, useState } from 'react'
import { X, Save } from 'lucide-react'
import { toast } from 'sonner'
import type { ClientFormField, Taxonomy } from '@/features/taxonomy/types'
import { createDefaultFormTemplate } from '@/features/briefs/defaults'
import { useSaveFormTemplate } from '@/features/briefs/useFormTemplate'
import { FieldList } from './FieldList'
import { FieldEditor } from './FieldEditor'
import { DynamicFormRenderer } from '../form-renderer/DynamicFormRenderer'

interface Props {
  open: boolean
  taxonomy: Taxonomy | null
  onClose: () => void
}

export function FormBuilderModal({ open, taxonomy, onClose }: Props) {
  const [draft, setDraft] = useState<ClientFormField[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [previewValues, setPreviewValues] = useState<Record<string, unknown>>({})
  const save = useSaveFormTemplate()

  // Hydrate le draft à l'ouverture
  useEffect(() => {
    if (!open || !taxonomy) return
    const initial = taxonomy.formTemplate ?? createDefaultFormTemplate()
    setDraft(initial)
    setSelectedId(initial[0]?.id ?? null)
    setPreviewValues({})
  }, [open, taxonomy])

  if (!open || !taxonomy) return null

  const selectedField = draft.find((f) => f.id === selectedId) ?? null

  const handleFieldChange = (patch: Partial<ClientFormField>) => {
    if (!selectedField) return
    setDraft((prev) =>
      prev.map((f) => (f.id === selectedField.id ? { ...f, ...patch } : f)),
    )
  }

  const handleDelete = () => {
    if (!selectedField || selectedField.builtin) return
    setDraft((prev) => prev.filter((f) => f.id !== selectedField.id))
    setSelectedId(null)
  }

  const handleAdd = (field: ClientFormField) => {
    setDraft((prev) => [...prev, field])
    setSelectedId(field.id)
  }

  const handleSave = async () => {
    try {
      await save.mutateAsync({ taxonomyId: taxonomy.id, fields: draft })
      toast.success('Formulaire enregistré')
      onClose()
    } catch (err) {
      toast.error('Erreur lors de la sauvegarde')
      console.error(err)
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-stretch p-6">
      <div className="flex-1 bg-[#0f0f0f] border border-white/[0.06] rounded-lg flex flex-col overflow-hidden">
        {/* Header */}
        <div className="h-12 bg-[#161616] border-b border-white/[0.06] flex items-center px-4 gap-3 shrink-0">
          <h2 className="text-[13px] font-semibold text-white/80">
            Configurer le formulaire — {taxonomy.name}
          </h2>
          <div className="flex-1" />
          <button
            onClick={onClose}
            className="text-[12px] text-white/50 hover:text-white/80 px-3 py-1.5 rounded-md hover:bg-white/[0.06]"
          >
            Annuler
          </button>
          <button
            onClick={handleSave}
            disabled={save.isPending}
            className="flex items-center gap-1.5 text-[12px] text-white bg-indigo-500 hover:bg-indigo-600 px-3 py-1.5 rounded-md disabled:opacity-50"
          >
            <Save className="w-3.5 h-3.5" />
            Enregistrer
          </button>
          <button
            onClick={onClose}
            aria-label="Fermer"
            className="text-white/40 hover:text-white/80 p-1.5 rounded-md hover:bg-white/[0.06]"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body 3 colonnes */}
        <div className="flex-1 grid grid-cols-[260px_320px_1fr] overflow-hidden">
          {/* Col 1 — champs */}
          <div className="border-r border-white/[0.06] bg-[#141414] overflow-hidden">
            <FieldList
              fields={draft}
              selectedFieldId={selectedId}
              onSelect={setSelectedId}
              onReorder={setDraft}
              onAdd={handleAdd}
            />
          </div>

          {/* Col 2 — éditeur */}
          <div className="border-r border-white/[0.06] bg-[#141414] overflow-y-auto">
            <FieldEditor
              field={selectedField}
              onChange={handleFieldChange}
              onDelete={handleDelete}
            />
          </div>

          {/* Col 3 — aperçu live */}
          <div className="overflow-y-auto p-6 bg-[#0f0f0f]">
            <h3 className="text-[11px] uppercase tracking-wide text-white/40 font-semibold mb-4">
              Aperçu
            </h3>
            <div className="max-w-lg">
              <DynamicFormRenderer
                fields={draft}
                values={previewValues}
                onChange={(key, value) =>
                  setPreviewValues((prev) => ({ ...prev, [key]: value }))
                }
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
