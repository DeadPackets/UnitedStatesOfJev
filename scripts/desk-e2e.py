# The desk end to end in real Chrome: one Biden term (every turn priced, signed where it can be, ended, every card
# answered, the midterm and the final vote clicked through), one Westeros act, the build wait on seeded v1 and v2
# fragments, the seat, reduced motion and 1920x1080. Leaves screenshots, the frame rate and long tasks of every moment,
# the loaded fonts and the JS size in OUT, and compare.html: each app shot beside the approved mock's shot of the same
# moment, with the measurements and every known difference from the mock and its reason.
# It also runs a contrast audit (every visible text against the ground under it, 4.5:1) in both worlds and themes, and
# seats a pack stored before R36 (no tokens, glance cards, icons, emblems, tints or short names) by its /s/ link.
# Then each golden world generation v2 wrote (docs/generation/golden/) is seeded into local D1 and played: its desk in
# both themes, a rim file with an emblem and one with the line icon, a member's card, the resources sheet, a law and a
# decree priced and signed, and End turn; the emblems drawn are checked against the pack. E2E_ONLY=golden runs only that.
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
    ("Numbers, reasons and the chip's verb differ in every shot", "The app shows the engine's real state and the clerk's real pricing; the mock shows scripted numbers."),
    ("No mock control bar above the desk; the desk is 40 px taller", "The bar was the mock's own switcher (world, theme, outcome), not part of the game (`--rev: 0`)."),
    ("Three text controls at the right of the top bar (Dark or Light, Sound, Leave) and the clerk's calls left in the turn line", "Decision 4: the game needs them; the mock never drew them."),
    ("Every text is at least 15 px at k = 1 (the mock's kickers, receipt heads and chip were 13 to 14 px)", "The owner asked for larger text after approving the mock."),
    ("Receipt stubs: 'Support, when you sign' instead of 'Support, if it passes', and 'Every turn while it stands' lines", "Decision 1: engine v2 moves support at signing for every verb; the receipt is simulated on the real engine so it lands exactly as shown."),
    ("Westeros: the force act has no count and no verdict (no 2b and 2e shots)", "Decision 2: the engine does not vote on force; a count would show a vote the engine never took."),
    ("No tie beat in the count, and no star seal on the verdict", "Decision 3: the engine has no tie-breaker yet. The seal is a stamp, and the owner ruled no logos, stamps or crests."),
    ("The resources sheet's trend is one bar and '1 turn ±0'", "Decision 5: the engine does not keep per-turn closing values yet (cross-track request 1)."),
    ("After pricing, each hesitant faction's legend entry ends in a 'Their terms' chip that opens a card with its terms; the legend runs three lines where the mock's ran two", "Lead ruling 1 keeps Negotiate reachable; one chip per faction keeps the hemicycle at the mock's size."),
    ("An Amend button on a short law's receipt, a floor slip with the drafts and 'Call the vote', and a member card when a seat is clicked", "Lead rulings 2 to 4: every engine mechanic stays reachable; built from the mock's atoms."),
    ("When a ledger under its line shuts kinds of act, the receipt slot says which kinds are still open, in red", "The clerk's answer would otherwise be a refusal the player could not see coming; the mock never reached 0."),
    ("The chamber kicker names seats by the pack's own word ('100 senators', '100 lords'); the mock scripted 'votes' and 'voices'", "The pack's member word is the nearest it has; the mock's words were never pack data."),
    ("Older packs fall back to the full name, the faction colour, a guessed icon and the default theme (see the old-pack shot)", "Review Focus 2: packs stored before R36 keep loading."),
    ("The receipt head uses the world's mono face, not IBM Plex Mono everywhere; the receipt's gain green is a shade darker", "Decision 8: at most three fonts per world. The mock's green read 4.2:1 on the dark theme's light paper."),
    ("The other screens (landing, build wait, seat, midterm, test, end) keep their v1 layout", "Scope: they take the tokens, fonts, scale and the 15 px floor now; their redesign is at CP4."),
    ("No star mark before the world's title in the top bar", "The owner ruled no logos, stamps or crests at world level; the mock's star is the stamp glyph Task 1 left out of the sprite."),
    ("Rim rows and the file's disc show the world's emblem where the mock shows line icons", "Placement A: the emblem replaces the line icon; the line icon stays the fallback. The mock predates the emblems."),
    ("The Negotiate chips stay in the legend through the count, verdict and review of a priced law", "The chamber keeps the priced count until Back to the desk so nothing repaints mid-moment; the chips do nothing while a moment runs."),
    ("At 1920x1080 the desk fills the screen at k = 1.2 (19.2 px root); the mock's fhd shot shows it near k = 1.0", "The brief's scaling rule (k = min(w/1440, h/900), clamped 1 to 1.8); the mock's shot predates the scale."),
]
# Scenario id, pack under docs/generation/golden/, what it is, and two acts: a law (counted) where the world has one, and a decree.
GOLDEN = [
    ("golden-ottoman", "2026-09-24-ottoman-1908/ottoman-1908.pack.json", "Ottoman 1908, the rebuild: emblems, the Porte as the player's holder, the chamber as a holder",
     ["Pass a law to restore the 1876 constitution and free the press across the empire.", "Order the army to disband the Macedonian bands before the elections."]),
    ("golden-ottoman-first", "2026-09-24/ottoman-1908.pack.json", "Ottoman 1908, the first golden run: no emblems (line icons), eight chamber factions",
     ["Pass a law to give every millet equal seats in the new chamber.", "Proclaim a general amnesty for the political prisoners of the old regime."]),
    ("golden-westeros", "2026-09-24/westeros-298.pack.json", "Westeros 298 AC: no chamber, so a court of 24 whose factions are the holders; emblems",
     ["Decree that the crown pays the Iron Bank a tenth of its debt in gold by spring.", "Send the gold cloaks to clear the kingsroad of outlaws and brigands."]),
    ("golden-fridge", "2026-09-24/fridge-parliament.pack.json", "The Parliament of the Fridge: every emblem call filtered, so line icons everywhere",
     ["Pass a law that every leftover gets a date label before it enters the fridge.", "Order the crisper drawer cleaned out before the weekend shop."]),
]
ONLY = os.environ.get("E2E_ONLY")
MOMENTS = {"open a file", "close a file", "open resources", "pricing", "sign: charge and shockwave", "the count", "verdict", "couriers"}
report = {"fps": [], "long": [], "fonts": {}, "errors": [], "answers": [], "turns": [], "js": {}, "js_gzip_kb": None, "shots": [], "contrast": [], "keyboard": [], "golden": []}
# Every visible text node (and each empty input's placeholder) against the ground under it, 4.5:1. Disabled controls are
# exempt (WCAG). A ground is each ancestor's background colour composited down; an opaque gradient counts at its worst stop.
AUDIT = (ROOT / "scripts/contrast.js").read_text()
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
        await contrast(page, f"{prefix}, the receipt")
        chip = await page.query_selector(".gleg .term")
        if chip:  # Negotiate: a hesitant faction's terms card
            await chip.click()
            await page.wait_for_timeout(1500)
            await shot(page, f"{prefix}-2f-terms", "A hesitant faction's terms (Negotiate), opened from its legend chip")
            await contrast(page, f"{prefix}, a terms card")
            await page.keyboard.press("Escape")
            await page.wait_for_timeout(600)
    if await page.is_disabled("#sign"):
        await page.click("#tear")
        return "blocked"
    law = not await page.query_selector(".rc.act")
    await page.click("#sign")
    if prefix and law:
        await page.wait_for_function("document.querySelectorAll('#hemi .v-yes,#hemi .v-no').length>document.querySelectorAll('#hemi .seat').length/3", timeout=180000)
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
        if not await page.is_enabled("#callvote"):  # the clerks are out of time: End turn drops the bill
            return "law (vote failed, no clerk time left to call it)"
        await page.click("#callvote")
        await back(page)
        return "law (vote failed, then called)"
    if prefix or review:
        await page.wait_for_timeout(1200)
        await shot(page, review or f"{prefix}-2d-review", "The review, which stays until Back to the desk")
        await contrast(page, f"{review or prefix}, the review")
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
    await contrast(page, f"{prefix}, at rest")
    for row in rows:
        await page.click(f'.hm[data-h="{row}"]')
        await page.wait_for_timeout(1500)
        await shot(page, f"{prefix}-3-file-{row}", f"The glance file of {row}")
        await contrast(page, f"{prefix}, the file of {row}")
        await page.keyboard.press("Escape")
        await page.wait_for_timeout(500)
    await page.click('.led[data-r="treasury"]')
    await page.wait_for_timeout(1800)
    await shot(page, f"{prefix}{resource_suffix}", "The resources sheet")
    await contrast(page, f"{prefix}, the resources sheet")
    await page.keyboard.press("Escape")
    await page.wait_for_timeout(500)


async def contrast(page, where):
    result = await page.evaluate(AUDIT)
    report["contrast"].append({"where": where, "checked": result["checked"], "failures": result["failures"]})


async def keyboard(page):
    """Seats from the keyboard: Tab reaches one seat, the arrows walk, Enter opens that member's card, Esc gives focus back."""
    await page.focus('#hemi .seat[tabindex="0"]')
    for _ in range(3):
        await page.keyboard.press("ArrowRight")
    seat = await page.evaluate("document.activeElement.getAttribute('aria-label')")
    await page.keyboard.press("Enter")
    await page.wait_for_selector(".fcard", timeout=5000)
    await page.wait_for_timeout(900)
    card = await page.evaluate("document.querySelector('.fcard h2').textContent")
    await page.keyboard.press("Escape")
    await page.wait_for_timeout(700)
    back = await page.evaluate("document.activeElement.getAttribute('aria-label')")
    report["keyboard"].append({"seat": seat, "card": card, "focus after Esc": back, "ok": bool(seat) and seat.startswith(card) and back == seat})


def seed_pack(pack, id):
    """One pack as a ready scenario in local D1. D1 caps a statement at 100 KB, so the pack goes in 40 KB pieces."""
    pack["id"] = id
    quote = lambda text: "'%s'" % str(text).replace("'", "''")
    text = json.dumps(pack)
    head = [id, "ready", "ready", "en", pack["title"], pack["era"], pack["place"], pack["description"], pack.get("prompt", "e2e")]
    sql = OUT / f"seed-{id}.sql"
    sql.write_text("\n".join(
        ["INSERT OR REPLACE INTO scenarios (id,status,step,lang,title,era,place,description,prompt,pack,fragments,created,builds) VALUES (%s,'','[]',%d,0);" % (",".join(map(quote, head)), int(time.time() * 1000))]
        + ["UPDATE scenarios SET pack = pack || %s WHERE id = %s;" % (quote(text[i : i + 40000]), quote(id)) for i in range(0, len(text), 40000)]
    ))
    subprocess.run(["bunx", "wrangler", "d1", "execute", "usoj", "--local", "--file", str(sql)], cwd=ROOT, check=True, capture_output=True)


def seed_old_pack():
    """Biden stripped of everything R36 added, as a pack stored before it would be (local D1 only)."""
    pack = json.loads((ROOT / "worker/fixtures/biden-2021.json").read_text())
    def strip(node):
        if isinstance(node, dict):
            for key in ("glance", "icon", "emblem", "tint", "themeTokens"):
                node.pop(key, None)
            for value in node.values():
                strip(value)
        elif isinstance(node, list):
            for value in node:
                strip(value)
    strip(pack)
    for holder in pack["constitution"]["holders"]:
        holder.pop("short", None)
    for key in ("file", "abroad"):
        pack["vocabulary"].pop(key, None)
    seed_pack(pack, "e2e-old")


# Each rim row and the open file's disc: the emblem (svg.em) or the line icon.
MARKS = "[...document.querySelectorAll('.rim .hm')].map(r=>({id:r.dataset.h,emblem:!!r.querySelector('.hi svg.em')}))"


async def golden(page, id, file, what, acts):
    """A golden world on the desk: both themes at rest, a file with an emblem and one with the line icon, a member's
    card, the resources sheet, a law and a decree priced and signed, End turn; the emblems drawn against the pack's."""
    pack = json.loads((ROOT / "docs/generation/golden" / file).read_text())
    seed_pack(pack, id)
    holders = pack["constitution"]["holders"]
    await page.goto(f"{URL}/s/{id}")
    await page.wait_for_timeout(2500)
    await shot(page, f"{id}-0-seat", f"{what}: the seat")
    await seat(page, id, pack["constitution"]["ruler"]["faction"], "light")
    rows = await page.evaluate(MARKS)
    drawn = [row["id"] for row in rows if row["emblem"]]
    packed = [h["id"] for h in holders if h.get("emblem") and h["id"] in {row["id"] for row in rows}]
    files = [row for row in ([r for r in rows if r["emblem"]][:1] + [r for r in rows if not r["emblem"]][:1])]
    await statics(page, id, [row["id"] for row in files])
    discs = {}
    for row in files:  # the file's disc shows the same mark as its rim row
        await page.click(f'.hm[data-h="{row["id"]}"]')
        await page.wait_for_selector(".fcard", timeout=5000)
        discs[row["id"]] = await page.evaluate("!!document.querySelector('.fcard svg.em')")
        await page.keyboard.press("Escape")
        await page.wait_for_timeout(600)
    await page.click("#hemi .seat")
    await page.wait_for_selector(".fcard", timeout=5000)
    await page.wait_for_timeout(1500)
    await shot(page, f"{id}-5-member", f"{what}: a member's card (R36 glance)")
    await contrast(page, f"{id}, a member's card")
    member = await page.evaluate("document.querySelector('.fcard').innerText.slice(0,300)")
    await page.keyboard.press("Escape")
    await page.wait_for_timeout(600)
    report["fonts"][id] = await fonts(page)
    turns = [await act(page, acts[0], id), await act(page, acts[1], None, review=f"{id}-6-decree-review")]
    await collect(page)
    if await page.is_disabled(".endt"):
        report["errors"].append(f"{id}: End turn disabled")
    else:
        await page.click(".endt")
        await back(page)
        await page.wait_for_timeout(800)
        await shot(page, f"{id}-7-turn-2", f"{what}: the desk after End turn, with any card the turn dealt")
        await answer_cards(page)
        await collect(page)
    await page.click(".tools button")  # Dark
    await page.wait_for_timeout(800)
    await shot(page, f"{id}-8-dark", f"{what}: the desk in the world's dark theme")
    await contrast(page, f"{id}, dark, at rest")
    await page.click(".tools button")
    await page.wait_for_timeout(500)
    report["golden"].append({
        "id": id, "what": what, "rows": len(rows), "emblems in pack": packed, "emblems drawn": drawn,
        "discs": discs, "ok": sorted(drawn) == sorted(packed) and all(discs[r["id"]] == r["emblem"] for r in files),
        "tokens": {k: pack["themeTokens"].get(k) for k in ("display", "body", "mono")}, "fonts": report["fonts"][id],
        "member card": member, "acts": list(zip(acts, turns)),
    })


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
    async with async_playwright() as p:
        browser = await p.chromium.launch(executable_path=CHROME, headless=False)
        context = await browser.new_context(viewport={"width": 1440, "height": 900})
        await context.add_init_script(INIT)
        page = await context.new_page()
        watch(page)
        if ONLY != "golden":
            await fixtures(page, browser)
        for world in GOLDEN:
            await golden(page, *world)
        await browser.close()
    finish()


async def fixtures(page, browser):
    seed_builds()
    seed_old_pack()

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
    await page.goto(f"{URL}/s/e2e-old")  # a hyphenated id opens by its link
    await page.wait_for_timeout(2500)
    await shot(page, "screen-seat-old-pack", "The seat of a pack stored before R36, opened by its /s/e2e-old link")
    await seat(page, "e2e-old", "dem", "light")
    await shot(page, "old-pack-desk", "Review Focus 2: a pack stored before R36 on the desk: the default theme, a line icon and a tint on every row, full names")
    await contrast(page, "old pack, light, at rest")

    # One Biden term, light, and the desk in dark.
    await seat(page, "biden-2021", "dem", "light")
    await statics(page, "biden-light", ["gop", "nato"], "-4-resources-change")
    await keyboard(page)
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
        if await page.query_selector("#callvote") and await page.is_enabled("#callvote"):
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
    await still.close()
    await wide.close()


def finish():
    assets = ROOT / "dist/client/assets"
    if assets.exists():
        report["js"] = {f.name: round(len(gzip.compress(f.read_bytes())) / 1024, 1) for f in sorted(assets.glob("*.js"))}
        report["js_gzip_kb"] = round(sum(report["js"].values()), 1)
    report["captions"] = CAPTIONS
    report["slow_moments"] = [f for f in report["fps"] if f["avg"] < 58]
    report["long_over_50ms"] = [t for t in report["long"] if t["ms"] > 50]
    report["contrast_failures"] = sum(len(c["failures"]) for c in report["contrast"])
    (OUT / "report.json").write_text(json.dumps(report, indent=1))
    write_compare()
    print(json.dumps({k: report[k] for k in ("js_gzip_kb", "fonts", "slow_moments", "long_over_50ms", "errors", "turns", "contrast_failures", "keyboard", "golden")}, indent=1))


def write_compare():
    e = html.escape
    (OUT / "mock").mkdir(exist_ok=True)
    rows = []
    for name in (n for n in report["shots"] if not n.startswith("golden-")):
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
    low = lambda c: "; ".join(f"{f['text']} ({f['fg']} on {f['bg']}, {f['ratio']}:1)" for f in c["failures"]) or "none"
    audit = "".join(
        f"<tr class='{'bad' if c['failures'] else ''}'><td>{e(c['where'])}</td><td>{c['checked']}</td><td>{e(low(c))}</td></tr>"
        for c in report["contrast"]
    )
    keys = "".join(f"<li>{e(json.dumps(k))}</li>" for k in report["keyboard"]) or "<li>not run</li>"
    differences = "".join(f"<tr><td>{e(what)}</td><td>{e(why)}</td></tr>" for what, why in DIFFERENCES)
    # One section per golden world: what the pack carries against what the desk drew, then its shots.
    golden = "".join(
        f"<section class='{'' if g['ok'] else 'bad'}'><h3>{e(g['id'])}: {e(g['what'])}</h3>"
        f"<table><tr><td>Emblems in the pack (rim rows)</td><td>{e(', '.join(g['emblems in pack']) or 'none: line icons')}</td></tr>"
        f"<tr><td>Emblems drawn on the rims</td><td>{e(', '.join(g['emblems drawn']) or 'none: line icons')}</td></tr>"
        f"<tr><td>File discs (emblem shown)</td><td>{e(json.dumps(g['discs']))}</td></tr>"
        f"<tr><td>Theme fonts (display, body, mono) / loaded</td><td>{e(json.dumps(g['tokens']))} / {e(', '.join(g['fonts']))}</td></tr>"
        f"<tr><td>Acts</td><td>{e('; '.join(f'{a}: {r}' for a, r in g['acts']))}</td></tr>"
        f"<tr><td>A member's card</td><td><pre>{e(g['member card'])}</pre></td></tr></table>"
        f"<div class=grid>{''.join(f'<figure><figcaption>{e(CAPTIONS.get(n, n))}</figcaption><img src={chr(39)}{e(n)}.png{chr(39)} loading=lazy></figure>' for n in report['shots'] if n.startswith(g['id'] + '-') and not n.startswith(g['id'] + '-first'))}</div></section>"
        for g in report["golden"]
    ) or "<p>not run</p>"
    (OUT / "compare.html").write_text(f"""<!doctype html><meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1"><title>Desk against mock</title>
<style>body{{font:15px/1.45 system-ui,sans-serif;margin:0 auto;max-width:1600px;padding:16px;color:#1b1b1b;background:#fafaf7}}h1{{margin:0 0 4px}}h2{{margin-top:32px;border-bottom:2px solid #1b1b1b}}
table{{border-collapse:collapse;width:100%}}td,th{{border-bottom:1px solid #ddd;padding:4px 8px;text-align:left;vertical-align:top}}tr.bad td{{background:#fde8e6}}
.pair{{display:grid;grid-template-columns:1fr 1fr;gap:12px}}figure{{margin:0}}figcaption{{font-weight:700;font-size:13px;text-transform:uppercase;letter-spacing:.06em}}img{{width:100%;border:1px solid #ccc}}
.grid{{display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px}}pre{{white-space:pre-wrap;margin:0;font:13px/1.3 ui-monospace,monospace}}section.bad h3{{color:#b00}}section{{margin:24px 0}}section h3{{margin:0}}section p{{margin:2px 0 8px;color:#555}}.none{{border:1px dashed #bbb;padding:24px;color:#777}}.big{{font-size:20px}}@media(max-width:900px){{.pair{{grid-template-columns:1fr}}}}</style>
<h1>The desk: app against the approved mock</h1>
<p>What this is: <code>scripts/desk-e2e.py</code> drove the real game (the production build, real clerk calls) in Chrome at 1440x900: one Biden term to its end screen, one Westeros act, the screens around the desk, 1920x1080, reduced motion, and one act and End turn on each golden world. Each app screenshot sits beside the mock's screenshot of the same moment. To get a fresh copy: <code>bunx vite build &amp;&amp; bunx vite preview --port 4173</code>, then <code>uv run --with playwright python scripts/desk-e2e.py</code>.</p>
<p class=big><b>JS</b> {report['js_gzip_kb']} KB gzipped of the 200 KB budget · <b>{len(report['slow_moments'])}</b> moments under 58 fps · <b>{len(report['long_over_50ms'])}</b> long tasks over 50 ms · <b>{len(report['errors'])}</b> errors · <b>{report['contrast_failures']}</b> texts under 4.5:1</p>
<h2>Every remaining difference from the mock, and why</h2><table><tr><th>What differs</th><th>Why</th></tr>{differences}</table>
<h2>Frame rate per moment</h2><p>Frames per second while each moment runs, measured by the page itself on every animation frame. The display runs at 120 Hz here, so 120 is the ceiling; the budget is 60 (a row turns red under 58 or with a long task, a main-thread block of 50 ms or more, inside the moment). "1% low" is the rate of the slowest 1% of frames.</p>
<table><tr><th>Moment</th><th>times run</th><th>lowest avg fps</th><th>lowest 1% low</th><th>long tasks inside</th></tr>{summary}</table>
<p><b>Long tasks outside every moment:</b></p><ul>{outside}</ul><p>The known one: opening the audio device takes about 120 ms. The desk does it when the act box first takes focus, so it never lands inside a moment (before this fix it hit the start of the first count).</p>
<details><summary>Every moment run, in order</summary><table><tr><th>Moment</th><th>avg fps</th><th>1% low</th><th>frames</th><th>long tasks</th></tr>{fps}</table></details>
<h2>Contrast: every visible text against its ground</h2><p>Each row is one state of the desk; the audit (<code>scripts/contrast.js</code>) checks every text node and placeholder against the colour under it and lists any under 4.5:1. Disabled controls are exempt.</p><table><tr><th>State</th><th>texts checked</th><th>under 4.5:1</th></tr>{audit}</table>
<h2>Keyboard</h2><p>A seat reached by Tab and the arrows opens its member's card with Enter; Esc closes it and gives focus back to the seat.</p><ul>{keys}</ul>
<h2>Fonts loaded per world</h2><ul>{fonts}</ul>
<h2>JS per chunk (gzipped KB)</h2><table>{js}</table>
<h2>Turns played</h2><ol>{turns}</ol>
<h2>Errors</h2><p>Page errors, server errors and timeouts. The server's 4xx answers to a move (shown to the player as a toast) are in report.json under <code>answers</code>.</p><ul>{errors}</ul>
<h2>Golden worlds</h2><p>Each world generation v2 wrote (docs/generation/golden/), seeded into local D1 and played on the desk: the emblems the pack carries against those drawn (placement A; the line icon where there is none), the world's fonts, a member's card (R36), a law and a decree priced and signed, and End turn. The mock never drew these worlds, so the shots stand alone. A red heading means the drawn emblems differ from the pack's.</p>{golden}
<h2>Shots: app (left) and mock (right)</h2><p>The mock's shot is the approved design with its scripted numbers; the app's is this run's real game. Screens the mock never drew (the build wait, the seat, the midterm, the final vote, the end, a failed vote) show the app alone.</p>{''.join(rows)}""")


asyncio.run(main())
