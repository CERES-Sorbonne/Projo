/**
* MoteurFacettes.jsx
*/
import { useState, useMemo, useEffect } from 'react'
import * as fuzzySearch from '@m31coding/fuzzy-search'

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
function ExtraitTranscription({ texte, motsMatches }) {
  if (!texte || !motsMatches || motsMatches.length === 0) return null

  // Création d'une regex qui matche tous les mots trouvés par l'index flou
  // On les trie par longueur décroissante pour éviter que "chat" ne coupe "château"
  const pattern = motsMatches
    .filter(Boolean)
    .sort((a, b) => b.length - a.length)
    .map(m => m.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('|')
    
  if (!pattern) return <p className="extrait-texte">{texte}</p>

  const regex = new RegExp(`(${pattern})`, 'gi')
  const parties = texte.split(regex)

  return (
    <div className="extrait-transcription">
      <span className="material-icons extrait-icone">format_quote</span>
      <p className="extrait-texte">
        <span className="extrait-ellipse">…</span>
        {parties.map((part, i) =>
          regex.test(part)
            ? <mark key={i} className="extrait-mark">{part}</mark>
            : part
        )}
        <span className="extrait-ellipse">…</span>
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
  // On exclut les clés techniques pour ne pas les afficher en chips
  const RESERVEES = new Set(['id', 'titre', 'sous_titre', 'auteur', 'manifeste_url', '_extraits', '_motsMatches'])
  const metaSupp = colonnesMeta.filter(m => !RESERVEES.has(m.key))
  
  const extraits = livre._extraits || []
  const motsMatches = livre._motsMatches || []

  return (
    <div className={`carte-resultat${extraits.length > 0 ? ' carte-resultat--transcription' : ''}`}>
      {/* Partie Haute : Lien vers le livre */}
      <a href={`/livres/${livre.id}`} className="carte-resultat-lien-titre">
        <div className="carte-resultat-icone">
          <span className="material-icons">menu_book</span>
        </div>
        <div className="carte-resultat-info">
          <h3 className="carte-resultat-titre">{livre.titre}</h3>
          {livre.sous_titre && <p className="carte-resultat-sous-titre">{livre.sous_titre}</p>}
          <p className="carte-resultat-auteur">{auteurs}</p>
        </div>
        <span className="material-icons carte-resultat-fleche">chevron_right</span>
      </a>

      {/* Partie Basse : Métadonnées et Extraits */}
      <div className="carte-resultat-details">
        <div className="carte-resultat-chips">
          {metaSupp.map(m => {
            const actif = estFiltreActif(m, livre, filtresActifs);
            return (
              <span key={m.key} className={`chip${actif ? ' chip--actif' : ''}`}>
                <strong>{m.label}</strong>&nbsp;{String(livre[m.key] ?? '')}
              </span>
            );
          })}
          
          {/* Chip spécial si on a trouvé des occurrences dans la transcription */}
          {extraits.length > 0 && (
            <span className="chip chip--actif">
              <span className="material-icons" style={{ fontSize: '13px' }}>history_edu</span>
              {extraits.length} passage{extraits.length > 1 ? 's' : ''} trouvé{extraits.length > 1 ? 's' : ''}
            </span>
          )}
        </div>

        {extraits.length > 0 && (
          <div className="extraits-container">
            {extraits.map((texte, idx) => (
              <ExtraitTranscription key={idx} texte={texte} motsMatches={motsMatches} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
// ─── Moteur principal ─────────────────────────────────────────────────────────

export default function MoteurFacettes({ livres, chunksParLivre, colonnesMeta }) {
  const [recherche, setRecherche] = useState('')
  const [filtres, setFiltres] = useState({})

  const majFiltres = (key, valeur) => setFiltres(prev => ({ ...prev, [key]: valeur }))
  const reinitialiser = () => { setRecherche(''); setFiltres({}); }

  // Indexation par mots (optimisée)
  const { indexMeta, indexMots, mapMotsVersChunks } = useMemo(() => {
    const iMeta = fuzzySearch.SearcherFactory.createDefaultSearcher()
    iMeta.indexEntities(livres, e => e.id, e => [e.titre ?? '', e.sous_titre ?? '', Array.isArray(e.auteur) ? e.auteur.join(' ') : (e.auteur ?? '')])

    const mapMots = new Map()
    Object.entries(chunksParLivre).forEach(([livreId, chunks]) => {
      chunks.forEach(chunk => {
        const mots = chunk.texte.toLowerCase().split(/[\s,.;:!?()'"«»]+/).filter(m => m.length > 2)
        new Set(mots).forEach(mot => {
          if (!mapMots.has(mot)) mapMots.set(mot, [])
          mapMots.get(mot).push({ livreId, texte: chunk.texte })
        })
      })
    })

    const iMots = fuzzySearch.SearcherFactory.createDefaultSearcher()
    const entitesMots = Array.from(mapMots.keys()).map(m => ({ mot: m }))
    iMots.indexEntities(entitesMots, e => e.mot, e => [e.mot])

    return { indexMeta: iMeta, indexMots: iMots, mapMotsVersChunks: mapMots }
  }, [livres, chunksParLivre])

  const resultats = useMemo(() => {
    // 1. Filtrage facettes
    const livresFiltres = livres.filter(livre => {
      return colonnesMeta.every(meta => {
        const filtre = filtres[meta.key]
        if (!filtre || (Array.isArray(filtre) && filtre.length === 0)) return true
        const valeur = String(livre[meta.key] ?? '')
        if (meta.type === 'select') return filtre.includes(valeur)
        if (meta.type === 'range') return Number(valeur) >= filtre[0] && Number(valeur) <= filtre[1]
        if (meta.type === 'text') return valeur.toLowerCase().includes(String(filtre).toLowerCase())
        return true
      })
    })

    if (!recherche.trim()) return livresFiltres.map(l => ({ ...l, _extraits: [] }))

    const idsFiltres = new Set(livresFiltres.map(l => l.id))
    
    // 2. Recherche Meta
    const hitsMeta = new Set(
      indexMeta.getMatches(new fuzzySearch.Query(recherche, Infinity))
        .matches.map(m => m.entity.id)
        .filter(id => idsFiltres.has(id))
    )

    // 3. Recherche Mots floue
    const hitsMots = indexMots.getMatches(
      new fuzzySearch.Query(recherche, Infinity, [
        new fuzzySearch.SubstringSearcher(0),
        new fuzzySearch.FuzzySearcher(0.2)
      ])
    ).matches

    const extraitsParLivre = new Map()
    const motsMatchesParLivre = new Map() // livreId -> Set de mots trouvés

    for (const hit of hitsMots) {
      const motTrouve = hit.entity.mot
      const occurrences = mapMotsVersChunks.get(motTrouve) || []

      for (const occ of occurrences) {
        if (!idsFiltres.has(occ.livreId)) continue

        // Gestion des extraits (max 5 par livre)
        if (!extraitsParLivre.has(occ.livreId)) extraitsParLivre.set(occ.livreId, new Set())
        const eSet = extraitsParLivre.get(occ.livreId)
        if (eSet.size < 5) eSet.add(occ.texte)

        // Stockage du mot pour le highlight
        if (!motsMatchesParLivre.has(occ.livreId)) motsMatchesParLivre.set(occ.livreId, new Set())
        motsMatchesParLivre.get(occ.livreId).add(motTrouve)
      }
    }

    const tousIds = new Set([...hitsMeta, ...extraitsParLivre.keys()])

    return [...tousIds]
      .map(id => {
        const livre = livresFiltres.find(l => l.id === id)
        if (!livre) return null
        return {
          ...livre,
          _extraits: Array.from(extraitsParLivre.get(id) || []),
          _motsMatches: Array.from(motsMatchesParLivre.get(id) || [recherche.toLowerCase()])
        }
      })
      .filter(Boolean)
  }, [recherche, filtres, livres, colonnesMeta, indexMeta, indexMots, mapMotsVersChunks])

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
                <CarteResultat
                  key={livre.id}
                  livre={livre}
                  colonnesMeta={colonnesMeta}
                  filtresActifs={filtres}
                  recherche={recherche}   // ← ajouter
                />
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