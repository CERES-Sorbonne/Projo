/**
* MoteurFacettes.jsx
* - MiniSearch remplace Fuse.js pour un fuzzy matching par mot plus précis
* - Gestion des expressions multi-mots (ex: "Comme celui")
*/
import { useState, useMemo, useEffect } from 'react'
import MiniSearch from 'minisearch' // Remplacement de Fuse

// ─── Composants de facettes (Inchangés) ──────────────────────────────────────

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
        <input type="range" min={meta.min} max={meta.max} value={min} onChange={e => onChange([Number(e.target.value), max])} />
        <input type="range" min={meta.min} max={meta.max} value={max} onChange={e => onChange([min, Number(e.target.value)])} />
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

/**
* Extrait un passage de contexte.
* Reçoit maintenant directement les indices calculés.
*/
function ExtraitTranscription({ texte, indices }) {
  if (!texte || !indices?.length) return null

  // On définit la fenêtre autour du premier match
  const FENETRE = 80
  const premierMatch = indices[0][0]
  const dernierMatch = indices[indices.length - 1][1]

  const start = Math.max(0, premierMatch - FENETRE)
  const end = Math.min(texte.length, dernierMatch + FENETRE)

  const extrait = texte.slice(start, end)
  const decalage = start

  // Fonction pour reconstruire le texte avec les balises <mark>
  const renduSurligne = () => {
    let dernierIndex = 0
    const elements = []

    indices.forEach(([debut, fin], i) => {
      // On ajuste les indices par rapport au début de l'extrait (decalage)
      const relDebut = debut - decalage
      const relFin = fin - decalage + 1

      // Si le match est en dehors de la fenêtre d'affichage, on l'ignore
      if (relDebut < 0 || relDebut > extrait.length) return

      // Texte avant le mot surligné
      elements.push(extrait.slice(dernierIndex, relDebut))
      // Le mot surligné
      elements.push(
        <mark key={i} className="extrait-mark">
          {extrait.slice(relDebut, relFin)}
        </mark>
      )
      dernierIndex = relFin
    })

    // Reste du texte après le dernier surlignage
    elements.push(extrait.slice(dernierIndex))
    return elements
  }

  return (
    <div className="extrait-transcription">
      <span className="material-icons extrait-icone">format_quote</span>
      <p className="extrait-texte">
        {start > 0 && <span className="extrait-ellipse">…</span>}
        {renduSurligne()}
        {end < texte.length && <span className="extrait-ellipse">…</span>}
      </p>
    </div>
  )
}

// ─── Carte résultat ───────────────────────────────────────────────────────────

function estFiltreActif(meta, livre, filtres) {
  const filtre = filtres[meta.key]
  if (!filtre || (Array.isArray(filtre) && filtre.length === 0)) return false
  const valeur = String(livre[meta.key] ?? '')

  if (meta.type === 'select') return Array.isArray(filtre) && filtre.includes(valeur)
  if (meta.type === 'range') return Array.isArray(filtre) && (Number(valeur) >= filtre[0] && Number(valeur) <= filtre[1])
  if (meta.type === 'text') return !!filtre && valeur.toLowerCase().includes(String(filtre).toLowerCase())
  return false
}

function CarteResultat({ livre, colonnesMeta, filtresActifs }) {
  const auteurs = Array.isArray(livre.auteur) ? livre.auteur.join(', ') : livre.auteur
  const RESERVEES = new Set(['id', 'titre', 'sous_titre', 'auteur', 'manifeste_url', '_transcriptionTexte', '_indicesMatch'])
  const metaSupp = colonnesMeta.filter(m => !RESERVEES.has(m.key))

  // On vérifie si on a des indices de match pour la transcription
  const indicesMatch = livre._indicesMatch

  return (
    <a href={`/livres/${livre.id}`} className={`carte-resultat${indicesMatch ? ' carte-resultat--transcription' : ''}`}>
      <div className="carte-resultat-icone">
        <span className="material-icons">menu_book</span>
      </div>
      <div className="carte-resultat-info">
        <h3 className="carte-resultat-titre">{livre.titre}</h3>
        {livre.sous_titre && <p className="carte-resultat-sous-titre">{livre.sous_titre}</p>}
        <p className="carte-resultat-auteur">{auteurs}</p>
        <div className="carte-resultat-chips">
          {metaSupp.map(m => (
            <span key={m.key} className={`chip${estFiltreActif(m, livre, filtresActifs) ? ' chip--actif' : ''}`}>
              <strong>{m.label}</strong>&nbsp;{String(livre[m.key] ?? '')}
            </span>
          ))}
          {indicesMatch && (
            <span className="chip chip--actif">
              <span className="material-icons" style={{ fontSize: '13px' }}>history_edu</span>
              Trouvé dans la transcription
            </span>
          )}
        </div>

        {indicesMatch && (
          <ExtraitTranscription
            texte={livre._transcriptionTexte}
            indices={indicesMatch}
          />
        )}
      </div>
      <span className="material-icons carte-resultat-fleche">chevron_right</span>
    </a>
  )
}

// ─── Moteur principal ─────────────────────────────────────────────────────────

export default function MoteurFacettes({ livres, colonnesMeta }) {
  const [recherche, setRecherche] = useState('')
  const [filtres, setFiltres] = useState({})


  const majFiltres = (key, valeur) => {
    setFiltres(prev => ({ ...prev, [key]: valeur }))
  }

  const reinitialiser = () => {
    setRecherche('')
    setFiltres({})
  }

  const resultats = useMemo(() => {
    // 1. Appliquer les filtres facettes sur tous les livres
    const livresFiltres = livres.filter(livre => {
      return colonnesMeta.every(meta => {
        const filtre = filtres[meta.key]
        if (filtre === null || filtre === undefined) return true

        const valeur = String(livre[meta.key] ?? '')

        if (meta.type === 'select') {
          if (!Array.isArray(filtre) || filtre.length === 0) return true
          return filtre.includes(valeur)
        }
        if (meta.type === 'range') {
          if (!Array.isArray(filtre)) return true
          const nb = Number(valeur)
          return nb >= filtre[0] && nb <= filtre[1]
        }
        if (meta.type === 'text') {
          if (!filtre) return true
          return valeur.toLowerCase().includes(String(filtre).toLowerCase())
        }
        return true
      })
    })

    // 2. Si pas de recherche texte, retourner les livres filtrés
    if (!recherche.trim()) return livresFiltres.map(l => ({ ...l, _indicesMatch: null }))

    // 3. MiniSearch uniquement sur les livres déjà filtrés
    const miniSearchLocal = new MiniSearch({
      fields: ['titre', 'sous_titre', 'auteur', '_transcriptionTexte'],
      storeFields: ['id', 'titre', 'sous_titre', 'auteur', '_transcriptionTexte'],
      searchOptions: { fuzzy: 0.2, prefix: true, combineWith: 'AND' }
    })
    miniSearchLocal.addAll(livresFiltres)

    const msResultats = miniSearchLocal.search(recherche)
    const termesRecherche = recherche.toLowerCase().trim().split(/\s+/)

    return msResultats.map(r => {
      const livreOriginal = livresFiltres.find(l => l.id === r.id)
      if (!livreOriginal) return null

      if (!r._transcriptionTexte) return { ...livreOriginal, _indicesMatch: null }

      const pattern = termesRecherche
        .map(t => `\\b${t.slice(0, -1)}[a-z]{1,2}`)
        .join('\\s+')

      let indicesMatch = []
      try {
        const regex = new RegExp(pattern, 'gi')
        let match
        while ((match = regex.exec(r._transcriptionTexte)) !== null) {
          indicesMatch.push([match.index, match.index + match[0].length - 1])
        }
      } catch (e) { return null }

      if (indicesMatch.length > 0) {
        return { ...livreOriginal, _indicesMatch: indicesMatch }
      }

      const matchHorsTranscription = Object.keys(r.match).some(k => k !== '_transcriptionTexte')
      if (matchHorsTranscription) {
        return { ...livreOriginal, _indicesMatch: null }
      }

      return null
    }).filter(Boolean)
  }, [recherche, filtres, livres, colonnesMeta])

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
          placeholder="Rechercher dans le titre ou la transcription"
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
            if (meta.type === 'select') return <FacetteSelect key={meta.key} meta={meta} valeurActive={filtres[meta.key]} onChange={v => majFiltres(meta.key, v)} />
            if (meta.type === 'range') return <FacetteRange key={meta.key} meta={meta} valeurActive={filtres[meta.key]} onChange={v => majFiltres(meta.key, v)} />
            return <FacetteTexte key={meta.key} meta={meta} valeurActive={filtres[meta.key]} onChange={v => majFiltres(meta.key, v)} />
          })}
        </aside>

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
              <button className="btn btn-outlined" onClick={reinitialiser}>Réinitialiser la recherche</button>
            </div>
          ) : (
            <div className="resultats-liste">
              {resultats.map(livre => (
                <CarteResultat key={livre.id} livre={livre} colonnesMeta={colonnesMeta} filtresActifs={filtres} />
              ))}
            </div>
          )}
        </section>
      </div>

      <style>{`
        .moteur { padding: 24px 0; }
        .recherche-barre { display: flex; align-items: center; background: white; border-radius: 28px; box-shadow: 0 2px 8px rgba(0,0,0,.15); padding: 4px 16px; margin-bottom: 24px; gap: 8px; }
        .recherche-icone { color: #757575; }
        .recherche-input { flex: 1; border: none; outline: none; font-family: var(--font-corps); font-size: 1rem; padding: 10px 0; color: var(--md-on-surface); }
        .recherche-reset { background: none; border: none; cursor: pointer; color: #757575; display: flex; align-items: center; }
        .moteur-corps { display: grid; grid-template-columns: 280px 1fr; gap: 24px; align-items: start; }
        @media (max-width: 768px) { .moteur-corps { grid-template-columns: 1fr; } }
        .facettes-panneau { padding: 16px; }
        .facettes-entete { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; padding-bottom: 12px; border-bottom: 1px solid var(--md-divider); }
        .facettes-titre { font-size: 0.875rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.1em; color: var(--md-on-surface-medium); }
        .facettes-reset { background: none; border: none; cursor: pointer; font-size: 0.75rem; color: var(--md-primary); font-weight: 500; }
        .facette { margin-bottom: 20px; padding-bottom: 20px; border-bottom: 1px solid var(--md-divider); }
        .facette:last-child { border-bottom: none; margin-bottom: 0; }
        .facette-label { display: flex; justify-content: space-between; font-size: 0.8rem; font-weight: 600; color: var(--md-on-surface); margin-bottom: 8px; text-transform: uppercase; letter-spacing: 0.05em; }
        .facette-range-valeurs { font-weight: 400; color: var(--md-on-surface-medium); }
        .facette-select-liste { display: flex; flex-direction: column; gap: 6px; }
        .facette-checkbox { display: flex; align-items: center; gap: 8px; font-size: 0.875rem; cursor: pointer; }
        .facette-checkbox input[type="checkbox"] { accent-color: var(--md-primary); }
        .facette-range-inputs { display: flex; flex-direction: column; gap: 4px; }
        .facette-range-inputs input[type="range"] { width: 100%; accent-color: var(--md-primary); }
        .facette-input { width: 100%; border: 1px solid var(--md-divider); border-radius: var(--radius); padding: 8px 12px; font-family: var(--font-corps); font-size: 0.875rem; outline: none; transition: border-color var(--transition); }
        .facette-input:focus { border-color: var(--md-primary); }
        .resultats-entete { margin-bottom: 16px; }
        .resultats-compteur { color: var(--md-on-surface-medium); font-size: 0.875rem; }
        .resultats-compteur strong { color: var(--md-on-surface); }
        .resultats-liste { display: flex; flex-direction: column; gap: 12px; }
        .carte-resultat { display: flex; align-items: center; gap: 16px; padding: 16px 20px; background: white; border-radius: 4px; box-shadow: 0 1px 3px rgba(0,0,0,.12); text-decoration: none; color: inherit; transition: box-shadow 200ms; }
        .carte-resultat:hover { box-shadow: 0 4px 12px rgba(0,0,0,.15); text-decoration: none; }
        .carte-resultat-icone { width: 40px; height: 40px; background: var(--md-primary-tint); border-radius: 50%; display: flex; align-items: center; justify-content: center; flex-shrink: 0; color: var(--md-primary); }
        .carte-resultat-info { flex: 1; min-width: 0; }
        .carte-resultat-titre { font-size: 1rem; font-weight: 600; margin-bottom: 2px; }
        .carte-resultat-sous-titre { font-size: 0.875rem; color: var(--md-on-surface-medium); font-style: italic; margin-bottom: 2px; }
        .carte-resultat-auteur { font-size: 0.875rem; color: var(--md-on-surface-medium); margin-bottom: 8px; }
        .carte-resultat-chips { display: flex; flex-wrap: wrap; gap: 6px; }
        .chip--actif {
          background: var(--md-primary);
          color: var(--md-on-primary);
          font-weight: 600;
        }
        .chip--actif strong {
          color: rgba(255, 255, 255, 0.75);
          font-weight: 400;
        }
        .carte-resultat-fleche { color: #bdbdbd; flex-shrink: 0; }
        .resultats-vide { padding: 64px; text-align: center; display: flex; flex-direction: column; align-items: center; gap: 16px; color: var(--md-on-surface-medium); }
        .resultats-vide .material-icons { font-size: 48px; opacity: 0.4; }
        .carte-resultat--transcription { border-left: 3px solid var(--md-primary); }
        .extrait-transcription { display: flex; align-items: flex-start; gap: 8px; margin-top: 10px; padding: 10px 12px; background: #f5f5f5; border-radius: 4px; border-left: 3px solid color-mix(in oklch, var(--color-primary) 30%, white); }
        .extrait-icone { font-size: 16px !important; color: color-mix(in oklch, var(--color-primary) 50%, white); flex-shrink: 0; margin-top: 2px; }
        .extrait-texte { font-family: 'Crimson Pro', Georgia, serif; font-size: 0.9rem; line-height: 1.6; color: #424242; margin: 0; }
        .extrait-ellipse { color: #9e9e9e; margin: 0 2px; }
        .extrait-mark { background: color-mix(in oklch, yellow 85%, var(--color-primary)); color: #212121; padding: 0 2px; border-radius: 2px; font-weight: 600; }
      `}</style>
    </div>
  )
}