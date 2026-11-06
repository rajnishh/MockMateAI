import { type Href, router } from "expo-router";
import { Pressable, View } from "react-native";

import { Icon, type IconName } from "@/components/icon";
import { Button, Card, Credits, Header, Hero, ListRow, Row, Screen, Txt } from "@/components/ui";
import { api } from "@/lib/api";
import { useData } from "@/lib/use-data";
import { radius, useTheme } from "@/theme";

type Item = { icon: IconName; title: string; sub: string; to: Href; lab?: boolean };

// Studio tab (design/v3.0/navigation.md §4): everything you make apart from a reel, one tap each.
const SECTIONS: { title: string; sub?: string; items: Item[] }[] = [
  {
    title: "Songs",
    items: [
      { icon: "music", title: "My songs", sub: "All your songs, play or share them", to: "/songs" },
      { icon: "mic", title: "Hum it", sub: "Hum a tune or say what you want", to: "/hum" },
      { icon: "download", title: "My recordings", sub: "Hums and takes you saved", to: "/hum/recordings" },
    ],
  },
  {
    title: "Together",
    items: [
      { icon: "heart", title: "Jugalbandi", sub: "Make a duet: you sing one part, a friend sings the other", to: "/duets/new" },
      { icon: "gift", title: "Gift a song", sub: "Pick a song and send it on WhatsApp", to: "/songs" },
    ],
  },
  {
    title: "Ideas",
    items: [{ icon: "recipe", title: "Reel recipes", sub: "Ready-made reel styles. Add your story and go", to: "/recipes" }],
  },
  {
    title: "Lab",
    sub: "New things we're trying. They may change.",
    items: [
      { icon: "sparkle", title: "Ask Reelkar", sub: "Chat with AI to plan reels and songs", to: "/ask", lab: true },
      { icon: "chart", title: "Your AI engines", sub: "Choose which AI answers you", to: "/ai", lab: true },
      { icon: "film", title: "Kids dance", sub: "Cartoon kids dancing to a dhol beat", to: { pathname: "/create", params: { kind: "dance" } }, lab: true },
    ],
  },
];

function LabTag() {
  const { colors } = useTheme();
  return (
    <Row style={{ gap: 6, flexWrap: "nowrap" }}>
      <View style={{ backgroundColor: colors.tealTint, borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 2 }}>
        <Txt variant="cap" style={{ color: colors.tealText }}>
          Lab
        </Txt>
      </View>
      <Icon name="right" size={18} color={colors.inkMuted} />
    </Row>
  );
}

export default function Studio() {
  const { colors } = useTheme();
  const studio = useData(() => api.songs());
  const billing = useData(() => api.billing());
  const songs = studio.data?.songs ?? [];

  return (
    <Screen>
      <Header title="Studio" sub="Songs, duets and more" right={<Credits count={billing.data?.balance ?? null} />} />
      <Hero>
        <Txt variant="lg" style={{ color: colors.onBrand }}>
          Make a song in your language
        </Txt>
        <Txt variant="cap" style={{ color: colors.onBrandMuted }}>
          Write a few words or just hum. Ready in about 2 minutes.
        </Txt>
        <Button label="Make a song" icon="music" block onPress={() => router.push("/songs/new")} />
        {songs.length ? (
          <Pressable accessibilityRole="link" onPress={() => router.push("/songs")} style={{ minHeight: 44, justifyContent: "center" }}>
            <Txt variant="cap" style={{ color: colors.onBrandMuted, textAlign: "center" }}>
              {`${songs.length === 1 ? "1 song" : `${songs.length} songs`} · Last: ${songs[0].title}`}
            </Txt>
          </Pressable>
        ) : null}
      </Hero>
      {SECTIONS.map((s) => (
        <View key={s.title} style={{ gap: 8 }}>
          <View>
            <Txt variant="md" accessibilityRole="header">
              {s.title}
            </Txt>
            {s.sub ? <Txt variant="cap">{s.sub}</Txt> : null}
          </View>
          <Card>
            {s.items.map((i) => (
              <ListRow key={i.title} icon={i.icon} title={i.title} sub={i.sub} onPress={() => router.push(i.to)} right={i.lab ? <LabTag /> : undefined} />
            ))}
          </Card>
        </View>
      ))}
    </Screen>
  );
}
