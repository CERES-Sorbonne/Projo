import { useState, useMemo } from 'react'
import { creerIndexRecherche, decouperRequete, rechercherMultimots } from '../../lib/rechercheTexte'
import ExtraitTranscription from './ExtraitTranscription.jsx'
import '../../styles/recherche-livre.css'

/**
 * Recherche plein-texte dans l'ouvrage en cours de visualisation.
 * Au clic sur un résultat, émet `transcription:goto { index }`, écouté par
 * le script inline de /livres/[id] qui affiche la page dans le mode actif
 * et synchronise le viewer IIIF.
 *
 * pageNVersIndex : { [pageN]: index } — pageN est l'attribut XML @n,
 * index la position dans transcriptionPages (= canvas IIIF).
 */
export default function RechercheLivre({ livreId, chunks, pageNVersIndex }) {
  const [requete, setRequete] = useState('')

  const chunksParLivre = useMemo(() => ({ [livreId]: chunks }), [livreId, chunks])

  const { indexMots, mapMotsVersChunks } = useMemo(
    () => creerIndexRecherche(chunksParLivre),
    [chunksParLivre]
  )

  const { extraits, motsMatches } = useMemo(() => {
    if (!requete.trim()) return { extraits: [], motsMatches: [] }
    const mots = decouperRequete(requete)
    const { extraitsParLivre, motsMatchesParLivre } = rechercherMultimots(
      mots, indexMots, mapMotsVersChunks, new Set([livreId]), chunksParLivre,
      { maxExtraitsParLivre: 30 }
    )
    return {
      extraits: extraitsParLivre.get(livreId) ?? [],
      motsMatches: Array.from(motsMatchesParLivre.get(livreId) ?? [requete.toLowerCase()])
    }
  }, [requete, livreId, indexMots, mapMotsVersChunks, chunksParLivre])

  const allerALaPage = (pageN) => {
    const index = pageNVersIndex[String(pageN)]
    if (index === undefined) return
    window.dispatchEvent(new CustomEvent('transcription:goto', { detail: { index } }))
  }

  return (
    <div className="recherche-livre">
      <div className="recherche-livre-barre">
        <span className="material-icons recherche-livre-icone">manage_search</span>
        <input
          className="recherche-livre-input"
          type="text"
          placeholder="Rechercher dans cet ouvrage…"
          value={requete}
          onChange={e => setRequete(e.target.value)}
        />
        {requete && (
          <button className="recherche-livre-reset" onClick={() => setRequete('')} title="Effacer la recherche">
            <span className="material-icons">close</span>
          </button>
        )}
      </div>

      {requete.trim() && (
        <div className="recherche-livre-resultats carte">
          <p className="recherche-livre-compteur">
            {extraits.length === 0
              ? 'Aucun passage trouvé.'
              : <><strong>{extraits.length}</strong> passage{extraits.length > 1 ? 's' : ''} trouvé{extraits.length > 1 ? 's' : ''} — cliquez pour afficher la page</>}
          </p>
          {extraits.length > 0 && (
            <ul className="recherche-livre-liste">
              {extraits.map(extrait => {
                const accessible = pageNVersIndex[String(extrait.pageN)] !== undefined
                return (
                  <li key={extrait.chunkId}>
                    <button
                      className="recherche-livre-resultat"
                      onClick={() => allerALaPage(extrait.pageN)}
                      disabled={!accessible}
                      title={accessible ? `Aller à la page ${extrait.pageN}` : undefined}
                    >
                      <ExtraitTranscription texte={extrait.texte} motsMatches={motsMatches} pageN={extrait.pageN} />
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
