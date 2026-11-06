import { api, type Duet, type ReceivedReply, type Song } from "./api";
import { publicTrackSong } from "./listen";

// What Loop can play besides your own songs (design/home-v3/spec.md §2.1). Each becomes a track
// for the one player; ids with a ":" aren't Song Studio songs, so the full player skips their
// lyrics analysis and sharing.

const track = (id: string, title: string, audioUrl: string, durationSec: number, genre: string, createdAt: string): Song => ({
  id,
  title,
  genre,
  mood: "",
  language: "",
  lyrics: "",
  durationSec,
  status: "completed",
  myVoice: false,
  edited: false,
  contentCredentials: false,
  error: null,
  createdAt,
  audioUrl,
});

// A song someone sent back to your gift, played from its gift link.
const fromReply = (r: ReceivedReply): Song => track(`gift:${r.token}`, `${r.songTitle} · from ${r.fromName}`, `/api/g/${r.token}/audio`, 0, "gift", r.createdAt);

// A finished Jugalbandi's joined song.
const fromDuet = (d: Duet): Song | null =>
  d.songAudioUrl ? track(`duet:${d.id}`, `${d.topic || "Jugalbandi"} · with ${d.role === "a" ? d.partnerName || "your partner" : d.starterName}`, d.songAudioUrl, 0, "duet", d.createdAt) : null;

// Songs shared with you: replies to your gifts, your Jugalbandis, and published remixes of your songs.
export async function sharedSongs(): Promise<Song[]> {
  const [gifts, duets, remixes] = await Promise.all([
    api.gifts().catch(() => ({ sent: [], replies: [] as ReceivedReply[] })),
    api.duets().catch(() => [] as Duet[]),
    api.remixInbox().catch(() => []),
  ]);
  const replies = gifts.replies.filter((r) => r.songReady && !r.takenDown).map(fromReply);
  const joined = duets.filter((d) => d.phase === "ready" || d.phase === "solo").flatMap((d) => fromDuet(d) ?? []);
  const ids = [...new Set(remixes.flatMap((r) => (r.publicId ? [r.publicId] : [])))].slice(0, 10);
  const remixSongs = (await Promise.all(ids.map((id) => api.publicSong(id).then((p) => publicTrackSong(p.song), () => null)))).flatMap((s) => s ?? []);
  return [...replies, ...joined, ...remixSongs].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

// Public songs from Listen: trending first, then new, without repeats.
export async function listenSongs(): Promise<Song[]> {
  const home = await api.listen();
  const seen = new Set<string>();
  return [...home.trending, ...home.new].filter((c) => !seen.has(c.publicId) && seen.add(c.publicId)).map(publicTrackSong);
}
