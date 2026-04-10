### xmlRules.ts — déclarer un schéma

Chaque schéma est un objet `XmlRuleMap` : les clés sont les noms de balises **en minuscules**, les valeurs sont des objets `XmlRule`.

```ts
interface XmlRule {
  tag?          : string                  // balise HTML cible (ex: 'p', 'div', 'span'…)
  classe?       : string                  // classe CSS appliquée
  skipSelf?     : boolean                 // traverse sans générer de balise (ex: <Body>, <transcription>)
  ignore?       : boolean                 // ignore le nœud et tous ses enfants
  anchorable?   : boolean                 // génère un id HTML + lien # au survol
  listePassages?: boolean                 // apparaît dans le panneau "Passages" (implique anchorable)
  attrs?        : (node) => Record<string, string>  // attributs HTML dynamiques depuis les attrs XML
}
```

**Champs clés :**

- `skipSelf` — à utiliser pour les balises structurelles qui n'ont pas d'équivalent HTML (`<Body>`, `<transcription>`, racine du document…). Le moteur descend directement dans leurs enfants.
- `ignore` — supprime complètement le nœud (ex : numéros de page, réclames, tampons bibliothécaires si non souhaités).
- `anchorable` — ajoute un `id` unique à l'élément et un lien `#` discret visible au survol. Permet les URLs directes vers n'importe quel passage (`/livres/Livre-01#paragraph-12`).
- `listePassages` — en plus de l'ancre, l'élément est répertorié dans l'onglet "Passages" de la page livre, avec son label textuel et un bouton copier-URL.
- `attrs` — fonction recevant les attributs XML du nœud (préfixés `@_`) et retournant des attributs HTML supplémentaires. Utile pour `data-rend`, `data-type`, `title`, etc.

**Balise inconnue (pas de règle)** → rendu en `<span class="transcription-[balise]">` par défaut.

---

### xmlRules.ts — schémas disponibles

Deux schémas sont préchargés dans `SCHEMA_RULES` :

| Schéma | Balise racine | Usage |
|---|---|---|
| `default` | `<transcription>` | Format simple maison (`<page>`, `<paragraphe>`, `<persName>`…) |
| `historical` | `<HistoricalDocument>` | Format HTR (`<Page>`, `<Body>`, `<Paragraph>`, `<Line>`…) |

La détection est automatique via `detecterSchema()` qui inspecte la balise racine du XML. Pour ajouter un nouveau schéma :

1. Déclarer un objet `XmlRuleMap` avec les règles
2. L'ajouter à `SCHEMA_RULES` sous une clé courte
3. Ajouter une condition dans `detecterSchema()` pour reconnaître la balise racine

---

### xmlRules.ts — exemples de règles

```ts
// Balise structurelle sans équivalent HTML
body: { skipSelf: true },

// Paragraphe avec ancre + dans le panneau Passages
paragraph: { tag: 'div', classe: 'transcription-paragraphe', anchorable: true },

// Citation avec ancre ET répertoriée dans Passages
blockquote: { tag: 'blockquote', classe: 'transcription-citation',
              anchorable: true, listePassages: true },

// Ligne de texte (block pour les retours à la ligne)
line: { tag: 'div', classe: 'transcription-line' },

// Balise avec attribut XML → attribut HTML dynamique
heading: { tag: 'div', classe: 'transcription-heading', anchorable: true,
           attrs: (n) => n['@_type'] ? { 'data-type': String(n['@_type']) } : {} },

// Lacune avec tooltip
gap: { tag: 'span', classe: 'transcription-gap',
       attrs: (n) => ({ title: `[${n['@_reason'] ?? 'gap'}]` }) },

// Élément à masquer complètement
pagenumber: { ignore: true },
```

---

### Ancres et liens directs

Tout élément marqué `anchorable: true` reçoit au build :
- un `id` HTML unique et stable (format `{balise}-{n}`, ex: `paragraph-12`)
- un lien `#` discret affiché au survol

Ce qui permet les URLs directes partageables : `/livres/Livre-01#paragraph-12`

Quand une telle URL est ouverte, la page bascule automatiquement sur l'onglet Transcription, affiche la bonne page, et scrolle jusqu'à l'élément avec un flash de surbrillance.

Les éléments marqués `listePassages: true` apparaissent en plus dans l'onglet **Passages**, avec leur label textuel (60 premiers caractères du contenu) et un bouton pour copier l'URL directe.