// A small H.264 copy for the editing screens' preview, in the same 9:16 crop as the final video,
// so overlays line up. Keyframes every half second keep scrubbing quick.
export function previewArgs(source: string, output: string): string[] {
  return [
    "-y", "-v", "error", "-i", source,
    "-vf", "scale=540:960:force_original_aspect_ratio=increase,crop=540:960,fps=30",
    "-c:v", "libx264", "-preset", "veryfast", "-crf", "30", "-g", "15", "-pix_fmt", "yuv420p",
    "-c:a", "aac", "-b:a", "64k", "-ac", "1",
    "-movflags", "+faststart", output,
  ];
}

export const PREVIEW_FILE = "preview.mp4";
