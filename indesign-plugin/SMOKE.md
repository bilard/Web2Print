# Smoke test — Plugin Web2Print pour InDesign

Pré-requis : InDesign v18+, plugin chargé via UDT (UXP Developer Tool), un dataSet
existant dans Web2Print, un token généré (Réglages → Connecteurs → Token plugin).

1. **Connexion** : ouvrir le panneau Web2Print, coller le token, « Connecter ».
   → la liste des dataSets se remplit. (Token invalide → message d'erreur.)
2. **Champs live** : choisir un dataSet → la liste des champs s'affiche.
3. **Balisage** : sélectionner un bloc texte → cliquer un champ → l'indicateur ✓ apparaît.
   Vérifier dans Affichage → Structure que l'élément XML porte le bon tag.
4. **Aperçu ON** : cocher « Aperçu » → le contenu des blocs tagués affiche les
   valeurs de la ligne 1. Naviguer ◀ ▶ → les valeurs changent.
5. **Aperçu OFF** : décocher → le contenu maquette d'origine revient.
6. **Restaurer tout** : cliquer → chaque bloc tagué affiche `{{Champ}}`.
7. **Export round-trip** : Fichier → Exporter → IDML. Importer l'IDML dans Web2Print.
   → les `{{Champ}}` sont détectés et liés aux colonnes du dataSet (fusion OK).
8. **Révocation** : révoquer le token dans Web2Print → re-tenter une action dans le
   plugin → erreur 401 attendue.
