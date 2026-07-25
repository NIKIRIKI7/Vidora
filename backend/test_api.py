import os, sys, json, urllib.request, time, glob

API = "http://127.0.0.1:8355"
BASE = os.path.dirname(os.path.abspath(__file__))
TEST_PROJECT = os.path.join(BASE, "..", "test_project")
REMOTION_OUT = os.path.join(BASE, "remotion-project", "out")

def post(path, body):
    url = f"{API}{path}"
    data = json.dumps(body).encode("utf-8")
    req = urllib.request.Request(url, data=data, headers={"Content-Type": "application/json"})
    resp = urllib.request.urlopen(req, timeout=120)
    return json.loads(resp.read())

# === 1. RENDER ANIMATION ===
print("=== Test 1: Render Animation ===")
tsx = """import React from 'react'
import {AbsoluteFill} from 'remotion'
const Scene: React.FC = () => (
  <AbsoluteFill style={{background:'linear-gradient(135deg,#667eea,#764ba2)',display:'flex',justifyContent:'center',alignItems:'center',flexDirection:'column'}}>
    <h1 style={{color:'#fff',fontSize:64,fontFamily:'sans-serif',margin:0}}>Vidora Test</h1>
    <p style={{color:'#ddd',fontSize:24}}>Animation Render + Audio Merge</p>
  </AbsoluteFill>
)
export {Scene}
"""
try:
    r1 = post("/api/v1/render/start", {
        "project_id": "test_project",
        "target": "scene",
        "target_id": "test_render",
        "project_path": TEST_PROJECT,
        "tsx_code": tsx
    })
    tid = r1["task_id"]
    print(f"  task_id={tid}")

    rendered = None
    for _ in range(60):
        time.sleep(1)
        files = glob.glob(os.path.join(REMOTION_OUT, "*.mp4"))
        if files:
            rendered = max(files, key=os.path.getmtime)
            print(f"  Rendered: {os.path.basename(rendered)} ({os.path.getsize(rendered)} bytes)")
            break
    if not rendered:
        print("  FAIL: no output file after 60s")
except Exception as e:
    print(f"  ERROR: {e}")
    import traceback; traceback.print_exc()

# === 2. AUDIO PROCESS ===
print("\n=== Test 2: Audio Process ===")
test_wav = os.path.join(BASE, "test_output.wav")
try:
    r2 = post("/api/v1/audio/process", {
        "scene_id": "test_scene",
        "audio_path": test_wav,
        "project_path": TEST_PROJECT,
        "action": "normalize"
    })
    print(f"  status={r2['status']} action={r2.get('action_applied')} path={r2.get('processed_audio_path')}")
except Exception as e:
    print(f"  Audio process: {e}")

# === 3. MERGE AUDIO-VIDEO ===
print("\n=== Test 3: Merge Audio-Video ===")
if rendered and os.path.exists(rendered):
    merged_out = os.path.join(REMOTION_OUT, "test_final_merged.mp4")
    try:
        r3 = post("/api/v1/render/merge-audio-video", {
            "project_path": TEST_PROJECT,
            "video_path": rendered,
            "audio_path": test_wav,
            "output_path": merged_out
        })
        print(f"  status={r3['status']} output={r3['output_path']}")
        if os.path.exists(merged_out):
            print(f"  Merged file: {os.path.getsize(merged_out)} bytes")
        else:
            print(f"  FAIL: merged file not found at {merged_out}")
    except Exception as e:
        print(f"  Merge error: {e}")
else:
    print("  SKIP: no rendered video to merge")
    # Fallback: use any existing mp4 in out/
    fallback_mp4s = glob.glob(os.path.join(REMOTION_OUT, "*.mp4"))
    if fallback_mp4s:
        fallback = max(fallback_mp4s, key=os.path.getmtime)
        print(f"  Using fallback video: {os.path.basename(fallback)}")
        merged_out = os.path.join(REMOTION_OUT, "test_final_merged.mp4")
        try:
            r3 = post("/api/v1/render/merge-audio-video", {
                "project_path": TEST_PROJECT,
                "video_path": fallback,
                "audio_path": test_wav,
                "output_path": merged_out
            })
            print(f"  status={r3['status']} output={r3['output_path']}")
            if os.path.exists(merged_out):
                print(f"  Merged file: {os.path.getsize(merged_out)} bytes")
        except Exception as e:
            print(f"  Merge error: {e}")

print("\n=== Done ===")
