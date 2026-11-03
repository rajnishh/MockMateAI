"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { BRAND_COLOURS, type BrandPrefs, loadBrand, saveBrand } from "@/lib/brand-prefs";
import { brandPalette, contrastRatio, type Palette } from "@/lib/motion/brand";

// What a reel looks like with no brand colour: the writer picks one of its looks per reel.
// This is the "saffron" look from src/lib/motion/render.ts, shown as an example.
const AUTO: Palette = { bg: ["#fff4e0", "#ffe2b8"], text: "#2a1a05", muted: "#6b4a1c", accent: "#c2410c", onAccent: "#ffffff", highlight: "#b4235a", blob: "rgba(232,115,12,0.14)" };

export default function BrandPage() {
  const [brand, setBrand] = useState<BrandPrefs>({});
  const [handle, setHandle] = useState("");
  const [custom, setCustom] = useState("#ff4d2e");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const b = loadBrand() ?? {};
    setBrand(b);
    setHandle(b.handle ?? "");
    if (b.accent && !BRAND_COLOURS.includes(b.accent as (typeof BRAND_COLOURS)[number])) setCustom(b.accent);
  }, []);

  function update(next: BrandPrefs) {
    const clean = saveBrand(next) ?? {};
    setBrand(clean);
    setHandle(clean.handle ?? "");
    setSaved(true);
  }

  const p = brand.accent ? brandPalette(brand, AUTO) : AUTO;
  const adjusted = brand.accent && p.accent !== brand.accent;
  const shownHandle = handle.trim() ? (handle.startsWith("@") ? handle : `@${handle}`) : "@yourhandle";

  return (
    <main>
      <header className="top">
        <div>
          <h1>Brand kit</h1>
          <p className="sub">Your colour and handle on every motion reel and video edit, so people know it&apos;s yours.</p>
        </div>
      </header>

      <div className="split">
        <section className="create" aria-labelledby="look-title">
          <h2 id="look-title" style={{ marginTop: 0 }}>Your colour</h2>
          <p className="muted">Used for buttons, highlighted words and cards. Reelkar adjusts it if it would be hard to read.</p>
          <div className="swatches" role="radiogroup" aria-label="Brand colour">
            <button type="button" role="radio" aria-checked={!brand.accent} className="swatch auto" onClick={() => update({ ...brand, accent: undefined })}>
              AI
              <span className="sr-only">Let AI choose a look for each reel</span>
            </button>
            {BRAND_COLOURS.map((c) => (
              <button key={c} type="button" role="radio" aria-checked={brand.accent === c} className="swatch" style={{ background: c }} onClick={() => update({ ...brand, accent: c })}>
                <span className="sr-only">Colour {c}</span>
              </button>
            ))}
            <label className="swatch custom" title="Pick any colour" style={{ background: custom }} data-on={brand.accent === custom && !BRAND_COLOURS.includes(custom as (typeof BRAND_COLOURS)[number])}>
              <input
                type="color"
                aria-label="Pick any colour"
                value={custom}
                onChange={(e) => {
                  setCustom(e.target.value);
                  update({ ...brand, accent: e.target.value });
                }}
              />
              <span aria-hidden="true">+</span>
            </label>
          </div>

          {brand.accent && (
            <>
              <label>Reel background</label>
              <div className="tabs" role="group" aria-label="Reel background">
                <button type="button" aria-pressed={(brand.background ?? "light") === "light"} onClick={() => update({ ...brand, background: "light" })}>Light</button>
                <button type="button" aria-pressed={brand.background === "dark"} onClick={() => update({ ...brand, background: "dark" })}>Dark</button>
              </div>
            </>
          )}

          <label htmlFor="handle">Handle shown on reels (optional)</label>
          <input
            id="handle"
            type="text"
            value={handle}
            maxLength={30}
            autoComplete="off"
            placeholder="@yourhandle"
            onChange={(e) => setHandle(e.target.value.replace(/\s/g, "").slice(0, 30))}
            onBlur={() => update({ ...brand, handle: handle || undefined })}
          />

          <p className="muted" role="status" style={{ marginTop: 16 }}>
            {saved ? "Saved in this browser. " : ""}
            Your brand look is used when you make a <Link href="/create?mode=motion">motion reel</Link> or <Link href="/create?mode=edit">edit a video</Link>, and when Ask Reelkar makes reels for you.
          </p>
          {adjusted && <p className="muted">Your colour is made a little {brand.background === "dark" ? "lighter" : "darker"} on reels so text on it stays readable ({contrastRatio(p.onAccent, p.accent).toFixed(1)}:1).</p>}
        </section>

        <aside>
          <section className="card summary" aria-label="Preview">
            <h2>Preview</h2>
            <div className="brand-preview" style={{ background: `linear-gradient(180deg, ${p.bg[0]}, ${p.bg[1]})`, color: p.text }}>
              <span className="bp-blob" style={{ background: p.blob }} />
              <span className="bp-over" style={{ color: p.muted }}>3 chai mistakes</span>
              <strong className="bp-title">
                Never boil the <em style={{ color: p.highlight }}>milk</em> first
              </strong>
              <span className="bp-card" style={{ borderColor: p.accent }}>
                <b style={{ color: p.accent }}>Tip 2</b> Add ginger after the water boils.
              </span>
              <span className="bp-btn" style={{ background: p.accent, color: p.onAccent }}>Follow for more</span>
              <span className="bp-handle" style={{ color: p.muted }}>{shownHandle}</span>
            </div>
            <p className="muted" style={{ marginTop: 12 }}>{brand.accent ? "How your motion reels will look." : "An example look. With AI chosen, each reel gets a look that suits it."}</p>
          </section>
        </aside>
      </div>
    </main>
  );
}
