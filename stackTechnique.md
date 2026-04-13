# Bibliothèque Numérique — Résumé technique pour reprise de projet

## Stack technique

- **Astro 5** — générateur de site statique, `output: 'static'`, déploiement GitHub Pages
- **React 18** + **`@astrojs/react` 4** — composants interactifs côté client ("îlots")
- **Clover IIIF** (`@samvera/clover-iiif`) — viewer IIIF multicanvas (remplace Mirador 4)
- **MiniSearch** — recherche floue côté client (remplace Fuse.js)
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

data/manifestes/ ──→ cp → public/manifestes/ ──→ servis statiquement
```

### 3. Runtime (navigateur)

```
/recherche
    └─→ MoteurFacettes.jsx (React, client:load)
            ├─ MiniSearch : recherche plein texte sur titre/auteur/transcription
            └─ .filter() JS : facettes auto-générées depuis les colonnes CSV

/livres/[id]
    └─→ CloverViewer.jsx (React, client:only)
            └─ charge public/manifestes/[id].json
               → Clover IIIF → OpenSeadragon → images Nakala (IIIF Image API v3)
```

---

## Conventions des données

### metadata.csv — colonnes

|Colonne|Statut|Rôle|
|---|---|---|
|`id`|**obligatoire**|slug URL (`/livres/[id]`), doit correspondre au nom du XML|
|`titre`|**obligatoire**|affiché en titre|
|`auteur`|**obligatoire**|plusieurs auteurs séparés par `;`|
|`manifeste_url`|**obligatoire**|URL du manifeste IIIF servi par le site|
|`sous_titre`|optionnel|affiché en italique|
|toute autre colonne|libre|devient automatiquement une facette|

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
- Un **select** "Page N" en haut du panneau (remplace les badges de page, non scalable au-delà de ~20 pages)
- Des boutons **Précédent / Suivant** en haut et en bas du contenu

Le conteneur de transcription a une hauteur fixe (`70vh`) en mode côte-à-côte, identique à celle du viewer. La zone de texte scroll en interne (`overflow-y: auto`), les barres de navigation haut et bas sont toujours visibles hors du scroll (`flex-shrink: 0`). En mode onglets, la hauteur est libre (scroll de page entière).

### État de page unique

Un seul objet `etat = { page: 0 }` est partagé entre les deux modes. Cela garantit que basculer de mode ne réinitialise pas la page courante. `syncAffichageTousModes()` resynchronise l'affichage des deux listes de pages (onglets et côte-à-côte) sur `etat.page` sans modifier l'index.

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

**Viewer → transcription** : via la prop officielle `canvasIdCallback` de Clover, qui reçoit l'id IIIF du canvas actif à chaque navigation utilisateur. Le composant convertit cet id en index via `canvasIdsRef` et émet `clover:pagechange`. Le listener dans `[id].astro` met à jour l'affichage de la colonne transcription (mode côte-à-côte uniquement).

**Transcription → viewer** : via un **plugin invisible** (`SyncPlugin`) enregistré dans `plugins[].imageViewer.controls`. Les plugins Clover reçoivent `useViewerDispatch` comme prop — c'est l'API officielle pour piloter l'état interne. Le plugin écoute `clover:goto` et dispatche `{ type: 'updateActiveCanvas', canvasId }` directement dans le contexte React de Clover. C'est la seule méthode fiable : modifier `iiifContent` ne provoque pas de navigation programmatique.

**Gestion du fetch asynchrone** : la liste des canvas IDs est chargée via `fetch(manifestUrl)` au montage. Si `clover:goto` arrive avant la fin du fetch (cas fréquent à l'init), l'index est mémorisé dans `pendingIndexRef` et re-dispatché dès que le fetch se termine.

**Anti-boucle** : `ignoreNextRef` est positionné à `true` avant chaque navigation programmatique vers le viewer. Le `canvasIdCallback` qui s'ensuit est alors ignoré, évitant la boucle transcription → viewer → transcription.

### Navigation vers un passage (ancres)

Tout élément marqué `anchorable: true` dans `xmlRules.ts` reçoit un `id` HTML unique au build. Les URLs directes (`/livres/Livre-01#blockquotation-12`) sont gérées par `gererAncreUrl()` au chargement.

Quand on navigue vers un passage (`allerAuPassage`) :
- En mode **côte-à-côte** : la transcription et le viewer se synchronisent sur la bonne page
- En mode **onglets** : la transcription s'ouvre à la bonne page, et le viewer est synchronisé silencieusement en arrière-plan (il sera à la bonne page si l'utilisateur bascule sur l'onglet viewer)
- Via une **URL directe avec hash** : le mode côte-à-côte est forcé, puis le passage est affiché avec surbrillance

---

## Points d'attention pour la reprise

### Viewer Clover — diagnostic

Si la synchro transcription → viewer ne fonctionne pas, vérifier dans la console :
1. Que `clover:goto` est bien émis (ajouter `window.addEventListener('clover:goto', console.log)`)
2. Que `canvasIdsRef.current` n'est pas vide (le fetch du manifeste a réussi)
3. Que `SyncPlugin` est bien monté (l'action `updateActiveCanvas` doit apparaître si Clover a un devtools Redux)

### Import dynamique obligatoire

`CloverViewer.jsx` importe Clover via `import('@samvera/clover-iiif/viewer')` dans un `useEffect`, jamais en import statique en haut du fichier. Même contrainte pour tout autre viewer basé sur OpenSeadragon. Sans ça, le build Astro échoue avec `document is not defined`.

### Correspondance canvas IIIF ↔ page XML

La synchro suppose que le canvas n°i du manifeste correspond à la page n°i du XML. C'est garanti si le manifeste est généré depuis le même PDF avec `nakala_vers_manifeste.py`. Un décalage (ex. canvas de couverture supplémentaire) briserait la synchro.

---