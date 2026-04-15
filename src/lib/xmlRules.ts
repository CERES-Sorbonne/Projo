/**
 * xmlRules.ts
 *
 * Règles de conversion XML → HTML pour les transcriptions.
 * Ce fichier est conçu pour être modifié facilement sans toucher au moteur de parsing.
 *
 * Chaque règle peut définir :
 *   - tag         : balise HTML cible (ex: 'p', 'span', 'h3'…)
 *   - classe      : classe CSS appliquée
 *   - skipSelf    : si true, ne génère pas de balise, passe directement au contenu enfant
 *   - asText      : si true, concatène le texte de tous les enfants sans balise
 *   - attrs       : fonction (nœud XML) → objet d'attributs HTML supplémentaires
 *   - anchorable  : si true, un id et un lien d'ancre sont ajoutés (pour les liens directs)
 *   - textContent : si true, extrait uniquement le texte brut (pour index de recherche)
 *
 * Les noms de balises sont comparés en minuscules.
 *
 * Deux schémas XML sont supportés (voir SCHEMA_RULES) :
 *   - "default"  : format simple utilisé dans les exemples de départ
 *   - "historical": format issu des transcriptions HTR (HistoricalDocument)
 *
 * Pour ajouter un nouveau schéma, créez une entrée dans SCHEMA_RULES.
 */

export type XmlRuleAttrs = (node: Record<string, unknown>) => Record<string, string>

export interface XmlRule {
  tag?: string
  classe?: string
  skipSelf?: boolean        // traverse sans générer de balise
  asText?: boolean          // concatène les enfants comme texte brut
  attrs?: XmlRuleAttrs      // attributs HTML supplémentaires
  anchorable?: boolean      // génère un id + lien d'ancre cliquable
  ignore?: boolean          // ignore complètement ce nœud et ses enfants
  listePassages?: boolean   // rend la balise disponible dans la liste des passages 
}

export type XmlRuleMap = Record<string, XmlRule>

// ─── Schéma "default" ────────────────────────────────────────────────────────
// Format simple : <transcription><page n="1"><paragraphe>…

const defaultRules: XmlRuleMap = {
  transcription:  { skipSelf: true },
  page:           { skipSelf: true },                    // géré séparément (découpage pages)
  paragraphe:     { tag: 'p',    classe: 'transcription-paragraphe', anchorable: true },
  persname:       { tag: 'span', classe: 'transcription-personne' },
  placename:      { tag: 'span', classe: 'transcription-lieu' },
  hi:             { tag: 'em',   classe: 'transcription-hi',
                    attrs: (n) => n['@_rend'] ? { 'data-rend': String(n['@_rend']) } : {} },
  note:           { tag: 'aside', classe: 'transcription-note', anchorable: true },
  titre_section:  { tag: 'h3',   classe: 'transcription-titre', anchorable: true },
}

// ─── Schéma "historical" ─────────────────────────────────────────────────────
// Format HTR : <HistoricalDocument><Page n="1"><Body><Paragraph><Line>…

const historicalRules: XmlRuleMap = {
  historicaldocument: { skipSelf: true },
  blockquotation:     { tag: 'div',    classe: 'transcription-blockquotation', anchorable: true, listePassages: true},
  page:               { skipSelf: true },              // géré séparément
  header:             { tag: 'header', classe: 'transcription-header' },
  pagenumber:         { tag: 'span',   classe: 'transcription-pagenumber', ignore: true },
  catchword:          { tag: 'span',   classe: 'transcription-catchword',  ignore: true },
  body:               { skipSelf: true },
  paragraph:          { tag: 'p',      classe: 'transcription-paragraphe', anchorable: true },
  heading:            { tag: 'div',    classe: 'transcription-heading', anchorable: true,
                        attrs: (n) => n['@_type'] ? { 'data-type': String(n['@_type']) } : {} },
  line:               { tag: 'div',   classe: 'transcription-line' },
  figure:             { tag: 'figure', classe: 'transcription-figure', anchorable: true },
  description:        { tag: 'figcaption', classe: 'transcription-figcaption' },
  gap:                { tag: 'span',   classe: 'transcription-gap',
                        attrs: (n) => ({
                          'data-reason':  String(n['@_reason']  ?? ''),
                          'data-extent':  String(n['@_extent']  ?? ''),
                          'title': `[${n['@_reason'] ?? 'gap'}${n['@_extent'] ? ' — ' + n['@_extent'] : ''}]`,
                        }) },
  stamp:              { tag: 'span',   classe: 'transcription-stamp',
                        attrs: (n) => ({ title: String(n['@_description'] ?? '') }) },
  italic:             { tag: 'i'}
}

// ─── Registre des schémas ─────────────────────────────────────────────────────
// Clé = nom du schéma, valeur = règles
// Pour ajouter un schéma : ajoutez une entrée ici + les règles correspondantes.

export const SCHEMA_RULES: Record<string, XmlRuleMap> = {
  default:    defaultRules,
  historical: historicalRules,
}

// ─── Détection automatique du schéma ─────────────────────────────────────────
// Inspecte la balise racine du XML pour déterminer quel schéma appliquer.
// Retourne le nom du schéma détecté (ou 'default' si inconnu).

export function detecterSchema(xmlContenu: string): string {
  // On cherche la première balise ouvrante significative
  const match = xmlContenu.match(/<([A-Za-z][A-Za-z0-9_:-]*)/);
  if (!match) return 'default'

  const racine = match[1].toLowerCase()

  if (racine === 'historicaldocument') return 'historical'
  if (racine === 'transcription')      return 'default'

  // Fallback : chercher la clé correspondante dans le registre
  for (const [nom, regles] of Object.entries(SCHEMA_RULES)) {
    if (regles[racine]) return nom
  }

  return 'default'
}