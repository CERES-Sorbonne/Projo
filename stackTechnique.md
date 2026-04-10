# Bibliothèque Numérique — Résumé technique pour reprise de projet

## Stack technique

- **Astro 5** — générateur de site statique, `output: 'static'`, déploiement GitHub Pages
- **React 18** + **`@astrojs/react` 4** — composants interactifs côté client ("îlots")
- **Mirador 4** — viewer IIIF (dépend de MUI 7 + React 18)
- **MUI 7** (`@mui/material`) — composants Material Design
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
    │   └── Base.astro                 # layout commun : nav + footer + CSS global MUI
    ├── lib/
    │   ├── parseData.ts               # lecture CSV + XML au build, détection des facettes
    │   └── xmlRules.ts                # règles de conversion XML → HTML (schémas déclarés ici)
    ├── pages/
    │   ├── index.astro                # accueil : hero + grille de livres
    │   ├── recherche.astro            # passe les données à MoteurFacettes
    │   └── livres/
    │       └── [id].astro             # page livre : onglets viewer / transcription / passages
    └── components/
        ├── CarteLivre.astro           # carte d'un livre dans la grille
        ├── MiradorViewer.jsx          # îlot React — viewer IIIF (client:only)
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
                                                    └─ ancres[] (id, label, pageN, dansPassages)

data/manifestes/ ──→ cp → public/manifestes/ ──→ servis statiquement
```

### 3. Runtime (navigateur)

```
/recherche
    └─→ MoteurFacettes.jsx (React, client:load)
            ├─ MiniSearch : recherche plein texte sur titre/auteur/transcription
            └─ .filter() JS : facettes auto-générées depuis les colonnes CSV
                  ├─ colonnes numériques → slider range
                  ├─ < 10 valeurs uniques → checkboxes
                  └─ sinon → champ texte libre

/livres/[id]
    └─→ MiradorViewer.jsx (React, client:only)
            └─ charge public/manifestes/[id].json
               → Mirador → OpenSeadragon → images Nakala (IIIF Image API v3)
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

Le parser est configuré avec **`preserveOrder: true`**, ce qui garantit que l'ordre des balises dans le XML est fidèlement respecté dans le HTML généré (essentiel quand `<Line>` alterne avec du texte, ou quand plusieurs `<Paragraph>` se suivent).

---

