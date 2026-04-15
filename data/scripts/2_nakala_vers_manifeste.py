#!/usr/bin/env python3
"""
nakala_vers_manifeste.py
========================
Génère un manifeste IIIF v3 par document.
L'association avec le CSV se fait sur le suffixe de l'identifiant (ex: nkl.abcd).
"""

import argparse
import json
import re
import sys
import os
from pathlib import Path
from urllib.parse import quote

# --- Configuration ---
NAKALA_API = "https://api.nakala.fr"
DIR_BASE = Path(__file__).parent.parent
DIR_MANIFESTES = DIR_BASE / "manifestes"
CSV_PATH = DIR_BASE / "metadata.csv"
CACHE_FILE = DIR_BASE / "nakala_cache.json"

def verifier_dependances():
    try:
        import requests
        from tqdm import tqdm
    except ImportError:
        print("❌ Erreur : Les modules 'requests' et 'tqdm' sont requis.")
        print("Installation : pip install requests tqdm")
        sys.exit(1)

# --- Gestion du Cache ---
def charger_cache():
    if CACHE_FILE.exists():
        with open(CACHE_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    return {}

def sauvegarder_cache(cache):
    with open(CACHE_FILE, "w", encoding="utf-8") as f:
        json.dump(cache, f, ensure_ascii=False, indent=2)

# --- Appels API Nakala ---
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
        data = nakala_get(f"{service_url}/info.json", apikey)
        w, h = int(data.get("width", 0)), int(data.get("height", 0))
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
        data = nakala_get(f"/collections/{id_encode}/datas?page={page}&limit=25", apikey)
        depots.extend(data.get("data", []))
        if page >= data.get("lastPage", 1): break
        page += 1
    return depots

# --- Construction IIIF ---
def titre_depot(depot: dict) -> str:
    for meta in depot.get("metas", []):
        if meta.get("propertyUri") == "http://nakala.fr/terms#title":
            return meta.get("value")
    return depot.get("identifier", "Sans titre")

def construire_manifeste(depot: dict, manifest_id: str, apikey: str | None, cache: dict) -> dict:
    from tqdm import tqdm
    depot_id = depot["identifier"]
    label = titre_depot(depot)
    
    images = [f for f in depot.get("files", []) if f.get("mime_type", "").startswith("image/")]
    if not images: return None
    
    images.sort(key=lambda f: [int(n) for n in re.findall(r'\d+', f["name"])] or [f["name"]])

    canvases = []
    for i, fichier in enumerate(tqdm(images, desc=f"      Pages", leave=False)):
        sha1 = fichier["sha1"]
        service_base = f"{NAKALA_API}/iiif/{depot_id}/{sha1}"
        w, h, real_service_id = recuperer_dimensions_image(service_base, apikey, cache)
        
        canvas_id = f"{manifest_id}/canvas/p{i+1}"
        canvases.append({
            "id": canvas_id,
            "type": "Canvas",
            "label": {"none": [fichier["name"]]},
            "width": w, "height": h,
            "items": [{
                "id": f"{canvas_id}/annopage",
                "type": "AnnotationPage",
                "items": [{
                    "id": f"{canvas_id}/anno",
                    "type": "Annotation",
                    "motivation": "painting",
                    "target": canvas_id,
                    "body": {
                        "id": f"{real_service_id}/full/max/0/default.jpg",
                        "type": "Image",
                        "format": "image/jpeg",
                        "width": w, "height": h,
                        "service": [{"id": real_service_id, "type": "ImageService3", "profile": "level2"}]
                    }
                }]
            }]
        })

    return {
        "@context": "http://iiif.io/api/presentation/3/context.json",
        "id": manifest_id,
        "type": "Manifest",
        "label": {"fr": [label]},
        "items": canvases
    }

# --- Mise à jour CSV ---
def maj_csv(correspondances: dict):
    """
    Met à jour le CSV en comparant uniquement le suffixe nkl.xxxx
    """
    import csv
    if not CSV_PATH.exists(): 
        print(f"⚠️ Fichier {CSV_PATH} non trouvé.")
        return
    
    lignes = []
    nb_maj = 0
    with open(CSV_PATH, "r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        fieldnames = list(reader.fieldnames or [])
        if "manifeste_url" not in fieldnames: fieldnames.append("manifeste_url")
        
        for row in reader:
            # On récupère l'id (complet ou court) présent dans le CSV
            id_brut = row.get("id") or row.get("identifier") or ""
            # On ne garde que la partie après le dernier slash (ex: nkl.abcd)
            id_court = id_brut.split('/')[-1].strip()
            
            if id_court in correspondances:
                row["manifeste_url"] = correspondances[id_court]
                nb_maj += 1
            lignes.append(row)

    with open(CSV_PATH, "w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(lignes)
    print(f"✅ CSV mis à jour : {nb_maj} lignes modifiées.")

# --- Main ---
def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--collection", required=True)
    parser.add_argument("--apikey")
    parser.add_argument("--base-url")
    parser.add_argument("--save-cache", action="store_true")
    parser.add_argument("--maj-csv", action="store_true")
    args = parser.parse_args()

    verifier_dependances()
    DIR_MANIFESTES.mkdir(parents=True, exist_ok=True)
    cache = charger_cache()

    print(f"🔍 Récupération de la collection {args.collection}...")
    depots = recuperer_depots_collection(args.collection, args.apikey)
    print(f"📚 {len(depots)} documents trouvés.")

    correspondances = {}
    for depot in depots:
        d_id = depot["identifier"]  # L'ID complet pour l'API (ex: 10.34847/nkl.c6ceava6)
        
        # 1. On extrait uniquement la partie après le slash
        suffixe = d_id.split('/')[-1] # devient: nkl.c6ceava6
        
        # 2. On définit le nom du fichier de manière simplifiée
        nom_fichier = f"{suffixe}.json" 
        chemin_complet = DIR_MANIFESTES / nom_fichier
        
        # 3. On construit l'URL du manifeste (pour l'ID interne et le CSV)
        if args.base_url:
            m_id = f"{args.base_url.rstrip('/')}/{nom_fichier}"
        else:
            m_id = f"file://{chemin_complet.resolve()}"

        print(f"📦 Traitement de {suffixe}...")
        
        # On construit le manifeste (on passe d_id à l'API mais m_id pour l'ID IIIF)
        manifeste = construire_manifeste(depot, m_id, args.apikey, cache)
        
        if manifeste:
            # Sauvegarde du fichier physique (ex: nkl.c6ceava6.json)
            with open(chemin_complet, "w", encoding="utf-8") as f:
                json.dump(manifeste, f, ensure_ascii=False, indent=2)
            
            # On stocke le lien pour le CSV en utilisant le suffixe comme clé
            correspondances[suffixe] = m_id

    if args.save_cache: sauvegarder_cache(cache)
    if args.maj_csv: maj_csv(correspondances)
    print("\n✨ Opération terminée avec succès !")

if __name__ == "__main__":
    main()


# uv run scripts/2_nakala_vers_manifeste.py \
#     --collection 10.34847/nkl.bf0c54x7 \
#     --base-url http://localhost:4321/manifestes \
#     --maj-csv --save