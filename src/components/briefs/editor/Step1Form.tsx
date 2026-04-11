import { useEffect, useState } from 'react'
import { ArrowRight } from 'lucide-react'
import { toast } from 'sonner'
import { DynamicFormRenderer } from '@/components/briefs/form-renderer/DynamicFormRenderer'
import { useUpdateBrief } from '@/features/briefs/useBriefMutations'
import type { Brief } from '@/features/briefs/types'
import type { ClientFormField } from '@/features/taxonomy/types'

function ensureBrandKitField(fields: ClientFormField[]): ClientFormField[] {
  if (fields.some((f) => f.key === 'brandKit')) return fields
  // Insère après secondaryColor (ou en fin si absent)
  const idx = fields.findIndex((f) => f.key === 'secondaryColor')
  const insertAfter = idx >= 0 ? idx : fields.length - 1
  const baseOrder = fields[insertAfter]?.order ?? 0
  const brandKit: ClientFormField = {
    id: 'builtin-brandKit',
    key: 'brandKit',
    label: 'Charte graphique / kit de communication',
    type: 'brand_kit_upload',
    required: false,
    group: 'Identité visuelle',
    order: baseOrder + 1,
    builtin: true,
    helpText: 'Importez un PDF, une image ou un dossier complet. Sera utilisé pour les exports.',
  }
  return [...fields.slice(0, insertAfter + 1), brandKit, ...fields.slice(insertAfter + 1)]
}

function ensureClientWebsiteUrlField(fields: ClientFormField[]): ClientFormField[] {
  if (fields.some((f) => f.key === 'clientWebsiteUrl')) return fields
  // Insère juste après companyName (ou en tête)
  const idx = fields.findIndex((f) => f.key === 'companyName')
  const insertAfter = idx >= 0 ? idx : -1
  const baseOrder = fields[insertAfter]?.order ?? 0
  const urlField: ClientFormField = {
    id: 'builtin-clientWebsiteUrl',
    key: 'clientWebsiteUrl',
    label: 'URL du site client',
    type: 'text',
    required: false,
    group: 'Société',
    order: baseOrder + 0.5,
    builtin: true,
    placeholder: 'https://www.exemple.fr',
    helpText:
      "Utilisé comme contexte si aucun PDF/kit n'est fourni. L'IA s'en servira pour inférer l'univers visuel et le ton.",
  }
  return [...fields.slice(0, insertAfter + 1), urlField, ...fields.slice(insertAfter + 1)]
}

interface Props {
  brief: Brief
  onAdvance: () => void
}

export function Step1Form({ brief, onAdvance }: Props) {
  const [values, setValues] = useState<Record<string, unknown>>(brief.client.values)
  const update = useUpdateBrief()

  const handleChange = (key: string, value: unknown) => {
    setValues((prev) => ({ ...prev, [key]: value }))
  }

  const handleNext = async () => {
    const missing = brief.client.formTemplateSnapshot.filter(
      (f) => f.required && !f.hidden && !values[f.key],
    )
    if (missing.length > 0) {
      toast.error(`Champs obligatoires manquants : ${missing.map((f) => f.label).join(', ')}`)
      return
    }
    const clientName = String(values.companyName ?? brief.clientName ?? 'Sans nom')
    // Firestore refuse les undefined : on les retire avant sauvegarde
    const cleanValues = Object.fromEntries(
      Object.entries(values).filter(([, v]) => v !== undefined),
    )
    try {
      await update.mutateAsync({
        briefId: brief.id,
        patch: {
          clientName,
          'client.values': cleanValues,
          status: 'form_filled',
          currentStep: 2,
        } as never,
      })
      onAdvance()
    } catch (err) {
      toast.error('Erreur lors de la sauvegarde')
      console.error(err)
    }
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Enter' || e.shiftKey || e.ctrlKey || e.metaKey) return
      if (update.isPending) return
      const tag = (e.target as HTMLElement)?.tagName
      if (tag === 'TEXTAREA') return
      e.preventDefault()
      e.stopPropagation()
      handleNext()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
     
  }, [values, update.isPending])

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-2xl mx-auto">
          <h2 className="text-[14px] font-semibold text-white/80 mb-1">
            Informations client
          </h2>
          <p className="text-[12px] text-white/40 mb-6">
            Remplissez les champs ci-dessous. Les champs marqués d'un astérisque sont obligatoires.
          </p>
          <DynamicFormRenderer
            fields={ensureClientWebsiteUrlField(ensureBrandKitField(brief.client.formTemplateSnapshot))}
            values={values}
            onChange={handleChange}
            briefId={brief.id}
          />
        </div>
      </div>
      <div className="border-t border-white/[0.06] bg-[#141414] px-6 py-3 flex justify-end shrink-0">
        <button
          onClick={handleNext}
          disabled={update.isPending}
          className="flex items-center gap-1.5 text-[12px] text-white bg-indigo-500 hover:bg-indigo-600 px-4 py-2 rounded-md disabled:opacity-50"
        >
          Étape suivante
          <ArrowRight className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  )
}
