import { useState } from "react";

import { Button, Card, Empty, Header, ListRow, Screen } from "./ui";
import type { IconName } from "./icon";

// Tabs whose backend isn't in the free beta yet: say what's coming instead of showing an empty shell.
export function ComingSoon({ title, heading, text, items }: { title: string; heading: string; text: string; items: { icon: IconName; title: string; sub: string }[] }) {
  const [asked, setAsked] = useState(false);
  return (
    <Screen>
      <Header title={title} />
      <Empty
        title={heading}
        text={text}
        action={<Button label={asked ? "We'll tell you first" : "Tell me when it's ready"} kind="secondary" icon={asked ? "check" : "bell"} disabled={asked} onPress={() => setAsked(true)} />}
      />
      <Card flat>
        {items.map((i) => (
          <ListRow key={i.title} icon={i.icon} title={i.title} sub={i.sub} />
        ))}
      </Card>
    </Screen>
  );
}
