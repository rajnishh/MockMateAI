import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  addToQueue,
  appendAuto,
  clear,
  current,
  dropAuto,
  emptyQueue,
  excludeIds,
  needsMore,
  next,
  playList,
  playNext,
  playOne,
  previous,
  type QueueTrack,
  remove,
  seedId,
  skipTo,
  upNext,
} from "@/lib/listen-queue";

const t = (key: string): QueueTrack => ({ key });
const keys = (list: QueueTrack[]) => list.map((x) => x.key);

describe("the player queue", () => {
  it("is the same file on web and mobile", () => {
    expect(readFileSync("mobile/src/lib/listen-queue.ts", "utf8")).toBe(readFileSync("src/lib/listen-queue.ts", "utf8"));
  });

  it("plays a list from the tapped song and remembers what was heard", () => {
    let q = playList(emptyQueue(), [t("s:a"), t("s:b"), t("s:c")], 1);
    expect(current(q)?.key).toBe("s:b");
    expect(keys(upNext(q))).toEqual(["s:c"]);
    q = next(q);
    expect(current(q)?.key).toBe("s:c");
    expect(q.heard).toEqual(["s:b", "s:c"]);
    // Nothing after the last one: next() leaves it for Autoplay.
    expect(next(q)).toBe(q);
  });

  it("goes back a song, or restarts after 3 seconds", () => {
    const q = next(playList(emptyQueue(), [t("s:a"), t("s:b")], 0));
    expect(previous(q, 10)).toEqual({ queue: q, restart: true });
    const back = previous(q, 1);
    expect(back.restart).toBe(false);
    expect(current(back.queue)?.key).toBe("s:a");
    expect(previous(back.queue, 1).restart).toBe(true);
  });

  it("removes upcoming songs and clears, but never the one playing", () => {
    let q = playList(emptyQueue(), [t("s:a"), t("s:b"), t("s:c")], 0);
    expect(remove(q, "s:a")).toBe(q);
    q = remove(q, "s:b");
    expect(keys(q.items)).toEqual(["s:a", "s:c"]);
    // Autoplay won't add it back.
    expect(keys(appendAuto(q, [t("s:b")]).items)).toEqual(["s:a", "s:c"]);
    q = clear(next(playList(q, [t("s:x"), t("s:y"), t("s:z")], 0)));
    expect(keys(q.items)).toEqual(["s:x", "s:y"]);
    expect(current(q)?.key).toBe("s:y");
  });

  it("puts Play next right after the current song and Add to queue before Autoplay's picks", () => {
    let q = playOne(emptyQueue(), t("s:a"));
    q = appendAuto(q, [t("s:auto1"), t("s:auto2")]);
    q = addToQueue(q, t("s:mine"));
    expect(keys(q.items)).toEqual(["s:a", "s:mine", "s:auto1", "s:auto2"]);
    q = playNext(q, t("s:now"));
    expect(keys(q.items)).toEqual(["s:a", "s:now", "s:mine", "s:auto1", "s:auto2"]);
    expect(addToQueue(q, t("s:mine"))).toBe(q);
  });

  it("asks Autoplay for more when one song is left, skipping everything heard or queued", () => {
    let q = playList(emptyQueue(), [t("own:1"), t("s:a"), t("s:b")], 0);
    expect(needsMore(q, true)).toBe(false);
    q = next(q);
    expect(needsMore(q, true)).toBe(true);
    expect(needsMore(q, false)).toBe(false);
    expect(excludeIds(q).sort()).toEqual(["a", "b"]);
    expect(seedId(q)).toBe("b");
    q = appendAuto(q, [t("s:a"), t("s:c"), t("s:d")]);
    expect(keys(upNext(q))).toEqual(["s:b", "s:c", "s:d"]);
    expect(upNext(q).filter((x) => x.auto).length).toBe(2);
  });

  it("drops Autoplay's unplayed picks when Autoplay is switched off", () => {
    let q = appendAuto(playOne(emptyQueue(), t("s:a")), [t("s:b"), t("s:c")]);
    q = next(q);
    q = dropAuto(q);
    expect(keys(q.items)).toEqual(["s:a", "s:b"]);
  });

  it("jumps to a song in the queue", () => {
    const q = skipTo(playList(emptyQueue(), [t("s:a"), t("s:b"), t("s:c")], 0), 2);
    expect(current(q)?.key).toBe("s:c");
    expect(skipTo(q, 9)).toBe(q);
  });
});
