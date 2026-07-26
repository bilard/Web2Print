# Jina Reader & Search — référence des en-têtes

Source : docs officielles `r.jina.ai` / `s.jina.ai` + README `jina-ai/reader`
(à jour 2026-07-17). Autorité finale = `src/dto/crawler-options.ts` du repo.

Endpoints : `GET https://r.jina.ai/{URL}` · `GET https://s.jina.ai/{query}`
(ou `?q=`). `Accept: application/json` pour du JSON, `text/event-stream` pour le
streaming. POST accepté (body `{ "url": ... }`).

Auth : `Authorization: Bearer <clé>` (tier gratuit sans clé mais rate-limité).

## Reader (r.jina.ai) — en-têtes

| En-tête | Valeurs | Rôle |
|---|---|---|
| `X-Engine` | `browser`, `direct`/`curl`, `auto`, `cf-browser-rendering` | Moteur de fetch. `browser` = Chromium headless (JS + lazy-load) ; `direct` = fetch statique rapide ; `auto` = choix intelligent. |
| `X-Respond-With` | `markdown`(défaut), `html`, `text`, `screenshot`, `pageshot`, `frontmatter`, `readerlm-v2` | Format de sortie. `readerlm-v2` = conversion HTML→MD haute fidélité. `html` = HTML rendu (utile pour extraire des liens). |
| `X-Proxy` | code pays (`fr`, `us`…) ou `auto` | **Pool proxy résidentiel Jina** (premium) → passe DataDome/Akamai. ⭐ pertinent pour les sites anti-bot. |
| `X-Proxy-Url` | URL (`http`/`https`/`socks4`/`socks5`) | Route via TON proxy. |
| `X-Target-Selector` | sélecteur(s) CSS | N'extrait QUE le contenu du/des élément(s) (ex. la grille produit) → moins de bruit. ⭐ listing. |
| `X-Wait-For-Selector` | sélecteur CSS | Attend que l'élément soit rendu avant de renvoyer. |
| `X-Remove-Selector` | sélecteur(s) CSS | **Retire** des éléments avant extraction (nav, footer, bannière cookie). ⭐ réduit la pollution des liens. |
| `X-Timeout` | entier s (max 180) | Attente max (sinon `network-idle`). |
| `X-Wait-For` / `X-Respond-Timing` | `html`, `visible-content`, `mutation-idle`, `resource-idle`, `media-idle`, `network-idle` | Quand renvoyer (latence ↔ complétude). |
| `X-No-Cache` | `true` | Ignore le cache (TTL défaut 3600 s). |
| `X-Cache-Tolerance` | entier s | Accepte un cache plus jeune que N. |
| `X-Locale` | locale (`fr-FR`) | Locale du navigateur au rendu. ⭐ langue correcte. |
| `X-Set-Cookie` | cookie string | Injecte des cookies (consentement/auth) ; bypass cache. |
| `X-Retain-Images` | `all`(défaut), `none`, `alt` | Sort des images en MD complet / aucune / alt seul. `none` pour une découverte de liens. |
| `X-Retain-Links` | `all`, `none`, `text`, `gpt-oss` | Idem pour les liens. |
| `X-With-Links-Summary` | `true`, `all` | Ajoute un pied de page dédupliqué de TOUS les liens (`all` = exhaustif). ⭐ découverte. |
| `X-With-Images-Summary` | `true` | Idem pour les images. |
| `X-With-Generated-Alt` | `true` | Légende IA (VLM) des images sans alt. |
| `X-With-Iframe` | `true` | Inclut le contenu des iframes. |
| `X-With-Shadow-Dom` | `true` | Inclut le Shadow DOM. |
| `X-Detach-Invisibles` | `true` | Retire les `display:none` avant capture. |
| `X-Base` | `final` | Résout jusqu'à l'URL finale (redirections). |
| `X-Token-Budget` / `X-Max-Tokens` | entier | Plafonne les tokens (rejette / tronque). |
| `X-Md-Heading-Style`, `X-Md-Link-Style`, `X-Md-Bullet-List-Marker`, `X-No-Gfm` | divers | Mise en forme du markdown. |
| `X-Robots-Txt` | user-agent | Respecte robots.txt pour ce UA. |
| `X-Preset` | `reader`, `index`, `research`, `agent`, `spider` | Bundles d'options préréglés (`spider` = crawl). |

## Search (s.jina.ai) — en-têtes

Reprend la plupart des en-têtes Reader (appliqués à CHAQUE page lue) + :

| En-tête / param | Valeurs | Rôle |
|---|---|---|
| `q` (query) | texte URL-encodé | La requête (ou dans le chemin `/{query}`). |
| `X-Respond-With` | `no-content` | Renvoie seulement URLs + snippets (pas de fetch des pages) → rapide/économe. |
| `X-Site` / param `site` | domaine(s), répétable | Restreint la recherche à un/des domaine(s). ⭐ ciblage enseigne. |
| `X-Country` / `gl` | code pays | Géolocalise les résultats. |
| `X-Location` | texte | Localité. |
| `X-Language` / `hl` | langue | Langue des résultats. |
| `X-No-Cache`, `X-Engine`, `X-Timeout`, `X-Retain-Images`, `X-With-Links-Summary` | cf. Reader | S'appliquent au fetch de chaque résultat. |

## Ce que l'app envoie aujourd'hui (`src/features/scraping/useJina.ts`)

- Global (`jinaHeaders`) : `Authorization`, `Accept: application/json`,
  `X-With-Links-Summary: true`, `X-With-Images-Summary: true`.
- `jinaRead` : `X-Timeout`, `X-No-Cache` (si demandé), `X-Engine: browser`
  (listing/sites protégés), `X-Wait-For-Selector` (grille/produit).

### Leviers non encore branchés (à considérer selon le besoin)
- **`X-Proxy` (résidentiel Jina)** — pour passer l'anti-bot SUR le chemin Jina
  au lieu de retomber sur la cascade Firecrawl/Bright Data. Le plus impactant.
- **`X-Remove-Selector`** (nav/footer/cookies) — réduit la pollution de liens
  d'une page de listing (moins de catégories/menu dans le links-summary).
- **`X-Target-Selector`** — focalise sur la grille produit d'un listing.
- **`X-Locale: <langue source>`** — rendu dans la bonne langue (cf. pièges locale).
- **`X-With-Links-Summary: all`** (au lieu de `true`) — liste EXHAUSTIVE des liens
  d'une grille (plus de produits découverts).
- **`X-Retain-Images: none`** en mode découverte — payload allégé (on veut les liens).
