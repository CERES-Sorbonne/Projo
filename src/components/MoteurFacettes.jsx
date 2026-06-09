/**
 * MoteurFacettes.jsx — orchestrateur du moteur de recherche à facettes.
 * La logique de recherche vit dans src/lib/rechercheTexte.js,
 * les sous-composants dans src/components/recherche/.
 */
import { useState, useMemo } from 'react'
import * as fuzzySearch from '@m31coding/fuzzy-search'
import { creerIndexRecherche, decouperRequete, rechercherMultimots } from '../lib/rechercheTexte'
import { telechargerResultats } from '../lib/exportCsv'
import { FacetteSelect, FacetteRange, FacetteTexte } from './recherche/Facettes.jsx'
import CarteResultat from './recherche/CarteResultat.jsx'
import '../styles/moteur-facettes.css'

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

    const { indexMots: iMots, mapMotsVersChunks: mapMots } = creerIndexRecherche(chunksParLivre)

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

    const mots = decouperRequete(recherche)
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
    </div>
  )
}
