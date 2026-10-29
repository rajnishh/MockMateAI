import { ComingSoon } from "@/components/coming-soon";

export default function Earn() {
  return (
    <ComingSoon
      title="Earn"
      heading="Turn followers into income"
      text="After the beta: free guides that grow your followers, then courses you can sell in ₹, AED and $."
      items={[
        { icon: "gift", title: "Free guides", sub: "AI writes the first draft, with a landing page and QR" },
        { icon: "earn", title: "Courses", sub: "Sell lessons with UPI and cards" },
        { icon: "chart", title: "Brand deals", sub: "A media kit made from your stats" },
      ]}
    />
  );
}
