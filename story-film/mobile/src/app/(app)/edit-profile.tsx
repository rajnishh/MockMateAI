import { router } from "expo-router";
import { useState } from "react";

import { ProfileFields, useProfileForm } from "@/components/profile-form";
import { Banner, Button, Header, Screen, Skeleton, Win } from "@/components/ui";
import { api } from "@/lib/api";
import { useSession } from "@/lib/session";
import { useData } from "@/lib/use-data";

// Account › Edit profile: the same fields as onboarding's "Your profile" step.
export default function EditProfile() {
  const { refreshUser } = useSession();
  const me = useData(() => api.profile());
  const form = useProfileForm(me.data);
  const [saved, setSaved] = useState(false);

  return (
    <Screen
      footer={
        <Button
          label="Save"
          block
          loading={form.busy}
          disabled={!form.canSave}
          onPress={async () => {
            setSaved(false);
            const p = await form.save();
            if (!p) return;
            if (p.name) await refreshUser(p.name).catch(() => undefined);
            setSaved(true);
            await me.reload();
            if (router.canGoBack()) setTimeout(() => router.back(), 600);
          }}
        />
      }>
      <Header title="Edit profile" back />
      {me.error ? <Banner kind="error" title="Couldn't load your profile" text="Check your internet connection." action={<Button label="Retry" small kind="secondary" onPress={me.reload} />} /> : null}
      {saved ? <Win text="Profile saved" /> : null}
      {me.data ? <ProfileFields form={form} /> : me.error ? null : <Skeleton height={280} />}
    </Screen>
  );
}
