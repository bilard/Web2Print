# PIM — Extension Chrome de capture de template

Capture visuellement les sélecteurs CSS d'une fiche produit fabricant pour générer un template de scraping réutilisable dans le PIM.

## Pourquoi une extension (vs éditeur web)

L'éditeur web intégré au PIM charge la page source dans un iframe `srcdoc`, mais :

- Les polices et icônes webfont ne chargent pas (CORS sur `@font-face`)
- Les SPA fortement JS-dépendants (Milwaukee, Grundfos) ne rendent pas leur contenu dynamique

L'extension Chrome résout tout : tu restes sur le **vrai site**, CSS/JS/polices nominaux, full hydration. L'overlay de capture s'injecte par-dessus sans rien modifier.

## Installation (1 min)

1. Ouvre `chrome://extensions/`
2. Active **Mode développeur** (coin supérieur droit)
3. Clique **Charger l'extension non empaquetée**
4. Sélectionne le dossier `chrome-extension/` de ce projet
5. Épingle l'icône à la barre d'outils (facultatif)

## Utilisation

1. Navigue sur une fiche produit fabricant (ex: `https://www.nicoll.fr/fr/caniveau-.../kenadrain`)
2. Clique l'icône de l'extension → popup
3. **Renseigne** le nom du template et le domaine (auto-détecté)
4. Clique **▶ Activer la capture**
5. **Survole** un élément dans la page (highlight violet) et **clique** dessus
6. Dans le popup : choisis un sélecteur parmi les 3 proposés, assigne-le à un champ (Titre, Description, Images, …)
7. Coche **Liste** si c'est un champ multi-valeurs (images, specs, variantes)
8. Répète pour tous les champs à mapper
9. Clique **⬇ Exporter JSON**

## Import dans le PIM

1. Ouvre le PIM : Dashboard → **Templates scraping**
2. Clique **Nouveau** (un template vierge se crée)
3. Clique **Importer** et sélectionne le fichier JSON exporté
4. Vérifie et clique **Enregistrer**

À partir de ce moment, chaque produit enrichi dont l'URL matche le domaine du template passe par l'extraction déterministe (sans LLM).

## Champs standards

Le popup propose 9 champs pré-configurés : Titre, Description, Marque, Référence, Prix, EAN, Images, Documents, Avantages. Tu peux aussi définir un **nom custom** pour tes propres champs.

## Actions préalables (à venir Phase 3)

Pour les SPA avec accordéons lazy (Milwaukee, Grundfos), il faudra exécuter des actions avant la capture : click sur "Spécifications", scroll, wait. Cette fonctionnalité est prévue dans le template engine (`template.preActions[]`) mais pas encore exposée dans l'extension. D'ici là, tu peux déplier manuellement les sections avant d'activer la capture.

## Limitations connues

- Le JSON exporté ne contient pas de `specGroups` (pattern complexe) : capture les paires de specs une par une via le champ `custom` si besoin. Le template engine côté PIM supporte déjà les `specGroups` définis via JSON, donc tu peux les ajouter manuellement dans l'éditeur PIM après import.
- Pas encore d'auth Firebase intégrée dans l'extension : l'export JSON + import manuel est la voie pour la v0.1. La v0.2 ajoutera une sync directe Firestore.

## Structure du projet

```
chrome-extension/
├── manifest.json        Manifest V3 + permissions
├── background.js        Service worker, buffer des captures
├── content.js           Overlay de capture (hover + click)
├── popup.html           UI
├── popup.js             Logique du popup
├── icons/               16, 48, 128
└── README.md
```
