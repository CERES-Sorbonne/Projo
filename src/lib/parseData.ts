/**
 * parseData.ts
 * Lit le CSV des métadonnées et les XML de transcription au moment du build Astro.
 * Détecte automatiquement les types de colonnes pour générer les facettes.
 */

import fs from 'node:fs'
import path from 'node:path'
import { XMLParser } from 'fast-xml-parser'

// Chemin vers les données — configurable via variable d'environnement
const DATA_PATH = process.env.DATA_PATH ?? path.resolve('./data')

// ─── Types ────────────────────────────────────────────────────────────────────

export type ColonneType = 'range' | 'select' | 'text' | 'reserved'

export interface ColonneMeta {
  key: string
  label: string       // nom lisible (underscores → espaces, capitalisé)
  type: ColonneType
  valeurs?: string[]  // pour type 'select'
  min?: number        // pour type 'range'
  max?: number        // pour type 'range'
}

export interface Livre {
  id: string
  titre: string
  sous_titre?: string
  auteur: string | string[]
  manifeste_url: string
  [key: string]: unknown  // colonnes libres
}

export interface LivreAvecTranscription extends Livre {
  transcriptionHtml: string
  transcriptionPages: TranscriptionPage[]
}

export interface TranscriptionPage {
  n: string | number
  html: string
}

// ─── Colonnes réservées (non transformées en facettes) ───────────────────────

const COLONNES_RESERVEES = new Set(['id', 'titre', 'sous_titre', 'auteur', 'manifeste_url'])

// ─── Lecture du CSV ──────────────────────────────────────────────────────────

function parseCSV(contenu: string): Record<string, string>[] {
  // Tokenisation complète RFC 4180 : gère guillemets, virgules et
  // sauts de ligne à l'intérieur des cellules (fréquents dans les CSV Excel)
  function tokeniser(csv: string): string[][] {
    const lignes: string[][] = []
    let ligneCourante: string[] = []
    let cellule = ''
    let dansGuillemets = false
    let i = 0
    while (i < csv.length) {
      const c = csv[i]
      const suivant = csv[i + 1]
      if (dansGuillemets) {
        if (c === '"' && suivant === '"') { cellule += '"'; i += 2 }
        else if (c === '"') { dansGuillemets = false; i++ }
        // Saut de ligne DANS une cellule → remplacé par espace
        else { cellule += (c === '\r' || c === '\n') ? ' ' : c; i++ }
      } else {
        if (c === '"') { dansGuillemets = true; i++ }
        else if (c === ',') { ligneCourante.push(cellule.trim()); cellule = ''; i++ }
        else if (c === '\r' && suivant === '\n') {
          ligneCourante.push(cellule.trim()); lignes.push(ligneCourante)
          ligneCourante = []; cellule = ''; i += 2
        } else if (c === '\n' || c === '\r') {
          ligneCourante.push(cellule.trim()); lignes.push(ligneCourante)
          ligneCourante = []; cellule = ''; i++
        } else { cellule += c; i++ }
      }
    }
    if (cellule || ligneCourante.length > 0) { ligneCourante.push(cellule.trim()); lignes.push(ligneCourante) }
    return lignes
  }

  const toutes = tokeniser(contenu).filter(l => l.some(c => c !== ''))
  if (toutes.length < 2) return []

  // Nettoyage des en-têtes : sauts de ligne internes → espace simple
  const entetes = toutes[0].map(h => h.replace(/\s+/g, ' ').trim())

  return toutes.slice(1).map(valeurs =>
    Object.fromEntries(entetes.map((h, i) => [h, valeurs[i] ?? '']))
  )
}

// ─── Détection automatique du type de colonne ────────────────────────────────

function detecterTypeColonne(key: string, valeurs: string[]): ColonneType {
  // Préfixe explicite dans le nom de colonne
  if (key.startsWith('range__')) return 'range'
  if (key.startsWith('select__')) return 'select'
  if (key.startsWith('text__')) return 'text'

  // Colonne réservée
  if (COLONNES_RESERVEES.has(key)) return 'reserved'

  // Toutes les valeurs sont numériques → range
  const valeursNonVides = valeurs.filter(v => v !== '')
  if (valeursNonVides.length > 0 && valeursNonVides.every(v => !isNaN(Number(v)))) {
    return 'range'
  }

  // Peu de valeurs uniques (< 20) → select
  const uniques = new Set(valeursNonVides)
  if (uniques.size <= 10) {
    return 'select'
  }

  // Sinon → texte libre
  return 'text'
}

function nomLisible(key: string): string {
  // Enlever les préfixes de type
  const sansPrefixe = key.replace(/^(range|select|text)__/, '')
  return sansPrefixe
    .split('_')
    .map(mot => mot.charAt(0).toUpperCase() + mot.slice(1))
    .join(' ')
}

// ─── Transformation XML → HTML ───────────────────────────────────────────────

/**
 * Règles de transformation des balises XML en HTML.
 * À enrichir selon vos besoins.
 */
const REGLES_BALISES: Record<string, { tag: string; classe?: string }> = {
  paragraphe: { tag: 'p', classe: 'transcription-paragraphe' },
  persName:   { tag: 'span', classe: 'transcription-personne' },
  placeName:  { tag: 'span', classe: 'transcription-lieu' },
  hi:         { tag: 'em', classe: 'transcription-hi' },
  note:       { tag: 'aside', classe: 'transcription-note' },
  titre_section: { tag: 'h3', classe: 'transcription-titre' },
}

function xmlNodeVersHtml(node: unknown, nomBalise?: string): string {
  if (typeof node === 'string' || typeof node === 'number') {
    return String(node)
  }
  if (typeof node !== 'object' || node === null) return ''

  const obj = node as Record<string, unknown>
  let html = ''

  for (const [key, valeur] of Object.entries(obj)) {
    if (key === '@_rend' || key === '@_n' || key.startsWith('@_')) continue

    const regle = REGLES_BALISES[key]
    const contenuEnfants = Array.isArray(valeur)
      ? valeur.map(v => xmlNodeVersHtml(v, key)).join('')
      : xmlNodeVersHtml(valeur, key)

    if (regle) {
      const attrs = regle.classe ? ` class="${regle.classe}"` : ''
      // Passer l'attribut rend si présent
      const rend = (obj['@_rend'] as string) ?? ''
      const dataRend = rend ? ` data-rend="${rend}"` : ''
      html += `<${regle.tag}${attrs}${dataRend}>${contenuEnfants}</${regle.tag}>`
    } else if (key === 'page') {
      // Les pages sont traitées séparément
      html += contenuEnfants
    } else {
      // Balise inconnue → span avec classe générique
      html += `<span class="transcription-${key}">${contenuEnfants}</span>`
    }
  }

  return html
}

function xmlVersPages(xmlContenu: string): TranscriptionPage[] {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    preserveOrder: false,
    textNodeName: '#text',
  })

  let parsed: Record<string, unknown>
  try {
    parsed = parser.parse(xmlContenu)
  } catch (e) {
    console.error('Erreur parsing XML:', e)
    return []
  }

  const transcription = parsed['transcription'] as Record<string, unknown> | undefined
  if (!transcription) return []

  const pagesRaw = transcription['page']
  if (!pagesRaw) return []

  const pages = Array.isArray(pagesRaw) ? pagesRaw : [pagesRaw]

  return pages.map((page: unknown) => {
    const p = page as Record<string, unknown>
    const n = (p['@_n'] as string | number) ?? '?'
    const html = xmlNodeVersHtml(p)
    return { n, html }
  })
}

// ─── API publique ─────────────────────────────────────────────────────────────

export function getLivres(): Livre[] {
  const csvPath = path.join(DATA_PATH, 'metadata.csv')
  const contenu = fs.readFileSync(csvPath, 'utf-8')
  const lignes = parseCSV(contenu)

  return lignes.map(ligne => ({
    ...ligne,
    auteur: ligne.auteur?.includes(';')
      ? ligne.auteur.split(';').map(a => a.trim())
      : ligne.auteur,
  })) as Livre[]
}

export function getLivreAvecTranscription(id: string): LivreAvecTranscription | null {
  const livres = getLivres()
  const livre = livres.find(l => l.id === id)
  if (!livre) return null

  const xmlPath = path.join(DATA_PATH, 'transcriptions', `${id}.xml`)
  let transcriptionPages: TranscriptionPage[] = []
  let transcriptionHtml = ''

  if (fs.existsSync(xmlPath)) {
    const xmlContenu = fs.readFileSync(xmlPath, 'utf-8')
    transcriptionPages = xmlVersPages(xmlContenu)
    transcriptionHtml = transcriptionPages.map(p => p.html).join('\n')
  }

  return { ...livre, transcriptionHtml, transcriptionPages }
}

export function getColonnesMeta(livres: Livre[]): ColonneMeta[] {
  if (livres.length === 0) return []

  const colonnes = Object.keys(livres[0])

  return colonnes
    .map(key => {
      const valeurs = livres.map(l => String(l[key] ?? ''))
      const type = detecterTypeColonne(key, valeurs)
      if (type === 'reserved') return null

      const meta: ColonneMeta = {
        key,
        label: nomLisible(key),
        type,
      }

      if (type === 'select') {
        meta.valeurs = [...new Set(valeurs.filter(v => v !== ''))].sort()
      }

      if (type === 'range') {
        const nombres = valeurs.filter(v => v !== '').map(Number)
        meta.min = Math.min(...nombres)
        meta.max = Math.max(...nombres)
      }

      return meta
    })
    .filter((m): m is ColonneMeta => m !== null)
}

// ─── Note sur le CSV ──────────────────────────────────────────────────────────
// Les colonnes obligatoires sont : id, titre, auteur, manifeste_url
// Les en-têtes avec sauts de ligne Excel (ex: "Manuscrit /\nimprimé") sont
// automatiquement normalisés en "Manuscrit / imprimé" par le parser.