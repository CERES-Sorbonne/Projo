#!/usr/bin/env python3
"""
pdf_vers_images.py
==================
Convertit chaque PDF du dossier pdfs/ en images JPEG, une par page.
Les images sont prêtes à être déposées sur Nakala

Usage :
    cd data/
    uv run scripts/1. pdf_vers_images.py

    # Options :
    uv run scripts/1. pdf_vers_images.py --dpi 300 --qualite 90
    uv run scripts/1. pdf_vers_images.py --pdf pdfs/1.pdf   # un seul fichier

Prérequis :
    pip install pdf2image Pillow
    sudo apt install poppler-utils   # Linux
    brew install poppler             # Mac

Structure attendue :
    data/
        pdfs/
            1.pdf
            2.pdf
        scripts/
            pdf_vers_images.py      ← ce fichier

Structure générée :
    data/
        images/
            1/
                page-001.jpg
                page-002.jpg
            2/
                page-001.jpg
                ...
"""

import argparse
import sys
from pathlib import Path

# ─── Chemins (relatifs à data/) ───────────────────────────────────────────────

DIR_BASE   = Path(__file__).parent.parent   # → data/
DIR_PDFS   = DIR_BASE / "pdfs"
DIR_IMAGES = DIR_BASE / "images"

# ─── Configuration par défaut ─────────────────────────────────────────────────

DPI_DEFAUT     = 150   # 200 dpi = bon compromis qualité/poids (~1-2 Mo/page)
                       # 300 dpi pour des images de meilleure qualité (~3-5 Mo/page)
QUALITE_DEFAUT = 65    # Qualité JPEG (1-95)

# ─── Vérification des dépendances ─────────────────────────────────────────────

def verifier_dependances():
    manquantes = []
    try:
        import pdf2image
    except ImportError:
        manquantes.append("pdf2image")
    try:
        import PIL
    except ImportError:
        manquantes.append("Pillow")

    if manquantes:
        print(f"❌ Dépendances manquantes : {', '.join(manquantes)}")
        print(f"   pip install {' '.join(manquantes)}")
        if "pdf2image" in manquantes:
            print()
            print("   Poppler est aussi nécessaire :")
            print("   Linux : sudo apt install poppler-utils")
            print("   Mac   : brew install poppler")
        sys.exit(1)

# ─── Conversion d'un PDF ──────────────────────────────────────────────────────

def convertir_pdf(pdf_path: Path, dpi: int, qualite: int) -> int:
    """
    Convertit un PDF en images JPEG dans data/images/[stem]/.
    Retourne le nombre de pages converties.
    """
    from pdf2image import convert_from_path

    livre_id = pdf_path.stem
    dossier_sortie = DIR_IMAGES / livre_id
    dossier_sortie.mkdir(parents=True, exist_ok=True)

    print(f"\n📄 {pdf_path.name}")
    print(f"   → {dossier_sortie}/")

    try:
        pages = convert_from_path(str(pdf_path), dpi=dpi)
    except Exception as e:
        print(f"   ❌ Erreur de conversion : {e}")
        return 0

    for i, page in enumerate(pages, start=1):
        nom = f"page-{i:03d}.jpg"
        chemin = dossier_sortie / nom

        # Forcer RGB (les PDFs peuvent avoir des canaux alpha)
        if page.mode != "RGB":
            page = page.convert("RGB")

        page.save(str(chemin), "JPEG", quality=qualite, optimize=True)
        taille_ko = chemin.stat().st_size // 1024
        print(f"   ✓ {nom}  {page.width}×{page.height}px  {taille_ko} Ko")

    print(f"   ✅ {len(pages)} page(s) extraite(s)")
    return len(pages)

# ─── Main ─────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(
        description="Convertit des PDFs en images JPEG pour dépôt sur Nakala"
    )
    parser.add_argument(
        "--pdf",
        type=Path,
        help="Traiter un seul PDF (ex: pdfs/1.pdf). Par défaut : tous les PDFs du dossier pdfs/"
    )
    parser.add_argument(
        "--dpi",
        type=int,
        default=DPI_DEFAUT,
        help=f"Résolution en DPI (défaut : {DPI_DEFAUT})"
    )
    parser.add_argument(
        "--qualite",
        type=int,
        default=QUALITE_DEFAUT,
        help=f"Qualité JPEG 1-95 (défaut : {QUALITE_DEFAUT})"
    )
    args = parser.parse_args()

    verifier_dependances()

    # Sélection des PDFs à traiter
    if args.pdf:
        pdf_path = args.pdf if args.pdf.is_absolute() else DIR_BASE / args.pdf
        if not pdf_path.exists():
            print(f"❌ Fichier introuvable : {pdf_path}")
            sys.exit(1)
        pdfs = [pdf_path]
    else:
        if not DIR_PDFS.exists():
            print(f"❌ Dossier '{DIR_PDFS}' introuvable.")
            print("   Placez vos PDFs dans data/pdfs/")
            sys.exit(1)
        pdfs = sorted(DIR_PDFS.glob("*.pdf"))
        if not pdfs:
            print(f"⚠️  Aucun PDF trouvé dans {DIR_PDFS}/")
            sys.exit(0)

    print(f"🔧 DPI : {args.dpi}  |  Qualité JPEG : {args.qualite}")
    print(f"📂 Sortie : {DIR_IMAGES}/")

    total_pages = 0
    for pdf_path in pdfs:
        total_pages += convertir_pdf(pdf_path, args.dpi, args.qualite)

    print(f"\n{'─'*50}")
    print(f"✅ {len(pdfs)} PDF(s) traité(s) — {total_pages} page(s) au total")
    print()
    print("Étapes suivantes :")
    print(f"  1. Déposer les dossiers de data/images/ sur Nakala")
    print(f"  2. Créer le manifeste IIIF depuis l'interface Nakala")
    print(f"  3. Copier l'URL du manifeste dans metadata.csv (colonne manifeste_url)")

if __name__ == "__main__":
    main()