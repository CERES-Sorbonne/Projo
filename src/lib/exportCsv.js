/**
 * exportCsv.js — téléchargement des résultats de recherche au format CSV.
 */

export function telechargerResultats(resultats, colonnesMeta, chunksParLivre) {
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
