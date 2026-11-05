import * as Haptics from "expo-haptics";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { View } from "react-native";

import { DuetAudio } from "@/components/duet-audio";
import { ReelLogo } from "@/components/logo";
import { Banner, Button, Card, Header, Hero, Row, Screen, Skeleton, Status, Txt, Win } from "@/components/ui";
import { api, ApiError, type Duet, type DuetAction } from "@/lib/api";
import { duetPart, hoursLeft, inviteMessage } from "@/lib/duets";
import { copyLink, sendOnWhatsApp, shareMore } from "@/lib/gifts";
import { useData } from "@/lib/use-data";

// One Jugalbandi, for either person: invite and wait, the 48-hour options, joining, the preview
// with retakes and approvals, and on to the music video and the Collab post (design D3-D11).
export default function DuetScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const duet = useData(() => api.duet(id));
  const [busy, setBusy] = useState<DuetAction | null>(null);
  const [error, setError] = useState<{ text: string; credits: boolean } | null>(null);
  const [copied, setCopied] = useState(false);
  const d = duet.data;

  // Waiting on the other person or the song: look again every 8 seconds.
  useEffect(() => {
    if (!d || !(d.phase === "joining" || d.phase === "waiting" || d.phase === "recording_a")) return;
    const t = setInterval(duet.reload, 8000);
    return () => clearInterval(t);
  }, [d, duet.reload]);

  // Whether it worked, so a retake only opens the recorder once it's allowed.
  async function act(action: DuetAction): Promise<boolean> {
    setBusy(action);
    setError(null);
    try {
      await api.duetAction(id, action);
      Haptics.selectionAsync().catch(() => undefined);
      await duet.reload();
      return true;
    } catch (err) {
      setError({ text: (err as Error).message, credits: err instanceof ApiError && err.needCredits });
      return false;
    } finally {
      setBusy(null);
    }
  }

  function sing(x: Duet) {
    const other = x.role === "a" ? x.partB : x.partA;
    duetPart.set({ id: x.id, otherName: (x.role === "a" ? x.partnerName : x.starterName) || "your partner", otherPart: other?.audioUrl ?? null });
    router.push("/hum");
  }

  if (!d) {
    return (
      <Screen>
        <Header title="Jugalbandi" back />
        {duet.error ? <Banner kind="error" text={duet.error} action={<Button label="Retry" small kind="secondary" onPress={duet.reload} />} /> : <Skeleton height={200} />}
      </Screen>
    );
  }

  const me = d.role === "a" ? d.starterName : d.partnerName;
  const other = (d.role === "a" ? d.partnerName : d.starterName) || "your partner";
  const myPart = d.role === "a" ? d.partA : d.partB;
  const theirPart = d.role === "a" ? d.partB : d.partA;
  const iApproved = d.role === "a" ? d.approvedA : d.approvedB;
  const theyApproved = d.role === "a" ? d.approvedB : d.approvedA;
  const bothApproved = d.approvedA && d.approvedB;
  const share = inviteMessage(d.url);

  return (
    <Screen>
      <Header title="Jugalbandi" sub={d.topic} back />
      {error ? <Banner kind="error" text={error.text} action={error.credits ? <Button label="Get credits" small onPress={() => router.push("/credits")} /> : undefined} /> : null}
      {d.askedToRetake && d.phase !== "joining" ? <Banner kind="info" text={`${other} asked you to sing your part again.`} /> : null}

      {d.phase === "recording_a" || (d.phase === "waiting" && !myPart) ? (
        <Hero>
          <Txt variant="lg" color="onBrand">
            {d.role === "a" && !d.partA ? "Record your part" : `Your turn, ${me || "you"}`}
          </Txt>
          <Txt color="onBrand">{theirPart ? `Hear ${other}'s part, then answer it. About 30 seconds.` : "Hum, sing or just say your lines. About 30 seconds."}</Txt>
          {theirPart ? <DuetAudio path={theirPart.audioUrl} label={`${other}'s part`} /> : null}
          <Button label="Sing my part" icon="mic" block onPress={() => sing(d)} />
        </Hero>
      ) : null}

      {d.phase === "waiting" && d.role === "a" && d.partA && !d.partB ? (
        <>
          <Hero>
            <Txt variant="lg" color="onBrand">
              Waiting for {d.partnerName || "your friend"}
            </Txt>
            <Txt color="onBrand">
              {d.partnerName ? `${d.partnerName} joined. ` : ""}They have {hoursLeft(d.expiresAt)} to sing their part.
            </Txt>
            <Status kind="ok" text="Your part ✓ recorded" />
            <Status kind="making" text={`${d.partnerName || "Their"} part · not yet`} />
          </Hero>
          <Button label="Send invite on WhatsApp" icon="send" block onPress={() => sendOnWhatsApp(share).catch(() => undefined)} />
          <Row style={{ gap: 8 }}>
            <Button label={copied ? "Copied" : "Copy link"} icon={copied ? "check" : "link"} kind="secondary" style={{ flex: 1 }} onPress={() => copyLink(d.url).then(() => setCopied(true))} />
            <Button label="More" icon="share" kind="secondary" style={{ flex: 1 }} onPress={() => shareMore(share, d.url).catch(() => undefined)} />
          </Row>
          <Txt variant="cap">They can sing right on the invite page, no app needed.</Txt>
          {d.partA ? <DuetAudio path={d.partA.audioUrl} label="my part" /> : null}
          <Row style={{ gap: 8, flexWrap: "wrap" }}>
            <Button label="Sing my part again" kind="ghost" small onPress={() => sing(d)} />
            <Button label="Cancel" kind="ghost" small loading={busy === "cancel"} onPress={() => act("cancel")} />
          </Row>
        </>
      ) : null}

      {d.phase === "waiting" && d.role === "b" && myPart && !theirPart ? <Status kind="making" text={`${d.starterName} is singing their part again.`} /> : null}

      {(d.phase === "expired" || d.phase === "declined") && d.role === "a" ? (
        <>
          <Card>
            <Txt variant="md">{d.phase === "declined" ? `${d.partnerName || "They"} can't join this time` : `${d.partnerName || "Your friend"} didn't answer`}</Txt>
            {d.declineNote ? <Txt>“{d.declineNote}”</Txt> : null}
            <Txt variant="cap">Your part is safe. Choose what&apos;s next.</Txt>
          </Card>
          <Button label="Invite someone else" icon="send" block loading={busy === "reinvite"} onPress={() => act("reinvite")} />
          <Button label="Finish it solo · 2 credits, the rest back" icon="music" kind="secondary" block loading={busy === "solo"} onPress={() => act("solo")} />
          {d.canExtend ? <Button label={`Give ${d.partnerName || "them"} 24 more hours`} icon="refresh" kind="secondary" block loading={busy === "extend"} onPress={() => act("extend")} /> : null}
          <Button label={`Cancel and get all ${d.paidA} credits back`} kind="ghost" block loading={busy === "cancel"} onPress={() => act("cancel")} />
        </>
      ) : null}

      {d.phase === "joining" ? (
        <Hero>
          <View style={{ alignItems: "center", paddingVertical: 12 }}>
            <ReelLogo size={64} loop />
          </View>
          <Txt variant="lg" color="onBrand">
            Joining your parts
          </Txt>
          <Txt color="onBrand">About 2 minutes. You can leave; it&apos;ll be here.</Txt>
        </Hero>
      ) : null}

      {d.phase === "join_failed" ? (
        <Banner
          kind="error"
          title="That didn't work"
          text="Nothing more is charged."
          action={d.role === "a" ? <Button label="Try again" small loading={busy === "join_again"} onPress={() => act("join_again")} /> : undefined}
        />
      ) : null}

      {d.phase === "ready" ? (
        <>
          <Win text={bothApproved ? "You both said yes" : "Your Jugalbandi is ready"} icon="music" />
          <Card>
            <Txt variant="md">{d.topic}</Txt>
            {d.songAudioUrl ? <DuetAudio path={d.songAudioUrl} label="the song" /> : null}
            <Status kind={d.approvedA ? "ok" : "making"} text={`${d.starterName} · ${d.approvedA ? "approved" : "not yet"}`} />
            <Status kind={d.approvedB ? "ok" : "making"} text={`${d.partnerName || "Partner"} · ${d.approvedB ? "approved" : "not yet"}`} />
          </Card>
          {!iApproved ? <Button label="Looks good, approve" icon="check" block loading={busy === "approve"} onPress={() => act("approve")} /> : null}
          {iApproved && !theyApproved ? <Txt variant="cap">Waiting for {other} to approve. Any retake asks you both again.</Txt> : null}
          <Row style={{ gap: 8, flexWrap: "wrap" }}>
            <Button label={`Retake my part${d.freeRetake ? " (free)" : ` (${d.retakeCredits} credit)`}`} icon="mic" kind="secondary" small loading={busy === "retake"} onPress={() => act("retake").then((ok) => ok && sing(d))} />
            <Button label={`Ask ${other} to retake`} kind="ghost" small loading={busy === "ask_retake"} onPress={() => act("ask_retake")} />
          </Row>
          {bothApproved && d.role === "a" && d.songId ? (
            <Card>
              <Txt variant="label">Post it as an Instagram Collab</Txt>
              <Txt variant="cap">
                Make the music video, then post it from there. {d.partnerIg ? `@${d.partnerIg} gets a Collab invite in Instagram.` : `${other} didn't add an Instagram username, so the caption credits them instead.`}
              </Txt>
              <Button label="Make the music video" icon="film" block onPress={() => router.push(`/songs/video/${d.songId}`)} />
              <Button label="Open in Song Studio" kind="ghost" block onPress={() => router.push(`/songs/${d.songId}`)} />
            </Card>
          ) : null}
          {bothApproved && d.role === "b" ? <Txt variant="cap">{d.starterName} posts it as an Instagram Collab. Accept the invite in Instagram and it shows on both profiles.</Txt> : null}
        </>
      ) : null}

      {d.phase === "solo" ? (
        <Card>
          <Txt variant="md">Finished solo</Txt>
          {d.role === "a" && d.songId ? <Button label="Open the song" icon="music" block onPress={() => router.push(`/songs/${d.songId}`)} /> : <Txt variant="cap">{d.starterName} finished this one alone.</Txt>}
        </Card>
      ) : null}

      {d.phase === "cancelled" ? <Banner kind="info" text="This Jugalbandi was cancelled. Any credits paid went back." /> : null}
      {(d.phase === "expired" || d.phase === "declined") && d.role === "b" ? <Banner kind="info" text={`This Jugalbandi has closed. ${d.starterName} may send a new invite.`} /> : null}
    </Screen>
  );
}
