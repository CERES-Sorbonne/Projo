/**
 * MoteurFacettes.jsx
 */
import { useState, useMemo } from 'react'
import * as fuzzySearch from '@m31coding/fuzzy-search'
import {url} from '../lib/url'

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
 * Affiche un extrait de chunk avec les mots matchés surlignés.
 */
function ExtraitTranscription({ texte, motsMatches }) {
  if (!texte || !motsMatches || motsMatches.length === 0) return null

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
          new RegExp(`^(${pattern})$`, 'i').test(part)
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
  const RESERVEES = new Set(['id', 'titre', 'sous_titre', 'auteur', 'manifeste_url', '_extraits', '_motsMatches'])
  const metaSupp = colonnesMeta.filter(m => !RESERVEES.has(m.key))
  const extraits = livre._extraits || []
  const motsMatches = livre._motsMatches || []

  return (
    <div className={`carte-resultat${extraits.length > 0 ? ' carte-resultat--transcription' : ''}`}>
      <a href={url(`/livres/${livre.id}`)} className="carte-resultat-lien-titre">
        <div className="carte-resultat-entete">
          <div className="carte-resultat-icone">
            <span className="material-icons">menu_book</span>
          </div>
          <div className="carte-resultat-info">
            <h3 className="carte-resultat-titre">{livre.titre}</h3>
            {livre.sous_titre && <p className="carte-resultat-sous-titre">{livre.sous_titre}</p>}
            <p className="carte-resultat-auteur">{auteurs}</p>
          </div>
          <span className="material-icons carte-resultat-fleche">chevron_right</span>
        </div>
      </a>
      <div className="carte-resultat-details">
        <div className="carte-resultat-chips">
          {metaSupp.map(m => {
            const actif = estFiltreActif(m, livre, filtresActifs)
            return (
              <span key={m.key} className={`chip${actif ? ' chip--actif' : ''}`}>
                <strong>{m.label}</strong>&nbsp;{String(livre[m.key] ?? '')}
              </span>
            )
          })}
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

// ─── Indexation ───────────────────────────────────────────────────────────────

/**
 * Construit la map mot -> [{ livreId, chunkId, positions: number[] }]
 * Les positions sont les indices du mot dans la séquence de mots du chunk.
 */
function construireIndexMots(chunksParLivre) {
  const mapMots = new Map()
  Object.entries(chunksParLivre).forEach(([livreId, chunks]) => {
    chunks.forEach(chunk => {
      const mots = chunk.texte.toLowerCase().split(/[\s,.;:!?()'"«»]+/).filter(m => m.length > 2)
      mots.forEach((mot, position) => {
        if (!mapMots.has(mot)) mapMots.set(mot, [])
        const occurrences = mapMots.get(mot)
        const existing = occurrences.find(o => o.chunkId === chunk.id)
        if (existing) {
          existing.positions.push(position)
        } else {
          occurrences.push({ livreId, chunkId: chunk.id, positions: [position] })
        }
      })
    })
  })
  return mapMots
}


// ─── Recherche multimots ──────────────────────────────────────────────────────

/**
 * Vérifie que les mots matchés apparaissent dans l'ordre avec une tolérance
 * de 2 mots d'écart maximum entre chaque mot consécutif.
 * positionsParMot : number[][] — une liste de positions triées par mot de la query.
 */
function motsEnOrdreEtProches(positionsParMot) {
  function chercher(motIndex, dernierePosition) {
    if (motIndex === positionsParMot.length) return true
    return positionsParMot[motIndex].some(pos =>
      pos > dernierePosition && pos <= dernierePosition + 3 &&
      chercher(motIndex + 1, pos)
    )
  }
  return positionsParMot[0].some(pos => chercher(1, pos))
}


/**
 * Pour un mot de la query, retourne :
 *   allMatchingChunks : { [chunkId]: { livreId, chunkId, positions } }
 *   allMatchs         : Set des formes réellement matchées (pour highlight)
 */
function rechercherMotDansIndex(motQuery, indexMots, mapMotsVersChunks, idsFiltres) {
  const hits = indexMots.getMatches(
    new fuzzySearch.Query(motQuery, Infinity, [
      new fuzzySearch.SubstringSearcher(0),
      new fuzzySearch.FuzzySearcher(0.5)
    ])
  ).matches.filter(h => h.matchedString.length <= motQuery.length * 2)

  const allMatchs = new Set(hits.map(h => h.matchedString))
  const allMatchingChunks = {}

  for (const hit of hits) {
    const occurrences = mapMotsVersChunks.get(hit.matchedString) || []
    for (const occ of occurrences) {
      if (!idsFiltres.has(occ.livreId)) continue
      // Si le même chunk matche via plusieurs formes fuzzy, on fusionne les positions
      if (allMatchingChunks[occ.chunkId]) {
        allMatchingChunks[occ.chunkId].positions.push(...occ.positions)
      } else {
        allMatchingChunks[occ.chunkId] = { livreId: occ.livreId, chunkId: occ.chunkId, positions: [...occ.positions] }
      }
    }
  }

  return { allMatchingChunks, allMatchs }
}

/**
 * Score d'un chunk (plus bas = meilleur) :
 *   tous les mots + ordre + proches → 0
 *   tous les mots                   → 1
 *   n-1 mots + ordre + proches      → 2
 *   n-1 mots                        → 3
 *   ...
 */
function scorerChunk(positionsParMotMatché, indicesMotsMatchés, nbMotsTotal) {
  const nbMatchs = indicesMotsMatchés.length
  const manquants = nbMotsTotal - nbMatchs
  const ordreProche = nbMatchs > 1 ? motsEnOrdreEtProches(positionsParMotMatché) : true
  return manquants * 2 + (ordreProche ? 0 : 1)
}

/**
 * Recherche multimots avec scoring et tri.
 * Retourne { extraitsParLivre, motsMatchesParLivre }.
 */
function rechercherMultimots(mots, indexMots, mapMotsVersChunks, idsFiltres, chunksParLivre) {
  const motsSignificatifs = mots.filter(m => m.length > 2)
  if (motsSignificatifs.length === 0) return { extraitsParLivre: new Map(), motsMatchesParLivre: new Map() }

  const searchResults = motsSignificatifs.map(mot =>
    rechercherMotDansIndex(mot, indexMots, mapMotsVersChunks, idsFiltres)
  )

  // Union de tous les chunkIds candidats
  const tousChunkIds = new Set(searchResults.flatMap(r => Object.keys(r.allMatchingChunks)))

  // Calcul du score pour chaque chunk candidat
  const chunksScores = []
  for (const chunkId of tousChunkIds) {
    const [livreId] = chunkId.split('__')

    // Quels mots de la query ont matché ce chunk ?
    const indicesMatchés = []
    const positionsParMotMatché = []
    searchResults.forEach((r, i) => {
      if (r.allMatchingChunks[chunkId]) {
        indicesMatchés.push(i)
        positionsParMotMatché.push(r.allMatchingChunks[chunkId].positions)
      }
    })

    const score = scorerChunk(positionsParMotMatché, indicesMatchés, motsSignificatifs.length)
    chunksScores.push({ chunkId, livreId, score, indicesMatchés })
  }

  chunksScores.sort((a, b) => a.score - b.score)

  const extraitsParLivre = new Map()
  const motsMatchesParLivre = new Map()

  // Pour les requêtes multi-mots : regex de phrase qui intègre les formes fuzzy des mots
  // significatifs et les mots courts en position, pour ne surligner "de" que près de "Neri".
  let phraseRegex = null
  if (mots.length > 1) {
    let sigIdx = 0
    const parties = mots.map(mot => {
      if (mot.length <= 2) return mot.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      const forms = Array.from(searchResults[sigIdx++]?.allMatchs ?? [])
        .sort((a, b) => b.length - a.length)
      return forms.length
        ? `(?:${forms.map(f => f.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`
        : mot.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    })
    phraseRegex = new RegExp(parties.join(`[\\s,.;:!?()'"«»]+`), 'gi')
  }

  for (const { chunkId, livreId, indicesMatchés } of chunksScores) {
    if (!extraitsParLivre.has(livreId)) extraitsParLivre.set(livreId, [])
    const eArr = extraitsParLivre.get(livreId)
    const chunk = chunksParLivre[livreId]?.find(c => c.id === chunkId)
    if (eArr.length < 10 && chunk) eArr.push(chunk.texte)

    if (!motsMatchesParLivre.has(livreId)) motsMatchesParLivre.set(livreId, new Set())
    const mSet = motsMatchesParLivre.get(livreId)
    indicesMatchés.forEach(i => searchResults[i].allMatchs.forEach(m => mSet.add(m)))
    if (phraseRegex && chunk) {
      phraseRegex.lastIndex = 0
      for (const m of chunk.texte.matchAll(phraseRegex)) mSet.add(m[0].toLowerCase())
    }
  }

  return { extraitsParLivre, motsMatchesParLivre }
}
// ─── Export CSV ───────────────────────────────────────────────────────────────

function telechargerResultats(resultats, colonnesMeta, chunksParLivre) {
  const escapeCsv = val => {
    const s = String(val ?? '')
    return (s.includes('"') || s.includes(',') || s.includes('\n') || s.includes(';'))
      ? `"${s.replace(/"/g, '""')}"`
      : s
  }

  const RESERVEES = new Set(['id', 'titre', 'sous_titre', 'auteur', 'manifeste_url', '_extraits', '_motsMatches'])
  const colonnesExtra = colonnesMeta.filter(m => !RESERVEES.has(m.key))
  const entetes = ['id', 'titre', 'sous_titre', 'auteur', ...colonnesExtra.map(m => m.key), 'transcription']

  const lignes = [
    entetes.join(','),
    ...resultats.map(livre => {
      const chunks = chunksParLivre[livre.id] || []
      const transcription = chunks.map(c => c.texte).join(' ')
      return entetes.map(col => {
        if (col === 'transcription') return escapeCsv(transcription)
        if (col === 'auteur') return escapeCsv(Array.isArray(livre.auteur) ? livre.auteur.join('; ') : (livre.auteur ?? ''))
        return escapeCsv(livre[col])
      }).join(',')
    })
  ]

  const blob = new Blob(['﻿' + lignes.join('\n')], { type: 'text/csv;charset=utf-8;' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = 'resultats.csv'
  a.click()
  URL.revokeObjectURL(a.href)
}

// ─── Moteur principal ─────────────────────────────────────────────────────────

export default function MoteurFacettes({ livres, chunksParLivre, colonnesMeta }) {
  const [recherche, setRecherche] = useState('')
  const [filtres, setFiltres] = useState({})

  const majFiltres = (key, valeur) => setFiltres(prev => ({ ...prev, [key]: valeur }))
  const reinitialiser = () => { setRecherche(''); setFiltres({}) }

  const { indexMeta, indexMots, mapMotsVersChunks } = useMemo(() => {
    const iMeta = fuzzySearch.SearcherFactory.createDefaultSearcher()
    iMeta.indexEntities(
      livres,
      e => e.id,
      e => [e.titre ?? '', e.sous_titre ?? '', Array.isArray(e.auteur) ? e.auteur.join(' ') : (e.auteur ?? '')]
    )

    const mapMots = construireIndexMots(chunksParLivre)

    const iMots = fuzzySearch.SearcherFactory.createDefaultSearcher()
    const entitesMots = Array.from(mapMots.keys()).map(m => ({ mot: m }))
    iMots.indexEntities(entitesMots, e => e.mot, e => [e.mot])

    return { indexMeta: iMeta, indexMots: iMots, mapMotsVersChunks: mapMots }
  }, [livres, chunksParLivre])

  const resultats = useMemo(() => {
    const livresFiltres = livres.filter(livre =>
      colonnesMeta.every(meta => {
        const filtre = filtres[meta.key]
        if (!filtre || (Array.isArray(filtre) && filtre.length === 0)) return true
        const valeur = String(livre[meta.key] ?? '')
        if (meta.type === 'select') return filtre.includes(valeur)
        if (meta.type === 'range') return Number(valeur) >= filtre[0] && Number(valeur) <= filtre[1]
        if (meta.type === 'text') return valeur.toLowerCase().includes(String(filtre).toLowerCase())
        return true
      })
    )

    if (!recherche.trim()) return livresFiltres.map(l => ({ ...l, _extraits: [], _motsMatches: [] }))

    const idsFiltres = new Set(livresFiltres.map(l => l.id))

    const hitsMeta = new Set(
      indexMeta.getMatches(new fuzzySearch.Query(recherche, Infinity))
        .matches.map(m => m.entity.id)
        .filter(id => idsFiltres.has(id))
    )

    const mots = recherche.trim().toLowerCase().split(/\s+/).filter(m => m.length > 0)
    const { extraitsParLivre, motsMatchesParLivre } = rechercherMultimots(
      mots, indexMots, mapMotsVersChunks, idsFiltres, chunksParLivre
    )

    const tousIds = new Set([...hitsMeta, ...extraitsParLivre.keys()])

    return [...tousIds]
      .map(id => {
        const livre = livresFiltres.find(l => l.id === id)
        if (!livre) return null
        return {
          ...livre,
          _extraits: extraitsParLivre.get(id) || [],
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
            {resultats.length > 0 && (
              <button
                className="btn-telecharger"
                onClick={() => telechargerResultats(resultats, colonnesMeta, chunksParLivre)}
                title="Télécharger les résultats (CSV)"
              >
                <span className="material-icons">download</span>
                Télécharger
              </button>
            )}
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
        .resultats-entete { margin-bottom: 16px; display: flex; align-items: center; justify-content: space-between; gap: 12px; }
        .btn-telecharger { display: flex; align-items: center; gap: 4px; background: none; border: 1px solid var(--md-divider); border-radius: 20px; padding: 5px 14px; font-size: 0.8rem; cursor: pointer; color: var(--md-on-surface-medium); transition: all 180ms; font-family: var(--font-corps); white-space: nowrap; }
        .btn-telecharger:hover { background: var(--md-primary-tint); border-color: var(--md-primary); color: var(--md-primary); }
        .btn-telecharger .material-icons { font-size: 16px !important; }
        .resultats-compteur { color: var(--md-on-surface-medium); font-size: 0.875rem; }
        .resultats-compteur strong { color: var(--md-on-surface); }
        .resultats-liste { display: flex; flex-direction: column; gap: 12px; }
        .carte-resultat { display: flex; flex-direction: column; background: white; border-radius: 4px; box-shadow: 0 1px 3px rgba(0,0,0,.12); overflow: hidden; transition: box-shadow 200ms; }
        .carte-resultat:hover { box-shadow: 0 4px 12px rgba(0,0,0,.15); }
        .carte-resultat-lien-titre { display: block; text-decoration: none; color: inherit; }
        .carte-resultat-entete { display: flex; align-items: center; gap: 16px; padding: 16px 20px; }
        .carte-resultat-icone { width: 40px; height: 40px; background: var(--md-primary-tint); border-radius: 50%; display: flex; align-items: center; justify-content: center; flex-shrink: 0; color: var(--md-primary); }
        .carte-resultat-info { flex: 1; min-width: 0; }
        .carte-resultat-titre { font-size: 1rem; font-weight: 600; margin-bottom: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .carte-resultat-sous-titre { font-size: 0.875rem; color: var(--md-on-surface-medium); font-style: italic; margin-bottom: 2px; }
        .carte-resultat-auteur { font-size: 0.875rem; color: var(--md-on-surface-medium); margin-bottom: 0; }
        .carte-resultat-details { padding: 0 20px 16px; border-top: 1px solid var(--md-divider); }
        .carte-resultat-chips { display: flex; flex-wrap: wrap; gap: 6px; padding-top: 12px; }
        .carte-resultat-fleche { color: #bdbdbd; flex-shrink: 0; }
        .chip--actif { background: var(--md-primary); color: var(--md-on-primary); font-weight: 600; }
        .chip--actif strong { color: rgba(255, 255, 255, 0.75); font-weight: 400; }
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