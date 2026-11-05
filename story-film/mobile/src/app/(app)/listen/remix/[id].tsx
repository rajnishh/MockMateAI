import { router, useLocalSearchParams } from "expo-router";

import { useSongPlayer } from "@/components/song-player";
import { fallbackKinds, StudioRemix } from "@/components/studio-remix";
import { Banner, Button, Card, Header, Screen, Skeleton, Txt } from "@/components/ui";
import { api } from "@/lib/api";
import { publicTrackSong } from "@/lib/listen";
import { useData } from "@/lib/use-data";

// Remix someone's public song: Song Studio's cover, sung again in your style. It's saved as your
// own new song, linked to the original (whose maker is credited on its page).
export default function RemixPublicSong() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const player = useSongPlayer();
  const page = useData(() => api.publicSong(id));
  const studio = useData(() => api.songs());
  const s = page.data?.song;
  const kinds = (studio.data?.remixKinds ?? fallbackKinds(studio.data?.remixCredits ?? { cover: 2 })).filter((k) => k.kind === "cover");

  return (
    <Screen>
      <Header title="Remix" sub={s ? `${s.title} · @${s.handle}` : undefined} back />
      {page.error ? <Banner kind="error" text={page.error} /> : null}
      {!s || !studio.data ? (
        <Skeleton height={240} />
      ) : !s.allowRemix ? (
        <Banner kind="info" text="This song's maker doesn't allow remixes." />
      ) : studio.data.available === false || !kinds.length ? (
        <Txt>Remixing isn&apos;t set up on this server yet.</Txt>
      ) : (
        <>
          <Txt variant="cap">{`A cover of @${s.handle}'s song in your own style. It's saved in your Song Studio and credits the original.`}</Txt>
          <Card>
            <StudioRemix
              song={publicTrackSong(s)}
              kinds={kinds}
              peaks={null}
              playingPart={false}
              playPart={() => undefined}
              onDone={(newId) => {
                player.pause();
                router.replace({ pathname: "/songs/[id]", params: { id: newId } });
              }}
            />
          </Card>
          <Button label="Back to the song" kind="ghost" onPress={() => router.back()} />
        </>
      )}
    </Screen>
  );
}
