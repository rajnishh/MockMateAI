import { ComingSoon } from "@/components/coming-soon";

export default function Calendar() {
  return (
    <ComingSoon
      title="Calendar"
      heading="Plan and post from one calendar"
      text="In the next beta, schedule reels to Instagram and YouTube at your best times."
      items={[
        { icon: "calendar", title: "Week view with best times", sub: "Learned from your own posts" },
        { icon: "check", title: "Approve before posting", sub: "Nothing goes out without your OK" },
        { icon: "send", title: "Post everywhere at once", sub: "Instagram, YouTube, then Facebook and LinkedIn" },
      ]}
    />
  );
}
