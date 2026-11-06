import type { PageLang } from "@/app/g/[token]/copy";
import type { FamilyNode, FamilyTree, SongFamily } from "@/lib/remixes";
import { songCopy } from "./copy";
import r from "./remixes.module.css";

type T = ReturnType<typeof songCopy>["remix"];
const iso = (name: string) => `⁨${name}⁩`;

function Pill({ kind, t }: { kind: string | null; t: T }) {
  return kind ? <span className={r.pill}>{t.pill[kind] ?? kind}</span> : null;
}

function Cover({ n, size }: { n: FamilyNode; size: number }) {
  // eslint-disable-next-line @next/next/no-img-element -- per-song art straight from the API
  return n.coverUrl ? <img className={r.cover} src={n.coverUrl} alt="" width={size} height={size} /> : <span className={r.cover} style={{ width: size, height: size }} aria-hidden="true" />;
}

// A song in the path or the list: a plain link (works without JavaScript), or a grey gone row.
function NodeRow({ n, t, label, size = 40, current }: { n: FamilyNode; t: T; label?: string; size?: number; current?: boolean }) {
  if (n.gone) {
    return (
      <div className={`${r.row} ${r.gone}`}>
        <span>
          <strong>{t.gone}</strong>
          <span className={r.sub}>{t.goneSub}</span>
        </span>
      </div>
    );
  }
  return (
    <a className={`${r.row} ${current ? r.current : ""}`} href={`/s/${n.publicId}`} aria-current={current ? "page" : undefined}>
      <Cover n={n} size={size} />
      <span className={r.text}>
        <strong dir="auto">{n.title}</strong>
        <span className={r.sub}>
          <bdi>@{n.handle}</bdi>
          {n.remixCount ? ` · ${t.count(n.remixCount)}` : ""}
        </span>
      </span>
      {label ? <span className={r.pill}>{label}</span> : <Pill kind={n.kind} t={t} />}
    </a>
  );
}

// The song page's Remixes section (design/community/remix-spec.md X1, web): where it came from, the
// top remixes, and the family tree link. Remix opens the web Song Studio's remix panel.
export function Remixes({ family, lang, title, handle, publicId, canRemix, signedIn }: { family: SongFamily["family"]; lang: PageLang; title: string; handle: string; publicId: string; canRemix: boolean; signedIn: boolean }) {
  const t = songCopy(lang).remix;
  const remixHref = signedIn ? `/songs?remixOf=${publicId}` : `/login?next=${encodeURIComponent(`/songs?remixOf=${publicId}`)}`;
  return (
    <section className={r.box} aria-labelledby="remixes-h">
      <h2 id="remixes-h">{t.section}</h2>
      {family.path.length ? (
        <div className={r.group}>
          <h3>{t.cameFrom}</h3>
          <ol className={r.path}>
            {family.path.map((n, i) => (
              <li key={`${n.publicId ?? "gone"}-${i}`}>
                <NodeRow n={n} t={t} label={i === 0 && n.kind === null ? t.original : undefined} />
                {i === 0 && family.more ? (
                  <a className={`${r.row} ${r.more}`} href={`/s/${publicId}/family`}>
                    {t.between(family.more)}
                  </a>
                ) : null}
              </li>
            ))}
            <li>
              <div className={`${r.row} ${r.current}`} aria-current="page">
                <span className={r.text}>
                  <strong dir="auto">{title}</strong>
                  <span className={r.sub}>
                    <bdi>@{handle}</bdi>
                  </span>
                </span>
                <span className={r.pill}>{t.thisSong}</span>
              </div>
            </li>
          </ol>
        </div>
      ) : null}
      <div className={r.group}>
        <h3>
          {t.ofThis} · {family.remixCount.toLocaleString(lang === "ar" ? "ar" : "en-IN")}
        </h3>
        {!family.allowRemix ? <p className={r.sub}>{t.off(iso(`@${handle}`))}</p> : null}
        {family.top.length ? (
          <ul className={r.list}>
            {family.top.map((n) => (
              <li key={n.publicId}>
                <NodeRow n={n} t={t} size={48} />
              </li>
            ))}
          </ul>
        ) : (
          <p className={r.sub}>{t.empty}</p>
        )}
        {canRemix ? (
          <a className={r.remixBtn} href={remixHref}>
            {t.button}
          </a>
        ) : null}
      </div>
      {family.familySize > 1 ? (
        <a className={r.treeLink} href={`/s/${publicId}/family`}>
          {t.tree(family.familySize)}
        </a>
      ) : null}
    </section>
  );
}

// The family tree as an outline (X8): a flat tree with levels, every row a plain link.
export function FamilyOutline({ tree, lang, publicId }: { tree: FamilyTree; lang: PageLang; publicId: string }) {
  const t = songCopy(lang).remix;
  const q = (extra: Record<string, string>) => `?${new URLSearchParams({ sort: tree.sort, ...extra })}`;
  // Position among siblings, for screen readers.
  const sets = new Map<string, { size: number; pos: Map<number, number> }>();
  const parents: number[] = [];
  tree.rows.forEach((row, i) => {
    parents[row.level] = i;
    const key = row.level === 0 ? "root" : `${parents[row.level - 1]}`;
    const set = sets.get(key) ?? { size: 0, pos: new Map() };
    set.size += 1;
    set.pos.set(i, set.size);
    sets.set(key, set);
  });
  const setOf = (i: number) => [...sets.values()].find((s) => s.pos.has(i))!;
  return (
    <>
      <nav className={r.sorts} aria-label="Sort">
        <a className={r.sort} aria-current={tree.sort === "top" ? "true" : undefined} href={`?sort=top`}>
          {t.sortTop}
        </a>
        <a className={r.sort} aria-current={tree.sort === "new" ? "true" : undefined} href={`?sort=new`}>
          {t.sortNew}
        </a>
      </nav>
      <ul className={r.tree} role="tree" aria-label={t.treeTitle}>
        {tree.rows.map((row, i) => {
          const set = setOf(i);
          return (
            <li
              key={row.key}
              role="treeitem"
              aria-level={row.level + 1}
              aria-setsize={set.size}
              aria-posinset={set.pos.get(i)}
              aria-selected={row.current}
              className={r.node}
              style={{ paddingInlineStart: Math.min(row.level, 3) * 20 }}>
              <div className={row.level ? r.rail : undefined}>
                <NodeRow n={row} t={t} size={row.level ? 40 : 56} label={row.level === 0 && !row.gone ? t.original : row.current ? t.thisSong : undefined} current={row.current} />
                {row.level > 3 ? <span className={r.sub}>{t.level(row.level + 1)}</span> : null}
                {row.more > 0 && row.publicId ? (
                  <a className={`${r.row} ${r.more}`} href={q({ branch: row.publicId })} aria-label={`${t.showMore(row.more)}: ${row.title}`}>
                    {t.showMore(row.more)}
                  </a>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
      <a className={r.treeLink} href={`/s/${publicId}`}>
        {t.back}
      </a>
    </>
  );
}
