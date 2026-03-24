/**
 * MoteurFacettes.jsx
 * Moteur de recherche à facettes généré dynamiquement depuis les colonnes du CSV.
 * - Fuse.js pour la recherche plein texte
 * - Filtres natifs JS pour les facettes (select, range, text)
 */
import { useState, useMemo, useEffect } from 'react'
import Fuse from 'fuse.js'

// ─── Composants de facettes ───────────────────────────────────────────────────

function FacetteSelect({ meta, valeurActive, onChange }) {
  return (
    <div className="facette">
      <label className="facette-label">{meta.label}</label>
      <div className="facette-select-liste">
        {meta.valeurs.map(val => (
          <label key={val} className="facette-checkbox">
            <input
              type="checkbox"
              checked={valeurActive?.includes(val) ?? false}
              onChange={e => {
                const actives = valeurActive ?? []
                onChange(
                  e.target.checked
                    ? [...actives, val]
                    : actives.filter(v => v !== val)
                )
              }}
            />
            <span>{val}</span>
          </label>
        ))}
      </div>
    </div>
  )
}

function FacetteRange({ meta, valeurActive, onChange }) {
  const [min, max] = valeurActive ?? [meta.min, meta.max]
  return (
    <div className="facette">
      <label className="facette-label">
        {meta.label}
        <span className="facette-range-valeurs">{min} – {max}</span>
      </label>
      <div className="facette-range-inputs">
        <input
          type="range"
          min={meta.min}
          max={meta.max}
          value={min}
          onChange={e => onChange([Number(e.target.value), max])}
        />
        <input
          type="range"
          min={meta.min}
          max={meta.max}
          value={max}
          onChange={e => onChange([min, Number(e.target.value)])}
        />
      </div>
    </div>
  )
}

function FacetteTexte({ meta, valeurActive, onChange }) {
  return (
    <div className="facette">
      <label className="facette-label">{meta.label}</label>
      <input
        className="facette-input"
        type="text"
        placeholder={`Filtrer par ${meta.label.toLowerCase()}…`}
        value={valeurActive ?? ''}
        onChange={e => onChange(e.target.value || null)}
      />
    </div>
  )
}

// ─── Carte résultat ───────────────────────────────────────────────────────────

function CarteResultat({ livre, colonnesMeta }) {
  const auteurs = Array.isArray(livre.auteur) ? livre.auteur.join(', ') : livre.auteur
  const RESERVEES = new Set(['id', 'titre', 'sous_titre', 'auteur', 'manifeste_url'])
  const metaSupp = colonnesMeta.filter(m => !RESERVEES.has(m.key))

  return (
    <a href={`/livres/${livre.id}`} className="carte-resultat">
      <div className="carte-resultat-icone">
        <span className="material-icons">menu_book</span>
      </div>
      <div className="carte-resultat-info">
        <h3 className="carte-resultat-titre">{livre.titre}</h3>
        {livre.sous_titre && (
          <p className="carte-resultat-sous-titre">{livre.sous_titre}</p>
        )}
        <p className="carte-resultat-auteur">{auteurs}</p>
        <div className="carte-resultat-chips">
          {metaSupp.map(m => (
            <span key={m.key} className="chip">
              <strong>{m.label}</strong>&nbsp;{String(livre[m.key] ?? '')}
            </span>
          ))}
        </div>
      </div>
      <span className="material-icons carte-resultat-fleche">chevron_right</span>
    </a>
  )
}

// ─── Moteur principal ─────────────────────────────────────────────────────────

export default function MoteurFacettes({ livres, colonnesMeta }) {
  const [recherche, setRecherche] = useState('')
  const [filtres, setFiltres] = useState({})

  // Index Fuse.js — recalculé une seule fois
  const fuse = useMemo(() => new Fuse(livres, {
    keys: ['titre', 'sous_titre', 'auteur'],
    threshold: 0.35,
    includeScore: true,
  }), [livres])

  const majFiltres = (key, valeur) => {
    setFiltres(prev => ({ ...prev, [key]: valeur }))
  }

  const reinitialiser = () => {
    setRecherche('')
    setFiltres({})
  }

  // Application des filtres
  const resultats = useMemo(() => {
    // 1. Recherche textuelle (Fuse.js)
    let base = recherche.trim()
      ? fuse.search(recherche).map(r => r.item)
      : [...livres]

    // 2. Filtres par facette
    for (const meta of colonnesMeta) {
      const filtre = filtres[meta.key]
      if (!filtre || (Array.isArray(filtre) && filtre.length === 0)) continue

      if (meta.type === 'select') {
        base = base.filter(l => filtre.includes(String(l[meta.key] ?? '')))
      } else if (meta.type === 'range') {
        const [fMin, fMax] = filtre
        base = base.filter(l => {
          const v = Number(l[meta.key])
          return v >= fMin && v <= fMax
        })
      } else if (meta.type === 'text') {
        const terme = filtre.toLowerCase()
        base = base.filter(l =>
          String(l[meta.key] ?? '').toLowerCase().includes(terme)
        )
      }
    }

    return base
  }, [recherche, filtres, livres, fuse, colonnesMeta])

  const nbFiltresActifs = Object.values(filtres).filter(v =>
    v !== null && v !== undefined && !(Array.isArray(v) && v.length === 0)
  ).length

  return (
    <div className="moteur">
      {/* Barre de recherche principale */}
      <div className="recherche-barre">
        <span className="material-icons recherche-icone">search</span>
        <input
          className="recherche-input"
          type="text"
          placeholder="Rechercher dans les titres, auteurs…"
          value={recherche}
          onChange={e => setRecherche(e.target.value)}
          autoFocus
        />
        {(recherche || nbFiltresActifs > 0) && (
          <button className="recherche-reset" onClick={reinitialiser} title="Réinitialiser">
            <span className="material-icons">close</span>
          </button>
        )}
      </div>

      <div className="moteur-corps">
        {/* Panneau de facettes */}
        <aside className="facettes-panneau carte">
          <div className="facettes-entete">
            <h2 className="facettes-titre">Filtres</h2>
            {nbFiltresActifs > 0 && (
              <button className="facettes-reset" onClick={() => setFiltres({})}>
                Réinitialiser ({nbFiltresActifs})
              </button>
            )}
          </div>

          {colonnesMeta.map(meta => {
            if (meta.type === 'select') return (
              <FacetteSelect
                key={meta.key}
                meta={meta}
                valeurActive={filtres[meta.key]}
                onChange={v => majFiltres(meta.key, v)}
              />
            )
            if (meta.type === 'range') return (
              <FacetteRange
                key={meta.key}
                meta={meta}
                valeurActive={filtres[meta.key]}
                onChange={v => majFiltres(meta.key, v)}
              />
            )
            return (
              <FacetteTexte
                key={meta.key}
                meta={meta}
                valeurActive={filtres[meta.key]}
                onChange={v => majFiltres(meta.key, v)}
              />
            )
          })}
        </aside>

        {/* Résultats */}
        <section className="resultats">
          <div className="resultats-entete">
            <p className="resultats-compteur">
              <strong>{resultats.length}</strong> résultat{resultats.length !== 1 ? 's' : ''}
              {livres.length !== resultats.length && ` sur ${livres.length}`}
            </p>
          </div>

          {resultats.length === 0 ? (
            <div className="resultats-vide carte">
              <span className="material-icons">search_off</span>
              <p>Aucun résultat pour ces critères.</p>
              <button className="btn btn-outlined" onClick={reinitialiser}>
                Réinitialiser la recherche
              </button>
            </div>
          ) : (
            <div className="resultats-liste">
              {resultats.map(livre => (
                <CarteResultat
                  key={livre.id}
                  livre={livre}
                  colonnesMeta={colonnesMeta}
                />
              ))}
            </div>
          )}
        </section>
      </div>

      <style>{`
        .moteur { padding: 24px 0; }

        .recherche-barre {
          display: flex;
          align-items: center;
          background: white;
          border-radius: 28px;
          box-shadow: 0 2px 8px rgba(0,0,0,.15);
          padding: 4px 16px;
          margin-bottom: 24px;
          gap: 8px;
        }

        .recherche-icone { color: #757575; }

        .recherche-input {
          flex: 1;
          border: none;
          outline: none;
          font-family: var(--font-corps);
          font-size: 1rem;
          padding: 10px 0;
          color: var(--md-on-surface);
        }

        .recherche-reset {
          background: none;
          border: none;
          cursor: pointer;
          color: #757575;
          display: flex;
          align-items: center;
        }

        .moteur-corps {
          display: grid;
          grid-template-columns: 280px 1fr;
          gap: 24px;
          align-items: start;
        }

        @media (max-width: 768px) {
          .moteur-corps { grid-template-columns: 1fr; }
        }

        /* Facettes */
        .facettes-panneau { padding: 16px; }

        .facettes-entete {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 16px;
          padding-bottom: 12px;
          border-bottom: 1px solid var(--md-divider);
        }

        .facettes-titre { font-size: 0.875rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.1em; color: var(--md-on-surface-medium); }

        .facettes-reset {
          background: none;
          border: none;
          cursor: pointer;
          font-size: 0.75rem;
          color: var(--md-primary);
          font-weight: 500;
        }

        .facette { margin-bottom: 20px; padding-bottom: 20px; border-bottom: 1px solid var(--md-divider); }
        .facette:last-child { border-bottom: none; margin-bottom: 0; }

        .facette-label {
          display: flex;
          justify-content: space-between;
          font-size: 0.8rem;
          font-weight: 600;
          color: var(--md-on-surface);
          margin-bottom: 8px;
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }

        .facette-range-valeurs { font-weight: 400; color: var(--md-on-surface-medium); }

        .facette-select-liste { display: flex; flex-direction: column; gap: 6px; }

        .facette-checkbox {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 0.875rem;
          cursor: pointer;
        }

        .facette-checkbox input[type="checkbox"] { accent-color: var(--md-primary); }

        .facette-range-inputs { display: flex; flex-direction: column; gap: 4px; }

        .facette-range-inputs input[type="range"] {
          width: 100%;
          accent-color: var(--md-primary);
        }

        .facette-input {
          width: 100%;
          border: 1px solid var(--md-divider);
          border-radius: var(--radius);
          padding: 8px 12px;
          font-family: var(--font-corps);
          font-size: 0.875rem;
          outline: none;
          transition: border-color var(--transition);
        }

        .facette-input:focus { border-color: var(--md-primary); }

        /* Résultats */
        .resultats-entete { margin-bottom: 16px; }
        .resultats-compteur { color: var(--md-on-surface-medium); font-size: 0.875rem; }
        .resultats-compteur strong { color: var(--md-on-surface); }

        .resultats-liste { display: flex; flex-direction: column; gap: 12px; }

        .carte-resultat {
          display: flex;
          align-items: center;
          gap: 16px;
          padding: 16px 20px;
          background: white;
          border-radius: 4px;
          box-shadow: 0 1px 3px rgba(0,0,0,.12);
          text-decoration: none;
          color: inherit;
          transition: box-shadow 200ms;
        }

        .carte-resultat:hover {
          box-shadow: 0 4px 12px rgba(0,0,0,.15);
          text-decoration: none;
        }

        .carte-resultat-icone {
          width: 40px;
          height: 40px;
          background: #e8eaf6;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
          color: var(--md-primary);
        }

        .carte-resultat-info { flex: 1; min-width: 0; }

        .carte-resultat-titre {
          font-size: 1rem;
          font-weight: 600;
          margin-bottom: 2px;
        }

        .carte-resultat-sous-titre {
          font-size: 0.875rem;
          color: var(--md-on-surface-medium);
          font-style: italic;
          margin-bottom: 2px;
        }

        .carte-resultat-auteur {
          font-size: 0.875rem;
          color: var(--md-on-surface-medium);
          margin-bottom: 8px;
        }

        .carte-resultat-chips { display: flex; flex-wrap: wrap; gap: 6px; }

        .carte-resultat-fleche { color: #bdbdbd; flex-shrink: 0; }

        .resultats-vide {
          padding: 64px;
          text-align: center;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 16px;
          color: var(--md-on-surface-medium);
        }

        .resultats-vide .material-icons { font-size: 48px; opacity: 0.4; }
      `}</style>
    </div>
  )
}
