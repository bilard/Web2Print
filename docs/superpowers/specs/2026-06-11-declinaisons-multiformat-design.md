# Déclinaisons multi-format — design

## V1 livrée (2026-06-11) — « Pack social » à l'export
Format **« Pack social »** dans la fenêtre Exporter : le design est rendu une
fois pleine page (2×, sans grille ni marques) puis posé en **contain centré**
sur chaque format cible, fond = couleur de page :
- Post carré 1080×1080, Story/Reel 1080×1920, Post paysage 1920×1080, Bannière 1500×500.
- Livraison en zip (`<titre>_pack_social.zip`).
- Implémentation : `src/features/export/useExportSocialPack.ts` (PACK_TARGETS exporté).

Limite assumée : pas de re-layout — sur des ratios très différents (bannière),
le design est letterboxé sur la couleur de page.

## V2 — re-layout adaptatif (à valider avant implémentation)
Objectif : recomposer réellement le design par format au lieu de letterboxer.
Pistes :
1. **Zones sémantiques** : réutiliser les rôles du re-skin (prix/titre/visuel/logo,
   cf. `features/merge/autoMatch.ts` + `semanticLayout`) pour identifier les blocs.
2. **Gabarits par ratio** : pour chaque format cible, un gabarit de placement
   (story = vertical stack ; bannière = horizontal) où les blocs sont re-projetés ;
   le fond est régénéré via Nano Banana au ratio cible (même mécanique que
   `RegenerateBgPanel`, avec `aspectRatio` cible).
3. **Édition post-déclinaison** : chaque déclinaison devient un document/page
   éditable (pas un PNG), pour ajustement manuel avant export.

Questions ouvertes (à trancher avec l'utilisateur) : coût NB2 par pack (4 fonds),
formats cibles configurables, où vivent les déclinaisons (pages du même doc ?
nouveaux projets ?).
