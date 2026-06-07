import { ChevronRight } from 'lucide-react'
import type { DiscoverSlide } from './discover.types'

interface DiscoverSlideViewProps {
  slide: DiscoverSlide
}

/** Rendu d'une slide selon son `kind`. Pleine surface, centrée, dark mode. */
export function DiscoverSlideView({ slide }: DiscoverSlideViewProps) {
  const { icon: Icon, palette: p } = slide
  return (
    <div className="relative h-full w-full overflow-hidden flex items-center justify-center px-12">
      {/* Halo d'accent */}
      <div
        className={`pointer-events-none absolute -top-1/3 left-1/2 -translate-x-1/2 h-[60vh] w-[60vh] rounded-full bg-gradient-to-b ${p.glow} to-transparent blur-3xl opacity-60`}
        aria-hidden="true"
      />

      <div className="relative w-full max-w-4xl">
        {/* En-tête commun */}
        <div className="flex items-center gap-3 mb-5">
          <span className={`flex items-center justify-center w-11 h-11 rounded-xl border ${p.border} ${p.bg}`}>
            <Icon className={`w-5 h-5 ${p.text}`} />
          </span>
          <div>
            <p className={`text-[11px] font-bold tracking-[0.18em] ${p.textSoft}`}>{slide.eyebrow}</p>
            {slide.sector && <p className="text-[13px] font-medium text-white/50">{slide.sector}</p>}
          </div>
        </div>

        <h2 className="text-4xl font-bold tracking-[-0.02em] text-[#F2F2F2] leading-tight">{slide.title}</h2>
        {slide.subtitle && <p className="mt-4 text-lg text-white/45 leading-relaxed max-w-2xl">{slide.subtitle}</p>}

        {/* Chaîne (overview) */}
        {slide.steps && (
          <div className="mt-10 flex flex-wrap items-center gap-2">
            {slide.steps.map((step, i) => (
              <div key={step} className="flex items-center gap-2">
                <span className={`px-4 py-2 rounded-lg border ${p.border} ${p.bg} text-sm font-medium ${p.text}`}>
                  {step}
                </span>
                {i < slide.steps!.length - 1 && <ChevronRight className="w-4 h-4 text-white/25" />}
              </div>
            ))}
          </div>
        )}

        {/* Modules → bénéfices (secteur) */}
        {slide.bullets && (
          <ul className="mt-9 space-y-4">
            {slide.bullets.map((b) => (
              <li key={b.module} className="flex gap-4">
                <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${p.dot}`} aria-hidden="true" />
                <div>
                  <span className={`text-sm font-semibold ${p.text}`}>{b.module}</span>
                  <span className="text-white/30"> — </span>
                  <span className="text-[15px] text-white/60">{b.text}</span>
                </div>
              </li>
            ))}
          </ul>
        )}

        {/* Puces modules */}
        {slide.modules && (
          <div className="mt-9 flex flex-wrap gap-2">
            {slide.modules.map((m) => (
              <span
                key={m}
                className="px-3 py-1.5 rounded-full border border-white/[0.08] bg-white/[0.03] text-[12px] font-medium text-white/55"
              >
                {m}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
