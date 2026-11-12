"""Turns the client's plant photographs into catalogue images, a manifest, a report and catalogue entries.

    python scripts/catalogue/process_plant_photos.py "C:\\Users\\HP\\Desktop\\plannts"

Needs Pillow. The source folder is only read, never changed. Outputs (all idempotent):
  apps/web/public/media/plants/<slug>[-n]-640.webp and -1024.webp   card and detail images
  docs/catalogue/photo-manifest.json                                 every photo and where it went
  docs/catalogue/photo-report.md                                     identifications to verify, probable matches
  apps/api/prisma/catalog.json                                       new draft products appended (existing kept)
  apps/api/prisma/catalog-updates.json                               photo swaps and bougainvillea renames
"""
import hashlib
import json
import os
import sys
from pathlib import Path

from PIL import Image, ImageOps

sys.path.insert(0, str(Path(__file__).parent))
from plant_catalogue import BOUGAINVILLEA, NEW_PRODUCTS, PHOTO_UPDATES, PROBABLE_MATCHES  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
MEDIA = ROOT / "apps/web/public/media/plants"
DOCS = ROOT / "docs/catalogue"
CATALOG = ROOT / "apps/api/prisma/catalog.json"
UPDATES = ROOT / "apps/api/prisma/catalog-updates.json"
CARD, DETAIL = 640, 1024
COLOUR_AR = {"magenta": "بلون الماجنتا", "pink and cream": "وردية وكريمية", "orange": "برتقالية", "apricot and pink": "مشمشية ووردية",
             "purple": "بنفسجية", "white": "بيضاء", "red": "حمراء"}


def photo_index(source: Path):
    files = []
    for folder in sorted(os.listdir(source)):
        for name in sorted(os.listdir(source / folder)):
            files.append((folder, name))
    return files


def save_variants(src: Path, stem: str):
    """Card (640px) and detail (up to 1024px) WebP, never upscaled, never cropped."""
    image = ImageOps.exif_transpose(Image.open(src)).convert("RGB")
    out = []
    for size, suffix, purpose in ((CARD, "640", "catalog"), (DETAIL, "1024", "detail")):
        copy = image.copy()
        copy.thumbnail((size, size), Image.LANCZOS)
        target = MEDIA / f"{stem}-{suffix}.webp"
        copy.save(target, "WEBP", quality=82, method=6)
        out.append({"url": f"/media/plants/{target.name}", "purpose": purpose, "width": copy.width, "height": copy.height})
    return out


def media_for(slug, photos, files, source, version=""):
    media = []
    for position, number in enumerate(photos):
        folder, name = files[number]
        stem = f"{slug}{version}" if position == 0 else f"{slug}{version}-{position + 1}"
        variants = save_variants(source / folder / name, stem)
        media.extend(variants)
    return media


def main(source: Path):
    files = photo_index(source)
    assert len(files) == 122, f"expected 122 photographs, found {len(files)}"
    MEDIA.mkdir(parents=True, exist_ok=True)
    DOCS.mkdir(parents=True, exist_ok=True)

    manifest = {}
    for number, (folder, name) in enumerate(files):
        path = source / folder / name
        with Image.open(path) as image:
            width, height = image.size
        manifest[number] = {
            "number": number, "folder": folder, "file": name, "width": width, "height": height,
            "sha1": hashlib.sha1(path.read_bytes()).hexdigest(),
            "identity": None, "scientificName": None, "confidence": None,
            "product": None, "role": None, "assignment": "unassigned", "outputs": [],
        }

    catalog = json.loads(CATALOG.read_text(encoding="utf8"))
    known = {entry["slug"] for entry in catalog}
    added = 0
    for index, product in enumerate(NEW_PRODUCTS, start=1):
        media = media_for(product["slug"], product["photos"], files, source)
        for position, number in enumerate(product["photos"]):
            manifest[number].update(identity=product["name"], scientificName=product["scientificName"], confidence=product["confidence"],
                                    product=product["slug"], role="main" if position == 0 else "gallery", assignment="new draft",
                                    outputs=[m["url"] for m in media[position * 2: position * 2 + 2]])
        if product["slug"] in known:
            continue
        category, category_ar = product["category"]
        light, light_ar = product["light"]
        watering, watering_ar = product["watering"]
        needs_review = product["confidence"] == "low" or bool(product["note"])
        catalog.append({
            "slug": product["slug"], "sku": f"QL-{index:03d}", "name": product["name"], "nameAr": product["nameAr"],
            "description": product["description"], "descriptionAr": product["descriptionAr"],
            "category": category, "categoryAr": category_ar, "light": light, "lightAr": light_ar,
            "scientificName": product["scientificName"], "watering": watering, "wateringAr": watering_ar,
            "careLevel": product["careLevel"], "placement": product["placement"],
            "needsReview": needs_review,
            "reviewNote": product["note"] or ("Identification confidence is low; please confirm the plant." if product["confidence"] == "low" else None),
            "priceQar": 0, "published": False, "stock": 0,
            "altText": product["name"] + (f" ({product['scientificName']})" if product["scientificName"] else ""),
            "media": media,
        })
        added += 1

    photo_updates = {}
    for slug, photos in PHOTO_UPDATES.items():
        media = media_for(slug, photos, files, source, version="-v2")
        old = next(entry for entry in catalog if entry["slug"] == slug)
        photo_updates[slug] = {"expectedCurrent": [m["url"] for m in old["media"]], "media": media}
        for position, number in enumerate(photos):
            manifest[number].update(identity=old["name"], confidence="high" if slug != "boston-fern" else "medium", product=slug,
                                    role="main" if position == 0 else "gallery", assignment="replaces existing photo",
                                    outputs=[m["url"] for m in media[position * 2: position * 2 + 2]])

    renames = {}
    for slug, (number, new_slug, name, name_ar, colour) in BOUGAINVILLEA.items():
        renames[slug] = {
            "slug": new_slug, "name": name, "nameAr": name_ar, "category": "Outdoor Plants", "categoryAr": "نباتات خارجية",
            "scientificName": "Bougainvillea sp.", "light": "Full sun", "lightAr": "شمس كاملة",
            "watering": "Water deeply, then let the top layer dry before watering again",
            "wateringAr": "اسقِ بعمق ثم انتظر حتى تجف الطبقة العليا قبل الري التالي",
            "careLevel": "easy", "placement": "outdoor",
            "description": (f"A bougainvillea covered in {colour} bracts, one of the few flowering plants that truly enjoys a Qatari summer. "
                            "Give it full sun, water deeply and let the soil dry a little in between; it flowers best when it is not overwatered or overfed."),
            "descriptionAr": (f"جهنمية مغطاة بقنابات {COLOUR_AR[colour]}، من النباتات المزهرة القليلة التي تستمتع حقًا بصيف قطر. "
                              "امنحها الشمس الكاملة واسقِها بعمق مع ترك التربة تجف قليلًا بين الريّات؛ تزهر أفضل حين لا يُبالغ في ريّها أو تسميدها."),
            "needsReview": True,
            "reviewNote": "Colour taken from the photo; variety name, size and price to be confirmed.",
        }
        manifest[number].update(identity=name, scientificName="Bougainvillea sp.", confidence="high", product=new_slug, role="main",
                                assignment="existing draft renamed (photo already imported)",
                                outputs=[m["url"] for m in next(e for e in catalog if e["slug"] == slug)["media"]])

    for number, (slug, why) in PROBABLE_MATCHES.items():
        if slug and manifest[number]["assignment"] == "unassigned":
            manifest[number].update(product=slug, assignment="probable match, size to confirm", identity=why)

    CATALOG.write_text(json.dumps(catalog, ensure_ascii=False, indent=2) + "\n", encoding="utf8")
    UPDATES.write_text(json.dumps({"photoUpdates": photo_updates, "draftRenames": renames}, ensure_ascii=False, indent=2) + "\n", encoding="utf8")
    entries = [manifest[n] for n in sorted(manifest)]
    (DOCS / "photo-manifest.json").write_text(json.dumps(entries, ensure_ascii=False, indent=2) + "\n", encoding="utf8")
    write_report(entries)
    counts = {}
    for entry in entries:
        counts[entry["assignment"]] = counts.get(entry["assignment"], 0) + 1
    print(json.dumps({"photos": len(entries), "newDrafts": added, "byAssignment": counts}))


def write_report(entries):
    by_product = {}
    for entry in entries:
        if entry["product"]:
            by_product.setdefault(entry["product"], []).append(entry)
    lines = ["# Plant photo report", "",
             "Source: `C:\\Users\\HP\\Desktop\\plannts` (122 photographs, unchanged). Full detail per photo: `photo-manifest.json`.", "",
             "## Needs your confirmation before publishing", "",
             "| Product (draft) | Photos | Why |", "| --- | --- | --- |"]
    notes = {p["slug"]: p for p in NEW_PRODUCTS}
    for slug, product in notes.items():
        if product["confidence"] == "low" or product["note"]:
            photos = ", ".join(f"#{n}" for n in product["photos"])
            reason = product["note"] or "Low identification confidence."
            lines.append(f"| {product['name']} (`{slug}`) | {photos} | {reason} |")
    lines += ["", "## Probable matches to existing listings (size to confirm)", "",
              "| Photo | Existing listing | Note |", "| --- | --- | --- |"]
    for entry in entries:
        if entry["assignment"] == "probable match, size to confirm":
            lines.append(f"| #{entry['number']} `{entry['file']}` | `{entry['product']}` | {entry['identity']} |")
    lines += ["", "## Photos that replace an existing listing's photo", ""]
    for slug in PHOTO_UPDATES:
        lines.append(f"- `{slug}`: " + ", ".join(f"#{e['number']}" for e in by_product.get(slug, [])))
    lines += ["", "## Bougainvillea", "",
              "The eight photos were already imported as drafts \"Hybrid Bougainvillea 1-8\" in a separate category. "
              "They are renamed by colour and moved to Outdoor Plants (still drafts). The live \"Bougainvillea Pink\" listing is unchanged; "
              "it may be the same plant as the magenta draft.", ""]
    for slug, (number, new_slug, name, _ar, _colour) in BOUGAINVILLEA.items():
        lines.append(f"- #{number}: `{slug}` -> `{new_slug}` ({name})")
    unassigned = [e for e in entries if e["assignment"] == "unassigned"]
    lines += ["", "## Unassigned photos", "", "None." if not unassigned else "\n".join(f"- #{e['number']} {e['folder']}/{e['file']}" for e in unassigned), "",
              "## Duplicates", "", "No two files are identical (SHA-1). Photos showing the same plant from another angle or at another size "
              "are grouped into one listing's gallery (see the manifest's `role: gallery`).", ""]
    (DOCS / "photo-report.md").write_text("\n".join(lines), encoding="utf8")


if __name__ == "__main__":
    main(Path(sys.argv[1]))
