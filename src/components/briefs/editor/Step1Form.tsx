import { useState } from 'react'
import { ArrowRight } from 'lucide-react'
import { toast } from 'sonner'
import { DynamicFormRenderer } from '@/components/briefs/form-renderer/DynamicFormRenderer'
import { useUpdateBrief } from '@/features/briefs/useBriefMutations'
import type { Brief } from '@/features/briefs/types'

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
      (f) => f.required && !values[f.key],
    )
    if (missing.length > 0) {
      toast.error(`Champs obligatoires manquants : ${missing.map((f) => f.label).join(', ')}`)
      return
    }
    const clientName = String(values.companyName ?? brief.clientName ?? 'Sans nom')
    try {
      await update.mutateAsync({
        briefId: brief.id,
        patch: {
          clientName,
          'client.values': values,
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
            fields={brief.client.formTemplateSnapshot}
            values={values}
            onChange={handleChange}
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
