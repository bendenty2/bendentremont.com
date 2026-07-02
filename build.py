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

import hashlib
import json
import os
import re
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
        str(Path.home() / "Documents" / "PhotositeCatalogue"),
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

# Source layout — two things in the catalogue folder:
#
#   media/          -> a single flat pool of every image and video (grid tiles
#                      AND hero/slideshow photos).
#   layout.txt      -> the whole page, top to bottom — one item per line:
#                      "<filename> <role>". Roles: hero (slideshow, listed
#                      first), medium (span-2 grid tile), "small landscape" /
#                      "small portrait" (half-width grid tiles). Videos take no
#                      role (detected by extension). The extension is optional;
#                      titles come from titles.json. Reorder by moving lines; add
#                      content by dropping a file in media/ and adding a line.
#                      (See the header inside layout.txt.)
MEDIA_DIR   = SOURCE_DIR / "media"
LAYOUT_FILE = SOURCE_DIR / "layout.txt"

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

# Video: the 1920x1080 Hi-8 footage is cropped to strip ONLY the ~15% pillarbox
# side bars (down to the 1350x1080 5:4 content, FULL height kept). The site then
# stretches it horizontally to the 3:2 tile via CSS object-fit:fill — same full
# frame as the original (incl. the slight horizontal stretch), but with no
# overflow clip, so the sub-pixel edge seam has nowhere to live.
VIDEO_CROP        = "1344:1080:290:0"  # crop=w:h:x:y — strip side bars (a few px past the
                                       # content edge so no sliver survives), keep full height
# The © watermark sits bottom-right below the date stamp, tuned for the 1344x1080 frame.
# (Frame is displayed stretched ~1.2x wide via object-fit:fill, so the source margin
# below reads ~1.2x larger on screen.)
VIDEO_WM_FONTSIZE = 20
VIDEO_WM_RIGHT    = 13     # px: text's right edge, from the cropped frame's right (1344)
VIDEO_WM_BOTTOM   = 16     # px: text's bottom, from the frame's bottom (1080)
VIDEO_CRF         = 23     # libx264 quality for the re-encode

# Looping in-tile slideshow: a `loop` line in layout.txt points at media/loop/,
# whose images share one grid tile and reveal one at a time (ascending filename
# order, wrapping). The frames are processed like normal stills (watermark, two
# sizes, content-hash) into photos/loop/ + thumbnails/loop/.
LOOP_DIRNAME     = "loop"
LOOP_INTERVAL_MS = 1000    # ms each frame is shown before switching to the next


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


# Optional sidecar (in the SOURCE folder) mapping canonical id -> partial EXIF,
# used to fill spec fields a source file is missing — e.g. DxO PhotoLab drops
# aperture/shutter/focal when you crop a shot. Values are the same formatted
# strings the manifest uses ("f/9", "1/640s", "400mm", lens model). Only BLANK
# fields get filled; real EXIF is never overwritten.
EXIF_OVERRIDES_PATH = SOURCE_DIR / "exif_overrides.json"


def _load_exif_overrides() -> dict:
    if not EXIF_OVERRIDES_PATH.exists():
        return {}
    try:
        data = json.loads(EXIF_OVERRIDES_PATH.read_text(encoding="utf-8"))
        return data if isinstance(data, dict) else {}
    except (OSError, json.JSONDecodeError) as e:
        print(f"  ! could not read {EXIF_OVERRIDES_PATH.name}: {e}")
        return {}


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


def _canonical_stem(stem: str) -> str:
    """Map a media filename's stem to its canonical id by stripping an editor's
    export suffix: a Lightroom copy suffix ('-1', '-2', …) and/or a DxO PhotoLab
    suffix ('_DxO…'). So an edited copy 'IMG_1009-1.JPG' or 'IMG_1009_DxO.JPG' is
    treated as 'IMG_1009' — same id, same output URL, same layout.txt / titles
    entry — letting you keep the suffix to track which photos you've edited.
    (Photo ids are 'IMG_NNNN' with no hyphens, so a trailing '-<n>' is always an
    edit suffix; video stems carry no such suffix and pass through unchanged.)"""
    low = stem.lower()
    i = low.find("_dxo")
    if i != -1:
        stem = stem[:i]
    return re.sub(r"-\d+$", "", stem)


def process_one(src: Path, titles: dict | None = None, span: int = 1) -> dict | None:
    try:
        src_img = Image.open(src)
    except Exception as e:
        print(f"  ! skip {src.name}: cannot open ({e})")
        return None

    exif = _named_exif(src_img)
    img = ImageOps.exif_transpose(src_img)
    # exif_transpose returns the same object when there's no orientation tag;
    # copy in that case so we can close the source file handle safely.
    if img is src_img:
        img = img.copy()
    src_img.close()

    stem = _canonical_stem(src.stem)
    thumb_name = f"{stem}.jpg"
    full_name  = f"{stem}.jpg"

    thumb = _resize_long_edge(img, THUMB_LONG_EDGE)
    full  = _resize_long_edge(img, FULL_LONG_EDGE)

    thumb = _watermark(thumb, WATERMARK_TEXT)
    full  = _watermark(full,  WATERMARK_TEXT)

    _save_jpeg(thumb, THUMBS_DIR / thumb_name, THUMB_QUALITY, exif_bytes=_COPYRIGHT_EXIF)
    _save_jpeg(full,  PHOTOS_DIR / full_name,  FULL_QUALITY,  exif_bytes=_COPYRIGHT_EXIF)

    # Content-hash cache-bust: a re-edited photo keeps the same filename/URL, so
    # without this the browser/CDN would serve the stale cached copy. The 8-char
    # hash changes only when the pixels do.
    thumb_v = hashlib.md5((THUMBS_DIR / thumb_name).read_bytes()).hexdigest()[:8]
    full_v  = hashlib.md5((PHOTOS_DIR / full_name).read_bytes()).hexdigest()[:8]

    w, h = full.size

    return {
        "id":        stem,
        "type":      "photo",
        "span":      span,
        "title":     _resolve_title(stem, exif, titles or {}),
        "thumbnail": f"thumbnails/{thumb_name}?v={thumb_v}",
        "full":      f"photos/{full_name}?v={full_v}",
        "width":     w,
        "height":    h,
        "exif":      _exif_fields(exif),
    }


def _exif_fields(exif: dict) -> dict:
    # The caption/spec fields the site reads off each photo. Shared by stills and
    # loop frames.
    return {
        "aperture": _format_aperture(exif.get("FNumber")),
        "iso":      _format_iso(exif.get("ISOSpeedRatings")
                                or exif.get("PhotographicSensitivity")),
        "shutter":  _format_shutter(exif.get("ExposureTime")),
        "focal":    _format_focal(exif.get("FocalLength")),
        "camera":   exif.get("Model"),
        "lens":     exif.get("LensModel"),
        "date":     _format_date(exif),
    }


def process_loop(loop_dir: Path, titles: dict | None = None, span: int = 1) -> dict | None:
    # Build one "loop" manifest item from every image in media/loop/. Each frame
    # is resized + watermarked like a normal still (into photos/loop/ +
    # thumbnails/loop/); the frames array is ordered ascending by filename so the
    # tile can cycle through them.
    frame_srcs = sorted(
        p for p in loop_dir.iterdir()
        if p.is_file() and p.suffix.lower() in SUPPORTED_EXTS
    )
    if not frame_srcs:
        print(f"  ! loop: no images found in {loop_dir}")
        return None

    out_thumbs = THUMBS_DIR / LOOP_DIRNAME
    out_full   = PHOTOS_DIR / LOOP_DIRNAME
    out_thumbs.mkdir(exist_ok=True)
    out_full.mkdir(exist_ok=True)

    frames: list[dict] = []
    for src in frame_srcs:
        try:
            src_img = Image.open(src)
        except Exception as e:
            print(f"  ! loop skip {src.name}: cannot open ({e})")
            continue
        exif = _named_exif(src_img)
        img  = ImageOps.exif_transpose(src_img)
        if img is src_img:
            img = img.copy()
        src_img.close()

        stem = _canonical_stem(src.stem)
        name = f"{stem}.jpg"
        thumb = _watermark(_resize_long_edge(img, THUMB_LONG_EDGE), WATERMARK_TEXT)
        full  = _watermark(_resize_long_edge(img, FULL_LONG_EDGE),  WATERMARK_TEXT)
        _save_jpeg(thumb, out_thumbs / name, THUMB_QUALITY, exif_bytes=_COPYRIGHT_EXIF)
        _save_jpeg(full,  out_full   / name, FULL_QUALITY,  exif_bytes=_COPYRIGHT_EXIF)

        tv = hashlib.md5((out_thumbs / name).read_bytes()).hexdigest()[:8]
        fv = hashlib.md5((out_full   / name).read_bytes()).hexdigest()[:8]
        w, h = full.size
        frames.append({
            "id":        stem,
            "thumbnail": f"thumbnails/{LOOP_DIRNAME}/{name}?v={tv}",
            "full":      f"photos/{LOOP_DIRNAME}/{name}?v={fv}",
            "width":     w,
            "height":    h,
            "title":     _resolve_title(stem, exif, titles or {}),
            "exif":      _exif_fields(exif),
        })

    if not frames:
        return None

    print(f"  [loop] {len(frames)} frames ({frame_srcs[0].name} … {frame_srcs[-1].name})")
    return {
        "id":         "loop",
        "type":       "loop",
        "span":       span,
        "intervalMs": LOOP_INTERVAL_MS,
        "width":      frames[0]["width"],   # tile sizes off the first frame
        "height":     frames[0]["height"],
        "title":      "",
        "frames":     frames,
    }


def _watermark_font_file() -> Path | None:
    # The actual TTF the stills use (first existing candidate) — ffmpeg's
    # drawtext needs a real file path, not a name PIL can resolve internally.
    for name in _FONT_CANDIDATES:
        p = Path(name)
        if p.is_file():
            return p
    return None


_WM_DIR: Path | None = None


def _watermark_assets() -> Path | None:
    # A temp dir holding the watermark text + font under simple relative names,
    # so they parse inside an ffmpeg filter regardless of spaces/colons in the
    # real paths (the repo path contains a space). Built once, reused.
    global _WM_DIR
    if _WM_DIR is None:
        font = _watermark_font_file()
        if not font:
            return None
        import tempfile, shutil
        d = Path(tempfile.mkdtemp(prefix="photosite_wm_"))
        (d / "wm.txt").write_text(WATERMARK_TEXT, encoding="utf-8")
        shutil.copy(font, d / "font.ttf")
        _WM_DIR = d
    return _WM_DIR


def _transcode_watermarked(src: Path, dest: Path) -> bool:
    # Re-encode a video with the © watermark baked in (mirrors the stills).
    # Returns False if it can't (disabled / no font / no ffmpeg) so the caller
    # falls back to a plain copy.
    if not ADD_WATERMARK:
        return False
    wm = _watermark_assets()
    if not wm:
        return False
    import subprocess
    a_text = WATERMARK_OPACITY / 255      # same opacity as the stills
    a_shad = 110 / 255                     # same subtle drop shadow
    vf = (f"crop={VIDEO_CROP},"
          f"drawtext=textfile=wm.txt:fontfile=font.ttf:fontsize={VIDEO_WM_FONTSIZE}:"
          f"fontcolor=white@{a_text:.3f}:shadowcolor=black@{a_shad:.3f}:"
          f"shadowx=1:shadowy=1:x=w-tw-{VIDEO_WM_RIGHT}:y=h-th-{VIDEO_WM_BOTTOM}")
    cmd = ["ffmpeg", "-y", "-hide_banner", "-loglevel", "error",
           "-i", str(src), "-vf", vf,
           "-c:v", "libx264", "-crf", str(VIDEO_CRF), "-preset", "medium",
           "-pix_fmt", "yuv420p", "-c:a", "copy", "-movflags", "+faststart",
           str(dest)]
    try:
        return subprocess.run(cmd, cwd=str(wm)).returncode == 0 and dest.exists()
    except FileNotFoundError:
        print("  ! ffmpeg not found on PATH — copying video without watermark")
        return False


def process_video(src: Path, titles: dict | None = None) -> dict | None:
    import shutil

    dest = VIDEOS_DIR / src.name
    try:
        if not dest.exists() or src.stat().st_mtime > dest.stat().st_mtime:
            if not _transcode_watermarked(src, dest):
                shutil.copy2(src, dest)   # fallback when ffmpeg/font unavailable
    except Exception as e:
        print(f"  ! skip {src.name}: cannot process ({e})")
        return None

    stem      = _canonical_stem(src.stem)
    raw_title = (titles or {}).get(stem, "")
    title     = raw_title.strip() or None

    cache_key = hashlib.md5(dest.read_bytes()).hexdigest()[:8]

    return {
        "id":     stem,
        "type":   "video",
        "title":  title,
        # Content cache-bust: videos aren't covered by index.html's ?v bumps,
        # and the CDN caches them by URL across deploys.
        "src":    f"videos/{src.name}?v={cache_key}",
        "width":  None,
        "height": None,
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

    # Index every media file by its canonical id (edit suffix + extension
    # stripped), so layout.txt's bare ids resolve whether or not a file carries a
    # "-<n>" (Lightroom) or "_DxO…" suffix. If an original and an edit share an id,
    # prefer the edit and warn so the leftover can be cleaned up.
    media_index: dict[str, Path] = {}
    if MEDIA_DIR.exists():
        for p in sorted(MEDIA_DIR.iterdir()):
            if not (p.is_file() and p.suffix.lower() in (SUPPORTED_EXTS | VIDEO_EXTS)):
                continue
            key  = _canonical_stem(p.stem)
            prev = media_index.get(key)
            if prev is None:
                media_index[key] = p
            else:
                edited = p if _canonical_stem(p.stem) != p.stem else prev
                drop   = prev if edited is p else p
                media_index[key] = edited
                print(f"  ! id '{key}': using {edited.name}, ignoring {drop.name}")

    def _resolve_source(name: str) -> Path | None:
        # Accept either the canonical id ("IMG_1009") or the actual edited
        # filename ("IMG_1009_DxO") in layout.txt — both resolve to the same file.
        return media_index.get(_canonical_stem(name))

    def _read_layout() -> list[tuple]:
        # Parse layout.txt -> [(Path, role, item_type, name)] in file order.
        # One item per line: "<filename> [role]", role one of: hero, medium,
        # "small landscape", "small portrait". Videos take no role (detected by
        # extension). '#' starts a comment; blank lines are ignored.
        entries: list[tuple] = []
        for lineno, raw in enumerate(
                LAYOUT_FILE.read_text(encoding="utf-8").splitlines(), 1):
            line = raw.split("#", 1)[0].strip()
            if not line:
                continue
            parts = line.split()
            name  = parts[0]
            tag   = " ".join(parts[1:]).lower()
            # `loop` is the media/loop/ folder rendered as one cycling tile.
            if name.lower() == LOOP_DIRNAME:
                loop_dir = MEDIA_DIR / LOOP_DIRNAME
                if not loop_dir.is_dir():
                    print(f"  ! layout.txt line {lineno}: no '{LOOP_DIRNAME}/' "
                          f"folder in {MEDIA_DIR.name}/")
                    continue
                if tag == "medium":
                    role = "medium"
                elif tag in ("small portrait", "portrait"):
                    role = "small_portrait"
                else:
                    role = "small_landscape"
                entries.append((loop_dir, role, "loop", "loop"))
                continue
            src   = _resolve_source(name)
            if not src:
                print(f"  ! layout.txt line {lineno}: no file for '{name}'")
                continue
            if src.suffix.lower() in VIDEO_EXTS:
                role, item_type = "video", "video"
            elif tag == "hero":
                role, item_type = "hero", "photo"
            elif tag == "medium":
                role, item_type = "medium", "photo"
            elif tag in ("small landscape", "landscape"):
                role, item_type = "small_landscape", "photo"
            elif tag in ("small portrait", "portrait"):
                role, item_type = "small_portrait", "photo"
            else:
                if tag:
                    print(f"  ! layout.txt line {lineno}: unknown role '{tag}' "
                          f"for {name}; treating as a small grid photo")
                role, item_type = "small", "photo"
            entries.append((src, role, item_type, name))
        return entries

    # ---- Discover sources -------------------------------------------------------

    # Page order comes entirely from layout.txt: hero-tagged lines become the
    # slideshow, the rest become grid tiles, all in file order.
    work_items: list[tuple]  = []    # grid: (Path, span, item_type, label)
    hero_sources: list[Path] = []    # heroes in display order
    grid_roles: dict[str, str] = {}  # stem -> declared role, for a sanity check
    if LAYOUT_FILE.exists():
        for src, role, item_type, name in _read_layout():
            if role == "hero":
                hero_sources.append(src)
            else:
                span = 2 if role == "medium" else 1
                work_items.append((src, span, item_type, name))
                if item_type == "photo":
                    grid_roles[src.stem] = role

    if not hero_sources and not work_items:
        sys.stderr.write(
            "No photos or videos found. Expected:\n"
            f"  {MEDIA_DIR}/ + {LAYOUT_FILE}\n"
        )
        return 1

    grid_desc         = f"layout.txt + {MEDIA_DIR.name}/"
    photo_work        = [(src, span, lbl) for src, span, t, lbl in work_items if t == "photo"]
    video_work        = [(src, lbl)       for src, span, t, lbl in work_items if t == "video"]
    all_photo_sources = hero_sources + [src for src, *_ in photo_work]
    all_video_sources = [src for src, _ in video_work]

    n_medium = sum(1 for _s, span, t, _l in work_items if t == "photo" and span == 2)
    print(
        f"Found  {len(hero_sources)} hero  |  grid from {grid_desc}  |  "
        f"{len(photo_work)} grid photos ({n_medium} medium)  |  "
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
        key = _canonical_stem(src.stem)
        if key not in titles:
            titles[key] = ""
            title_changes = True
    if title_changes or not TITLES_PATH.exists():
        _save_titles(titles)
        print(f"  ~ updated {TITLES_PATH} (fill in titles + re-run to apply)")

    # ---- Process hero photos (parallel) ----------------------------------------

    workers      = max(1, os.cpu_count() or 4)
    hero_entries: list[dict] = []

    if hero_sources:
        worker_hero = partial(process_one, titles=titles, span=1)
        with ThreadPoolExecutor(max_workers=workers) as pool:
            for i, entry in enumerate(pool.map(worker_hero, hero_sources), 1):
                print(f"  [hero {i:>2}/{len(hero_sources)}] {hero_sources[i-1].name}")
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

    # Sanity check: warn when a declared "small landscape/portrait" or "medium"
    # role disagrees with the image's real orientation. The grid still renders by
    # actual dimensions — this just flags likely typos in layout.txt.
    _want = {"small_landscape": "landscape", "small_portrait": "portrait",
             "medium": "landscape"}
    for stem, role in grid_roles.items():
        entry = stem_to_entry.get(stem)
        if not entry or role not in _want:
            continue
        w, h = entry.get("width"), entry.get("height")
        if w and h:
            actual = "portrait" if h > w else "landscape"
            if actual != _want[role]:
                print(f"  ! role mismatch: {stem} is tagged "
                      f"'{role.replace('_', ' ')}' but the image is {actual} "
                      f"— rendered as {actual}")

    # Re-assemble in tile order, inserting videos inline.
    entries: list[dict] = []
    for src, span, item_type, lbl in work_items:
        if item_type == "photo":
            entry = stem_to_entry.get(src.stem)
            if entry:
                entries.append(entry)
        elif item_type == "loop":
            entry = process_loop(src, titles=titles, span=span)
            if entry:
                entries.append(entry)
        else:
            print(f"  [vid] {lbl} -- {src.name}")
            entry = process_video(src, titles=titles)
            if entry:
                entries.append(entry)

    # ---- EXIF overrides --------------------------------------------------------
    # Fill spec fields a source file is missing (e.g. DxO drops aperture/shutter/
    # focal on crop) from exif_overrides.json. Never clobbers real EXIF.
    overrides = _load_exif_overrides()
    if overrides:
        filled = 0
        for e in entries + hero_entries:
            ov = overrides.get(e.get("id"))
            if not ov or e.get("type") == "video":
                continue
            ex = e.setdefault("exif", {})
            for k, v in ov.items():
                if v and not ex.get(k):
                    ex[k] = v
                    filled += 1
        if filled:
            print(f"  ~ filled {filled} missing EXIF field(s) from {EXIF_OVERRIDES_PATH.name}")

    # ---- Build manifest --------------------------------------------------------
    # Tile order is already correct — no mtime sort needed.

    public = [dict(e) for e in entries]

    heroes_public = [dict(e) for e in hero_entries]
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

    valid_photo_stems = {_canonical_stem(p.stem) for p in all_photo_sources}
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
        f"Grid: {len(public)} items ({len(video_work)} videos)."
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
