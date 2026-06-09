import ExtraitTranscription from './ExtraitTranscription.jsx'
import { url } from '../../lib/url'
import '../../styles/carte-resultat.css'

function estFiltreActif(meta, livre, filtres) {
  const filtre = filtres[meta.key]
  if (!filtre || (Array.isArray(filtre) && filtre.length === 0)) return false
  const valeur = String(livre[meta.key] ?? '')
  if (meta.type === 'select') return Array.isArray(filtre) && filtre.includes(valeur)
  if (meta.type === 'range') return Array.isArray(filtre) && (Number(valeur) >= filtre[0] && Number(valeur) <= filtre[1])
  if (meta.type === 'text') return !!filtre && valeur.toLowerCase().includes(String(filtre).toLowerCase())
  return false
}

export default function CarteResultat({ livre, colonnesMeta, filtresActifs }) {
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
            {extraits.map((extrait, idx) => (
              <ExtraitTranscription key={idx} texte={extrait.texte} pageN={extrait.pageN} motsMatches={motsMatches} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
