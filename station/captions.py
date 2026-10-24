"""Prepare text subtitles once; serve only cached WebVTT to viewers."""
import os
from pathlib import Path
import re
import subprocess
import tempfile
import uuid
from .media import probe

TEXT_CODECS = {"subrip", "srt", "ass", "ssa", "webvtt", "mov_text", "text", "ttml"}
LANGUAGES = {"eng": "en", "fre": "fr", "fra": "fr", "ger": "de", "deu": "de", "spa": "es",
             "wel": "cy", "cym": "cy", "gla": "gd", "ita": "it", "por": "pt", "und": "und"}
LABELS = {"en": "English", "fr": "French", "de": "German", "es": "Spanish", "cy": "Welsh", "gd": "Scottish Gaelic"}


def language_code(value):
    code = LANGUAGES.get(str(value).lower(), str(value or "und"))
    return code if re.fullmatch(r"[A-Za-z]{2,8}(?:-[A-Za-z0-9]{1,8})*", code) else "und"


def convert_caption(source, destination, stream=None):
    """Convert a sidecar or an embedded subtitle stream without encoding video."""
    destination = Path(destination)
    destination.parent.mkdir(parents=True, exist_ok=True)
    fd, temp = tempfile.mkstemp(suffix=".vtt", dir=destination.parent)
    os.close(fd)
    try:
        command = ["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-i", str(source),
                   "-map", f"0:{stream}" if stream is not None else "0:s:0", "-c:s", "webvtt", "-map_metadata", "-1", "-f", "webvtt", temp]
        subprocess.run(command, check=True, timeout=300)
        if not Path(temp).read_text(encoding="utf-8-sig").startswith("WEBVTT"):
            raise ValueError("Subtitle conversion did not produce WebVTT")
        os.replace(temp, destination)
    finally:
        Path(temp).unlink(missing_ok=True)


def caption_record(asset_id, media_root, source, language="en", label=None, stream=None, default=False):
    if not re.fullmatch(r"[a-zA-Z0-9_-]{1,100}", asset_id):
        raise ValueError("Invalid caption asset ID")
    language = language_code(language)
    track_id = "cc-" + uuid.uuid4().hex[:12]
    filename = f"{asset_id}-{track_id}.vtt"
    convert_caption(source, Path(media_root) / filename, stream)
    return {"id": track_id, "file": filename, "language": language,
            "label": label or LABELS.get(language, language.upper()), "default": bool(default)}


def extract_embedded(source, asset_id, media_root):
    tracks = []
    for stream in probe(source)["streams"]:
        if stream["codec_type"] != "subtitle":
            continue
        if stream.get("codec_name") not in TEXT_CODECS:
            print("Skipped a bitmap/unsupported subtitle stream; supply an OCR'd SRT or WebVTT sidecar.")
            continue
        tags = stream.get("tags", {})
        tracks.append(caption_record(asset_id, media_root, source, tags.get("language", "und"),
                                     tags.get("title"), stream["index"], stream.get("disposition", {}).get("default", False)))
    return tracks


def add_demo_captions(config, media):
    """Add original descriptive captions to an existing synthetic demo."""
    import json
    from .media import save_json
    path = Path(config) / "catalog.json"
    catalog = json.loads(path.read_text())
    count = 0
    for key, asset in catalog["assets"].items():
        if asset.get("provenance") != "Original synthetic demonstration; CC0" or asset.get("captions"):
            continue
        seconds = float(asset["duration"])
        milliseconds = round(seconds * 1000)
        stamp = f"{milliseconds//3600000:02}:{milliseconds//60000%60:02}:{milliseconds//1000%60:02}.{milliseconds%1000:03}"
        filename = f"{key}-demo-cc.vtt"
        (Path(media) / filename).write_text(f"WEBVTT\n\n00:00:00.000 --> {stamp}\n[Soft test tone]\nSynthetic demonstration: {asset['title']}\n", encoding="utf-8")
        asset["captions"] = [{"id": "demo-cc", "file": filename, "language": "en", "label": "English — demo descriptions", "default": False}]
        count += 1
    save_json(path, catalog)
    return count
