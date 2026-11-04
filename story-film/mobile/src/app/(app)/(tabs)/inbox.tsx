import { ComingSoon } from "@/components/coming-soon";

export default function Inbox() {
  return (
    <ComingSoon
      title="Inbox"
      heading="All your comments in one place"
      text="In the next beta, reply to comments from every platform here, with AI reply ideas."
      items={[
        { icon: "inbox", title: "Comments and DMs together", sub: "Instagram, YouTube, Facebook" },
        { icon: "sparkle", title: "Reply ideas", sub: "Written in your voice and language" },
        { icon: "send", title: "Comment GUIDE, get a DM", sub: "Turn comments into followers automatically" },
      ]}
    />
  );
}
