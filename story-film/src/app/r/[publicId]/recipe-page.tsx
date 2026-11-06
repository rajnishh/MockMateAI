"use client";

import { useState } from "react";
import { copy as giftCopy, type PageLang } from "@/app/g/[token]/copy";
import { Report } from "@/app/g/[token]/gift-page";
import g from "@/app/g/[token]/gift.module.css";
import type { PublicRecipeView, RecipeCard } from "@/lib/recipes";
import { ReelLogo } from "../../reel-logo";
import { recipeCopy } from "./copy";
import s from "./recipe.module.css";

type Live = NonNullable<PublicRecipeView["recipe"]>;

// A public reel recipe: the maker's preview (or the look card), what you bring and what the recipe
// has, the price in general terms (we don't know a signed-out viewer's credits), Use this recipe,
// more recipes for the festival, and Report.
export function RecipePage({ view, lang, festival, more, price }: { view: PublicRecipeView; lang: PageLang; festival: string | null; more: RecipeCard[]; price: { freePerWeek: number; credits: number | null } }) {
  const t = recipeCopy(lang);
  const r = view.recipe;
  if (!r) {
    return (
      <Shell lang={lang} publicId={view.publicId}>
        <section className={`${g.hero} ${g.center}`}>
          <p className={g.headline}>{view.state === "taken_down" ? t.removed : t.stopped}</p>
          <a className={g.ghostBtn} href="/create">
            {t.seeMore}
          </a>
        </section>
      </Shell>
    );
  }
  const next = `/create?recipe=${view.publicId}`;
  const use = `/login?next=${encodeURIComponent(next)}`;
  return (
    <Shell lang={lang} publicId={view.publicId} wide>
      <div className={s.split}>
        <div className={s.media}>
          <Preview r={r} lang={lang} />
        </div>
        <div className={s.details}>
          <section className={g.hero}>
            <p className={g.overline}>{festival ? `${t.overline} · ${festival}` : t.overline}</p>
            <h1 className={g.headline} dir="auto">
              {r.name}
            </h1>
            <p style={{ margin: 0 }}>
              <bdi>{t.by(r.handle)}</bdi>
            </p>
            <div className={s.chips}>
              <span className={g.chip}>{t.format[r.format]}</span>
              {r.styleLabel ? <span className={g.chip}>{r.styleLabel}</span> : null}
              <span className={g.chip} dir="ltr">
                {t.sec(r.durationSec)}
              </span>
              {r.kidSafe ? <span className={g.chip}>{t.kids}</span> : null}
              <span className={g.aiPill}>{giftCopy(lang).madeWithAi}</span>
            </div>
          </section>
          <p className={g.meta} style={{ textAlign: "start" }}>
            {t.made(r.useCount)}
          </p>
          <div className={s.card}>
            <h2>{t.youBring}</h2>
            <ul>
              {(r.format === "edit" ? [t.bringVideo, t.bringLang] : [t.bringTopic, ...(r.format === "story" ? [t.bringPhoto] : []), t.bringLang]).map((x) => (
                <li key={x}>
                  <span className={s.mark} aria-hidden="true">
                    +
                  </span>
                  {x}
                </li>
              ))}
            </ul>
            <h2>{t.has}</h2>
            <ul>
              {r.styleLabel ? <Has text={`${t.look}: ${r.styleLabel}`} /> : null}
              {r.has.format === "story" ? <Has text={`${t.shape}: ${t.shapeValue(t.role[r.has.shape.first], r.has.shape.middle, t.role[r.has.shape.last])}`} /> : null}
              {r.has.format === "story" || r.has.format === "motion" ? <Has text={t.music} /> : null}
              <Has text={`${t.length}: ${t.sec(r.durationSec)}`} />
            </ul>
            {r.has.format === "story" ? (
              <ol>
                {r.has.shape.shots.map((x, i) => (
                  <li key={i}>
                    <span className={s.mark}>{i + 1}</span>
                    <span>
                      <strong>{t.role[x.role]}</strong> · <span dir="auto">{x.intent}</span>
                    </span>
                  </li>
                ))}
              </ol>
            ) : null}
          </div>
          <div className={s.price}>
            <p>{price.credits ? `${t.priceFree(price.freePerWeek)} ${t.or} ${t.pricePaid(price.credits, t.quality[r.quality])}` : t.priceFree(price.freePerWeek)}</p>
            <p className={s.small}>{t.earns}</p>
          </div>
          <div className={s.sticky}>
            <a className={g.replyBtn} href={view.mine ? next : use}>
              {t.use}
            </a>
          </div>
          {more.length && festival ? (
            <div className={s.card} style={{ background: "none", border: 0, padding: 0 }}>
              <h2>{t.more(festival)}</h2>
              <div className={s.tiles}>
                {more.map((c) => (
                  <a key={c.publicId} className={s.tile} href={`/r/${c.publicId}`}>
                    {/* eslint-disable-next-line @next/next/no-img-element -- per-recipe poster straight from the API */}
                    {c.posterUrl ? <img src={c.posterUrl} alt="" loading="lazy" /> : <span className={s.tileArt} aria-hidden="true" />}
                    <span className={s.tileName} dir="auto">
                      {c.name}
                    </span>
                    <span className={s.small}>
                      <bdi>@{c.handle}</bdi>
                    </span>
                  </a>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </Shell>
  );
}

function Has({ text }: { text: string }) {
  return (
    <li>
      <span className={s.mark} aria-hidden="true">
        ✓
      </span>
      {text}
    </li>
  );
}

// The 9:16 preview: plays only on tap (preload none), the poster first. A recipe whose maker kept
// people out of it shows the look card.
function Preview({ r, lang }: { r: Live; lang: PageLang }) {
  const t = recipeCopy(lang);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  if (r.previewUrl && !failed) {
    return (
      <video key={attempt} className={s.video} src={r.previewUrl} poster={r.posterUrl ?? undefined} preload="none" controls playsInline muted dir="ltr" onError={() => setFailed(true)} aria-label={r.name} />
    );
  }
  return (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element -- per-recipe poster straight from the API */}
      {r.posterUrl ? <img className={s.poster} src={r.posterUrl} alt="" /> : <div className={s.look}>{t.lookCard}</div>}
      {failed ? (
        <button type="button" className={g.linkBtn} onClick={() => (setFailed(false), setAttempt(attempt + 1))}>
          {t.previewFailed}
        </button>
      ) : null}
    </>
  );
}

// The frame: Reelkar, Get the app, Made with AI and Report on every state.
function Shell({ lang, children, publicId, wide }: { lang: PageLang; children: React.ReactNode; publicId: string; wide?: boolean }) {
  const t = recipeCopy(lang);
  const gt = giftCopy(lang);
  const [reporting, setReporting] = useState(false);
  return (
    <div className={g.page} lang={lang} dir={lang === "ar" ? "rtl" : "ltr"}>
      <header className={g.top}>
        <a className={g.brand} href="/" style={{ color: "inherit", textDecoration: "none" }}>
          <ReelLogo size={26} />
          Reelkar
        </a>
        <a className={s.getApp} href="/">
          {t.getApp}
        </a>
      </header>
      <main className={`${g.main} ${wide ? s.wide : ""}`}>{children}</main>
      <footer className={g.foot}>
        <span>{gt.madeWithAi} · Reelkar</span>
        <button type="button" className={g.linkBtn} onClick={() => setReporting(true)}>
          ⚑ {gt.report}
        </button>
      </footer>
      {reporting ? <Report endpoint={`/api/recipes/public/${publicId}/report`} lang={lang} title={t.reportTitle} onClose={() => setReporting(false)} /> : null}
    </div>
  );
}
