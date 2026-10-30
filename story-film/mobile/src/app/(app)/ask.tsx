import * as Clipboard from "expo-clipboard";
import { router } from "expo-router";
import {
  type ComponentRef,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import {
  Banner,
  Button,
  Card,
  ChipRow,
  Header,
  Row,
  Status,
  Txt,
} from "@/components/ui";
import {
  type AgentCard,
  type AgentMessage,
  type AgentTurn,
  api,
  type PostingMode,
} from "@/lib/api";
import { useSession } from "@/lib/session";
import { fonts, radius, useTheme } from "@/theme";

const MODES: { value: PostingMode; label: string; help: string }[] = [
  {
    value: "ask",
    label: "Ask me first",
    help: "I prepare each post; you tap Approve.",
  },
  {
    value: "auto_schedule",
    label: "Auto-schedule",
    help: "I schedule posts at good times without asking.",
  },
  {
    value: "auto_now",
    label: "Auto-post",
    help: "I post as soon as each reel is ready.",
  },
];

const STARTERS = [
  "Give me 3 reel ideas for my topic",
  "Make a reel on my topic and post it tomorrow evening",
  "Plan my week: 3 reels, one a day",
];

// Reels still being made, or posts waiting for them: keep the conversation fresh.
const busy = (messages: AgentMessage[]) =>
  messages.some((m) =>
    m.cards.some(
      (c) =>
        (c.type === "reel" &&
          (c.status === "queued" || c.status === "running")) ||
        (c.type === "proposal" && c.status === "waiting") ||
        (c.type === "post" && c.status === "waiting"),
    ),
  );

export default function Ask() {
  const { colors } = useTheme();
  const { prefs } = useSession();
  const scroll = useRef<ComponentRef<typeof ScrollView>>(null);
  const [messages, setMessages] = useState<AgentMessage[]>([]);
  const [mode, setMode] = useState<PostingMode>("ask");
  const [freeLeft, setFreeLeft] = useState<number | null>(null);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const turn: AgentTurn = {
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    language: prefs?.language,
    topic: prefs?.topic || prefs?.niche,
    brand: prefs?.brand,
  };

  const apply = useCallback((a: Awaited<ReturnType<typeof api.agent>>) => {
    setMessages(a.messages);
    setMode(a.postingMode);
    setFreeLeft(a.freeLeft);
  }, []);
  const load = useCallback(() => api.agent().then(apply), [apply]);

  useEffect(() => {
    api.agent().then(apply, (e) => setError((e as Error).message));
  }, [apply]);

  useEffect(() => {
    if (!busy(messages)) return;
    const timer = setTimeout(() => load().catch(() => undefined), 5000);
    return () => clearTimeout(timer);
  }, [messages, load]);

  // Runs a request that returns the updated conversation.
  async function act(fn: () => Promise<AgentMessage[]>) {
    setSending(true);
    setError(null);
    try {
      setMessages(await fn());
      setTimeout(() => scroll.current?.scrollToEnd({ animated: true }), 50);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSending(false);
    }
  }

  function send(value = text) {
    const t = value.trim();
    if (!t || sending) return;
    setText("");
    act(() => api.agentSend(t, turn));
  }

  async function changeMode(next: PostingMode) {
    setMode(next);
    await api.setPostingMode(next).catch((e) => setError((e as Error).message));
  }

  return (
    <SafeAreaView
      edges={["top", "bottom"]}
      style={{ flex: 1, backgroundColor: colors.surface }}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView
          ref={scroll}
          contentContainerStyle={styles.content}
          onContentSizeChange={() =>
            scroll.current?.scrollToEnd({ animated: false })
          }
        >
          <Header
            title="Ask Reelkar"
            sub={
              freeLeft === null
                ? "Tell me what to make or post"
                : `${freeLeft} free reels left this week`
            }
            back
          />
          <View style={{ gap: 6 }}>
            <Txt variant="cap">When I post for you</Txt>
            <ChipRow<PostingMode>
              options={MODES.map((m) => ({ value: m.value, label: m.label }))}
              value={mode}
              onChange={changeMode}
            />
            <Txt variant="cap">{MODES.find((m) => m.value === mode)?.help}</Txt>
          </View>

          {messages.length === 0 ? (
            <Card flat>
              <Txt variant="md">Namaste! What should we make?</Txt>
              <Txt variant="cap">Type in any language. Try:</Txt>
              {STARTERS.map((s) => (
                <Button
                  key={s}
                  label={s}
                  small
                  kind="secondary"
                  onPress={() => send(s)}
                />
              ))}
            </Card>
          ) : null}

          {messages.map((m) => (
            <View
              key={m.id}
              style={{
                gap: 8,
                alignItems: m.role === "user" ? "flex-end" : "stretch",
              }}
            >
              {m.text ? (
                <View
                  style={[
                    styles.bubble,
                    m.role === "user"
                      ? { backgroundColor: colors.brand, alignSelf: "flex-end" }
                      : {
                          backgroundColor: colors.surfaceRaised,
                          borderColor: colors.line,
                          borderWidth: 1,
                          alignSelf: "flex-start",
                        },
                  ]}
                >
                  <Txt
                    style={{
                      color: m.role === "user" ? colors.onBrand : colors.ink,
                    }}
                  >
                    {m.text}
                  </Txt>
                </View>
              ) : null}
              {m.cards.map((c, i) => (
                <AgentCardView
                  key={i}
                  card={c}
                  disabled={sending}
                  onAct={act}
                  turn={turn}
                />
              ))}
            </View>
          ))}
          {sending ? <Txt variant="cap">Working on it…</Txt> : null}
          {error ? <Banner kind="error" text={error} /> : null}
        </ScrollView>
        <View
          style={[
            styles.composer,
            { borderColor: colors.line, backgroundColor: colors.surfaceRaised },
          ]}
        >
          <TextInput
            accessibilityLabel="Message Ask Reelkar"
            placeholder="e.g. kal shaam ke liye chai pe reel banao"
            placeholderTextColor={colors.inkMuted}
            value={text}
            onChangeText={setText}
            onSubmitEditing={() => send()}
            returnKeyType="send"
            multiline
            maxLength={1000}
            style={[
              styles.input,
              {
                color: colors.ink,
                borderColor: colors.lineStrong,
                backgroundColor: colors.surfaceSunken,
                fontFamily: fonts.regular,
              },
            ]}
          />
          <Button
            label="Send"
            icon="send"
            disabled={!text.trim() || sending}
            loading={sending}
            onPress={() => send()}
          />
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function AgentCardView({
  card,
  disabled,
  onAct,
  turn,
}: {
  card: AgentCard;
  disabled: boolean;
  onAct: (fn: () => Promise<AgentMessage[]>) => void;
  turn: AgentTurn;
}) {
  switch (card.type) {
    case "ideas":
      return (
        <Card>
          <Txt variant="label">Ideas</Txt>
          {card.ideas.map((idea) => (
            <View key={idea.title} style={{ gap: 4 }}>
              <Txt variant="label">{idea.title}</Txt>
              <Txt variant="cap">{idea.idea}</Txt>
              <Button
                label="Make this"
                small
                kind="secondary"
                icon="sparkle"
                disabled={disabled}
                onPress={() =>
                  onAct(() =>
                    api.agentAction(
                      "make_reel",
                      {
                        idea: `${idea.title}. ${idea.idea}`,
                        title: idea.title,
                        format: card.format,
                        language: card.language,
                      },
                      `Make this: ${idea.title}`,
                      turn,
                    ),
                  )
                }
              />
            </View>
          ))}
        </Card>
      );
    case "reel":
      return (
        <Card>
          <ReelRow
            reelId={card.reelId}
            title={card.title}
            status={card.status}
          />
          {card.note ? <Txt variant="cap">{card.note}</Txt> : null}
        </Card>
      );
    case "reels":
      return (
        <Card>
          {card.reels.length ? (
            card.reels.map((r) => (
              <ReelRow
                key={r.reelId}
                reelId={r.reelId}
                title={r.title}
                status={r.status}
              />
            ))
          ) : (
            <Txt variant="cap">No reels yet.</Txt>
          )}
        </Card>
      );
    case "proposal":
      return (
        <Card>
          <Txt variant="label">{card.text}</Txt>
          {card.status === "proposed" ? (
            <Row>
              <Button
                label="Approve"
                small
                icon="check"
                disabled={disabled}
                onPress={() =>
                  onAct(() => api.agentDecide(card.actionId, true, turn))
                }
              />
              <Button
                label="Cancel"
                small
                kind="ghost"
                disabled={disabled}
                onPress={() =>
                  onAct(() => api.agentDecide(card.actionId, false, turn))
                }
              />
            </Row>
          ) : (
            <Txt variant="cap">
              {card.status === "waiting"
                ? "Approved · posts when the reel is ready"
                : card.status === "done"
                  ? "Approved · scheduled"
                  : card.status === "cancelled"
                    ? "Cancelled"
                    : "Couldn't post"}
            </Txt>
          )}
        </Card>
      );
    case "post":
      return (
        <Card flat>
          <Txt variant="label">{card.text}</Txt>
          <Button
            label="See calendar"
            small
            kind="ghost"
            icon="calendar"
            onPress={() => router.push("/calendar")}
            style={{ paddingHorizontal: 0 }}
          />
        </Card>
      );
    case "caption":
      return (
        <Card>
          <Txt variant="cap">Caption for {card.platform}</Txt>
          <Txt selectable>{card.text}</Txt>
          <Button
            label="Copy"
            small
            kind="secondary"
            icon="link"
            onPress={() => Clipboard.setStringAsync(card.text)}
          />
        </Card>
      );
    case "connect":
      return (
        <Banner
          kind="info"
          text={card.text}
          action={
            <Button
              label="Connect"
              small
              onPress={() => router.push("/connections")}
            />
          }
        />
      );
    case "settings":
      return (
        <Banner
          kind="info"
          text={`Posting is now: ${MODES.find((m) => m.value === card.postingMode)?.label}`}
        />
      );
    case "credits":
      return (
        <Banner
          kind="warn"
          title="Out of free reels"
          text={card.text}
          action={
            <Button
              label="Get credits"
              small
              onPress={() => router.push("/credits")}
            />
          }
        />
      );
    case "error":
      return <Banner kind="error" text={card.text} />;
  }
}

function ReelRow({
  reelId,
  title,
  status,
}: {
  reelId: string;
  title: string;
  status: string;
}) {
  const ready = status === "completed";
  return (
    <Row style={{ justifyContent: "space-between", alignItems: "center" }}>
      <View style={{ flex: 1, gap: 4 }}>
        <Txt variant="label" numberOfLines={2}>
          {title}
        </Txt>
        {ready ? (
          <Status kind="ok" text="Ready" />
        ) : status === "failed" ? (
          <Status kind="error" text="Failed" />
        ) : status === "review" ? (
          <Status kind="warn" text="Check effects" />
        ) : (
          <Status kind="making" text="Making" />
        )}
      </View>
      {ready || status === "review" ? (
        <Button
          label={ready ? "Open" : "Check"}
          small
          kind="secondary"
          onPress={() =>
            router.push(ready ? `/reel/${reelId}` : `/edit/${reelId}`)
          }
        />
      ) : status !== "failed" ? (
        <Button
          label="Progress"
          small
          kind="ghost"
          onPress={() => router.push(`/making/${reelId}`)}
        />
      ) : null}
    </Row>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 14, paddingBottom: 24 },
  bubble: {
    maxWidth: "85%",
    borderRadius: radius.lg,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  composer: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 8,
    padding: 12,
    borderTopWidth: 1,
  },
  input: {
    flex: 1,
    minHeight: 44,
    maxHeight: 120,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
  },
});
