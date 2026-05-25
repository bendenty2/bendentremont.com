"""
PhotoSite build script.

Scans the source photo folder, extracts EXIF data (aperture, ISO, shutter
speed, focal length, plus camera/lens/date for safekeeping), generates
web-sized images and thumbnails into the project, and writes a manifest.json
that the static site reads.

Re-run this any time you add or remove a photo in the source folder.

Usage:
    python build.py

Configuration lives in the CONFIG block below.
"""

from __future__ import annotations

import json
import os
import sys
from datetime import datetime
from pathlib import Path

try:
    from PIL import Image, ExifTags, ImageOps, ImageDraw, ImageFont
except ImportError:
    sys.stderr.write(
        "Pillow is required. Install with:\n    pip install Pillow\n"
    )
    sys.exit(1)


# --------------------------------------------------------------------------
# CONFIG
# --------------------------------------------------------------------------

# Source folder — where the originals live.
# Override at runtime by setting the PHOTOSITE_SOURCE environment variable.
SOURCE_DIR = Path(
    os.environ.get(
        "PHOTOSITE_SOURCE",
        str(Path.home() / "OneDrive" / "Desktop" / "PhotositeCatalogue"),
    )
)

# Where this script lives — site output goes alongside it.
SITE_DIR = Path(__file__).resolve().parent

# Output subfolders inside the site directory.
THUMBS_DIR = SITE_DIR / "thumbnails"   # used in the masonry grid
PHOTOS_DIR = SITE_DIR / "photos"       # used in the lightbox / full view
# We emit a .js file (assigning to a global) rather than .json because
# browsers block fetch() over file:// — a <script> tag works fine there.
MANIFEST_PATH = SITE_DIR / "manifest.js"

# Sidecar file in the SOURCE folder mapping photo ID -> human-readable title.
# The build script auto-creates this on first run with empty strings, so you
# can fill in titles for whichever photos you care about and re-run.
TITLES_PATH = SOURCE_DIR / "titles.json"

# Source subfolders — place your images/videos into these.
#
#   large_photos/   -> hero images shown in the slideshow above the grid
#
#   tiles/tileN/    -> each subfolder is one 7-item grid group.
#                      ODD  tile numbers (1, 3, 5, ...) have no video slot:
#                        medium_photo_top          medium_photo_bottom
#                        small_photo_portrait_left small_photo_portrait_right
#                        small_photo_top           small_photo_middle   small_photo_bottom
#                      EVEN tile numbers (2, 4, 6, ...) include a video slot:
#                        medium_photo_top          medium_photo_bottom
#                        small_photo_portrait_left small_photo_portrait_right
#                        small_photo_top           small_photo_bottom
#                        video_middle
#
# Place a single image (or video) file inside each slot subfolder.
# Tiles are consumed in numeric order (tile1, tile2, tile3, ...).
# To add a new tile just create the next tileN folder and re-run build.py.
LARGE_PHOTOS_DIR = SOURCE_DIR / "large_photos"
TILES_DIR        = SOURCE_DIR / "tiles"

# Max long-edge sizes for the generated derivatives.
THUMB_LONG_EDGE = 1200   # grid view (retina-friendly for ~600px columns)
FULL_LONG_EDGE = 2400    # lightbox view

# JPEG quality.
THUMB_QUALITY = 82
FULL_QUALITY = 88

# File extensions we'll try to ingest.
SUPPORTED_EXTS = {".jpg", ".jpeg", ".png", ".tif", ".tiff", ".webp"}

# Video extensions -- these are copied as-is (no transcoding).
VIDEO_EXTS = {".mp4", ".mov", ".m4v"}

# Output subfolder for video files.
VIDEOS_DIR = SITE_DIR / "videos"

# --- Copyright / watermark ---
# These get baked into every derivative: a subtle visible mark in the
# bottom-right corner, plus EXIF Copyright + Artist tags so the metadata
# travels with the file even after re-encoding or download.
COPYRIGHT_HOLDER = "Benjamin d'Entremont"
COPYRIGHT_YEAR = datetime.now().year
WATERMARK_TEXT = f"© {COPYRIGHT_HOLDER}"
ADD_WATERMARK = True                            # flip to False to skip the visible mark
WATERMARK_OPACITY = 150                         # 0-255; ~60% feels subtle but readable


# --------------------------------------------------------------------------
# EXIF helpers
# --------------------------------------------------------------------------

_TAG_NAME_TO_ID = {v: k for k, v in ExifTags.TAGS.items()}


def _named_exif(img: Image.Image) -> dict:
    """Return EXIF tags keyed by their human-readable name."""
    raw = img.getexif()
    if not raw:
        return {}
    out = {}
    for tag_id, value in raw.items():
        name = ExifTags.TAGS.get(tag_id, str(tag_id))
        out[name] = value
    try:
        ifd = raw.get_ifd(_TAG_NAME_TO_ID.get("ExifOffset", 0x8769))
        for tag_id, value in ifd.items():
            name = ExifTags.TAGS.get(tag_id, str(tag_id))
            out.setdefault(name, value)
    except Exception:
        pass
    return out


def _to_float(value) -> float | None:
    if value is None:
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        try:
            return float(value.numerator) / float(value.denominator)
        except Exception:
            return None


def _format_aperture(fnumber) -> str | None:
    f = _to_float(fnumber)
    if f is None or f <= 0:
        return None
    return f"f/{f:g}"


def _format_iso(iso) -> str | None:
    if iso is None:
        return None
    if isinstance(iso, (list, tuple)):
        iso = iso[0] if iso else None
    if iso is None:
        return None
    try:
        return f"ISO {int(iso)}"
    except (TypeError, ValueError):
        return None


def _format_shutter(exposure) -> str | None:
    t = _to_float(exposure)
    if t is None or t <= 0:
        return None
    if t >= 1:
        return f"{t:g}s"
    denom = round(1.0 / t)
    return f"1/{denom}s"


def _format_focal(focal) -> str | None:
    f = _to_float(focal)
    if f is None or f <= 0:
        return None
    return f"{int(round(f))}mm"


def _format_date(exif: dict) -> str | None:
    raw = exif.get("DateTimeOriginal") or exif.get("DateTime")
    if not raw:
        return None
    try:
        dt = datetime.strptime(str(raw), "%Y:%m:%d %H:%M:%S")
        return dt.strftime("%Y-%m-%d")
    except ValueError:
        return str(raw)


# --------------------------------------------------------------------------
# Image processing
# --------------------------------------------------------------------------

def _resize_long_edge(img: Image.Image, long_edge: int) -> Image.Image:
    w, h = img.size
    if max(w, h) <= long_edge:
        return img.copy()
    if w >= h:
        new_w = long_edge
        new_h = round(h * long_edge / w)
    else:
        new_h = long_edge
        new_w = round(w * long_edge / h)
    return img.resize((new_w, new_h), Image.LANCZOS)


def _save_jpeg(img: Image.Image, path: Path, quality: int,
               exif_bytes: bytes | None = None) -> None:
    if img.mode in ("RGBA", "P"):
        img = img.convert("RGB")
    path.parent.mkdir(parents=True, exist_ok=True)
    kwargs = dict(quality=quality, optimize=True, progressive=True)
    if exif_bytes:
        kwargs["exif"] = exif_bytes
    img.save(path, "JPEG", **kwargs)


# ---------- Watermark ----------

_FONT_CACHE: dict[int, ImageFont.ImageFont] = {}

_FONT_CANDIDATES = (
    "arial.ttf",
    "C:\\Windows\\Fonts\\arial.ttf",
    "/Library/Fonts/Arial.ttf",
    "/System/Library/Fonts/Supplemental/Arial.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
    "DejaVuSans.ttf",
)


def _font(size: int) -> ImageFont.ImageFont:
    if size in _FONT_CACHE:
        return _FONT_CACHE[size]
    for name in _FONT_CANDIDATES:
        try:
            font = ImageFont.truetype(name, size)
            _FONT_CACHE[size] = font
            return font
        except (OSError, IOError):
            continue
    font = ImageFont.load_default()
    _FONT_CACHE[size] = font
    return font


def _watermark(img: Image.Image, text: str) -> Image.Image:
    if not text or not ADD_WATERMARK:
        return img

    base = img.convert("RGBA")
    overlay = Image.new("RGBA", base.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay)

    font_size = max(14, base.size[0] // 70)
    font = _font(font_size)
    pad = max(10, base.size[0] // 120)

    try:
        bbox = draw.textbbox((0, 0), text, font=font)
        tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
        offset_y = bbox[1]
    except AttributeError:
        tw, th = draw.textsize(text, font=font)
        offset_y = 0

    x = base.size[0] - tw - pad
    y = base.size[1] - th - pad - offset_y

    draw.text((x + 1, y + 1), text, font=font, fill=(0, 0, 0, 110))
    draw.text((x, y), text, font=font, fill=(255, 255, 255, WATERMARK_OPACITY))

    return Image.alpha_composite(base, overlay)


# ---------- EXIF copyright stamp ----------

def _copyright_exif_bytes() -> bytes:
    exif = Image.Exif()
    notice = f"© {COPYRIGHT_YEAR} {COPYRIGHT_HOLDER}. All rights reserved."
    exif[0x8298] = notice
    exif[0x013B] = COPYRIGHT_HOLDER
    return exif.tobytes()


_COPYRIGHT_EXIF = _copyright_exif_bytes()


# --------------------------------------------------------------------------
# Per-item processors
# --------------------------------------------------------------------------

def _load_titles() -> dict:
    if not TITLES_PATH.exists():
        return {}
    try:
        data = json.loads(TITLES_PATH.read_text(encoding="utf-8"))
        return data if isinstance(data, dict) else {}
    except (OSError, json.JSONDecodeError) as e:
        print(f"  ! could not read {TITLES_PATH.name}: {e}")
        return {}


def _save_titles(titles: dict) -> None:
    try:
        ordered = {k: titles[k] for k in sorted(titles)}
        TITLES_PATH.write_text(
            json.dumps(ordered, indent=2, ensure_ascii=False) + "\n",
            encoding="utf-8",
        )
    except OSError as e:
        print(f"  ! could not write {TITLES_PATH.name}: {e}")


def _resolve_title(stem: str, exif: dict, titles: dict) -> str | None:
    sidecar = (titles.get(stem) or "").strip()
    if sidecar:
        return sidecar
    raw = exif.get("ImageDescription")
    if raw:
        text = str(raw).strip()
        if text:
            return text
    return None


def process_one(src: Path, titles: dict | None = None, span: int = 1) -> dict | None:
    try:
        img = Image.open(src)
    except Exception as e:
        print(f"  ! skip {src.name}: cannot open ({e})")
        return None

    exif = _named_exif(img)
    img = ImageOps.exif_transpose(img)

    stem = src.stem
    thumb_name = f"{stem}.jpg"
    full_name  = f"{stem}.jpg"

    thumb = _resize_long_edge(img, THUMB_LONG_EDGE)
    full  = _resize_long_edge(img, FULL_LONG_EDGE)

    thumb = _watermark(thumb, WATERMARK_TEXT)
    full  = _watermark(full,  WATERMARK_TEXT)

    _save_jpeg(thumb, THUMBS_DIR / thumb_name, THUMB_QUALITY, exif_bytes=_COPYRIGHT_EXIF)
    _save_jpeg(full,  PHOTOS_DIR / full_name,  FULL_QUALITY,  exif_bytes=_COPYRIGHT_EXIF)

    w, h = full.size

    return {
        "id":        stem,
        "type":      "photo",
        "span":      span,
        "title":     _resolve_title(stem, exif, titles or {}),
        "thumbnail": f"thumbnails/{thumb_name}",
        "full":      f"photos/{full_name}",
        "width":     w,
        "height":    h,
        "exif": {
            "aperture": _format_aperture(exif.get("FNumber")),
            "iso":      _format_iso(exif.get("ISOSpeedRatings")
                                    or exif.get("PhotographicSensitivity")),
            "shutter":  _format_shutter(exif.get("ExposureTime")),
            "focal":    _format_focal(exif.get("FocalLength")),
            "camera":   exif.get("Model"),
            "lens":     exif.get("LensModel"),
            "date":     _format_date(exif),
        },
        "source_mtime": src.stat().st_mtime,
    }


def process_video(src: Path, titles: dict | None = None) -> dict | None:
    import shutil

    dest = VIDEOS_DIR / src.name
    try:
        if not dest.exists() or src.stat().st_mtime > dest.stat().st_mtime:
            shutil.copy2(src, dest)
    except Exception as e:
        print(f"  ! skip {src.name}: cannot copy ({e})")
        return None

    stem      = src.stem
    raw_title = (titles or {}).get(stem, "")
    title     = raw_title.strip() or None

    return {
        "id":     stem,
        "type":   "video",
        "title":  title,
        "src":    f"videos/{src.name}",
        "width":  None,
        "height": None,
        "source_mtime": src.stat().st_mtime,
    }


# --------------------------------------------------------------------------
# Main
# --------------------------------------------------------------------------

def main() -> int:
    if not SOURCE_DIR.exists():
        sys.stderr.write(f"Source folder not found: {SOURCE_DIR}\n")
        return 1

    from concurrent.futures import ThreadPoolExecutor
    from functools import partial

    # ---- Helpers ----------------------------------------------------------------

    def _tile_num(name: str) -> int | None:
        low = name.lower()
        if low.startswith("tile"):
            try:
                return int(low[4:])
            except ValueError:
                pass
        return None

    def _get_sorted_tile_dirs(parent: Path) -> list[Path]:
        if not parent.exists():
            return []
        dirs = [p for p in parent.iterdir()
                if p.is_dir() and _tile_num(p.name) is not None]
        return sorted(dirs, key=lambda p: _tile_num(p.name))

    def _pick_file(slot_dir: Path, exts: set) -> Path | None:
        if not slot_dir.exists():
            return None
        for p in slot_dir.iterdir():
            if p.is_file() and p.suffix.lower() in exts:
                return p
        return None

    def _scan_photos(folder: Path) -> list[Path]:
        if not folder.exists():
            return []
        return sorted(
            p for p in folder.iterdir()
            if p.is_file() and p.suffix.lower() in SUPPORTED_EXTS
        )

    # ---- Slot definitions -------------------------------------------------------
    # Each entry: (subfolder_name, span, item_type)
    # Emission order here determines per-bucket ordering in the JS grid renderer.

    NV_SLOTS = [   # odd tile numbers — no video
        ("medium_photo_top",           2, "photo"),
        ("medium_photo_bottom",        2, "photo"),
        ("small_photo_portrait_left",  1, "photo"),
        ("small_photo_portrait_right", 1, "photo"),
        ("small_photo_top",            1, "photo"),
        ("small_photo_middle",         1, "photo"),
        ("small_photo_bottom",         1, "photo"),
    ]
    V_SLOTS = [    # even tile numbers — includes a video
        ("medium_photo_top",           2, "photo"),
        ("medium_photo_bottom",        2, "photo"),
        ("small_photo_portrait_left",  1, "photo"),
        ("small_photo_portrait_right", 1, "photo"),
        ("small_photo_top",            1, "photo"),
        ("small_photo_bottom",         1, "photo"),
        ("video_middle",               1, "video"),
    ]

    # ---- Discover sources -------------------------------------------------------

    large_sources = _scan_photos(LARGE_PHOTOS_DIR)
    all_tile_dirs = _get_sorted_tile_dirs(TILES_DIR)

    if not large_sources and not all_tile_dirs:
        sys.stderr.write(
            "No photos or videos found. Expected subfolders:\n"
            f"  {LARGE_PHOTOS_DIR}\n"
            f"  {TILES_DIR}/tile1/  ...\n"
        )
        return 1

    # Build ordered work list: walk tiles in numeric order.
    # Odd tile numbers -> NV_SLOTS (no video), even -> V_SLOTS (with video).
    work_items: list[tuple] = []   # (Path, span, item_type, label)

    for tile_dir in all_tile_dirs:
        n     = _tile_num(tile_dir.name)
        slots = NV_SLOTS if (n % 2 == 1) else V_SLOTS
        for slot_name, span, item_type in slots:
            exts = SUPPORTED_EXTS if item_type == "photo" else VIDEO_EXTS
            src  = _pick_file(tile_dir / slot_name, exts)
            if src:
                work_items.append((src, span, item_type, f"{tile_dir.name}/{slot_name}"))
            else:
                print(f"  ! slot missing: {tile_dir.name}/{slot_name}")

    photo_work        = [(src, span, lbl) for src, span, t, lbl in work_items if t == "photo"]
    video_work        = [(src, lbl)       for src, span, t, lbl in work_items if t == "video"]
    all_photo_sources = large_sources + [src for src, *_ in photo_work]
    all_video_sources = [src for src, _ in video_work]

    nv_count = sum(1 for d in all_tile_dirs if _tile_num(d.name) % 2 == 1)
    v_count  = len(all_tile_dirs) - nv_count
    print(
        f"Found  {len(large_sources)} hero  |  "
        f"{nv_count} non-video tiles  |  "
        f"{v_count} video tiles  |  "
        f"{len(photo_work)} grid photos  |  "
        f"{len(video_work)} videos"
    )
    print(f"Writing site assets into {SITE_DIR}")
    THUMBS_DIR.mkdir(exist_ok=True)
    PHOTOS_DIR.mkdir(exist_ok=True)
    VIDEOS_DIR.mkdir(exist_ok=True)

    # ---- Titles sidecar --------------------------------------------------------

    titles = _load_titles()
    title_changes = False
    for src in all_photo_sources + all_video_sources:
        if src.stem not in titles:
            titles[src.stem] = ""
            title_changes = True
    if title_changes or not TITLES_PATH.exists():
        _save_titles(titles)
        print(f"  ~ updated {TITLES_PATH} (fill in titles + re-run to apply)")

    # ---- Process hero photos (parallel) ----------------------------------------

    workers      = max(1, os.cpu_count() or 4)
    hero_entries: list[dict] = []

    if large_sources:
        worker_hero = partial(process_one, titles=titles, span=1)
        with ThreadPoolExecutor(max_workers=workers) as pool:
            for i, entry in enumerate(pool.map(worker_hero, large_sources), 1):
                print(f"  [hero {i:>2}/{len(large_sources)}] {large_sources[i-1].name}")
                if entry:
                    hero_entries.append(entry)

    # ---- Process grid photos (parallel, then re-order) -------------------------

    photo_srcs  = [src  for src, span, lbl in photo_work]
    photo_spans = [span for src, span, lbl in photo_work]
    photo_lbls  = [lbl  for src, span, lbl in photo_work]

    stem_to_entry: dict[str, dict] = {}
    if photo_srcs:
        def _process_with_span(args):
            src, span = args
            return process_one(src, titles=titles, span=span)

        with ThreadPoolExecutor(max_workers=workers) as pool:
            results = list(pool.map(_process_with_span, zip(photo_srcs, photo_spans)))

        for i, (src, lbl, entry) in enumerate(zip(photo_srcs, photo_lbls, results), 1):
            print(f"  [{i:>3}/{len(photo_srcs)}] {lbl} -- {src.name}")
            if entry:
                stem_to_entry[src.stem] = entry

    # Re-assemble in tile order, inserting videos inline.
    entries: list[dict] = []
    for src, span, item_type, lbl in work_items:
        if item_type == "photo":
            entry = stem_to_entry.get(src.stem)
            if entry:
                entries.append(entry)
        else:
            print(f"  [vid] {lbl} -- {src.name}")
            entry = process_video(src, titles=titles)
            if entry:
                entries.append(entry)

    # ---- Build manifest --------------------------------------------------------
    # Tile order is already correct — no mtime sort needed.

    public = [{k: v for k, v in e.items() if k != "source_mtime"} for e in entries]

    heroes_public = [
        {k: v for k, v in e.items() if k != "source_mtime"}
        for e in hero_entries
    ]
    hero_public = heroes_public[0] if heroes_public else None

    manifest = {
        "generated_at": datetime.now().isoformat(timespec="seconds"),
        "hero":         hero_public,
        "heroes":       heroes_public,
        "count":        len(public),
        "photos":       public,
    }
    js = "window.PHOTOSITE_MANIFEST = " + json.dumps(manifest, indent=2) + ";\n"
    MANIFEST_PATH.write_text(js, encoding="utf-8")

    legacy_json = SITE_DIR / "manifest.json"
    if legacy_json.exists():
        try:
            legacy_json.unlink()
        except OSError:
            pass

    # ---- Stale-file cleanup ----------------------------------------------------

    valid_photo_stems = {p.stem for p in all_photo_sources}
    for d in (THUMBS_DIR, PHOTOS_DIR):
        for leftover in d.glob("*.jpg"):
            if leftover.stem not in valid_photo_stems:
                print(f"  - removing stale {leftover.relative_to(SITE_DIR)}")
                leftover.unlink()

    valid_video_names = {p.name for p in all_video_sources}
    if VIDEOS_DIR.exists():
        for leftover in VIDEOS_DIR.iterdir():
            if leftover.is_file() and leftover.name not in valid_video_names:
                print(f"  - removing stale {leftover.relative_to(SITE_DIR)}")
                leftover.unlink()

    print(
        f"\nDone. Heroes: {len(heroes_public)}. "
        f"Grid: {len(public)} items  "
        f"({nv_count} non-video tiles, {v_count} video tiles)."
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
