# Bibliothèque Numérique

Site statique généré avec [Astro](https://astro.build) pour explorer une collection de livres numérisés en IIIF.

## Stack technique

- **Astro** — génération du site statique
- **Mirador 3** — viewer IIIF (îlot React)
- **Fuse.js** — recherche plein texte
- **MUI / Material Design** — composants UI
- **fast-xml-parser** — parsing des transcriptions XML au build

---

## Structure des données

```
data/
  metadata.csv           ← une ligne par livre
  transcriptions/
    livre-001.xml
    livre-002.xml
    ...
```

### Colonnes du CSV

**Colonnes réservées** (obligatoires) :

| Colonne | Description |
|---|---|
| `id` | Identifiant unique, utilisé dans l'URL (`/livres/[id]`) |
| `titre` | Titre du livre |
| `auteur` | Auteur(s) — séparer plusieurs auteurs par `;` |
| `manifeste_url` | URL du manifeste IIIF |

**Colonnes optionnelles reconnues** :

| Colonne | Description |
|---|---|
| `sous_titre` | Sous-titre, affiché en italique |

**Toutes les autres colonnes** deviennent automatiquement des facettes dans le moteur de recherche.

### Typage automatique des facettes

Le moteur détecte automatiquement le type de chaque colonne :

| Condition | Type de filtre |
|---|---|
| Toutes les valeurs sont numériques | Slider (plage) |
| Moins de 20 valeurs uniques | Cases à cocher |
| Sinon | Champ texte libre |

**Pour forcer le type**, préfixer le nom de colonne :

```
range__date      → toujours un slider
select__genre    → toujours des cases à cocher  
text__remarques  → toujours un champ texte libre
```

---

## Format des transcriptions XML

Les transcriptions XML n'ont pas de schéma imposé. Les balises connues sont transformées en HTML :

| Balise XML | Rendu |
|---|---|
| `<paragraphe>` | `<p>` |
| `<persName>` | `<span>` souligné en rouge (nom de personne) |
| `<placeName>` | `<span>` souligné en bleu (lieu) |
| `<hi rend="italic">` | `<em>` |
| `<note>` | `<aside>` en marge |
| Toute autre balise | `<span class="transcription-[balise]">` |

Pour ajouter de nouvelles règles de transformation, modifier `src/lib/parseData.ts`, section `REGLES_BALISES`.

---

## Développement

```bash
# Installer les dépendances
npm install

# Lancer en développement
npm run dev

# Build de production
npm run build

# Prévisualiser le build
npm run preview
```

## Déploiement GitHub Pages

1. Aller dans **Settings > Pages** du dépôt
2. Source : **GitHub Actions**
3. Modifier `astro.config.mjs` avec votre URL et le nom du dépôt :

```js
export default defineConfig({
  site: 'https://votre-user.github.io',
  base: '/nom-du-repo',
  ...
})
```

4. Pousser sur `main` — le déploiement se déclenche automatiquement.

### Dépôt de données séparé (optionnel)

Pour déclencher un redéploiement automatique quand les données changent, depuis le dépôt de données :

```yaml
# .github/workflows/notify.yml dans le dépôt data
on: push
jobs:
  notify:
    runs-on: ubuntu-latest
    steps:
      - run: |
          curl -X POST \
            -H "Authorization: token ${{ secrets.SITE_TOKEN }}" \
            https://api.github.com/repos/VOTRE_ORG/VOTRE_SITE/dispatches \
            -d '{"event_type":"data-updated"}'
```
