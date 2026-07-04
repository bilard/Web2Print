// Affiche d'ouverture d'univers : chip « chapitre », numéro XXL en filigrane,
// titre, compteur, puis un PANNEAU contrasté (fond de page sur bandeau sombre)
// listant les familles + chips de sous-familles — ou un extrait de la gamme
// (noms produits) quand l'univers n'a pas de familles.
import type { CatalogPageStyle, OpenerFamily } from '../../catalogTypes'

interface Props {
  label: string
  catalogName: string
  index: number
  productCount: number
  families: OpenerFamily[]
  highlights: string[]
  /** Style des éléments de page (FUSIONNÉ avec les défauts par l'appelant). */
  pageStyle: CatalogPageStyle
}

export function OpenerPage({ label, catalogName, index, productCount, families, highlights, pageStyle: ps }: Props) {
  return (
    <div className="cat-opener">
      <div className="cat-opener-stripe" />
      <div className="cat-opener-stripe2" />
      {ps.showOpenerNum && <div className="cat-opener-num">{String(index).padStart(2, '0')}</div>}
      {ps.showOpenerChip && <div className="cat-opener-chip">Chapitre {String(index).padStart(2, '0')}</div>}
      <div className="cat-opener-kicker">{catalogName}</div>
      <h2 className="cat-opener-title">{label}</h2>
      {ps.showOpenerCount && <div className="cat-opener-count"><b>{productCount}</b>produit{productCount > 1 ? 's' : ''}</div>}
      {ps.showOpenerPanel && families.length > 0 ? (
        <div className="cat-opener-panel">
          <div className="cat-opener-panel-title">Dans ce chapitre</div>
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
        </div>
      ) : ps.showOpenerPanel && highlights.length > 0 ? (
        <div className="cat-opener-panel">
          <div className="cat-opener-panel-title">Aperçu de la gamme</div>
          <div className="cat-opener-hls">
            {highlights.map((name) => <span key={name} className="cat-opener-hl">{name}</span>)}
          </div>
        </div>
      ) : null}
    </div>
  )
}
