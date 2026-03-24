#!/usr/bin/env python3
"""
nakala_vers_manifeste.py
========================
Génère un manifeste IIIF v3 conforme avec cache local et mise à jour CSV.
"""

import argparse
import json
import re
import sys
import os
import time
from pathlib import Path
from urllib.parse import quote

# ─── Configuration ─────────────────────────────────────────────────────────────

NAKALA_API   = "https://api.nakala.fr"
DIR_BASE     = Path(__file__).parent.parent   # → data/
DIR_MANIFESTES = DIR_BASE / "manifestes"
CSV_PATH     = DIR_BASE / "metadata.csv"
CACHE_FILE   = DIR_BASE / "nakala_cache.json"

# ─── Dépendances ───────────────────────────────────────────────────────────────

def verifier_dependances():
    try:
        import requests
    except ImportError:
        print("❌ 'requests' manquant. Installez-le avec : pip install requests")
        sys.exit(1)
    try:
        from tqdm import tqdm
    except ImportError:
        print("❌ 'tqdm' manquant. Installez-le avec : pip install tqdm")
        sys.exit(1)

# ─── Gestion du Cache ──────────────────────────────────────────────────────────

def charger_cache():
    if CACHE_FILE.exists():
        with open(CACHE_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    return {}

def sauvegarder_cache(cache):
    with open(CACHE_FILE, "w", encoding="utf-8") as f:
        json.dump(cache, f, ensure_ascii=False, indent=2)

# ─── Appels API Nakala ─────────────────────────────────────────────────────────

def nakala_get(chemin: str, apikey: str | None) -> dict:
    import requests
    headers = {"accept": "application/json"}
    if apikey:
        headers["X-API-KEY"] = apikey
    
    url = chemin if chemin.startswith("http") else f"{NAKALA_API}/{chemin.lstrip('/')}"
    r = requests.get(url, headers=headers, timeout=30)
    r.raise_for_status()
    return r.json()

def recuperer_dimensions_image(service_url: str, apikey: str | None, cache: dict):
    if service_url in cache:
        return cache[service_url]["w"], cache[service_url]["h"], cache[service_url]["id"]

    try:
        info_url = f"{service_url}/info.json"
        data = nakala_get(info_url, apikey)
        w = int(data.get("width", 0))
        h = int(data.get("height", 0))
        real_id = data.get("id", service_url)
        
        cache[service_url] = {"w": w, "h": h, "id": real_id}
        return w, h, real_id
    except Exception:
        return 0, 0, service_url

def recuperer_depots_collection(collection_id: str, apikey: str | None) -> list[dict]:
    depots = []
    page = 1
    while True:
        id_encode = quote(collection_id, safe='')
        data = nakala_get(f"/collections/{id_encode}/datas?page={page}&limit=100", apikey)
        depots.extend(data.get("data", []))
        if page >= data.get("lastPage", 1):
            break
        page += 1
    return depots

# ─── Construction du manifeste IIIF v3 ────────────────────────────────────────

def titre_depot(depot: dict) -> str:
    for meta in depot.get("metas", []):
        if meta.get("propertyUri") == "http://nakala.fr/terms#title":
            return meta.get("value") or depot["identifier"]
    return depot["identifier"]

def fichiers_images_tries(depot: dict) -> list[dict]:
    images = [f for f in depot.get("files", []) if f.get("mime_type", "").startswith("image/")]
    def cle_tri(f):
        nums = re.findall(r'\d+', f["name"])
        return [int(n) for n in nums] if nums else [0]
    return sorted(images, key=cle_tri)

def construire_canvas(depot_id: str, fichier: dict, index: int, manifest_id: str, apikey: str | None, cache: dict) -> dict:
    sha1 = fichier["sha1"]
    nom  = fichier["name"]
    service_base = f"{NAKALA_API}/iiif/{depot_id}/{sha1}"
    
    width, height, real_service_id = recuperer_dimensions_image(service_base, apikey, cache)
    
    image_url = f"{real_service_id}/full/max/0/default.jpg"
    canvas_id = f"{manifest_id}/canvas/p{index}"

    return {
        "id": canvas_id,
        "type": "Canvas",
        "label": {"none": [nom]},
        "width": width,
        "height": height,
        "items": [{
            "id": f"{canvas_id}/annotationpage",
            "type": "AnnotationPage",
            "items": [{
                "id": f"{canvas_id}/annotation",
                "type": "Annotation",
                "motivation": "painting",
                "target": canvas_id,
                "body": {
                    "id": image_url,
                    "type": "Image",
                    "format": "image/jpeg",
                    "width": width,
                    "height": height,
                    "service": [{
                        "id": real_service_id,
                        "type": "ImageService3",
                        "profile": "level2"
                    }]
                }
            }]
        }]
    }

def construire_manifeste(depot: dict, manifest_id: str, apikey: str | None, cache: dict) -> dict:
    from tqdm import tqdm
    depot_id = depot["identifier"]
    label    = titre_depot(depot)
    images   = fichiers_images_tries(depot)

    if not images: return None

    URI_LABELS = {
        "http://nakala.fr/terms#title": "Titre",
        "http://nakala.fr/terms#creator": "Créateur",
        "http://nakala.fr/terms#created": "Date",
        "http://nakala.fr/terms#license": "Licence",
    }
    metadata_iiif = []
    for meta in depot.get("metas", []):
        prop, valeur = meta.get("propertyUri", ""), meta.get("value")
        if valeur and prop in URI_LABELS:
            metadata_iiif.append({"label": {"fr": [URI_LABELS[prop]]}, "value": {"fr": [str(valeur)]}})

    print(f"  📦 Traitement : {label}")
    canvases = [construire_canvas(depot_id, f, i+1, manifest_id, apikey, cache) 
                for i, f in enumerate(tqdm(images, desc="     Pages", leave=False))]

    return {
        "@context": "http://iiif.io/api/presentation/3/context.json",
        "id": manifest_id,
        "type": "Manifest",
        "label": {"fr": [label]},
        "metadata": metadata_iiif,
        "items": canvases,
    }

# ─── Mise à jour du CSV ────────────────────────────────────────────────────────

def maj_csv(correspondances: dict[str, str]):
    import csv
    if not CSV_PATH.exists():
        print(f"⚠️ {CSV_PATH} introuvable.")
        return
    
    lignes = []
    with open(CSV_PATH, encoding="utf-8") as f:
        reader = csv.DictReader(f)
        colonnes = list(reader.fieldnames or [])
        if "manifeste_url" not in colonnes:
            colonnes.append("manifeste_url")
        for ligne in reader:
            # On cherche par titre ou par ID pour faire matcher avec le dictionnaire correspondances
            titre = ligne.get("Titre", "")
            livre_id = ligne.get("id", "")
            if titre in correspondances:
                ligne["manifeste_url"] = correspondances[titre]
            elif livre_id in correspondances:
                ligne["manifeste_url"] = correspondances[livre_id]
            lignes.append(ligne)

    with open(CSV_PATH, "w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=colonnes)
        writer.writeheader()
        writer.writerows(lignes)

# ─── Main ──────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--collection", required=True)
    parser.add_argument("--apikey", default=None)
    parser.add_argument("--base-url", default=None)
    parser.add_argument("--save", action="store_true", help="Sauvegarde le cache local")
    parser.add_argument("--maj-csv", action="store_true", help="Met à jour metadata.csv")
    args = parser.parse_args()

    verifier_dependances()
    DIR_MANIFESTES.mkdir(parents=True, exist_ok=True)
    
    cache = charger_cache()
    print(f"💾 Cache chargé ({len(cache)} images connues).")

    depots = recuperer_depots_collection(args.collection, args.apikey)
    print(f"📚 {len(depots)} dépôts trouvés.")
    
    correspondances = {}
    for depot in depots:
        depot_id, label = depot["identifier"], titre_depot(depot)
        nom_fich = depot_id.replace("/", "-")
        chemin = DIR_MANIFESTES / f"{nom_fich}.json"
        
        m_id = f"{args.base_url.rstrip('/')}/{nom_fich}.json" if args.base_url else f"file://{chemin.resolve()}"
        
        manifeste = construire_manifeste(depot, m_id, args.apikey, cache)
        if manifeste:
            with open(chemin, "w", encoding="utf-8") as f:
                json.dump(manifeste, f, ensure_ascii=False, indent=2)
            # On stocke le lien pour le CSV (clé = Titre)
            correspondances[label] = m_id

    if args.save:
        sauvegarder_cache(cache)
        print(f"\n💾 Cache mis à jour.")

    if args.maj_csv:
        maj_csv(correspondances)
        print(f"✅ {CSV_PATH.name} mis à jour.")

    print(f"\n✨ Terminé !")

if __name__ == "__main__":
    main()