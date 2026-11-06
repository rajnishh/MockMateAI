import { router } from "expo-router";

import { ProfileFields, useProfileForm } from "@/components/profile-form";
import { Banner, Button, Header, ProgressBar, Screen, Skeleton, Txt } from "@/components/ui";
import { api } from "@/lib/api";
import { useSession } from "@/lib/session";
import { useData } from "@/lib/use-data";

// Onboarding step 2 of 3: name, @username and photo. One screen, every field optional, and
// skipping is always one tap away; Account › Edit profile finishes it later.
export default function YourProfile() {
  const { refreshUser } = useSession();
  const me = useData(() => api.profile());
  const form = useProfileForm(me.data);
  const next = () => router.push("/first-reel");

  return (
    <Screen
      footer={
        <>
          <Button
            label="Continue"
            block
            loading={form.busy}
            disabled={!form.canSave}
            onPress={async () => {
              const saved = await form.save();
              if (!saved) return;
              if (saved.name) await refreshUser(saved.name).catch(() => undefined);
              next();
            }}
          />
          <Button label="Skip for now" kind="ghost" style={{ alignSelf: "center" }} onPress={next} />
        </>
      }>
      <ProgressBar value={2 / 3} />
      <Header title="Your profile" back />
      <Txt color="inkMuted">How you show up on songs you share and Jugalbandis. You can change it any time.</Txt>
      {me.error ? (
        <Banner kind="error" title="Couldn't load your profile" text="You can skip this and finish it later in Account." action={<Button label="Retry" small kind="secondary" onPress={me.reload} />} />
      ) : null}
      {me.data ? <ProfileFields form={form} /> : me.error ? null : <Skeleton height={280} />}
    </Screen>
  );
}
