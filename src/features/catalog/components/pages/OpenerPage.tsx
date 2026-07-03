// Affiche d'ouverture d'univers : numéro de chapitre géant, titre, compteur,
// puis la carte du contenu — familles (avec compte) et chips de sous-familles.
import type { OpenerFamily } from '../../catalogTypes'

interface Props {
  label: string
  catalogName: string
  index: number
  productCount: number
  families: OpenerFamily[]
}

export function OpenerPage({ label, catalogName, index, productCount, families }: Props) {
  return (
    <div className="cat-opener">
      <div className="cat-opener-stripe" />
      <div className="cat-opener-stripe2" />
      <div className="cat-opener-num">{String(index).padStart(2, '0')}</div>
      <div className="cat-opener-kicker">{catalogName}</div>
      <h2 className="cat-opener-title">{label}</h2>
      <div className="cat-opener-count"><b>{productCount}</b>produit{productCount > 1 ? 's' : ''}</div>
      <div className="cat-opener-rule" />
      {families.length > 0 && (
        <div className="cat-opener-fams">
          {families.map((fam, i) => (
            <div key={fam.label} className="cat-opener-fam">
              <div className="cat-opener-fam-name">
                <span className="cat-opener-fam-idx">{String(i + 1).padStart(2, '0')}</span>
                {fam.label}
              </div>
              <div className="cat-opener-fam-count">{fam.count} produit{fam.count > 1 ? 's' : ''}</div>
              {fam.subs.length > 0 && (
                <div className="cat-opener-subs">
                  {fam.subs.map((sub) => <span key={sub} className="cat-opener-sub">{sub}</span>)}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
