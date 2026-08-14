// Ce qu'est un MODÈLE de tableau de bord : des tuiles et une mise en page, écrites une fois
// pour toutes, que l'utilisateur ouvre au lieu de partir d'une page blanche.
//
// ⚠⚠ Un modèle n'est PAS un `Dashboard` : celui-ci porte des champs qui n'existent qu'à
// l'exécution (identifiant, société, espace de travail, auteur, horodatages). Le modèle
// décrit la partie STABLE, `buildDashboard` y ajoute le contexte — c'est ce qui le garde pur
// et testable sans base ni React.
//
// ⚠⚠ Les titres de tuiles sont des CLÉS, pas des phrases : `Tile.title` est persisté tel quel
// en base, il doit donc être traduit AU CLIC, dans la langue de lecture du moment (et avec
// les surcharges de vocabulaire du compte, hydratées après le premier rendu). Un `t()` de
// module figerait la langue à l'import.
import type { TranslationKey } from '@/lib/i18n'
import type { FilterClause, SourceId, Tile, TilePlacement } from '../types'

/** Une tuile de modèle : la tuile du contrat, moins son titre, plus la clé de son titre. */
export type TemplateTile = Omit<Tile, 'title'> & { titleKey: TranslationKey }

/** Une page de modèle : ses tuiles et leur mise en page (grille de 12 colonnes). */
export interface TemplatePage {
  nameKey: TranslationKey
  tiles: TemplateTile[]
  layout: TilePlacement[]
}

/** Ce qui distingue un modèle d'un autre. Sert d'identifiant de document (voir `templateDocId`). */
export type TemplateKey = 'watchGaps' | 'catalogCoverage' | 'pimCompleteness'

export interface DashboardTemplate {
  key: TemplateKey
  nameKey: TranslationKey
  /** Ce que le modèle montre, en UNE phrase — c'est le texte de la carte d'accueil. */
  descKey: TranslationKey
  /**
   * Sources dont le modèle a besoin, dans l'ordre où la carte les annonce.
   *
   * ⚠ La carte s'en sert pour DIRE ce qui manque : un modèle de veille ouvert sans le moindre
   * suivi afficherait des cadres vides, ce qui se lit comme une panne.
   */
  sources: SourceId[]
  pages: TemplatePage[]
  /** Filtres globaux du tableau de bord. Vides sur les trois modèles livrés. */
  filters: FilterClause[]
}
