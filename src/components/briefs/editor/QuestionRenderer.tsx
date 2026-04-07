import type { DynamicQuestion } from '@/features/taxonomy/types'

interface Props {
  questions: DynamicQuestion[]
  values: Record<string, unknown>
  onChange: (id: string, value: unknown) => void
}

const baseInput =
  'bg-[#0f0f0f] border border-white/[0.08] rounded-md px-3 py-2 text-[13px] text-white placeholder:text-white/25 focus:outline-none focus:border-indigo-500/60'

export function QuestionRenderer({ questions, values, onChange }: Props) {
  return (
    <div className="flex flex-col gap-5">
      {questions.map((q) => (
        <div key={q.id} className="flex flex-col gap-1.5">
          <label className="text-[12px] text-white/70">
            {q.label}
            {q.required && <span className="text-red-400 ml-1">*</span>}
          </label>
          {renderField(q, values[q.id], (v) => onChange(q.id, v))}
          {q.helpText && <p className="text-[11px] text-white/40">{q.helpText}</p>}
        </div>
      ))}
    </div>
  )
}

function renderField(
  q: DynamicQuestion,
  value: unknown,
  onChange: (v: unknown) => void,
) {
  switch (q.type) {
    case 'text':
      return (
        <input
          type="text"
          value={(value as string) ?? ''}
          onChange={(e) => onChange(e.target.value)}
          className={baseInput}
        />
      )
    case 'number':
      return (
        <input
          type="number"
          value={(value as number | undefined) ?? ''}
          onChange={(e) => onChange(e.target.value === '' ? undefined : Number(e.target.value))}
          className={baseInput}
        />
      )
    case 'select':
      return (
        <select
          value={(value as string) ?? ''}
          onChange={(e) => onChange(e.target.value)}
          className={baseInput}
        >
          <option value="">—</option>
          {(q.options ?? []).map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      )
    case 'multiselect': {
      const arr = (value as string[]) ?? []
      const toggle = (opt: string) => {
        if (arr.includes(opt)) onChange(arr.filter((o) => o !== opt))
        else onChange([...arr, opt])
      }
      return (
        <div className="flex flex-wrap gap-2">
          {(q.options ?? []).map((opt) => {
            const on = arr.includes(opt)
            return (
              <button
                key={opt}
                type="button"
                onClick={() => toggle(opt)}
                className={`text-[12px] px-2.5 py-1 rounded-md border ${
                  on
                    ? 'bg-indigo-500/20 border-indigo-500/60 text-white'
                    : 'bg-[#0f0f0f] border-white/[0.08] text-white/60 hover:text-white/90'
                }`}
              >
                {opt}
              </button>
            )
          })}
        </div>
      )
    }
    case 'boolean':
      return (
        <label className="flex items-center gap-2 text-[12px] text-white/70 cursor-pointer">
          <input
            type="checkbox"
            checked={Boolean(value)}
            onChange={(e) => onChange(e.target.checked)}
            className="w-4 h-4 accent-indigo-500"
          />
          Oui
        </label>
      )
  }
}
