from pathlib import Path
from lxml import etree

# ── Configuration ────────────────────────────────────────────
# the path containing the churro xml to merge
INPUT_DIR = Path("/home/ceres/Documents/Code/ExperiencesOCR/AgreablesDivertissements")
FINAL_FILE = Path("./data/transcriptions/nkl.c6ceava6.xml")
NS = "http://example.com/historicaldocument"
# ─────────────────────────────────────────────────────────────

def main() -> None:
    xml_files = sorted(INPUT_DIR.glob("page-*.xml"), key=lambda p: int(p.stem.split("-")[1]))

    root = etree.Element("HistoricalDocument", nsmap={None: NS})

    for xml_file in xml_files:
        page_number = int(xml_file.stem.split("-")[1])
        tree = etree.parse(xml_file)
        page = tree.find(f"{{{NS}}}Page")

        if page is None:
            print(f"⚠ {xml_file.name} : pas de balise <Page> trouvée, ignoré")
            continue

        page.set("n", str(page_number))
        root.append(page)
        print(f"✓ {xml_file.name} → page n={page_number}")

    FINAL_FILE.write_bytes(
        etree.tostring(root, pretty_print=True, xml_declaration=True, encoding="utf-8")
    )
    print(f"\n── {len(root)} pages écrites dans {FINAL_FILE} ──")

main()