// Champ couleur standard du kit : encapsule le ColorPicker popover partagé.
// value '' = hérité → on affiche `inherit` (repli) mais on patch la valeur brute.
import { ColorPicker } from '@/components/shared/ColorPicker'

export function ColorField({ label, value, inherit, onChange }: {
  label: string; value: string; inherit?: string; onChange: (v: string) => void
}) {
  return <ColorPicker label={label} value={value || inherit || '#000000'} onChange={onChange} />
}
