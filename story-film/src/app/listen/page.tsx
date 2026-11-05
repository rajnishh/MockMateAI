import { ListenClient } from "./listen-client";

// Listen on the web (signed in; the proxy sends others to /login): rails of public songs, a
// player bar that keeps going with Autoplay, and the Up next panel.
export default function ListenPage() {
  return <ListenClient />;
}
