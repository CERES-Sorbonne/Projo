/**
 * rechercheTexte.js — logique de recherche plein-texte dans les transcriptions.
 *
 * Module sans UI, utilisable côté client (recherche multi-livres sur /recherche
 * et recherche dans un seul ouvrage sur /livres/[id]).
 *
 * IMPORTANT : ne jamais importer parseData.ts ici (il dépend de node:fs et
 * casserait le bundle client). Les chunks arrivent toujours en paramètre :
 *   chunksParLivre : { [livreId]: { id, pageN, texte }[] }
 */
import * as fuzzySearch from '@m31coding/fuzzy-search'

// ─── Indexation ───────────────────────────────────────────────────────────────

/**
 * Construit la map mot -> [{ livreId, chunkId, positions: number[] }]
 * Les positions sont les indices du mot dans la séquence de mots du chunk.
 */
export function construireIndexMots(chunksParLivre) {
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

/**
 * Construit l'index fuzzy des mots + la map mot → chunks.
 * Retourne { indexMots, mapMotsVersChunks } à passer à rechercherMultimots.
 */
export function creerIndexRecherche(chunksParLivre) {
  const mapMotsVersChunks = construireIndexMots(chunksParLivre)

  const indexMots = fuzzySearch.SearcherFactory.createDefaultSearcher()
  const entitesMots = Array.from(mapMotsVersChunks.keys()).map(m => ({ mot: m }))
  indexMots.indexEntities(entitesMots, e => e.mot, e => [e.mot])

  return { indexMots, mapMotsVersChunks }
}

/** Découpe une requête utilisateur en mots normalisés. */
export function decouperRequete(recherche) {
  return recherche.trim().toLowerCase().split(/\s+/).filter(m => m.length > 0)
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
 * Retourne {
 *   extraitsParLivre:    Map<livreId, { texte, pageN, chunkId }[]>,
 *   motsMatchesParLivre: Map<livreId, Set<string>>
 * }
 */
export function rechercherMultimots(
  mots, indexMots, mapMotsVersChunks, idsFiltres, chunksParLivre,
  { maxExtraitsParLivre = 10 } = {}
) {
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
    if (eArr.length < maxExtraitsParLivre && chunk) {
      eArr.push({ texte: chunk.texte, pageN: chunk.pageN, chunkId })
    }

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
