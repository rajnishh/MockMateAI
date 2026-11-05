import { router } from "expo-router";
import { useEffect } from "react";
import { View } from "react-native";

import { Icon } from "@/components/icon";
import { SongCover } from "@/components/song-cover";
import { SongPlayerRow, useSongPlayer } from "@/components/song-player";
import { Banner, Button, Card, Credits, Empty, Header, Row, Screen, Skeleton, Status, Txt } from "@/components/ui";
import { api, type Song } from "@/lib/api";
import { formatTime, genreLabel, songMaking } from "@/lib/songs";
import { useData } from "@/lib/use-data";
import { useTheme } from "@/theme";

// Song Studio: the creator's songs, newest first. Refreshes while songs are being made.
export default function Songs() {
  const studio = useData(() => api.songs());
  const billing = useData(() => api.billing());
  const player = useSongPlayer();
  const songs = studio.data?.songs ?? [];
  const making = songs.some(songMaking);
  const { reload } = studio;

  useEffect(() => {
    if (!making) return;
    const t = setTimeout(reload, 5000);
    return () => clearTimeout(t);
  }, [making, studio.data, reload]);

  return (
    <Screen footer={songs.length > 0 ? <Button label="New song" icon="music" block disabled={studio.data?.available === false} onPress={() => router.push("/songs/new")} /> : undefined}>
      <Header title="Song Studio" sub="Songs sung in Hindi, Hinglish and more" back right={<Credits count={billing.data?.balance ?? null} />} />
      {studio.data?.available === false ? <Banner kind="warn" text="Song Studio isn't set up on this server yet." /> : null}
      {studio.error ? <Banner kind="error" title="Couldn't load your songs" text={studio.error} action={<Button label="Retry" small kind="secondary" onPress={reload} />} /> : null}
      {studio.loading && !studio.data ? (
        <>
          <Skeleton height={120} />
          <Skeleton height={120} />
        </>
      ) : studio.data && songs.length === 0 ? (
        <Empty
          title="No songs yet"
          text="Write a song about anything and hear it sung. Two versions in about a minute."
          action={<Button label="Make my first song" icon="music" style={{ alignSelf: "center" }} onPress={() => router.push("/songs/new")} />}
        />
      ) : (
        <>
          <Txt variant="md">My songs</Txt>
          {songs.map((s) => (
            <SongCard key={s.id} song={s} player={player} />
          ))}
        </>
      )}
    </Screen>
  );
}

function SongCard({ song, player }: { song: Song; player: ReturnType<typeof useSongPlayer> }) {
  const { colors } = useTheme();
  const done = song.status === "completed";
  const meta = [genreLabel(song.genre), formatTime(song.durationSec), song.edited ? "Edited" : null].filter(Boolean).join(" · ");
  return (
    <Card onPress={done ? () => router.push(`/songs/${song.id}`) : undefined}>
      <Row style={{ flexWrap: "nowrap" }}>
        <SongCover song={song} size={56} />
        <View style={{ flex: 1, gap: 2 }}>
          <Txt variant="label" numberOfLines={2}>
            {song.title}
          </Txt>
          {done ? <Txt variant="cap">{meta}</Txt> : null}
        </View>
        {done ? <Icon name="right" size={18} color={colors.inkMuted} /> : null}
      </Row>
      {done ? (
        <SongPlayerRow song={song} player={player} />
      ) : song.status === "failed" ? (
        <>
          <Status kind="error" text="Failed · credits refunded" />
          {song.error ? <Txt variant="cap">{song.error}</Txt> : null}
        </>
      ) : (
        <Status kind="making" text="Making your song… about a minute" />
      )}
    </Card>
  );
}
