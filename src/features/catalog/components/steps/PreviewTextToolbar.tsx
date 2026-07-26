// Barre de PARAGRAPHE du header de l'aperçu (façon éditeur) : gras / italique /
// souligné + alignement, appliqués au BLOC TEXTE SÉLECTIONNÉ dans l'aperçu.
// Écrit cardStyle.textStyle[obj] — rendu identique aperçu / catalogue / export.
import { AlignCenter, AlignJustify, AlignLeft, AlignRight, Bold, Italic, Underline } from 'lucide-react'
import type { CardObjectId, CardTextStyle, CatalogCardStyle } from '../../catalogTypes'

interface Props {
  /** Bloc sélectionné dans l'aperçu — la barre n'apparaît que pour un bloc texte. */
  obj: CardObjectId | null
  style: CatalogCardStyle
  patch: (p: Partial<CatalogCardStyle>) => void
}

const ALIGNS: { key: NonNullable<CardTextStyle['align']>; icon: typeof AlignLeft; title: string }[] = [
  { key: 'l', icon: AlignLeft, title: 'Aligner à gauche' },
  { key: 'c', icon: AlignCenter, title: 'Centrer' },
  { key: 'r', icon: AlignRight, title: 'Aligner à droite' },
  { key: 'j', icon: AlignJustify, title: 'Justifier' },
]

const btnCls = (active: boolean) =>
  `p-1.5 ${active ? 'bg-indigo-600 text-[#fff]' : 'bg-surface-2 text-muted-foreground hover:text-white'}`

export function PreviewTextToolbar({ obj, style, patch }: Props) {
  if (!obj || obj === 'image') return null
  const ts: CardTextStyle = style.textStyle?.[obj] ?? {}
  // Toggle OFF = retour au défaut du template (clé retirée, pas `false` stocké).
  const set = (p: Partial<CardTextStyle>) =>
    patch({ textStyle: { ...(style.textStyle ?? {}), [obj]: { ...ts, ...p } } })
  return (
    <div className="flex items-center gap-2">
      <div className="flex rounded-md overflow-hidden border border-border">
        <button type="button" title="Gras (forcé)" onClick={() => set({ bold: ts.bold ? undefined : true })} className={btnCls(!!ts.bold)}>
          <Bold className="w-3.5 h-3.5" />
        </button>
        <button type="button" title="Italique (forcé)" onClick={() => set({ italic: ts.italic ? undefined : true })} className={btnCls(!!ts.italic)}>
          <Italic className="w-3.5 h-3.5" />
        </button>
        <button type="button" title="Souligné" onClick={() => set({ underline: ts.underline ? undefined : true })} className={btnCls(!!ts.underline)}>
          <Underline className="w-3.5 h-3.5" />
        </button>
      </div>
      <div className="flex rounded-md overflow-hidden border border-border">
        {ALIGNS.map(({ key, icon: Icon, title }) => (
          <button key={key} type="button" title={`${title} (re-cliquer : défaut du template)`}
            onClick={() => set({ align: ts.align === key ? undefined : key })} className={btnCls(ts.align === key)}>
            <Icon className="w-3.5 h-3.5" />
          </button>
        ))}
      </div>
    </div>
  )
}
