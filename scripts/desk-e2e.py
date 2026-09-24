# The desk end to end in real Chrome: one Biden term (every turn priced, signed where it can be, ended, every card
# answered, the midterm and the final vote clicked through), one Westeros act, the build wait on seeded v1 and v2
# fragments, the seat, reduced motion and 1920x1080. Leaves screenshots, the frame rate and long tasks of every moment,
# the loaded fonts and the JS size in OUT, and compare.html: each app shot beside the approved mock's shot of the same
# moment, with the measurements and every known difference from the mock and its reason.
# Run against the production build (frame rates of the dev build measure React's dev mode), fixtures seeded (plan,
# Global Constraints):
#   bunx vite build && bunx vite preview --port 4173 &
#   uv run --with playwright python scripts/desk-e2e.py [OUT] [MOCK_SHOTS]    # E2E_URL=http://localhost:5173 for dev
import asyncio, gzip, html, json, os, pathlib, shutil, subprocess, sys, time
from playwright.async_api import async_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = pathlib.Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / "docs/design/e2e/latest"
MOCK = pathlib.Path(sys.argv[2]) if len(sys.argv) > 2 else pathlib.Path("/Users/deadpackets/workspace/UnitedStatesOfJev/docs/mocks/v4/feel/desk-shots")
URL = os.environ.get("E2E_URL", "http://localhost:4173")
CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
ACTS = [
    "Send $1,400 checks and extend jobless aid through the summer.",
    "Pass a bill to cap insulin at $35 a month for everyone.",
    "Order every federal agency to buy American steel for new projects.",
    "Nominate a new chair of the Federal Reserve who backs full employment.",
    "Pass a bill to fund roads, bridges and broadband in every state.",
    "Address the nation on vaccines and ask every adult to get a shot.",
    "Send more troops to NATO's eastern flank to reassure the allies.",
    "Order the Justice Department to review police use of force.",
    "Spend $20 billion to reopen schools safely this spring.",
    "Pass a bill to raise the corporate tax rate to 28 percent.",
    "Lift the tariffs on Chinese consumer goods to ease prices.",
    "Pass a voting rights bill that restores the preclearance rule.",
    "Order the EPA to set new limits on power plant emissions.",
    "Spend on child care so parents can return to work.",
    "Pass a bill to fund chip factories in the United States.",
    "Address the nation on the border and the asylum backlog.",
    "Nominate a new ambassador to China who will press on Taiwan.",
    "Pass a bill to extend the child tax credit for another year.",
    "Order a freeze on new oil leases on federal land.",
    "Spend on veterans' health care for burn pit exposure.",
]
# Local dev has no daily and no favicon; those two answers are not the desk's errors.
KNOWN = ("/api/daily", "/favicon")
INIT = "window.__long=[];new PerformanceObserver(l=>{for(const e of l.getEntries())window.__long.push({ms:Math.round(e.duration),at:Math.round(e.startTime)})}).observe({type:'longtask',buffered:true});"

# Every visible difference between the app and the approved mock that this run leaves, and why.
DIFFERENCES = [
    ("Numbers, faction names, reasons and the chip's verb differ in every shot", "The app shows the engine's real state and the clerk's real pricing; the mock shows scripted numbers."),
    ("No mock control bar above the desk; the desk is 40 px taller", "The bar was the mock's own switcher (world, theme, outcome), not part of the game (`--rev: 0`)."),
    ("Three text controls at the right of the top bar (Dark or Light, Sound, Leave) and the clerk's calls left in the turn line", "Decision 4: the game needs them; the mock never drew them."),
    ("Receipt stubs: 'Support, when you sign' instead of 'Support, if it passes', and 'Every turn while it stands' lines", "Decision 1: engine v2 moves support at signing for every verb; the receipt is simulated on the real engine so it lands exactly as shown."),
    ("Westeros: the force act has no count and no verdict (no 2b and 2e shots)", "Decision 2: the engine does not vote on force; a count would show a vote the engine never took."),
    ("No tie beat in the count", "Decision 3: the engine has no tie-breaker yet (cross-track request 3)."),
    ("The resources sheet's trend is one bar and '1 turn ±0'", "Decision 5: the engine does not keep per-turn closing values yet (cross-track request 1)."),
    ("Negotiate terms show as small buttons in the legend after pricing; with three hesitant factions the legend grows and the hemicycle shrinks about 90 px", "Decision 4 and lead ruling 1: the mock never drew Negotiate; the chips are the mock's own atoms."),
    ("An Amend button on a short law's receipt, a floor slip with the drafts and 'Call the vote', and a member card when a seat is clicked", "Lead rulings 2 to 4: every engine mechanic stays reachable; built from the mock's atoms."),
    ("Rows use the pack's short names and tints where generation wrote them; older packs fall back to the full name, the faction colour and a guessed icon", "Cross-track request 2 (Track E writes short, tint and icon)."),
    ("The receipt head uses the world's mono face, not IBM Plex Mono everywhere", "Decision 8: at most three fonts per world."),
    ("The other screens (landing, build wait, seat, midterm, test, end) keep their v1 layout", "Scope: they take the tokens, fonts and scale now; their redesign is at CP4."),
    ("No star mark before the world's title in the top bar", "The owner ruled no logos, stamps or crests at world level; the mock's star is the stamp glyph Task 1 left out of the sprite."),
    ("Rim rows and the file's disc show the world's emblem (an elephant, a donkey, a lion) where the mock shows line icons", "Placement A: the emblem replaces the line icon; the line icon stays the fallback. The mock predates the emblems."),
    ("The chamber kicker reads '100 seats' for every world; the mock reads '100 votes' (Biden) and '100 voices' (Westeros)", "The mock scripted that unit per world; the pack has no word for it, so the desk uses the neutral one."),
    ("The legend names factions in full ('Democratic Party 48'); the mock uses 'Democrats 48'", "Pack data: the fixture's faction names. A pack with shorter names reads like the mock."),
    ("Price it stays disabled until the act has 12 characters; the mock drew it enabled", "The server refuses shorter acts ('Write a little more.'); the button says so before the call."),
    ("The Negotiate chips stay in the legend through the count, verdict and review of a priced law", "The chamber keeps the priced count until Back to the desk so nothing repaints mid-moment; the chips do nothing while a moment runs."),
    ("At 1920x1080 the desk fills the screen at k = 1.2 (19.2 px root); the mock's fhd shot shows it near k = 1.0", "The brief's scaling rule (k = min(w/1440, h/900), clamped 1 to 1.8); the mock's shot predates the scale."),
]
MOMENTS = {"open a file", "close a file", "open resources", "pricing", "sign: charge and shockwave", "the count", "verdict", "couriers"}
report = {"fps": [], "long": [], "fonts": {}, "errors": [], "answers": [], "turns": [], "js": {}, "js_gzip_kb": None, "shots": []}
CAPTIONS = {}


async def shot(page, name, caption, **options):
    await page.screenshot(path=str(OUT / f"{name}.png"), **options)
    report["shots"].append(name)
    CAPTIONS[name] = caption


async def collect(page):
    # Both lists are on the page's own clock, so a moment's long tasks are pinned before a reload restarts it.
    fps = await page.evaluate("(()=>{const f=window.deskFps||[];window.deskFps=[];return f})()")
    long = await page.evaluate("(()=>{const l=window.__long||[];window.__long=[];return l})()")
    for moment in fps:
        inside = [t for t in long if moment["at"] <= t["at"] <= moment["at"] + moment["ms"]]
        moment["long"] = [t["ms"] for t in inside]
        for t in inside:
            t["moment"] = moment["moment"]
    report["fps"] += fps
    report["long"] += long


def watch(page):
    page.on("pageerror", lambda e: report["errors"].append(f"page error: {e}"))
    # A 4xx is the server's answer to a move (shown as a toast); a 5xx other than the forced vote is an error.
    def answered(response):
        if response.status < 400 or any(k in response.url for k in KNOWN):
            return
        forced = response.status == 503 and response.url.endswith("/vote")
        report["answers" if response.status < 500 or forced else "errors"].append(f"{response.status} {response.url}")
    page.on("response", answered)


async def seat(page, scenario, faction, theme):
    await page.goto(URL)
    await page.evaluate(
        """([s,f,t])=>fetch('/api/games',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({scenario:s,faction:f,promises:[0,1,2]})})
        .then(r=>r.json()).then(g=>{localStorage.setItem('usoj:game',g.id);localStorage.setItem('usoj:theme',t)})""",
        [scenario, faction, theme],
    )
    await page.reload()
    await page.wait_for_selector(".dk .hm", timeout=30000)
    await page.wait_for_timeout(1500)


async def stage(page):
    return await page.evaluate("fetch('/api/games/'+localStorage.getItem('usoj:game')).then(r=>r.json()).then(g=>g.stage)")


async def back(page):
    await page.wait_for_selector("#rv", timeout=240000)
    await page.wait_for_timeout(800)
    await page.click("#back")
    await page.wait_for_timeout(600)


async def answer_cards(page):
    while await page.query_selector(".fcard.ev [data-stance]"):
        await page.click(".fcard.ev [data-stance]")
        await back(page)


async def act(page, text, prefix=None, review=None):
    await page.wait_for_selector(".toast", state="detached", timeout=15000)  # the last move's toast is not this one's
    await page.fill("#actx", text)
    await page.click("#go")
    try:
        await page.wait_for_selector("#pb .acts, .tag0.bad, #rv, .toast", timeout=90000)
    except Exception:
        report["errors"].append(f"price timed out: {text}")
        return "none"
    toast = await page.query_selector(".toast")
    if toast:  # the server said no (an instrument the ledgers no longer allow, calls spent): the desk toasts it
        return f"not priced: {await toast.text_content()}"
    if await page.query_selector("#rv"):  # a refusal whose cost travels first
        await back(page)
        return "refused"
    if await page.query_selector(".tag0.bad"):
        return "refused"
    await page.wait_for_timeout(3000)  # the printing
    if prefix:
        await shot(page, f"{prefix}-2a-receipt", "The clerk's receipt, printed, with its knots tied on what it moves")
    if await page.is_disabled("#sign"):
        await page.click("#tear")
        return "blocked"
    law = not await page.query_selector(".rc.act")
    await page.click("#sign")
    if prefix and law:
        await page.wait_for_function("document.querySelectorAll('#hemi .v-yes,#hemi .v-no').length>30", timeout=180000)
        await shot(page, f"{prefix}-2b-count", "The count, seat by seat")
        await page.wait_for_selector(".vd", timeout=60000)
        await page.wait_for_timeout(500)
        await shot(page, f"{prefix}-2e-verdict", "The verdict, the court dimmed to 12%")
    if prefix:
        await page.wait_for_selector(".wtag", timeout=180000)
        await shot(page, f"{prefix}-2c-couriers", "The couriers land each change with its reason")
    await page.wait_for_selector("#rv, #callvote", timeout=240000)
    if await page.query_selector("#callvote"):  # the vote failed after signing: the desk reloaded the server's game
        await page.wait_for_timeout(1500)
        await shot(page, "biden-light-8-vote-failed", "Review Focus 5: the vote answered 503 after signing; the toast, and the law waits with Call the vote")
        await page.click("#callvote")
        await back(page)
        return "law (vote failed, then called)"
    if prefix or review:
        await page.wait_for_timeout(1200)
        await shot(page, review or f"{prefix}-2d-review", "The review, which stays until Back to the desk")
    await back(page)
    return "law" if law else "act"


async def screens_until_desk(page):
    seen = set()
    for _ in range(30):
        now = await stage(page)
        if now == "session" and await page.query_selector(".dk"):
            return now
        # A stage that has flipped back to session while a screen still holds is the midterm night's result.
        name = {"session": "screen-midterm-result", "won": "screen-test", "over": "screen-test"}.get(now, f"screen-{now}")
        if await page.query_selector("main.over.stagger"):
            name = "screen-end"
        if name not in seen and not await page.query_selector(".dk"):
            seen.add(name)
            await shot(page, name, f"The {name[7:]} screen (restyled, not redesigned)")
        if name == "screen-end":
            return now
        if now in ("won", "over"):  # the final vote counts, then See the result; never the end screen's own buttons
            reveal = await page.query_selector("button:has-text('See the result'), button:has-text('Ask again'), button:has-text('Skip the count')")
            if reveal:
                await reveal.click()
            await page.wait_for_timeout(3000)
            continue
        buttons = await page.query_selector_all(".btn:not(.ghost):not([disabled])")
        if buttons:
            await buttons[0].click()
        await page.wait_for_timeout(2500)
    return await stage(page)


async def statics(page, prefix, rows, resource_suffix="-4-resources"):
    await shot(page, f"{prefix}-1-desk", "The desk at rest")
    for row in rows:
        await page.click(f'.hm[data-h="{row}"]')
        await page.wait_for_timeout(1500)
        await shot(page, f"{prefix}-3-file-{row}", f"The glance file of {row}")
        await page.keyboard.press("Escape")
        await page.wait_for_timeout(500)
    await page.click('.led[data-r="treasury"]')
    await page.wait_for_timeout(1800)
    await shot(page, f"{prefix}{resource_suffix}", "The resources sheet")
    await page.keyboard.press("Escape")
    await page.wait_for_timeout(500)


async def fonts(page):
    return await page.evaluate("[...new Set([...document.fonts].filter(f=>f.status==='loaded').map(f=>f.family))]")


def seed_builds():
    """Three stages of a generation v2 build and one v1 build, as the build screen polls them (local D1 only)."""
    pack = json.loads((ROOT / "worker/fixtures/westeros.json").read_text())
    holders = pack["constitution"]["holders"]
    first = lambda value: value if isinstance(value, str) else (value[0] if value else "")
    rows = [{"id": h["id"], "icon": h.get("icon", "council"), "color": (h.get("tint") or {}).get("light", "#555555"), "wants": first(h.get("wants")), "hates": [], "strike": ""} for h in holders]
    fragments = [
        {"kind": "plan", "seat": "King on the Iron Throne", "holder": "Robert Baratheon", "start": "298 AC", "end": "299 AC", "lookups": [], "at": 14000},
        {"kind": "sources", "pages": ["Robert Baratheon", "Small Council", "Iron Bank of Braavos", "House Lannister", "King's Landing", "Faith of the Seven", "Free Cities"], "at": 38000},
        {"kind": "roster", "groups": [{"id": h["id"], "name": h["name"], "sits": "home" if h.get("where", "home") == "home" else "abroad", "seats": None, "wants": first(h.get("wants"))} for h in holders], "at": 86000},
        {"kind": "bible", "title": pack["title"], "era": pack["era"], "place": pack["place"], "voice": "", "vocabulary": pack["vocabulary"], "groups": [{"id": h["id"], "name": h["name"], "short": h["name"], "identity": first(h.get("wants")), "face": ""} for h in holders], "at": 151000},
        {"kind": "groups", "rows": rows[:4], "at": 170000},
        {"kind": "groups", "rows": rows[4:], "at": 176000},
        {"kind": "theme", "tokens": pack["themeTokens"], "at": 180000},
        {"kind": "briefing", "role": "Robert Baratheon, King on the Iron Throne", "situation": pack["description"], "problems": [first(p.get("title") if isinstance(p, dict) else p) for p in pack["problems"][:3]], "pledges": [p["label"] for p in pack["promises"][:4]], "at": 191000},
        {"kind": "emblems", "emblems": {h["id"]: h["emblem"] for h in holders if h.get("emblem")}, "at": 200000},
    ]
    old = [
        {"kind": "frame", "title": "The Old Build", "era": "1861", "place": "Washington", "description": "A build started before generation v2.", "theme": {}, "factions": [{"id": "a", "name": "Union", "short": "U", "color": "#2553a3"}, {"id": "b", "name": "Confederacy", "short": "C", "color": "#bf2f2b"}], "problems": ["The war", "The debt"]},
        {"kind": "members", "names": ["Ann Lee", "Bo Park"]},
    ]
    row = lambda id, step, items: "INSERT OR REPLACE INTO scenarios (id,status,step,prompt,fragments,created) VALUES ('%s','building','%s','e2e','%s',%d);" % (id, step, json.dumps(items).replace("'", "''"), int(time.time() * 1000))
    sql = OUT / "seed-builds.sql"
    sql.write_text("\n".join([row("e2ev2roster", "roster", fragments[:3]), row("e2ev2full", "people", fragments), row("e2ev1", "names", old)]))
    subprocess.run(["bunx", "wrangler", "d1", "execute", "usoj", "--local", "--file", str(sql)], cwd=ROOT, check=True, capture_output=True)


async def main():
    OUT.mkdir(parents=True, exist_ok=True)
    seed_builds()
    async with async_playwright() as p:
        browser = await p.chromium.launch(executable_path=CHROME, headless=False)
        context = await browser.new_context(viewport={"width": 1440, "height": 900})
        await context.add_init_script(INIT)
        page = await context.new_page()
        watch(page)

        # The screens around the desk.
        await page.goto(URL)
        await page.evaluate("localStorage.removeItem('usoj:game');localStorage.setItem('usoj:theme','light')")
        await page.reload()
        await page.wait_for_timeout(1500)
        await shot(page, "screen-landing", "The landing (restyled, not redesigned)")
        for id, caption in [("e2ev2roster", "The build wait, generation v2, at the roster (about 90 s in)"), ("e2ev2full", "The build wait, generation v2, with the briefing, groups, theme and emblems landed"), ("e2ev1", "The build wait on a v1 build's fragments (frame, members)")]:
            await page.goto(f"{URL}/s/{id}")
            await page.wait_for_timeout(2500)
            await shot(page, f"screen-build-{id[3:]}", caption)
        await page.goto(f"{URL}/s/westeros")
        await page.wait_for_timeout(2500)
        await shot(page, "screen-seat", "The seat (briefing pages), Westeros tokens")

        # One Biden term, light, and the desk in dark.
        await seat(page, "biden-2021", "dem", "light")
        await statics(page, "biden-light", ["gop", "nato"], "-4-resources-change")
        await page.hover('.hm[data-h="congress"] .bal-w')
        await page.wait_for_timeout(300)
        await shot(page, "biden-light-5-vote-tooltip", "The ballot chip's tooltip", clip={"x": 0, "y": 80, "width": 620, "height": 260})
        report["fonts"]["biden-2021"] = await fonts(page)
        await page.click(".tools button")  # Dark
        await page.wait_for_timeout(800)
        await statics(page, "biden-dark", ["dem"], "-4-resources-change")
        await page.click(".tools button")  # back to Light
        await page.wait_for_timeout(500)
        await collect(page)
        forced = False
        for turn, text in enumerate(ACTS, start=1):
            now = await screens_until_desk(page)
            if now in ("won", "over"):
                break
            await answer_cards(page)
            if turn == 2 and not forced:  # Review Focus 5: a vote that fails after the act was signed
                forced = True
                await page.route("**/bills/*/vote", lambda route: route.fulfill(status=503, content_type="application/json", body='{"error":"The chamber is in recess. Try again."}'), times=1)
            result = await act(page, text, "biden-light" if turn == 1 else None)
            report["turns"].append({"turn": turn, "act": text, "result": result})
            await collect(page)
            if await page.query_selector("#callvote"):
                await page.click("#callvote")
                await back(page)
            await answer_cards(page)
            if await page.is_disabled(".endt"):
                report["errors"].append(f"turn {turn}: End turn disabled")
                break
            await page.click(".endt")
            await back(page)
            await collect(page)
        final = await screens_until_desk(page)
        await shot(page, "biden-light-7-end", f"Where the term ended ({final})")

        # One Westeros act, dark, and the Westeros desk in light.
        await seat(page, "westeros", "baratheon", "dark")
        await statics(page, "westeros-dark", ["lannister", "ironbank"], "-4-resources-change")
        report["fonts"]["westeros"] = await fonts(page)
        report["turns"].append({"world": "westeros", "result": await act(page, "Call the banners to clear the kingsroad of outlaws.", "westeros-dark")})
        await collect(page)
        await page.click(".tools button")  # Light
        await page.wait_for_timeout(800)
        await statics(page, "westeros-light", ["smallfolk"], "-4-resources-change")
        await collect(page)

        # The desk at 1920x1080 (k = 1.2), and reduced motion.
        wide = await browser.new_page(viewport={"width": 1920, "height": 1080})
        await seat(wide, "biden-2021", "dem", "light")
        await shot(wide, "viewport-fhd-16x9", "1920x1080: every size is 1.2 times the 1440 desk")
        still = await browser.new_context(viewport={"width": 1440, "height": 900}, reduced_motion="reduce")
        quiet = await still.new_page()
        watch(quiet)
        await seat(quiet, "biden-2021", "dem", "light")
        result = await act(quiet, ACTS[0], None, review="biden-light-6-reduced-motion-end")
        CAPTIONS["biden-light-6-reduced-motion-end"] = f"Reduced motion: the same flow ends in the same review, with no travel ({result})"
        await browser.close()

    assets = ROOT / "dist/client/assets"
    if assets.exists():
        report["js"] = {f.name: round(len(gzip.compress(f.read_bytes())) / 1024, 1) for f in sorted(assets.glob("*.js"))}
        report["js_gzip_kb"] = round(sum(report["js"].values()), 1)
    report["captions"] = CAPTIONS
    report["slow_moments"] = [f for f in report["fps"] if f["avg"] < 58]
    report["long_over_50ms"] = [t for t in report["long"] if t["ms"] > 50]
    (OUT / "report.json").write_text(json.dumps(report, indent=1))
    write_compare()
    print(json.dumps({k: report[k] for k in ("js_gzip_kb", "fonts", "slow_moments", "long_over_50ms", "errors", "turns")}, indent=1))


def write_compare():
    e = html.escape
    (OUT / "mock").mkdir(exist_ok=True)
    rows = []
    for name in report["shots"]:
        mock = MOCK / f"{name}.png"
        if mock.exists():
            shutil.copy(mock, OUT / "mock" / mock.name)
        cell = f'<img src="mock/{e(mock.name)}" loading="lazy">' if mock.exists() else '<p class="none">The mock has no shot of this moment.</p>'
        rows.append(f"<section><h3>{e(name)}</h3><p>{e(CAPTIONS.get(name, ''))}</p><div class=pair><figure><figcaption>App</figcaption><img src='{e(name)}.png' loading=lazy></figure><figure><figcaption>Approved mock</figcaption>{cell}</figure></div></section>")
    kinds = {}
    for f in report["fps"]:
        kind = "End turn" if f["moment"].startswith("End of") else f["moment"] if f["moment"] in MOMENTS else "A card answered or declined, a withdrawal, a refusal's cost"
        kinds.setdefault(kind, []).append(f)
    summary = "".join(
        f"<tr class='{'bad' if min(x['avg'] for x in fs) < 58 or any(x.get('long') for x in fs) else ''}'><td>{e(kind)}</td><td>{len(fs)}</td><td>{min(x['avg'] for x in fs)}</td><td>{min(x['low1'] for x in fs)}</td><td>{sum(len(x.get('long', [])) for x in fs)}</td></tr>"
        for kind, fs in kinds.items()
    )
    outside = "".join(f"<li>{t['ms']} ms at {t['at']} ms on the page's clock</li>" for t in report["long"] if "moment" not in t) or "<li>none</li>"
    fps = "".join(
        f"<tr class='{'bad' if f['avg'] < 58 or any(ms > 50 for ms in f.get('long', [])) else ''}'><td>{e(f['moment'])}</td><td>{f['avg']}</td><td>{f['low1']}</td><td>{f['frames']}</td><td>{', '.join(f'{ms} ms' for ms in f.get('long', [])) or 'none'}</td></tr>"
        for f in report["fps"]
    )
    js = "".join(f"<tr><td>{e(k)}</td><td>{v}</td></tr>" for k, v in sorted(report["js"].items(), key=lambda item: -item[1]))
    fonts = "".join(f"<li><b>{e(world)}</b>: {e(', '.join(names))}</li>" for world, names in report["fonts"].items())
    turns = "".join(f"<li>{e(json.dumps(t))}</li>" for t in report["turns"])
    errors = "".join(f"<li>{e(x)}</li>" for x in report["errors"]) or "<li>none</li>"
    differences = "".join(f"<tr><td>{e(what)}</td><td>{e(why)}</td></tr>" for what, why in DIFFERENCES)
    (OUT / "compare.html").write_text(f"""<!doctype html><meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1"><title>Desk against mock</title>
<style>body{{font:15px/1.45 system-ui,sans-serif;margin:0 auto;max-width:1600px;padding:16px;color:#1b1b1b;background:#fafaf7}}h1{{margin:0 0 4px}}h2{{margin-top:32px;border-bottom:2px solid #1b1b1b}}
table{{border-collapse:collapse;width:100%}}td,th{{border-bottom:1px solid #ddd;padding:4px 8px;text-align:left;vertical-align:top}}tr.bad td{{background:#fde8e6}}
.pair{{display:grid;grid-template-columns:1fr 1fr;gap:12px}}figure{{margin:0}}figcaption{{font-weight:700;font-size:13px;text-transform:uppercase;letter-spacing:.06em}}img{{width:100%;border:1px solid #ccc}}
section{{margin:24px 0}}section h3{{margin:0}}section p{{margin:2px 0 8px;color:#555}}.none{{border:1px dashed #bbb;padding:24px;color:#777}}.big{{font-size:20px}}@media(max-width:900px){{.pair{{grid-template-columns:1fr}}}}</style>
<h1>The desk: app against the approved mock</h1>
<p>What this is: <code>scripts/desk-e2e.py</code> drove the real game (the production build, real clerk calls) in Chrome at 1440x900: one Biden term to its end screen, one Westeros act, the screens around the desk, 1920x1080 and reduced motion. Each app screenshot sits beside the mock's screenshot of the same moment. To get a fresh copy: <code>bunx vite build &amp;&amp; bunx vite preview --port 4173</code>, then <code>uv run --with playwright python scripts/desk-e2e.py</code>.</p>
<p class=big><b>JS</b> {report['js_gzip_kb']} KB gzipped of the 200 KB budget · <b>{len(report['slow_moments'])}</b> moments under 58 fps · <b>{len(report['long_over_50ms'])}</b> long tasks over 50 ms · <b>{len(report['errors'])}</b> errors</p>
<h2>Every remaining difference from the mock, and why</h2><table><tr><th>What differs</th><th>Why</th></tr>{differences}</table>
<h2>Frame rate per moment</h2><p>Frames per second while each moment runs, measured by the page itself on every animation frame. The display runs at 120 Hz here, so 120 is the ceiling; the budget is 60 (a row turns red under 58 or with a long task, a main-thread block of 50 ms or more, inside the moment). "1% low" is the rate of the slowest 1% of frames.</p>
<table><tr><th>Moment</th><th>times run</th><th>lowest avg fps</th><th>lowest 1% low</th><th>long tasks inside</th></tr>{summary}</table>
<p><b>Long tasks outside every moment:</b></p><ul>{outside}</ul><p>The known one: opening the audio device takes about 120 ms. The desk does it when the act box first takes focus, so it never lands inside a moment (before this fix it hit the start of the first count).</p>
<details><summary>Every moment run, in order</summary><table><tr><th>Moment</th><th>avg fps</th><th>1% low</th><th>frames</th><th>long tasks</th></tr>{fps}</table></details>
<h2>Fonts loaded per world</h2><ul>{fonts}</ul>
<h2>JS per chunk (gzipped KB)</h2><table>{js}</table>
<h2>Turns played</h2><ol>{turns}</ol>
<h2>Errors</h2><p>Page errors, server errors and timeouts. The server's 4xx answers to a move (shown to the player as a toast) are in report.json under <code>answers</code>.</p><ul>{errors}</ul>
<h2>Shots: app (left) and mock (right)</h2><p>The mock's shot is the approved design with its scripted numbers; the app's is this run's real game. Screens the mock never drew (the build wait, the seat, the midterm, the final vote, the end, a failed vote) show the app alone.</p>{''.join(rows)}""")


asyncio.run(main())
