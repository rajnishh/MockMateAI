import { useAudioPlayer, useAudioPlayerStatus } from "expo-audio";
import { useEffect } from "react";

import { Button } from "@/components/ui";
import { api } from "@/lib/api";

// Plays one part of a Jugalbandi, or the joined song (signed-in audio, so the session goes along).
export function DuetAudio({ path, label }: { path: string; label: string }) {
  const player = useAudioPlayer(null);
  const status = useAudioPlayerStatus(player);
  useEffect(() => {
    let live = true;
    api.videoHeaders().then((headers) => live && player.replace({ uri: api.duetAudioUrl(path), headers }));
    return () => {
      live = false;
    };
  }, [path, player]);
  return (
    <Button
      label={status.playing ? `Pause ${label}` : `Play ${label}`}
      icon={status.playing ? "stop" : "play"}
      kind="secondary"
      small
      onPress={() => (status.playing ? player.pause() : player.play())}
    />
  );
}
