# iPhone app navigation (v3.0, decided 2026-11-06)

**Problem.** Song Studio, Hum, Duets, Recipes, Earn and Ask Reelkar each hang off one card or one list row, and Account hides behind a small icon. People can't find what they can't see.
**Decision.** Five tabs, each with one clear job: **Home · Studio · (Create) · Listen · You**. Studio is the hub for everything you make apart from a reel. You is the hub for your own stuff and money. Calendar and Inbox stop being tabs but can still be reached in one tap.
**Success metric.** Each main feature is no more than 2 taps from any tab. More weekly users open Song Studio, Hum, Duets and Recipes (compare the 2 weeks before and after the change).

Changes to PLAN.md item 19 (tabs) and item 518.1 (Listen replaces Earn): the tab list becomes the one below. Update PLAN when this ships.

## 1. Tab bar

Keep the floating deep-plum bar, mint for the current tab, and the round chilli Create button. **Create moves to the true centre (3rd of 5).** Today it's 2nd. In the centre it's equally easy to reach with either thumb, and the v3.0 phone mockup already puts it there.

| # | Route name | Label | Icon | Job |
|---|---|---|---|---|
| 1 | `home` | Home | `home` | What's happening with my reels today |
| 2 | `studio` | Studio | **`studio` (new)** | Songs, Hum, Jugalbandi, Recipes, Lab |
| 3 | `create` | Create (a11y label only) | `plus` in the chilli button | Make a reel |
| 4 | `listen` | Listen | `headphones` | Public song feed |
| 5 | `you` | You | `user` | My reels, calendar, inbox, money, settings |

New icon `studio`, mixing-desk faders (24 grid, stroke 2, matches the set). Add it to `PATHS` in `icon.tsx`:
```
studio: '<path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6"/>',
```
Why not `music`: Studio holds more than songs (recipes, Lab), and a note icon would look like a duplicate of Listen's headphones.

- `ICONS` map: `{ home: "home", studio: "studio", create: "plus", listen: "headphones", you: "user" }`.
- Labels are one word, 11pt semibold, and must fit at 200% text size. At AX sizes, hide the labels and keep `accessibilityLabel`; don't wrap them. Hindi: होम · स्टूडियो · सुनें · आप. Arabic: الرئيسية · الاستوديو · استمع · أنت. In RTL the order mirrors (row direction follows I18nManager).
- **Unread dot** on the You icon when Inbox has something new: 8pt chilli dot with a 2pt deep-plum ring, top-right of the icon. Its a11y label is "You, new in Inbox". No numbers on the tab.
- Each tab target is at least 44×52pt (it's `minHeight: 52` today). The Create button is 50pt.

## 2. Moving routes (URLs don't change)

- Move `(tabs)/calendar.tsx` to `(app)/calendar.tsx` and `(tabs)/inbox.tsx` to `(app)/inbox.tsx`. Both become pushed screens with `Header back`. `/calendar`, `/inbox` and every push deep link (`/inbox`, `/duets/[id]`, `/songs/[id]`, `/earn/[ref]`) keep working.
- Add `(tabs)/studio.tsx` (`/studio`) and `(tabs)/you.tsx` (`/you`).
- `/account` stays as it is, retitled **Settings** (see 5). Every other route is untouched.

## 3. Home: add a bell, replace the person icon

- Header right: a **bell** (`bell`) with the same unread dot, 44pt target, opening `/inbox`. Its a11y label is "Inbox" or "Inbox, new messages". It replaces the person icon, because the You tab now does that job.
- New row above the checklist, shown only when a post is scheduled: `ListRow icon="calendar"` "Next post · Today 7:30 pm" / "{reel title} to Instagram", opening `/calendar`.
- Keep the Ask, Song Studio and Listen cards. Song Studio's card now opens `/studio`.
- The checklist's "Set up" brand look still opens `/account`.

**How unread works (no server change).** Save `inbox.seenAt` in storage when `/inbox` is opened. Show the dot if any gift reply, duet or remix item has `createdAt`/`at` newer than that. Re-check when the app comes to the foreground and after a push arrives. Later, a server `GET /api/me/inbox/unread` can replace this without any design change.

## 4. Studio hub (`/studio`)

`Screen` > `Header title="Studio" sub="Songs, duets and more"` > `Hero` > 4 sections, each a `Txt variant="md"` heading over `Card` + `ListRow`s with `right` chevrons. **One primary action:** the Hero button.

**Hero** (saffron): "Make a song in your language" / "Write a few words or just hum. Ready in about 2 minutes." Button **Make a song** goes to `/songs/new`.
If the user already has songs, add a line under the button: "{n} songs · Last: {title}", opening `/songs`.

**Songs**
| Icon | Title | Sub | Goes to |
|---|---|---|---|
| `music` | My songs | All your songs, play or share them | `/songs` |
| `mic` | Hum it | Hum a tune or say what you want | `/hum` |
| `download` | My recordings | Hums and takes you saved | `/hum/recordings` |

**Together**
| `heart` | Jugalbandi | Make a duet: you sing one part, a friend sings the other | `/duets/new` |
| `gift` | Gift a song | Pick a song and send it on WhatsApp | `/songs` |

**Ideas**
| `recipe` | Reel recipes | Ready-made reel styles. Add your story and go | `/recipes` |

**Lab**, with the sub-heading "New things we're trying. They may change." Each row shows a small mint `Chip`-style "Lab" tag in `right`, before the chevron.
| `sparkle` | Ask Reelkar | Chat with AI to plan reels and songs | `/ask` |
| `chart` | Your AI engines | Choose which AI answers you | `/ai` |
| `film` | Kids dance | Cartoon kids dancing to a dhol beat | `/create?kind=dance` |

- `/create` reads `kind` the same way it already reads `recipe`. That's a small param addition.
- "Build with Claude" **stays in Create**. It sends the story you've typed, so moving it to Studio would break it.
- Duet invites and gifts sent stay in Inbox. Studio is for starting something; Inbox is for replies to it.
- Empty state: none needed, every row is always there. Offline: show the list and use the existing `Banner kind="error"` only when a row fails to open.

## 5. You hub (`/you`), with Settings at `/account`

You is a **hub**. `/account` stays the settings screen behind it. This keeps one job per screen and changes the least code.

**Top card** (`Card`, not a Hero, because there's no main action here): avatar initial, name, `@handle` (or "Pick your handle", opening the handle screen), and `Credits` on the right, opening `/credits`.

**My stuff**
| `film` | My reels | Every reel you've made | `/reels` |
| `calendar` | Posting calendar | What's going out and when | `/calendar` |
| `inbox` | Inbox | Duets, gifts and remixes of your songs. Unread: chilli dot plus "3 new" | `/inbox` |

**Money**
| `sparkle` | Credits and plans | {balance} credits left | `/credits` |
| `earn` | Earnings | From remixes of your songs and uses of your recipes | `/earn` |

**Settings**
| `link` | Connected accounts | Instagram, YouTube | `/connections` |
| `user` | Settings | Language, your reel look, notifications | `/account` |
| `send` | Send feedback | Tell us what to fix | mail |
| `lock` | Privacy policy | (no sub) | link |

- `/account`: the Header becomes "Settings". It keeps profile, reel language, look, brand look, notifications, sign out and delete. **Remove** its Connected accounts, Credits, My reels and Earnings rows, because they now live in You (no duplicates).
- Sign out stays at the bottom of Settings, not You, so nobody taps it by accident.

## 6. Reach check (taps from any tab)

Reel: 1 (Create). Song Studio, Hum, Duet, Recipes, Ask, AI engines, Kids dance: 2 (Studio > row). Listen: 1. Inbox: 1 from Home (bell), 2 from You. Calendar: 2 (You), or 1 from Home's Next post row. Earn and Credits: 2 (You). Settings: 2 (You).

## 7. Acceptance criteria

- [ ] The tab bar shows Home, Studio, chilli Create, Listen, You in that order; RTL mirrors it.
- [ ] `/calendar`, `/inbox`, `/account` and every push deep link open the right screen with a working back button.
- [ ] The unread dot appears on the Home bell and the You tab within 1s of the app coming to the foreground, and clears once `/inbox` is opened.
- [ ] Every Studio and You row opens its route. Lab rows show the Lab tag.
- [ ] VoiceOver reads each tab as "{label}, tab, {n} of 5" and reads the dot state. All targets are at least 44pt.
- [ ] At 200% text size the labels don't clip and the rows wrap to 2 lines. Hindi and Arabic strings fit.
- [ ] Checks pass: `npx tsc --noEmit && npx expo lint`.

## 8. Copy keys

`nav.home` Home · `nav.studio` Studio · `nav.create` Create · `nav.listen` Listen · `nav.you` You · `nav.inboxNew` "{n} new" · `studio.hero.title`, `studio.hero.sub`, `studio.hero.cta` · `studio.{songs,together,ideas,lab}.title` · `studio.lab.sub` · `studio.row.{mySongs,hum,recordings,duet,gift,recipes,ask,engines,kidsDance}.{title,sub}` · `you.{stuff,money,settings}.title` · `you.row.{reels,calendar,inbox,credits,earn,connections,settings,feedback,privacy}.{title,sub}` · `home.nextPost.{title,sub}`.
