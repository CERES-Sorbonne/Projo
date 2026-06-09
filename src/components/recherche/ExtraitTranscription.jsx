import '../../styles/extrait-transcription.css'

/**
 * Affiche un extrait de chunk avec les mots matchés surlignés.
 * pageN (optionnel) : numéro de page affiché en fin d'extrait.
 */
export default function ExtraitTranscription({ texte, motsMatches, pageN }) {
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
        {pageN !== undefined && pageN !== null && (
          <span className="extrait-page">p. {pageN}</span>
        )}
      </p>
    </div>
  )
}
