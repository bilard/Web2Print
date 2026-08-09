// Le compteur unitaire des bandeaux de mesure de l'explorateur. Partagé entre la ligne
// « concurrent » et la ligne « Mon catalogue » : deux bandeaux qui se ressemblent à
// l'écran mais divergent dans le code finissent par ne plus se ressembler.

/** Un compteur. Avec `onToggle`, il devient un FILTRE : cliquer restreint la liste à ce
 *  qu'il mesure — un chiffre qui intrigue doit pouvoir être ouvert, pas seulement lu. */
export function Stat({ label, value, tone = 'text-white/80', hint, onToggle, active }: {
  label: string; value: string; tone?: string; hint?: string
  onToggle?: () => void; active?: boolean
}) {
  const body = (
    <>
      <span className={`text-[10px] uppercase tracking-wide ${active ? 'text-white/60' : 'text-white/30'}`}>{label}</span>
      <span className={`text-xs font-medium tabular-nums ${tone}`}>{value}</span>
    </>
  )
  if (!onToggle) {
    return <div className="flex items-baseline gap-1.5 whitespace-nowrap" title={hint}>{body}</div>
  }
  return (
    <button type="button" onClick={onToggle} title={hint}
      className={`flex items-baseline gap-1.5 whitespace-nowrap rounded px-1.5 py-0.5 -mx-1 border transition-colors ${
        active ? 'bg-white/[0.07] border-white/15' : 'border-transparent hover:bg-white/[0.05]'
      }`}>
      {body}
    </button>
  )
}
