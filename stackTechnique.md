# Bibliothèque Numérique — Résumé technique pour reprise de projet

## Stack technique

- **Astro 5** — générateur de site statique, `output: 'static'`, déploiement GitHub Pages
- **React 18** + **`@astrojs/react` 4** — composants interactifs côté client ("îlots")
- **Clover IIIF** (`@samvera/clover-iiif`) — viewer IIIF multicanvas
- **@m31coding/fuzzy-search** — recherche floue côté client
- **fast-xml-parser** — parsing XML au moment du build (`preserveOrder: true`)
- **Python** (scripts externes) — preprocessing des données

---

## Structure des dossiers

```
projet/
├── astro.config.mjs
├── package.json
├── tsconfig.json                      # jsx: react-jsx, jsxImportSource: react
│
├── data/                              # DÉPÔT SÉPARÉ (données, géré par les utilisateurs)
│   ├── metadata.csv                   # une ligne par livre, colonnes libres
│   ├── manifestes/                    # manifestes IIIF générés par le script Python
│   │   └── 10.34847-nkl.5be8vpp2.json
│   ├── transcriptions/
│   │   └── Livre-01.xml
│   └── scripts/
│       ├── pdf_vers_images.py         # PDF → JPEG (pour dépôt sur Nakala)
│       └── nakala_vers_manifeste.py   # API Nakala → manifestes IIIF v3
│
├── public/
│   └── manifestes/                    # copié depuis data/manifestes/ au build
│
└── src/
    ├── layouts/
    │   └── Base.astro                 # layout commun : nav + footer + CSS global
    ├── lib/
    │   ├── parseData.ts               # lecture CSV + XML au build, détection des facettes
    │   └── xmlRules.ts                # règles de conversion XML → HTML (schémas déclarés ici)
    ├── pages/
    │   ├── index.astro                # accueil : hero + grille de livres
    │   ├── recherche.astro            # passe les données à MoteurFacettes
    │   └── livres/
    │       └── [id].astro             # page livre : modes onglets / côte-à-côte
    └── components/
        ├── CarteLivre.astro           # carte d'un livre dans la grille
        ├── CloverViewer.jsx           # îlot React — viewer IIIF (client:only)
        └── MoteurFacettes.jsx         # îlot React — recherche + filtres (client:load)
```

---

## Flux de données

### 1. Preprocessing (scripts Python, lancés manuellement)

```
pdfs/*.pdf
    └─ pdf_vers_images.py ──→ data/images/[id]/page-001.jpg ...
                                    │
                                    ▼ (dépôt manuel sur Nakala)
                              Nakala (hébergement IIIF)
                                    │
                                    ▼
nakala_vers_manifeste.py ──→ data/manifestes/[id].json
    (appelle API Nakala :          (manifeste IIIF v3 avec dimensions
     /collections/[id]/datas        récupérées via info.json)
     + /iiif/[id]/[sha1]/info.json)
```

### 2. Build Astro (`npm run build`)

```
data/metadata.csv ──┐
                    ├─→ parseData.ts ──→ getLivres() ──→ pages statiques
data/transcriptions/│   + xmlRules.ts    getColonnesMeta()   (/livres/[id])
    *.xml ──────────┘                   getLivreAvecTranscription()
                                              └─→ TranscriptionPage[]
                                                    ├─ html
                                                    └─ ancres[] (id, label, pageN, inPassages)
                                        getChunksTranscription()
                                              └─→ TranscriptionChunk[]
                                                    ├─ id      "${livreId}__${pageN}__${i}"
                                                    ├─ livreId
                                                    ├─ pageN
                                                    └─ texte   ~300 chars, chevauchement 80

data/manifestes/ ──→ cp → public/manifestes/ ──→ servis statiquement
```

### 3. Runtime (navigateur)

```
/recherche
    └─→ MoteurFacettes.jsx (React, client:load)
            ├─ indexMeta    : fuzzy-search sur titre/auteur/sous-titre
            ├─ indexMots    : fuzzy-search sur les mots extraits des chunks
            ├─ mapMotsVersChunks : mot → [{ livreId, chunkId, positions[] }]
            └─ recherche plein texte : voir section dédiée ci-dessous

/livres/[id]
    └─→ CloverViewer.jsx (React, client:only)
            └─ charge public/manifestes/[id].json
               → Clover IIIF → OpenSeadragon → images Nakala (IIIF Image API v3)
```

---

## Moteur de recherche plein texte (`MoteurFacettes.jsx`)

### Indexation au montage

Deux index sont construits une seule fois dans `useMemo` :

**`indexMeta`** — fuzzy-search sur titre, sous-titre et auteur de chaque livre.

**`indexMots` + `mapMotsVersChunks`** — construit par `construireIndexMots()` :
- Les transcriptions sont découpées en chunks de ~300 caractères (chevauchement 80) par `getChunksTranscription()` côté build.
- Chaque chunk est tokenisé mot par mot. Pour chaque mot, on stocke dans `mapMotsVersChunks` : `mot → [{ livreId, chunkId, positions: number[] }]` où `positions` sont les indices du mot dans la séquence de mots du chunk (pas des offsets caractères).
- `indexMots` est un fuzzy-searcher construit sur l'ensemble des mots distincts, pour permettre la recherche approximative.

Le chunkId vaut `${livreId}__${pageN}__${i}`, ce qui permet de retrouver `livreId` et `pageN` par simple split sans stocker ces infos en doublon.

### Pipeline de recherche

Pour chaque frappe, `resultats` (useMemo) exécute :

**1. Filtrage facettes** — filtre `livresFiltres` sur les colonnes CSV actives.

**2. Recherche meta** (`indexMeta`) — fuzzy match sur titre/auteur, retourne un Set d'ids.

**3. Recherche plein texte** (`rechercherMultimots`) :

Pour chaque mot significatif (longueur > 2) de la query, `rechercherMotDansIndex` interroge `indexMots` avec deux stratégies combinées :
- `SubstringSearcher` — match de sous-chaîne exact
- `FuzzySearcher` (seuil 0.5) — match approximatif

Les formes réellement matchées (`matchedString`) sont collectées dans `allMatchs` — c'est ce qui sert au highlight, pas les mots de la query. Pour chaque forme matchée, les occurrences sont récupérées depuis `mapMotsVersChunks` et filtrées par `idsFiltres`.

Résultat par mot : `{ allMatchingChunks: { [chunkId]: { livreId, chunkId, positions[] } }, allMatchs: Set }`.

**4. Scoring des chunks** — pour chaque chunk présent dans au moins un résultat par mot :

| Condition | Score |
|---|---|
| tous les mots matchés + en ordre + proches | 0 |
| tous les mots matchés | 1 |
| n-1 mots + en ordre + proches | 2 |
| n-1 mots | 3 |
| … | … |

"En ordre et proches" est vérifié par `motsEnOrdreEtProches()` : pour chaque paire de mots consécutifs de la query, il doit exister des positions telles que le second mot suit le premier avec un écart ≤ 3 positions dans la séquence de mots du chunk.

Les chunks sont triés par score croissant. Les 10 meilleurs par livre sont retenus comme extraits. Le texte du chunk est récupéré depuis `chunksParLivre` uniquement à ce moment (pas stocké dans l'index).

**5. Fusion** — union des ids trouvés par meta et par plein texte, enrichis de `_extraits` (textes des chunks) et `_motsMatches` (formes matchées pour le highlight).

### Highlight

`ExtraitTranscription` reçoit le texte brut du chunk et `_motsMatches` (les `matchedString` fuzzy, pas les mots de la query). Une regex construite sur ces formes surligne exactement ce qui a été trouvé par l'index, y compris les matchs fuzzy.

---

## Conventions des données

### metadata.csv — colonnes

| Colonne | Statut | Rôle |
|---|---|---|
| `id` | **obligatoire** | slug URL (`/livres/[id]`), doit correspondre au nom du XML |
| `titre` | **obligatoire** | affiché en titre |
| `auteur` | **obligatoire** | plusieurs auteurs séparés par `;` |
| `manifeste_url` | **obligatoire** | URL du manifeste IIIF servi par le site, peut être une url distante écrite en dure ou une url relative |
| `sous_titre` | optionnel | affiché en italique |
| toute autre colonne | libre | devient automatiquement une facette |

**Forcer le type d'une facette** en préfixant le nom de colonne : `range__date`, `select__genre`, `text__remarques`

---

### XML transcriptions — architecture générale

Le parsing XML est découpé en deux fichiers aux responsabilités séparées :

- **`xmlRules.ts`** — déclare les schémas et leurs règles de conversion. C'est le seul fichier à modifier pour adapter le rendu HTML ou ajouter un nouveau format XML.
- **`parseData.ts`** — moteur générique qui lit les règles, détecte le schéma, et produit le HTML + les ancres. Ne pas modifier sauf pour changer la logique de traversée.

---

## Page livre (`[id].astro`) — architecture détaillée

### Modes d'affichage

La page propose deux modes commutables via une barre en haut :

- **Côte-à-côte** (défaut) — viewer IIIF et transcription affichés simultanément en deux colonnes
- **Onglets** — viewer / transcription / passages affichés en onglets dans une seule colonne

Le mode choisi est persisté dans `sessionStorage` (`livreMode`). Le mode côte-à-côte est le défaut. Si l'URL contient un hash (`#ancre-id`), le mode côte-à-côte est toujours forcé, quelle que soit la préférence sauvegardée.

### Navigation de transcription

La navigation entre pages de transcription utilise :
- Un **select** "Page N" en haut du panneau
- Des boutons **Précédent / Suivant** en haut et en bas du contenu

Le conteneur de transcription a une hauteur fixe (`70vh`) en mode côte-à-côte, identique à celle du viewer. La zone de texte scroll en interne (`overflow-y: auto`), les barres de navigation haut et bas sont toujours visibles hors du scroll (`flex-shrink: 0`). En mode onglets, la hauteur est libre.

### État de page unique

Un seul objet `etat = { page: 0 }` est partagé entre les deux modes. Cela garantit que basculer de mode ne réinitialise pas la page courante. `syncAffichageTousModes()` resynchronise l'affichage des deux listes de pages sur `etat.page` sans modifier l'index.

### Viewer IIIF — CloverViewer.jsx

`CloverViewer` est un composant React monté avec `client:only="react"` (jamais exécuté côté serveur, ce qui évite `document is not defined` dû à OpenSeadragon). Le composant Clover est lui-même importé dynamiquement dans un `useEffect` pour la même raison.

#### Synchronisation bidirectionnelle viewer ↔ transcription

La communication passe par des **CustomEvents** sur `window` :

| Événement | Direction | Payload |
|---|---|---|
| `clover:goto` | transcription → viewer | `{ detail: { index: number } }` |
| `clover:pagechange` | viewer → transcription | `{ detail: { index: number } }` |
| `clover:sync-enabled` | `[id].astro` → viewer | aucun |
| `clover:sync-disabled` | `[id].astro` → viewer | aucun |

**Viewer → transcription** : via la prop officielle `canvasIdCallback` de Clover. Le composant convertit l'id IIIF du canvas actif en index via `canvasIdsRef` et émet `clover:pagechange`.

**Transcription → viewer** : via un plugin invisible (`SyncPlugin`) enregistré dans `plugins[].imageViewer.controls`. Le plugin écoute `clover:goto` et dispatche `{ type: 'updateActiveCanvas', canvasId }` dans le contexte React de Clover.

**Anti-boucle** : `ignoreNextRef` est positionné à `true` avant chaque navigation programmatique. Le `canvasIdCallback` qui s'ensuit est ignoré.

### Navigation vers un passage (ancres)

Tout élément marqué `anchorable: true` dans `xmlRules.ts` reçoit un `id` HTML unique au build. Les URLs directes (`/livres/Livre-01#blockquotation-12`) sont gérées par `gererAncreUrl()` au chargement.

---

## Points d'attention pour la reprise

### Viewer Clover — diagnostic

Si la synchro transcription → viewer ne fonctionne pas, vérifier dans la console :
1. Que `clover:goto` est bien émis
2. Que `canvasIdsRef.current` n'est pas vide (le fetch du manifeste a réussi)
3. Que `SyncPlugin` est bien monté

### Import dynamique obligatoire

`CloverViewer.jsx` importe Clover via `import('@samvera/clover-iiif/viewer')` dans un `useEffect`, jamais en import statique. Sans ça, le build Astro échoue avec `document is not defined`.

### Correspondance canvas IIIF ↔ page XML

La synchro suppose que le canvas n°i du manifeste correspond à la page n°i du XML. Un décalage (ex. canvas de couverture supplémentaire) briserait la synchro.

### Gestion des URL

Ce site supporte le fait d'avoir un prefixe d'url dans l'url, ce dernier est défini dans le fichier de config astro.config.mjs, pour être sûr que tous les liens sont bons, on utilise le helper url dans lib/url pour construire des liens en mettant automatiquement le préfixe devant. Cela vaut aussi pour les liens vers les manifestes relatifs indiqués dans le csv.

AU DEPLOIEMENT, on effectue un sed avant le build pour remplacer toutes les urls par une url de déploiement indiquée dans le fichier .github/workflows/deploy.yaml