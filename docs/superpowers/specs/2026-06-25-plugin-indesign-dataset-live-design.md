# Plugin InDesign ↔ dataSet Web2Print (live, round-trip)

> Date : 2026-06-25
> Statut : design validé, prêt pour plan d'implémentation

## Objectif

Un plugin InDesign (UXP) qui assiste le maquettiste pour **baliser** un document
InDesign avec les champs d'un **dataSet Web2Print**, en se connectant **en live**,
et qui permet de **prévisualiser** le rendu avec une ligne du dataSet (round-trip).

InDesign sert à **baliser** + **vérifier** ; Web2Print reste le moteur de **fusion**.

## Décisions cadrantes (validées)

- **Rôle** : round-trip (baliser + prévisualiser une ligne ; pas de génération de
  toutes les variantes dans InDesign).
- **Techno** : UXP (InDesign 2023 / v18+). Panneau HTML/React, `fetch` natif.
- **Connexion** : token personnel par utilisateur + endpoint HTTP dédié (approche A).
- **Format de balisage** : balisage XML natif InDesign → produit
  `<XMLElement MarkupTag="XMLTag/Champ">` dans l'IDML, **déjà** relu par
  `src/features/idml/xmlElementStory.ts` (`flattenXmlElementStory` reconstruit
  `{{Champ}}` à l'import). **Aucun nouveau parseur côté Web2Print.**
- **Périmètre v1** : texte uniquement, **lecture seule** du dataSet.
- **Phase 2** : balisage d'images (cadre image lié), écriture vers le dataSet,
  formules/prix composites.

## Insight central

Le format natif Web2Print `MarkupTag="XMLTag/Champ"` **est** la représentation
native du balisage XML d'InDesign dans l'IDML. Un tag XML InDesign nommé `Champ`
génère `<XMLTag Self="XMLTag/Champ" Name="Champ">` et des
`<XMLElement MarkupTag="XMLTag/Champ">` à l'export. Le plugin ne fait donc que
**piloter le balisage XML natif d'InDesign** à partir de la liste de champs live.

## Architecture

```
┌─────────────────── InDesign (UXP) ───────────────────┐
│  Panneau "Web2Print"                                  │
│  [Token (1×)]   [Dataset ▼]   [Ligne ◀ 3/120 ▶]       │
│  [Aperçu ON/OFF]                                       │
│  Liste LIVE des champs (colonnes) :                    │
│    • Référence   [Tag] ✓                               │
│    • Prix        [Tag]                                 │
│    • Description [Tag] ✓ ×2 ...                        │
└───────────│──────────────────────│────────────────────┘
            │ fetch (Bearer token)  │ scripting UXP
            ▼                        ▼
  ┌──────────────────────┐   Document InDesign :
  │ CF HTTP  pluginApi    │   - xmlTags.add("Champ")
  │  GET /datasets        │   - XMLElement(MarkupTag/Champ)
  │  GET /datasets/:id    │     autour de la sélection
  │  GET /datasets/:id/row│   - aperçu : remplit le contenu
  └─────────┬────────────┘
            ▼
  Firestore : pluginTokens (token→uid),
              excel_data / excel_data_payload
```

Trois unités isolées :

1. **Backend** `pluginApi` — lecture seule, gardée par token, réutilise la logique
   de `src/features/excel/useExcelFirebase.ts` et `getRowValue` de
   `src/features/merge/mergeEngine.ts`.
2. **Plugin UXP** — UI + réseau + manipulation du document (tags, aperçu).
3. **Web2Print app** — écran « Token plugin » dans les réglages
   (générer / révoquer).

## Backend

### Modèle du token

Collection `pluginTokens/{tokenId}` :

```ts
{
  uid: string          // propriétaire
  hash: string         // SHA-256 du token (jamais le token en clair)
  label: string        // libellé saisi par l'utilisateur
  createdAt: Timestamp
  lastUsedAt: Timestamp | null
  revoked: boolean
}
```

Format token affiché une seule fois : `w2p_<32 octets base64url aléatoires>`.

### Cloud Function HTTP `pluginApi` (`onRequest`, calque `workflowWebhook`)

Header `Authorization: Bearer w2p_…`. Résout token (par hash) → `uid`.

- `GET /datasets` → `[{ docId, fileName, sheetCount, rowCount }]`
  (filtre `excel_data` par `uid`).
- `GET /datasets/:docId` → `{ columns: [{ key, label, fieldType }] }`
  (depuis `excel_data_payload`).
- `GET /datasets/:docId/row?i=N` → `{ values: { [champ]: valeurRésolue } }`
  via `getRowValue` (fieldMap → key → label → alias), cohérent avec la fusion.

Garde-fous :

- Toujours re-filtrer par le `uid` **résolu du token** ; ne jamais faire confiance
  à un `docId` pour contourner la propriété (refuser si le doc n'appartient pas au `uid`).
- 401 si token invalide / révoqué.
- CORS ouvert (UXP n'envoie pas d'origine fiable).
- Met à jour `lastUsedAt` ; rate-limit léger.

### Écran « Token plugin » (réglages Web2Print)

Dans un onglet existant (Connecteurs / Profil) :

- Bouton *Générer un token* → affiche le secret **une seule fois** + copier.
- Liste des tokens (label, dernière utilisation) + *Révoquer*.
- Réutilise les composants UI existants (`src/components/ui/**`).

## Plugin UXP

### Balisage

1. À l'ouverture du dataSet : synchroniser un tag XML InDesign par colonne
   (`document.xmlTags.add(label)`), en slugifiant si nécessaire pour un nom XML
   valide tout en gardant le label d'affichage.
2. Sélection (texte ou cadre) → clic sur un champ → enrober dans un `XMLElement`
   lié au tag.
3. Indicateur par champ : posé ✓ / non posé, et nombre d'occurrences.

### Aperçu round-trip (ON / OFF)

- Sélecteur de ligne `◀ N/Total ▶`.
- **ON** : pour chaque élément tagué, `GET /datasets/:id/row?i=N`, remplace le
  contenu texte, **mémorise le contenu d'origine** par élément.
- **OFF** : restaure le contenu d'origine. On ne touche **jamais** aux tags →
  l'export reste fusionnable.
- Les valeurs arrivent **déjà résolues** du serveur.

## Erreurs & cas limites

- Token invalide/révoqué → 401, panneau affiche « Reconnecte-toi » + champ token.
- Hors-ligne / CF injoignable → message clair, dernier dataSet gardé en cache
  mémoire, pas de fetch bloquant.
- Colonne renommée mais tag déjà posé → tag garde l'ancien nom ; panneau signale
  « champ orphelin » (tag présent sans colonne correspondante).
- Aperçu interrompu (crash/fermeture) → au prochain *OFF*, restaure depuis la
  mémoire ; filet *Restaurer tout* qui re-pose `{{Champ}}` à partir du nom de tag.
- Accents/caractères spéciaux dans les noms de champs → slugify pour un nom de tag
  XML valide, label d'affichage conservé.

## Tests

- **Backend** (émulateur Firestore, harnais existant) : résolution token→uid,
  filtrage de propriété, 401, parité de la valeur résolue avec la fusion.
- **Round-trip (critique)** : doc IDML tagué par le plugin → import Web2Print →
  `{{Champ}}` détectés (fixtures `xmlElementStory`). Anti-régression.
- **Plugin UXP** : non automatisable → checklist de smoke test manuel
  (poser tag, aperçu ON/OFF, restaurer, export IDML, ré-import).

## Séquence de build

1. Backend `pluginApi` + collection `pluginTokens` + tests émulateur.
2. Réglages Web2Print : génération / révocation de token.
3. Plugin UXP : scaffolding panneau, saisie token, liste datasets/champs.
4. Balisage : pose de tags XML natifs depuis la liste.
5. Aperçu round-trip ON/OFF + restaurer.
6. Test round-trip import + smoke checklist.
7. *(Phase 2)* images, écriture, formules.

## Fichiers de référence

- Merge engine : `src/features/merge/mergeEngine.ts` (`getRowValue`)
- Balisage XML IDML : `src/features/idml/xmlElementStory.ts`
- Lecture datasets : `src/features/excel/useExcelFirebase.ts`
- Webhook HTTP (modèle) : `functions/src/workflow/webhookTrigger.ts`
- Clés API par user (modèle stockage) : `functions/src/workflow/apiKeys.ts`
- Cloud functions index : `functions/src/index.ts`
- Store merge : `src/stores/merge.store.ts`
