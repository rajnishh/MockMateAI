import { router } from "expo-router";
import { useState } from "react";
import { View } from "react-native";

import { Button, ChipRow, Field, Header, ProgressBar, Screen, Txt } from "@/components/ui";
import { LANGUAGES, NICHES } from "@/lib/languages";
import { useSession } from "@/lib/session";

export default function QuickStart() {
  const { prefs, savePrefs } = useSession();
  const [topic, setTopic] = useState(prefs?.topic ?? "");
  const [niche, setNiche] = useState<string>(prefs?.niche ?? NICHES[0]);
  const [language, setLanguage] = useState(prefs?.language ?? "hi");
  const [experience, setExperience] = useState<"new" | "existing">(prefs?.experience ?? "new");

  return (
    <Screen
      footer={
        <Button
          label="Continue"
          block
          onPress={async () => {
            await savePrefs({ topic: topic.trim() || niche, niche, language, experience });
            router.push("/first-reel");
          }}
        />
      }>
      <ProgressBar value={0.5} />
      <Header title="What will you make videos about?" />
      <Field label="Your topic, in your words" value={topic} onChangeText={setTopic} placeholder="Quick Indian recipes for working people" maxLength={100} />
      <ChipRow options={NICHES.map((n) => ({ value: n, label: n }))} value={niche} onChange={setNiche} />
      <View style={{ gap: 6 }}>
        <Txt variant="cap">Language of your reels</Txt>
        <ChipRow options={LANGUAGES.map((l) => ({ value: l.code, label: l.label }))} value={language} onChange={setLanguage} />
      </View>
      <View style={{ gap: 6 }}>
        <Txt variant="cap">I am</Txt>
        <ChipRow
          options={[
            { value: "new", label: "New to creating" },
            { value: "existing", label: "Already posting" },
          ]}
          value={experience}
          onChange={setExperience}
        />
      </View>
    </Screen>
  );
}
