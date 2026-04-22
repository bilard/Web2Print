# Guide de Debugging — SVG Overlaps & Zone Analysis

Quand un design généré affiche du texte qui se chevauche ou des zones mal positionnées, utilise ce guide pour diagnostiquer le problème.

## Étape 1: Générer le design et activer le Debug

1. **Remplir le brief** dans le panneau "Claude Design"
2. **Cliquer "Générer"** et attendre la fin (100%)
3. **Dans le modal de résultat**, cliquer le bouton **"Analyser"** (à côté de "Export SVG")

## Étape 2: Lire le rapport dans la console

Ouvrir la console du navigateur : **F12** → onglet **Console**

Tu verras 3 groupes de rapports :

### Group 1: [SVG Analysis] Overlap Detection Report

```
✓ Extracted 5 text zones from SVG
┌─────────────────────────────────────────────┐
│ Zone ID  │ X (mm) │ Y (mm) │ Width │ Height │
├──────────┼────────┼────────┼───────┼────────┤
│ text-0   │ 10.00  │ 20.00  │ 50.12 │ 10.80  │
│ text-1   │ 15.00  │ 22.00  │ 45.30 │  8.60  │
└─────────────────────────────────────────────┘
```

**Interprétation:**
- `text-0` occupe X=10–60 mm, Y=20–31 mm
- `text-1` occupe X=15–60 mm, Y=22–31 mm
- **Chevauchement détecté:** X=15–60 mm, Y=22–31 mm (recouvrement total en X)

### Group 2: [SVG Debug] Art Director Plan (Planned Zones)

```
┌──────────┬────────┬───────┬────────┬────────┬────────────────┐
│ Zone ID  │ Role   │ X (mm)│ Y (mm) │ W (mm) │ H (mm) │ Fill  │
├──────────┼────────┼───────┼────────┼────────┼────────┼───────┤
│ title    │ title  │ 10.00 │ 20.00  │ 50.00  │ 10.00  │ #333  │
│ body     │ body   │ 10.00 │ 32.00  │ 50.00  │ 20.00  │ #666  │
└──────────┴────────┴───────┴────────┴────────┴────────┴───────┘
```

**Interprétation:**
- Art Director a prévu `title` à Y=20–30 mm et `body` à Y=32–52 mm (10 mm de séparation)
- Les plans *ne se chevauchent pas*

### Group 3: [SVG Debug] Plan vs SVG Comparison

```
┌──────────┬────────────────┬─────────┬──────────┬───────────┐
│ Zone     │ Planned X,Y    │ Matched │ Δx,Δy    │ Δw,Δh     │
├──────────┼────────────────┼─────────┼──────────┼───────────┤
│ title    │ 10.0, 20.0     │ ✓       │  0.0, 0.0│ 0.1, 0.8  │
│ body     │ 10.0, 32.0     │ ✗       │ N/A      │ N/A       │
│ subtitle │ 10.0, 31.0     │ ✓       │  5.0, 1.0│ -5.0, 2.3 │
└──────────┴────────────────┴─────────┴──────────┴───────────┘
```

**Interprétation:**
- `title`: ✓ Matched, déviation minime (0.8 mm en hauteur)
- `body`: ✗ Non trouvée dans le SVG (zone manquante !)
- `subtitle`: ✓ Matched, mais +5 mm en X et hauteur +2.3 mm (déviation significative)

## Diagnostic: Identifier la Cause Racine

### Cas 1: Chevauchements détectés + Plan prévoit une séparation

**Cause probable:** SVG Engineer n'a pas suivi le plan

**Vérification:**
1. Regarder la colonne "Plan vs SVG Comparison" pour les zones mal positionnées
2. Chercher les zones avec Δx ou Δy > 2 mm
3. Chercher les ✗ (zones non matchées)

**Solution:**
- Améliorer le prompt du SVG Engineer pour mieux respecter les coordonnées du plan
- Ajouter une validation post-génération qui rejette les layouts invalides

### Cas 2: Zones manquantes (✗ dans la comparaison)

**Cause probable:** SVG Engineer a oublié de générer certaines zones

**Vérification:**
1. Compter les zones dans le plan vs le SVG
2. Identifier les rôles manquants

**Solution:**
- Ajouter une contrainte "zone list must match plan exactly"
- Valider que chaque zone du plan est présente dans le SVG

### Cas 3: Plan prévoit du chevauchement

**Cause probable:** Bug dans le plan Art Director

**Vérification:**
1. Dans le Group 2, chercher deux zones avec des Y overlaps
2. Vérifier si c'était intentionnel

**Solution:**
- Améliorer le prompt Art Director pour garantir une séparation minimale

## Étape 3: Exporter et Inspecter le SVG brut

Si tu veux analyser le SVG manuellement:

1. Cliquer **"Export SVG"** pour télécharger le fichier
2. Ouvrir dans un éditeur (VSCode, Notepad++)
3. Rechercher les éléments `<text>` et vérifier les attributs `x`, `y`, `font-size`

Exemple:
```xml
<text x="10" y="20" font-size="12" font-family="Arial">Title Text</text>
<text x="15" y="22" font-size="10" font-family="Arial">Body Text</text>
```

Les Y qui se chevauchent (20 vs 22) + hauteurs qui se croisent → chevauchement confirmé

## Console Shortcut: Copy Full SVG

Tu peux aussi faire dans la console:

```javascript
// Accéder à l'état React (si exposé)
// Copier directement le SVG pour inspection
copy(document.querySelector('[data-svg]')?.innerHTML)
```

Ou vérifier le DOM du canvas Fabric pour voir comment les éléments sont rendus.

## Rapport de Bug: Fournir le Contexte

Quand signaler un bug de chevauchement:

```
❌ **Problème:** Texte qui se chevauche sur le canvas
📸 Screenshot: [Image #4]
🔍 Debug Report:
   - Zones extraites: 7
   - Chevauchements détectés: 3
   - Plan vs SVG: 2 zones mal positionnées (Δx > 3mm)
   - Zones manquantes: 1 (role=price)
🎯 Cause suspectée: SVG Engineer ignore les coordonnées du plan
📥 SVG export: [design.svg file]
```

---

## Troubleshooting

### Le rapport dit "0 overlaps detected" mais je vois du chevauchement

**Cause probable:** L'estimation de largeur de texte est inexacte

**Solution:**
1. Exporter le SVG et vérifier manuellement les `<text>` elements
2. Comparer les attributs `x`, `y`, `font-size` avec les dimensions réelles

### Le bouton "Analyser" ne fait rien

**Cause probable:** Pas de SVG généré encore

**Vérification:**
- Être sûr que step === 'done' (modal montre "Design prêt")
- Ouvrir la console pour voir les erreurs

### Le Plan vs SVG montre tous ✗

**Cause probable:** Coordonnées du SVG complètement différentes

**Investigation:**
1. Exporter le SVG brut
2. Vérifier si les éléments `<text>` existent du tout
3. Vérifier la valeur `viewBox` du SVG (unités mm vs px?)

---

Besoin d'aide ? Ouvre la console et partage les tables de debug pour diagnosis rapide.
