import os, sys, json, urllib.request, time, glob, subprocess, shutil

API = "http://127.0.0.1:8355"
BASE = os.path.dirname(os.path.abspath(__file__))
REMOTION_OUT = os.path.join(BASE, "remotion-project", "out")
PROJ_NAME = "test_e2e"

def post(path, body):
    data = json.dumps(body).encode("utf-8")
    req = urllib.request.Request(f"{API}{path}", data=data, headers={"Content-Type": "application/json"})
    resp = urllib.request.urlopen(req, timeout=120)
    return json.loads(resp.read())

def probe(mp4):
    r = subprocess.run(
        ["ffprobe", "-v", "quiet", "-show_entries", "stream=codec_type", "-of", "csv=p=0", mp4],
        capture_output=True, text=True, encoding="utf-8", errors="replace"
    )
    return r.stdout

# Clean previous test data
proj_dir = os.path.join(BASE, PROJ_NAME)
if os.path.exists(proj_dir):
    shutil.rmtree(proj_dir)
for f in os.listdir(REMOTION_OUT):
    p = os.path.join(REMOTION_OUT, f)
    try:
        if os.path.isfile(p): os.remove(p)
        elif os.path.isdir(p): shutil.rmtree(p)
    except: pass

# Create project structure (simulates audio generation)
os.makedirs(os.path.join(proj_dir, "assets", "voice"))
os.makedirs(os.path.join(proj_dir, "preview"))
# Copy test audio
shutil.copy2(os.path.join(BASE, "test_output.wav"), os.path.join(proj_dir, "assets", "voice", "scene_audio.wav"))

assert os.path.exists(os.path.join(proj_dir, "assets", "voice", "scene_audio.wav"))

# === 1. RENDER with audio merge ===
print("=== 1. RENDER with audio_path ===")
try:
    r1 = post("/api/v1/render/start", {
        "project_id": PROJ_NAME,
        "target": "scene",
        "target_id": "scene_1",
        "project_path": PROJ_NAME,
        "tsx_code": """import React from 'react'
import {AbsoluteFill} from 'remotion'
const Scene: React.FC = () => (
  <AbsoluteFill style={{background:'#667eea',display:'flex',justifyContent:'center',alignItems:'center'}}>
    <h1 style={{color:'#fff',fontSize:64}}>E2E Test</h1>
  </AbsoluteFill>
)
export {Scene}
""",
        "audio_path": f"{PROJ_NAME}/assets/voice/scene_audio.wav"
    })
    print(f"  task_id={r1['task_id']}")

    rendered = None
    for _ in range(60):
        time.sleep(1)
        files = glob.glob(os.path.join(REMOTION_OUT, "*.mp4"))
        if files:
            rendered = max(files, key=os.path.getmtime)
            break

    if rendered:
        streams = probe(rendered)
        print(f"  Temp out: {os.path.basename(rendered)} ({os.path.getsize(rendered)} B)")
        print(f"  Streams: {streams.strip()}")
    else:
        print("  FAIL: no output")

    # Check preview copy
    preview = os.path.join(proj_dir, "preview", "scene_1.mp4")
    if os.path.exists(preview):
        streams = probe(preview)
        print(f"  Preview: {preview}")
        print(f"  Streams: {streams.strip()}")
    else:
        print(f"  Preview NOT FOUND at {preview}")

except Exception as e:
    print(f"  ERROR: {e}")
    import traceback; traceback.print_exc()

# === 2. MERGE endpoint (relative paths like frontend) ===
print("\n=== 2. MERGE (relative paths) ===")
try:
    r2 = post("/api/v1/render/merge-audio-video", {
        "project_path": PROJ_NAME,
        "video_path": f"{PROJ_NAME}/preview/scene_1.mp4",
        "audio_path": f"{PROJ_NAME}/assets/voice/scene_audio.wav",
        "output_path": f"{PROJ_NAME}/preview/merged.mp4"
    })
    print(f"  status={r2['status']} output={r2['output_path']}")

    merged = os.path.join(proj_dir, "preview", "merged.mp4")
    if os.path.exists(merged):
        streams = probe(merged)
        print(f"  Merged: {os.path.getsize(merged)} B")
        print(f"  Streams: {streams.strip()}")
        has_audio = "audio" in streams
        print(f"  Has audio: {'YES' if has_audio else 'NO'}")
    else:
        print(f"  Merged file NOT FOUND at {merged}")
except Exception as e:
    print(f"  ERROR: {e}")

print("\n=== Done ===")
