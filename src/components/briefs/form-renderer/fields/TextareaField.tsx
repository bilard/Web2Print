import { Sparkles, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import type { ClientFormField } from '@/features/taxonomy/types'
import { useImproveBriefPrompt } from '@/features/briefs/ai/useImproveBriefPrompt'

interface Props {
  field: ClientFormField
  value: string | undefined
  onChange: (value: string) => void
  disabled?: boolean
}

export function TextareaField({ field, value, onChange, disabled }: Props) {
  const improve = useImproveBriefPrompt()
  const canImprove = field.key === 'contextSummary'

  const handleImprove = async () => {
    const current = (value ?? '').trim()
    if (!current) {
      toast.error('Saisissez d’abord un brief à améliorer.')
      return
    }
    try {
      const improved = await improve.mutateAsync(current)
      onChange(improved)
      toast.success('Brief amélioré par Claude')
    } catch (err) {
      console.error(err)
      toast.error(err instanceof Error ? err.message : 'Erreur lors de l’amélioration')
    }
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <label className="text-[12px] text-white/70">
          {field.label}
          {field.required && <span className="text-red-400 ml-1">*</span>}
        </label>
        {canImprove && (
          <button
            type="button"
            onClick={handleImprove}
            disabled={disabled || improve.isPending}
            title="Améliorer le brief avec Claude"
            className="flex items-center gap-1 text-[11px] text-indigo-300 hover:text-indigo-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {improve.isPending ? (
              <Loader2 className="w-3 h-3 animate-spin" />
            ) : (
              <Sparkles className="w-3 h-3" />
            )}
            {improve.isPending ? 'Amélioration…' : 'Améliorer avec Claude'}
          </button>
        )}
      </div>
      <textarea
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value)}
        placeholder={field.placeholder}
        disabled={disabled || improve.isPending}
        rows={4}
        className="bg-[#0f0f0f] border border-white/[0.08] rounded-md px-3 py-2 text-[13px] text-white placeholder:text-white/25 focus:outline-none focus:border-indigo-500/60 disabled:opacity-50 resize-y"
      />
      {field.helpText && (
        <p className="text-[11px] text-white/40">{field.helpText}</p>
      )}
    </div>
  )
}
