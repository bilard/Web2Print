# Web2Print Capture — Extension Chrome

Extension Manifest V3 qui permet à Web2Print d'injecter son mode capture directement dans un onglet natif. Évite le rendu dégradé de l'iframe (polices custom, icon-fonts).

## Build

```bash
npm run build:ext
```

Produit `extension/dist/` (à charger dans Chrome).

## Side-load en dev

1. Ouvrir `chrome://extensions`
2. Activer **Mode développeur** (toggle en haut à droite)
3. Cliquer **Charger l'extension non empaquetée**
4. Sélectionner le dossier `extension/dist/`
5. Copier l'**ID de l'extension** affiché sous le nom (ex : `abcdef…`)

## Configuration Web2Print

Créer / éditer `/Applications/_IA/Claude_workspace/Web2Print/.env.local` :

```
VITE_CHROME_EXTENSION_ID=<l'ID copié à l'étape 5>
```

Relancer `npm run dev`. Dans le Scraping Hub → n'importe quel template, l'éditeur visuel affichera un bouton **« Ouvrir dans Chrome & tagger »** (vert) à côté du bouton **Charger**.

## Utilisation

1. Saisir l'URL du produit dans le champ source du template.
2. Cliquer **Ouvrir dans Chrome & tagger** → un nouvel onglet s'ouvre avec la page réelle (polices natives, JS exécuté).
3. Un bandeau « Onglet Chrome actif » s'affiche dans le Scraping Hub.
4. Dans l'onglet source : **double-clic** pour capturer un élément (simple-clic navigue, accordéons ouvrent…).
5. La modal de mappage apparaît dans Web2Print → assigner à un field.
6. Les surbrillances multi-couleurs suivent en temps réel dans l'onglet.

## Désinstaller / désactiver

`chrome://extensions` → interrupteur de l'extension. Web2Print bascule automatiquement sur le mode iframe (fallback).

## Permissions expliquées

- `activeTab` + `scripting` : injecter le script de capture à la demande.
- `tabs` : ouvrir / fermer l'onglet de capture.
- `host_permissions: <all_urls>` : l'utilisateur saisit des URLs de fournisseurs variés ; pas de liste fixe possible.
- `storage` : mémoriser l'état de connexion pour la popup.
- `externally_connectable` : seules les origines Web2Print connues (`localhost:5173/4173`, `web2print-6fe5a.web.app`, `web2print-6fe5a.firebaseapp.com`) peuvent communiquer avec l'extension.
