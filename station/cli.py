"""Private administration: python -m station.cli --help."""
import argparse
import json
import os
from pathlib import Path
import re
import subprocess
import tempfile
import time
from .media import prepare, save_json

ROOT = Path(__file__).resolve().parent.parent


def register(args, asset_id, title, source, kind, copy=False, provenance=None):
    if not re.fullmatch(r"[a-zA-Z0-9_-]{1,100}", asset_id):
        raise ValueError("Use a simple slug for the asset ID")
    catalog_path = args.config / "catalog.json"
    catalog = json.loads(catalog_path.read_text()) if catalog_path.exists() else {"assets": {}}
    if asset_id in catalog["assets"] or (args.media / f"{asset_id}.mp4").exists():
        raise ValueError("Asset ID already exists; use a new ID to keep published media immutable")
    duration = prepare(source, args.media / f"{asset_id}.mp4", copy=copy)
    catalog["assets"][asset_id] = {"title": title, "kind": kind, "duration": duration,
                                     "file": f"{asset_id}.mp4", "provenance": provenance or "Operator supplied"}
    save_json(catalog_path, catalog)
    print(f"Prepared {asset_id}: {duration:.3f}s. Add its ID to schedule.json and restart the station.")


def demo(args):
    specs = [
        ("ident", "ODDITY TELEVISION", "An independent service / Please stand by", "ident", 8, "0x233b36", 220),
        ("documentary", "THE LAST TRAIN TO SOMEWHERE", "A small film about going nowhere / Demonstration programme", "programme", 24, "0x363628", 165),
        ("advert", "A PROPER CUP OF SOMETHING", "Ask for it by its almost familiar name / Fictional advertisement", "advert", 8, "0x6a4028", 330),
        ("pif", "PLEASE DO NOT ADJUST THE MOON", "A message from the Department of Unusual Affairs", "public-information", 10, "0x293d4c", 110),
        ("trailer", "SATURDAY NIGHT CINEMA", "Coming soon / A film you may vaguely remember", "trailer", 8, "0x493347", 275),
        ("feature", "THE NIGHT SHIFT", "An excursion into the slightly peculiar / Demonstration feature", "programme", 40, "0x243342", 146),
        ("oddity", "TRANSMISSION TEST No. 7", "If the picture moves, this is quite normal", "interstitial", 12, "0x333333", 440),
    ]
    args.media.mkdir(parents=True, exist_ok=True)
    args.config.mkdir(parents=True, exist_ok=True)
    catalog = {"assets": {}}
    for key, title, subtitle, kind, seconds, colour, tone in specs:
        path = args.media / f"{key}.mp4"
        if not path.exists():
            print(f"Making {key} ({seconds}s)", flush=True)
            with tempfile.TemporaryDirectory() as tmp:
                title_path, sub_path = Path(tmp) / "title.txt", Path(tmp) / "subtitle.txt"
                title_path.write_text(title)
                sub_path.write_text(subtitle)
                font = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"
                filters = (f"drawgrid=w=80:h=60:t=1:c=white@0.08,"
                           f"drawtext=fontfile={font}:textfile={title_path}:fontsize=25:fontcolor=0xe7d9b5:x=(w-tw)/2:y=190,"
                           f"drawtext=fontfile={font}:textfile={sub_path}:fontsize=12:fontcolor=0xe7d9b5:x=(w-tw)/2:y=235,"
                           f"drawtext=fontfile={font}:text='SYNTHETIC DEMO / NOT ARCHIVE FOOTAGE':fontsize=12:fontcolor=white@0.6:x=(w-tw)/2:y=420,"
                           f"drawbox=x=20+mod(t*30\\,590):y=300:w=10:h=10:color=0xe7d9b5:t=fill")
                subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-f", "lavfi", "-i",
                                f"color=c={colour}:s=640x480:r=25", "-f", "lavfi", "-i", f"sine=frequency={tone}:sample_rate=48000",
                                "-t", str(seconds), "-vf", filters, "-af", "volume=0.03", "-c:v", "libx264", "-threads", "2",
                                "-preset", "ultrafast", "-crf", "27", "-pix_fmt", "yuv420p", "-g", "50", "-c:a", "aac", "-b:a", "64k",
                                "-map_metadata", "-1", "-movflags", "+faststart", str(path)], check=True)
        catalog["assets"][key] = {"title": title.title(), "kind": kind, "duration": seconds,
                                      "file": path.name, "provenance": "Original synthetic demonstration; CC0"}
    save_json(args.config / "catalog.json", catalog)
    save_json(args.config / "schedule.json", {
        "channel": "Oddity Television", "timezone": "Europe/London", "mode": "cycle",
        "origin": "2026-01-01T00:00:00Z", "period_seconds": 120, "filler": ["oddity", "ident"],
        "blocks": [{"title": "The demonstration service", "offset": 0, "items": [
            {"asset": "ident"}, {"asset": "documentary"}, {"asset": "advert"}, {"asset": "pif"},
            {"asset": "trailer"}, {"asset": "feature", "break_every": 20, "ads": ["advert"]}, {"asset": "ident"}]}]})
    print("Demo ready. A two-minute cycle is anchored to even UTC minutes; restarting preserves its position.")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--config", type=Path, default=Path(os.getenv("STATION_CONFIG", ROOT / "config")))
    parser.add_argument("--media", type=Path, default=Path(os.getenv("STATION_MEDIA", ROOT / "media")))
    sub = parser.add_subparsers(dest="command", required=True)
    sub.add_parser("demo", help="Generate original, synthetic sample clips and a 2-minute broadcast cycle")
    add = sub.add_parser("add", help="Prepare a local programme or archive clip without modifying the original")
    add.add_argument("source", type=Path)
    for p in [add]:
        p.add_argument("--id", required=True)
        p.add_argument("--title", required=True)
        p.add_argument("--kind", default="programme", choices=["programme", "advert", "ident", "trailer", "archive", "public-information", "interstitial"])
        p.add_argument("--copy", action="store_true")
        p.add_argument("--provenance", required=True, help="Source and rights/permission notes (kept private)")
    discover = sub.add_parser("discover", help="List Jellyfin films/episodes, optionally within a library, collection or series")
    for flag in ["parent", "genre", "tag"]:
        discover.add_argument("--" + flag)
    for flag in ["year", "studio", "rating"]:
        discover.add_argument("--" + flag, action="append")
    fetch = sub.add_parser("import-jellyfin", help="Prefetch one Jellyfin item into the isolated broadcast cache")
    fetch.add_argument("item_id")
    fetch.add_argument("--id", required=True)
    fetch.add_argument("--title", required=True)
    fetch.add_argument("--copy", action="store_true")
    sub.add_parser("validate", help="Check paths, scheduling and prepared media")
    export = sub.add_parser("export", help="Write the next 24 hours of public programme-guide data")
    export.add_argument("output", type=Path)
    args = parser.parse_args()
    try:
        if args.command == "demo":
            if (args.config / "catalog.json").exists() or (args.config / "schedule.json").exists():
                raise ValueError("Demo refuses to replace an existing station. Use fresh --config and --media directories.")
            demo(args)
        elif args.command == "add":
            register(args, args.id, args.title, args.source, args.kind, args.copy, args.provenance)
        elif args.command in ("discover", "import-jellyfin"):
            from .jellyfin import Jellyfin
            client = Jellyfin()
            try:
                if args.command == "discover":
                    print(json.dumps(list(client.items(args.parent, args.genre, args.tag, args.year, args.studio, args.rating)), indent=2))
                else:
                    with tempfile.TemporaryDirectory() as tmp:
                        source = Path(tmp) / "source.media"
                        client.download(args.item_id, source)
                        register(args, args.id, args.title, source, "programme", args.copy, "Jellyfin prefetch; operator to confirm broadcast rights")
            finally:
                client.close()
        else:
            from .schedule import Schedule
            station = Schedule(json.loads((args.config / "schedule.json").read_text()),
                               json.loads((args.config / "catalog.json").read_text()), args.media)
            guide = station.guide(time.time(), 24)
            if args.command == "export":
                save_json(args.output, guide)
            else:
                from .media import probe
                for key in station.allowed:
                    asset = station.assets[key]
                    info = probe(station.root / asset["file"])
                    videos = [s for s in info["streams"] if s["codec_type"] == "video"]
                    audios = [s for s in info["streams"] if s["codec_type"] == "audio"]
                    if not videos or videos[0]["codec_name"] != "h264" or videos[0].get("pix_fmt") != "yuv420p" or any(s["codec_name"] != "aac" for s in audios):
                        raise ValueError(f"Asset {key} needs browser-compatible preparation")
                    if abs(float(info["format"]["duration"]) - asset["duration"]) > .25:
                        raise ValueError(f"Catalogue duration disagrees with prepared media: {key}")
                print(f"Valid station: {len(station.allowed)} scheduled assets; {len(guide['upcoming'])} upcoming entries over 24 hours")
    except Exception as error:
        # Do not echo upstream exceptions: they may contain server URLs or headers.
        if isinstance(error, (ValueError, FileNotFoundError, KeyError)):
            parser.exit(1, f"Configuration error: {error}\n")
        parser.exit(1, f"Operation failed ({type(error).__name__}). Check the private connection/media and retry.\n")


if __name__ == "__main__":
    main()
