import os, sys, json, urllib.request, time, glob, subprocess

API = "http://127.0.0.1:8355"
BASE = os.path.dirname(os.path.abspath(__file__))
PROJ_NAME = "test_e2e"

def post(path, body):
    data = json.dumps(body).encode("utf-8")
    req = urllib.request.Request(f"{API}{path}", data=data, headers={"Content-Type": "application/json"})
    resp = urllib.request.urlopen(req, timeout=120)
    return json.loads(resp.read())

def probe(mp4):
    r = subprocess.run(
        ["ffprobe", "-v", "quiet", "-show_entries", "stream=codec_type,codec_name", "-of", "csv=p=0", mp4],
        capture_output=True, text=True, encoding="utf-8", errors="replace"
    )
    return r.stdout.strip()

# Video is at assets/a-roll/scene_1.mp4 (target="scene" → else branch)
rendered_video = os.path.join(BASE, PROJ_NAME, "assets", "a-roll", "scene_1.mp4")
audio_file = os.path.join(BASE, PROJ_NAME, "assets", "voice", "scene_audio.wav")

print(f"Video exists: {os.path.exists(rendered_video)} ({os.path.getsize(rendered_video)} B)")
print(f"Video streams: {probe(rendered_video)}")
print(f"Audio exists: {os.path.exists(audio_file)} ({os.path.getsize(audio_file)} B)")

# === Test merge with ABSOLUTE paths ===
print("\n=== MERGE with absolute paths ===")
try:
    merged_out = os.path.join(BASE, PROJ_NAME, "preview", "merged_abs.mp4")
    r = post("/api/v1/render/merge-audio-video", {
        "project_path": PROJ_NAME,
        "video_path": rendered_video,
        "audio_path": audio_file,
        "output_path": merged_out
    })
    print(f"status={r['status']} output={r['output_path']}")
    if os.path.exists(merged_out):
        print(f"Merged: {os.path.getsize(merged_out)} B, streams: {probe(merged_out)}")
    else:
        print("File NOT created")
except Exception as e:
    print(f"ERROR: {e}")

# === Test merge with RELATIVE paths (like frontend sends) ===
print("\n=== MERGE with relative paths ===")
try:
    merged_out_rel = f"{PROJ_NAME}/preview/merged_rel.mp4"
    r = post("/api/v1/render/merge-audio-video", {
        "project_path": PROJ_NAME,
        "video_path": f"{PROJ_NAME}/assets/a-roll/scene_1.mp4",
        "audio_path": f"{PROJ_NAME}/assets/voice/scene_audio.wav",
        "output_path": merged_out_rel
    })
    print(f"status={r['status']} output={r['output_path']}")
    merged_path = os.path.join(BASE, PROJ_NAME, "preview", "merged_rel.mp4")
    if os.path.exists(merged_path):
        print(f"Merged: {os.path.getsize(merged_path)} B, streams: {probe(merged_path)}")
    else:
        print(f"File NOT found at {merged_path}; checking resolved path {r['output_path']}")
        if os.path.exists(r['output_path']):
            print(f"Found at resolved path: {os.path.getsize(r['output_path'])} B, streams: {probe(r['output_path'])}")
except Exception as e:
    print(f"ERROR: {e}")
    import traceback; traceback.print_exc()

print("\n=== Done ===")
