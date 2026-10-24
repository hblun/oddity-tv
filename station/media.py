"""One-time FFmpeg preparation, kept outside the public server."""
import json
from pathlib import Path
import subprocess
import tempfile
import os


def probe(path):
    result = subprocess.run(["ffprobe", "-v", "error", "-show_format", "-show_streams",
                             "-of", "json", str(path)], check=True, capture_output=True, text=True)
    return json.loads(result.stdout)


def prepare(source, destination, copy=False):
    """Copy compatible streams or encode once. Publish only a completed MP4."""
    source, destination = Path(source), Path(destination)
    destination.parent.mkdir(parents=True, exist_ok=True)
    info = probe(source)
    videos = [s for s in info["streams"] if s["codec_type"] == "video"]
    audios = [s for s in info["streams"] if s["codec_type"] == "audio"]
    if not videos:
        raise ValueError("No video stream")
    if copy and (videos[0]["codec_name"] != "h264" or videos[0].get("pix_fmt") != "yuv420p"
                 or (audios and audios[0]["codec_name"] != "aac")):
        raise ValueError("--copy requires H.264 yuv420p and AAC; omit it for one-time encoding")
    handle, temp = tempfile.mkstemp(suffix=".mp4", dir=destination.parent)
    os.close(handle)
    try:
        command = ["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-i", str(source),
                   "-map", "0:v:0", "-map", "0:a:0?", "-sn", "-dn", "-map_metadata", "-1"]
        if copy:
            command += ["-c", "copy"]
        else:
            command += ["-c:v", "libx264", "-preset", "veryfast", "-crf", "23", "-pix_fmt", "yuv420p",
                        "-vf", "scale=trunc(iw/2)*2:trunc(ih/2)*2", "-force_key_frames", "expr:gte(t,n_forced*2)",
                        "-c:a", "aac", "-b:a", "128k"]
        command += ["-movflags", "+faststart", temp]
        subprocess.run(command, check=True)
        duration = float(probe(temp)["format"]["duration"])
        os.replace(temp, destination)
        return duration
    finally:
        Path(temp).unlink(missing_ok=True)


def save_json(path, data):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    handle, temp = tempfile.mkstemp(dir=path.parent, suffix=".json")
    try:
        with os.fdopen(handle, "w") as f:
            json.dump(data, f, indent=2)
            f.write("\n")
        os.replace(temp, path)
    finally:
        Path(temp).unlink(missing_ok=True)
