import os, sys, json, urllib.request, time, glob, subprocess

API = "http://127.0.0.1:8355"
BASE = os.path.dirname(os.path.abspath(__file__))
REMOTION_OUT = os.path.join(BASE, "remotion-project", "out")
TEST_PROJ = "test_project"  # relative name, like frontend sends

def post(path, body):
    data = json.dumps(body).encode("utf-8")
    req = urllib.request.Request(f"{API}{path}", data=data, headers={"Content-Type": "application/json"})
    resp = urllib.request.urlopen(req, timeout=120)
    return json.loads(resp.read())

def has_audio_stream(mp4_path):
    if not os.path.exists(mp4_path):
        return False
    r = subprocess.run(
        ["ffprobe", "-v", "quiet", "-show_entries", "stream=codec_type", "-of", "csv=p=0", mp4_path],
        capture_output=True, text=True, encoding="utf-8", errors="replace"
    )
    return "audio" in r.stdout

# Clean out dir
for f in os.listdir(REMOTION_OUT):
    p = os.path.join(REMOTION_OUT, f)
    try:
        if os.path.isfile(p): os.remove(p)
        elif os.path.isdir(p): os.rmdir(p)
    except: pass

# === 1. Render with audio_path ===
print("=== 1. Render with audio_path ===")
tsx = "import React from 'react'\nimport {AbsoluteFill} from 'remotion'\nconst Scene: React.FC = () => (\n  <AbsoluteFill style={{background:'#667eea',display:'flex',justifyContent:'center',alignItems:'center'}}>\n    <h1 style={{color:'#fff',fontSize:64}}>Test</h1>\n  </AbsoluteFill>\n)\nexport {Scene}\n"

try:
    r1 = post("/api/v1/render/start", {
        "project_id": "test_project",
        "target": "scene",
        "target_id": "scene_1",
        "project_path": TEST_PROJ,
        "tsx_code": tsx,
        "audio_path": "test_project/assets/voice/test_audio.wav"
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
        size = os.path.getsize(rendered)
        audio = has_audio_stream(rendered)
        print(f"  Output: {os.path.basename(rendered)} ({size} bytes, audio={'Y' if audio else 'N'})")

        # File in project preview
        preview_file = os.path.join(BASE, TEST_PROJ, "preview", "scene_1.mp4")
        if os.path.exists(preview_file):
            paudio = has_audio_stream(preview_file)
            print(f"  Preview: {preview_file} (audio={'Y' if paudio else 'N'})")
        else:
            print(f"  Preview: NOT FOUND at {preview_file}")
    else:
        print("  FAIL: no output file")
except Exception as e:
    print(f"  ERROR: {e}")
    import traceback; traceback.print_exc()

# === 2. Separate merge (frontend-style relative paths) ===
print("\n=== 2. Merge endpoint (relative paths, like frontend sends) ===")
try:
    rendered_video = f"{TEST_PROJ}/preview/scene_1.mp4"
    audio_path = f"{TEST_PROJ}/assets/voice/test_audio.wav"
    merged_out = f"{TEST_PROJ}/preview/Merged_scene_1.mp4"

    r2 = post("/api/v1/render/merge-audio-video", {
        "project_path": TEST_PROJ,
        "video_path": rendered_video,
        "audio_path": audio_path,
        "output_path": merged_out
    })
    print(f"  status={r2['status']} output={r2['output_path']}")

    merged_file = os.path.join(BASE, TEST_PROJ, "preview", "Merged_scene_1.mp4")
    if os.path.exists(merged_file):
        maudio = has_audio_stream(merged_file)
        print(f"  Merged file: {os.path.getsize(merged_file)} bytes, audio={'Y' if maudio else 'N'}")
    else:
        print(f"  Merged file NOT FOUND at {merged_file}")
        # check if it was created at resolved path
        for candidate in glob.glob(os.path.join(BASE, "**", "Merged_scene_1.mp4"), recursive=True):
            print(f"  Found at: {candidate}")
except Exception as e:
    print(f"  ERROR: {e}")

print("\n=== Done ===")
