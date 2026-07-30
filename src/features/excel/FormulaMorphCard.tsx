import { useMemo } from 'react'
import { FileSpreadsheet, Calculator, ArrowDown } from 'lucide-react'
import type { FormulaConversion } from './excelFormulas'
import { t } from '@/lib/i18n'

/** Palette assignée aux références de colonne pour des chips distinctes et lisibles. */
const REF_COLORS = ['#6366f1', '#10b981', '#f59e0b', '#0ea5e9', '#f43f5e', '#a855f7']

type IbsTok = { ref: boolean; v: string }

/** Découpe la formule IBS en jetons : `[Label]` = référence (chip), le reste = texte mono. */
function parseIbsTokens(formula: string): IbsTok[] {
  const out: IbsTok[] = []
  const re = /\[[^\]]+\]/g
  let last = 0
  let m: RegExpExecArray | null
  while ((m = re.exec(formula))) {
    if (m.index > last) out.push({ ref: false, v: formula.slice(last, m.index) })
    out.push({ ref: true, v: m[0].slice(1, -1) })
    last = m.index + m[0].length
  }
  if (last < formula.length) out.push({ ref: false, v: formula.slice(last) })
  return out
}

function formatResult(v: FormulaConversion['sampleResult']): string {
  if (typeof v === 'number') return Number.isInteger(v) ? String(v) : v.toFixed(2)
  return v == null ? '—' : String(v)
}

/** Rendu de la formule Excel brute avec surbrillance des références de cellule (E2, L2…). */
function ExcelFormula({ text }: { text: string }) {
  const parts = text.split(/([A-Za-z]{1,3}\d+)/g)
  return (
    <code className="text-[13px] font-mono text-emerald-300/90 leading-relaxed">
      {parts.map((p, i) =>
        /^[A-Za-z]{1,3}\d+$/.test(p) ? (
          <span key={i} className="fx-scan rounded px-0.5 text-emerald-200">{p}</span>
        ) : (
          <span key={i}>{p}</span>
        ),
      )}
    </code>
  )
}

export function FormulaMorphCard({ conv }: { conv: FormulaConversion }) {
  // Couleur stable par référence distincte (ordre d'apparition).
  const refColor = useMemo(() => {
    const map = new Map<string, string>()
    for (const t of parseIbsTokens(conv.ibsFormula)) {
      if (t.ref && !map.has(t.v)) map.set(t.v, REF_COLORS[map.size % REF_COLORS.length])
    }
    return map
  }, [conv.ibsFormula])

  const tokens = useMemo(() => parseIbsTokens(conv.ibsFormula), [conv.ibsFormula])

  return (
    <div className="w-full flex flex-col items-center gap-2.5">
      {/* En-tête colonne */}
      <div className="fx-rise flex items-center gap-2 px-3 py-1 rounded-full bg-white/5 border border-white/10">
        <span className="text-[10px] uppercase tracking-wider font-semibold text-white/50">{conv.label}</span>
      </div>

      {/* Cellule Excel source */}
      <div className="fx-rise relative w-full max-w-md overflow-hidden rounded-xl border border-emerald-500/20 bg-emerald-500/[0.04] px-4 py-3">
        <div className="flex items-center gap-2 mb-1.5">
          <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-400" />
          <span className="text-[10px] text-emerald-300/70 font-medium">Formule Excel</span>
        </div>
        <ExcelFormula text={conv.excelFormula} />
        {/* Faisceau de scan */}
        <div className="fx-beam pointer-events-none absolute inset-x-0 top-0 h-8 bg-gradient-to-b from-indigo-400/0 via-indigo-400/25 to-indigo-400/0" />
      </div>

      {/* Transition */}
      <div className="fx-rise flex items-center gap-1.5 text-[10px] text-indigo-300/70" style={{ animationDelay: '0.15s' }}>
        <ArrowDown className="w-3.5 h-3.5 animate-bounce" />
        Conversion en champ calculé
      </div>

      {/* Carte IBS Studio */}
      <div className="fx-pop w-full max-w-md rounded-xl border border-indigo-500/30 bg-indigo-500/[0.07] px-4 py-3 shadow-lg shadow-indigo-500/10" style={{ animationDelay: '0.25s' }}>
        <div className="flex items-center gap-2 mb-2">
          <div className="w-5 h-5 rounded-md bg-indigo-500/20 flex items-center justify-center">
            <Calculator className="w-3 h-3 text-indigo-300" />
          </div>
          <span className="text-[10px] text-indigo-200/80 font-medium">Formule IBS Studio</span>
        </div>
        <div className="flex flex-wrap items-center gap-1 font-mono text-[13px] leading-relaxed">
          {tokens.map((t, i) =>
            t.ref ? (
              <span
                key={i}
                className="fx-pop inline-flex items-center rounded px-1.5 py-0.5 text-[12px] font-medium border"
                style={{
                  animationDelay: `${0.3 + i * 0.06}s`,
                  color: refColor.get(t.v),
                  backgroundColor: `${refColor.get(t.v)}1a`,
                  borderColor: `${refColor.get(t.v)}40`,
                }}
              >
                {t.v}
              </span>
            ) : (
              <span key={i} className="text-white/80 whitespace-pre">{t.v}</span>
            ),
          )}
        </div>
        {/* Résultat réel */}
        <div className="fx-result mt-2.5 flex items-center gap-2 text-[11px]" style={{ animationDelay: '0.7s' }}>
          <span className="text-white/30">{t('xl.result')}</span>
          <ArrowDown className="w-3 h-3 text-white/20 -rotate-90" />
          <span className="font-mono font-semibold text-emerald-400">{formatResult(conv.sampleResult)}</span>
        </div>
      </div>
    </div>
  )
}
