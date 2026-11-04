"""Finds the person in a creator's video for face-aware effects.

Reads the video already cropped to 9:16 (same framing as the edit renderer) and writes:
  faces.json  one face box per frame [x, y, w, h] in 0..1 of the frame, or null; smoothed
  mask.mkv    grayscale person mask per frame (white = person), lossless, same timing

Uses MediaPipe's BlazeFace and Selfie Segmenter (Apache-2.0). Run:
  python3 analyze.py <video> <out_dir> [--models DIR] [--width 540 --height 960 --fps 30]
"""

import argparse
import json
import os
import subprocess
import sys

import mediapipe as mp
import numpy as np

vision = mp.tasks.vision
BaseOptions = mp.tasks.BaseOptions


def frames(path, w, h, fps):
    cmd = [
        "ffmpeg", "-v", "error", "-i", path,
        "-vf", f"scale={w}:{h}:force_original_aspect_ratio=increase,crop={w}:{h},fps={fps}",
        "-f", "rawvideo", "-pix_fmt", "rgb24", "pipe:1",
    ]
    proc = subprocess.Popen(cmd, stdout=subprocess.PIPE)
    size = w * h * 3
    while True:
        buf = proc.stdout.read(size)
        if len(buf) < size:
            break
        yield np.frombuffer(buf, np.uint8).reshape(h, w, 3)
    proc.wait()


def smooth(boxes, alpha=0.35, hold=8):
    """Exponential smoothing so effects don't jitter; a lost face is held for a few frames."""
    out, last, missing = [], None, 0
    for b in boxes:
        if b is None:
            missing += 1
            out.append([round(v, 4) for v in last] if last is not None and missing <= hold else None)
            continue
        missing = 0
        last = b if last is None else [last[i] + alpha * (b[i] - last[i]) for i in range(4)]
        out.append([round(v, 4) for v in last])
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("video")
    ap.add_argument("out_dir")
    ap.add_argument("--models", default=os.path.join(os.path.dirname(__file__), "models"))
    ap.add_argument("--width", type=int, default=540)
    ap.add_argument("--height", type=int, default=960)
    ap.add_argument("--fps", type=int, default=30)
    a = ap.parse_args()
    os.makedirs(a.out_dir, exist_ok=True)

    face = vision.FaceDetector.create_from_options(vision.FaceDetectorOptions(
        base_options=BaseOptions(model_asset_path=os.path.join(a.models, "blaze_face_short_range.tflite")),
        running_mode=vision.RunningMode.VIDEO, min_detection_confidence=0.5))
    seg = vision.ImageSegmenter.create_from_options(vision.ImageSegmenterOptions(
        base_options=BaseOptions(model_asset_path=os.path.join(a.models, "selfie_segmenter.tflite")),
        running_mode=vision.RunningMode.VIDEO, output_confidence_masks=True, output_category_mask=False))

    enc = subprocess.Popen([
        "ffmpeg", "-y", "-v", "error", "-f", "rawvideo", "-pix_fmt", "gray", "-s", f"{a.width}x{a.height}",
        "-r", str(a.fps), "-i", "pipe:0", "-c:v", "ffv1", os.path.join(a.out_dir, "mask.mkv"),
    ], stdin=subprocess.PIPE)

    boxes = []
    for i, rgb in enumerate(frames(a.video, a.width, a.height, a.fps)):
        img = mp.Image(image_format=mp.ImageFormat.SRGB, data=np.ascontiguousarray(rgb))
        ts = int(i * 1000 / a.fps)
        found = face.detect_for_video(img, ts).detections
        if found:
            # Largest face is the creator.
            bb = max((d.bounding_box for d in found), key=lambda b: b.width * b.height)
            boxes.append([bb.origin_x / a.width, bb.origin_y / a.height, bb.width / a.width, bb.height / a.height])
        else:
            boxes.append(None)
        conf = seg.segment_for_video(img, ts).confidence_masks[0].numpy_view()
        enc.stdin.write((np.clip(conf, 0, 1) * 255).astype(np.uint8).tobytes())
    enc.stdin.close()
    enc.wait()

    with open(os.path.join(a.out_dir, "faces.json"), "w") as f:
        json.dump({"fps": a.fps, "width": a.width, "height": a.height, "faces": smooth(boxes)}, f)
    found = sum(1 for b in boxes if b is not None)
    print(json.dumps({"frames": len(boxes), "faces": found}))
    return 0 if boxes else 1


if __name__ == "__main__":
    sys.exit(main())
