/**
 * parseData.ts
 * Lit le CSV des métadonnées et les XML de transcription au moment du build Astro.
 * Détecte automatiquement les types de colonnes pour générer les facettes.
 * Détecte automatiquement le schéma XML et applique les règles de xmlRules.ts.
 */

import fs from 'node:fs'
import path from 'node:path'
import { XMLParser } from 'fast-xml-parser'
import { SCHEMA_RULES, detecterSchema, type XmlRuleMap } from './xmlRules'

// Chemin vers les données — configurable via variable d'environnement
const DATA_PATH = process.env.DATA_PATH ?? path.resolve('./data')

// ─── Types ────────────────────────────────────────────────────────────────────

export type ColonneType = 'range' | 'select' | 'text' | 'reserved'

export interface ColonneMeta {
  key: string
  label: string
  type: ColonneType
  valeurs?: string[]
  min?: number
  max?: number
}

export interface Livre {
  id: string
  titre: string
  sous_titre?: string
  auteur: string | string[]
  manifeste_url: string
  /** Éditions rattachées : lignes du CSV sans id qui suivent cet ouvrage. */
  editions?: Record<string, string>[]
  [key: string]: unknown
}

export interface LivreAvecTranscription extends Livre {
  transcriptionHtml: string
  transcriptionPages: TranscriptionPage[]
}

export interface TranscriptionChunk {
  id: string
  livreId: string
  pageN: string | number
  texte: string
}

export interface TranscriptionPage {
  n: string | number
  html: string
  ancres: Ancre[]   // liste des ancres navigables de la page
}

export interface Ancre {
  id: string        // id HTML de l'élément
  label: string     // texte court pour affichage (premiers mots)
  pageN: string | number
  inPassages?: boolean
}

// ─── Colonnes réservées ───────────────────────────────────────────────────────

const COLONNES_RESERVEES = new Set(['id', 'titre', 'sous_titre', 'auteur', 'manifeste_url', 'editions'])

// ─── Lecture du CSV ──────────────────────────────────────────────────────────

function parseCSV(contenu: string): Record<string, string>[] {
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
  const entetes = toutes[0].map(h => h.replace(/\s+/g, ' ').trim())
  return toutes.slice(1).map(valeurs =>
    Object.fromEntries(entetes.map((h, i) => [h, valeurs[i] ?? '']))
  )
}

// ─── Détection automatique du type de colonne ────────────────────────────────

function detecterTypeColonne(key: string, valeurs: string[]): ColonneType {
  if (key.startsWith('range__')) return 'range'
  if (key.startsWith('select__')) return 'select'
  if (key.startsWith('text__')) return 'text'
  if (COLONNES_RESERVEES.has(key)) return 'reserved'
  const valeursNonVides = valeurs.filter(v => v !== '')
  if (valeursNonVides.length > 0 && valeursNonVides.every(v => !isNaN(Number(v)))) return 'range'
  const uniques = new Set(valeursNonVides)
  if (uniques.size <= 10) return 'select'
  return 'text'
}

export function nomLisible(key: string): string {
  const sansPrefixe = key.replace(/^(range|select|text)__/, '')
  return sansPrefixe.split('_').map(mot => mot.charAt(0).toUpperCase() + mot.slice(1)).join(' ')
}

// ─── Moteur de rendu XML → HTML (preserveOrder: true) ────────────────────────
//
// Avec preserveOrder:true, fast-xml-parser retourne des tableaux de nœuds.
// Chaque nœud est un objet avec UNE seule clé = nom de la balise (ou '#text').
// Les attributs sont dans une clé ':@' séparée, au même niveau que la balise.
//
// Exemple pour <Paragraph type="x"><Line>Hello</Line></Paragraph> :
// [
//   { ':@': { '@_type': 'x' }, Paragraph: [ { Line: [ { '#text': 'Hello' } ] } ] }
// ]

type OrdredNode = Record<string, unknown>

let ancreCounter = 0

function genAncreId(balise: string): string {
  return `${balise}-${++ancreCounter}`
}

/**
 * Extrait le texte brut d'un tableau de nœuds ordonnés.
 */
function extraireTexteOrdered(nodes: OrdredNode[]): string {
  return nodes
    .map(node => {
      const key = Object.keys(node).find(k => k !== ':@')
      if (!key) return ''
      if (key === '#text') return String(node[key])
      const enfants = node[key]
      return Array.isArray(enfants) ? extraireTexteOrdered(enfants as OrdredNode[]) : ''
    })
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 60)
}

/**
 * Convertit un tableau de nœuds ordonnés en HTML.
 * C'est la fonction principale récursive.
 */
function nodesVersHtml(
  nodes: OrdredNode[],
  rules: XmlRuleMap,
  pageN: string | number,
  ancres: Ancre[],
): string {
  let html = ''

  for (const node of nodes) {
    // Clé du nœud (nom de balise ou '#text'), ':@' contient les attributs
    const key = Object.keys(node).find(k => k !== ':@')
    if (!key) continue

    // Nœud texte
    if (key === '#text') {
      html += String(node[key])
      continue
    }

    const keyLower = key.toLowerCase()
    const rule = rules[keyLower]
    const attrs = (node[':@'] ?? {}) as Record<string, string>
    const enfants = (node[key] ?? []) as OrdredNode[]

    // Règle : ignorer complètement
    if (rule?.ignore) continue

    // Règle : traverser sans générer de balise
    if (rule?.skipSelf) {
      html += nodesVersHtml(enfants, rules, pageN, ancres)
      continue
    }

    // Contenu enfants
    const contenu = nodesVersHtml(enfants, rules, pageN, ancres)

    // Pas de règle connue → span générique
    if (!rule?.tag) {
      html += `<span class="transcription-${keyLower}">${contenu}</span>`
      continue
    }

    // Attributs HTML supplémentaires via la fonction attrs de la règle
    // On lui passe les attributs XML du nœud (normalisés sans préfixe @_)
    const attrsXml: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(attrs)) {
      attrsXml[k] = v  // k est déjà sous la forme '@_xxx'
    }
    const attrsExtra = rule.attrs ? rule.attrs(attrsXml) : {}

    // Ancre cliquable
    let ancreHtml = ''
    let idAttr = ''
    if (rule.anchorable) {
      const ancreId = genAncreId(keyLower)
      idAttr = ancreId
      const label = extraireTexteOrdered(enfants)
      ancres.push({ id: ancreId, label: label || keyLower, pageN, inPassages: rule.listePassages ?? false })
      ancreHtml = `<a class="transcription-ancre" href="#${ancreId}" aria-label="Lien direct vers ce passage" title="Lien direct">#</a>`
    }

    const attrsStr = [
      rule.classe ? `class="${rule.classe}"` : '',
      idAttr      ? `id="${idAttr}"`         : '',
      ...Object.entries(attrsExtra).map(([k, v]) => `${k}="${v}"`),
    ].filter(Boolean).join(' ')

    html += `<${rule.tag}${attrsStr ? ' ' + attrsStr : ''}>${ancreHtml}${contenu}</${rule.tag}>`
  }

  return html
}

// ─── Découpage en pages ───────────────────────────────────────────────────────

function xmlVersPages(xmlContenu: string): TranscriptionPage[] {
  ancreCounter = 0

  const schemaName = detecterSchema(xmlContenu)
  const rules = SCHEMA_RULES[schemaName] ?? SCHEMA_RULES['default']

  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    preserveOrder: true,       // ← préserve l'ordre et la structure exacte du XML
    textNodeName: '#text',
    removeNSPrefix: true,
  })

  let parsed: OrdredNode[]
  try {
    parsed = parser.parse(xmlContenu) as OrdredNode[]
  } catch (e) {
    console.error('[parseData] Erreur parsing XML:', e)
    return []
  }

  // Trouver la racine (ignorer '?xml')
  const racineNode = parsed.find(n => {
    const k = Object.keys(n).find(k => k !== ':@')
    return k && k !== '?xml'
  })
  if (!racineNode) return []

  const racineKey = Object.keys(racineNode).find(k => k !== ':@')!
  const racineEnfants = (racineNode[racineKey] ?? []) as OrdredNode[]

  // Chercher les nœuds <Page> (insensible à la casse)
  const pageNodes = racineEnfants.filter(n => {
    const k = Object.keys(n).find(k => k !== ':@')
    return k?.toLowerCase() === 'page'
  })

  if (pageNodes.length === 0) {
    // Pas de pagination → tout en une seule page
    const ancres: Ancre[] = []
    const html = nodesVersHtml(racineEnfants, rules, 1, ancres)
    return [{ n: 1, html, ancres }]
  }

  return pageNodes.map(pageNode => {
    const pageKey = Object.keys(pageNode).find(k => k !== ':@')!
    const attrs = (pageNode[':@'] ?? {}) as Record<string, string>
    const n = attrs['@_n'] ?? '?'
    const enfants = (pageNode[pageKey] ?? []) as OrdredNode[]
    const ancres: Ancre[] = []
    const html = nodesVersHtml(enfants, rules, n, ancres)
    return { n, html, ancres }
  })
}

// ─── API publique ─────────────────────────────────────────────────────────────

export function getLivres(): Livre[] {
  const csvPath = path.join(DATA_PATH, 'metadata.csv')
  const contenu = fs.readFileSync(csvPath, 'utf-8')
  const lignes = parseCSV(contenu)

  // Une ligne sans id est considérée comme une édition de l'ouvrage précédent
  // (la dernière ligne possédant un id). On la replie dans son tableau `editions`.
  const livres: Livre[] = []
  for (const ligne of lignes) {
    if (ligne.id && ligne.id.trim() !== '') {
      livres.push({
        ...ligne,
        auteur: ligne.auteur?.includes(';')
          ? ligne.auteur.split(';').map(a => a.trim())
          : ligne.auteur,
        editions: [],
      } as Livre)
    } else if (livres.length > 0) {
      livres[livres.length - 1].editions!.push(ligne)
    }
  }
  return livres
}

export function createIndex(livreIds: string[]){
  const transcriptions = []
  for(let livreId of livreIds){
    transcriptions.push()
  }
}

/** Découpe les transcriptions en chunks de ~300 chars avec chevauchement de 80 chars */
export function getChunksTranscription(livreId: string): TranscriptionChunk[] {
  const livre = getLivreAvecTranscription(livreId)
  if (!livre) return []

  const TAILLE = 300
  const CHEVAUCHEMENT = 15
  const chunks: TranscriptionChunk[] = []

  for (const page of livre.transcriptionPages) {
    // Texte brut de la page (sans balises HTML)
    const texte = page.html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
    if (!texte) continue

    let debut = 0
    let i = 0
    while (debut < texte.length) {
      const fin = Math.min(debut + TAILLE, texte.length)
      chunks.push({
        id: `${livreId}__${page.n}__${i}`,
        livreId,
        pageN: page.n,
        texte: texte.slice(debut, fin),
      })
      debut += TAILLE - CHEVAUCHEMENT
      i++
    }
  }
  return chunks
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

      const meta: ColonneMeta = { key, label: nomLisible(key), type }

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