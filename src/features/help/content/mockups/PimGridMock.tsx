import { Sparkles } from 'lucide-react'

const rows = [
  { ref: 'NIC-3501', title: 'Caniveau Connecto', brand: 'Nicoll', price: '24,90 €', enriched: true },
  { ref: 'MIL-2503', title: 'Visseuse à choc M18', brand: 'Milwaukee', price: '189,00 €', enriched: true },
  { ref: 'FIS-7218', title: 'Cheville universelle', brand: 'Fischer', price: '5,40 €', enriched: false },
  { ref: 'BOS-4421', title: 'Lame scie sauteuse', brand: 'Bosch', price: '12,30 €', enriched: false },
]

export function PimGridMock() {
  return (
    <div className="w-full max-w-[460px] bg-[#1a1a1a] border border-white/10 rounded-md overflow-hidden pointer-events-none">
      <div className="grid grid-cols-[80px_1fr_90px_70px_28px] gap-0 text-[10px] uppercase tracking-wider text-white/40 border-b border-white/10 bg-[#161616]">
        <div className="px-2.5 py-2">Réf.</div>
        <div className="px-2.5 py-2">Titre</div>
        <div className="px-2.5 py-2">Marque</div>
        <div className="px-2.5 py-2 text-right">Prix</div>
        <div />
      </div>
      {rows.map((r, i) => (
        <div
          key={i}
          className={`grid grid-cols-[80px_1fr_90px_70px_28px] gap-0 text-[11px] border-b border-white/5 ${
            i === 0 ? 'bg-indigo-500/10' : ''
          }`}
        >
          <div className="px-2.5 py-1.5 font-mono text-white/60">{r.ref}</div>
          <div className="px-2.5 py-1.5 text-white/80 truncate">{r.title}</div>
          <div className="px-2.5 py-1.5 text-white/60">{r.brand}</div>
          <div className="px-2.5 py-1.5 text-right font-mono text-white/80">{r.price}</div>
          <div className="flex items-center justify-center">
            {r.enriched && <Sparkles className="w-3 h-3 text-indigo-400" />}
          </div>
        </div>
      ))}
    </div>
  )
}
