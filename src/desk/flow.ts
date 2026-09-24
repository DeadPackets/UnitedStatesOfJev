// The desk's moments from Sign on, ported from the approved mock: the shockwave, the seat-by-seat count, the verdict,
// and the couriers that carry each change to its target with its reason (P1-B). Pure DOM and canvas over the desk React
// drew; the caller hands React the new view when a moment ends.
import { animate, stagger } from "motion";
import type { ReviewLine, RimRow, Verdict } from "../../worker/desk";
import type { SeatSpot } from "./Chamber";
import {
  burst,
  centre,
  fly,
  pace,
  play,
  reduced,
  ring,
  roll,
  sfx,
  shake,
  signed,
  sleep,
  token,
  wave,
  addToLayer,
  type Point,
} from "./fx";
import { iconNode, paintCentre, paintRow, paintTally, RESOURCE_TOKEN, targetOf } from "./paint";
import { paintSheet } from "./Sheet";

export type Scene = {
  desk: HTMLElement; // the .desk wrapper: why-tags and the sweep go here, outside the shaking #dk
  main: HTMLElement; // #dk
  spots: SeatSpot[];
  rows: Map<string, RimRow>;
  names: Map<string, string>; // member id to name, for the hesitant calls
  turn: number;
  turnWord: string;
  need: number; // the final vote's bar
};
const find = (root: ParentNode, selector: string) => root.querySelector<HTMLElement>(selector)!;

function whyTag(scene: Scene, el: HTMLElement, delta: number, why: string, colour: string) {
  const box = el.getBoundingClientRect(),
    tag = document.createElement("div"),
    amount = document.createElement("b"),
    words = document.createElement("span");
  tag.className = "wtag";
  tag.style.setProperty("--tc", colour);
  amount.className = "num";
  amount.textContent = signed(delta);
  words.textContent = why;
  tag.append(amount, words);
  const right = box.left < innerWidth / 2;
  if (el.classList.contains("hm")) {
    tag.style.top = `${box.top + 6}px`;
    if (right) tag.style.left = `${box.right + 12}px`;
    else tag.style.right = `${innerWidth - box.left + 12}px`;
  } else {
    tag.style.top = `${box.bottom + 8}px`;
    tag.style.left = `${Math.min(innerWidth - 250, box.left)}px`;
  }
  scene.desk.append(tag);
  if (!reduced()) animate(tag, { opacity: [0, 1], scale: [0.9, 1] }, { duration: 0.25 });
  setTimeout(() => {
    if (tag.isConnected) animate(tag, { opacity: 0 }, { duration: 0.4 }).then(() => tag.remove());
  }, 3200 * pace());
}
function changeTag(el: HTMLElement, delta: number, colour: string) {
  const slot = el.querySelector(".dx");
  if (!slot) return;
  const tag = document.createElement("span");
  tag.className = "gd";
  tag.style.setProperty("--c", colour);
  tag.textContent = signed(delta);
  slot.replaceChildren(tag);
}

/** Commits one change: the number rolls, the bar moves, the warn state follows the line; an open sheet counts too. */
function land(line: ReviewLine, scene: Scene, ms = 650): Promise<void> {
  const el = targetOf(scene.main, line)!;
  const bar = el.querySelector<HTMLElement>(".bar>i");
  if (bar) bar.style.width = `${Math.min(100, line.to)}%`;
  if (line.target === "group") {
    const row = scene.rows.get(line.id);
    if (row) paintRow(el, row, line.to, scene.turn, scene.turnWord);
  } else if (line.target === "finalVote") {
    el.classList.toggle("over", line.to >= scene.need);
    el.classList.toggle("under", line.to < scene.need);
  } else paintSheet?.(line);
  return roll(find(el, ".n"), line.from, line.to, ms);
}

// A resource: coins travel one by one and the counter ticks as each lands (a cost ticks as each leaves).
async function resource(line: ReviewLine, source: Point, scene: Scene) {
  const el = targetOf(scene.main, line)!,
    number = find(el, ".n"),
    end = centre(number);
  const colour = token(`--${RESOURCE_TOKEN[line.id as keyof typeof RESOURCE_TOKEN]}`),
    danger = token("--danger");
  const steps = Math.min(16, Math.max(1, Math.abs(line.delta))),
    gain = line.delta > 0,
    flights: Promise<void>[] = [];
  sfx(gain ? "coins-in" : "coins-out");
  for (let i = 0; i < steps; i++) {
    const value = line.from + Math.round((line.delta * (i + 1)) / steps);
    const jitter = {
      x: source.x + (Math.random() - 0.5) * 24,
      y: source.y + (Math.random() - 0.5) * 14,
    };
    if (!gain) number.textContent = String(value);
    flights.push(
      fly({
        from: gain ? jitter : end,
        to: gain ? end : jitter,
        colour,
        radius: 5,
        coin: true,
        duration: 0.55 + Math.random() * 0.15,
        arc: 0.18 + Math.random() * 0.12,
        delay: i * 0.045,
        label: i === steps - 1 ? signed(line.delta) : null,
        onLand: () => {
          if (gain) {
            number.textContent = String(value);
            if (!reduced()) animate(number, { scale: [1.12, 1] }, { duration: 0.18 });
          }
          burst(gain ? end.x : source.x, gain ? end.y : source.y, {
            count: 3,
            colours: [colour],
            speed: 90,
            gravity: 0,
            size: 1.8,
            life: 0.35,
          });
        },
      }),
    );
    if (!gain && !reduced()) await sleep(45);
  }
  await Promise.all(flights);
  land(line, scene, 0);
  changeTag(el, line.delta, gain ? colour : danger);
  if (Math.abs(line.delta) >= 10) ring(end.x, end.y, gain ? colour : danger, 46, 3);
  whyTag(scene, el, line.delta, line.why, gain ? colour : danger);
}

function landGroup(line: ReviewLine, scene: Scene) {
  const el = targetOf(scene.main, line)!,
    colour = line.delta > 0 ? token("--up") : token("--danger"),
    disc = centre(find(el, ".hi"));
  land(line, scene, 450);
  changeTag(el, line.delta, colour);
  el.style.setProperty("--fc", colour);
  el.classList.remove("flash");
  void el.offsetWidth; // restart the flash animation
  el.classList.add("flash");
  ring(disc.x, disc.y, colour, 34, 2.5);
  burst(disc.x, disc.y, {
    count: 8,
    colours: [colour],
    speed: 150,
    gravity: 0,
    size: 2.2,
    life: 0.45,
    shrink: true,
  });
  whyTag(scene, el, line.delta, line.why, colour);
  sfx(line.delta > 0 ? "land-up" : "land-down");
}

/** One courier per change, from its source to its target; then the voting groups send their share to the final vote. */
export async function deliver(
  lines: ReviewLine[],
  source: (line: ReviewLine) => Point,
  scene: Scene,
) {
  const resources = lines.filter((line) => line.target === "resource");
  const groups = lines.filter((line) => line.target === "group" && targetOf(scene.main, line));
  const vote = lines.find((line) => line.target === "finalVote");
  await Promise.all(resources.map((line) => resource(line, source(line), scene)));
  await sleep(200);
  await Promise.all(
    groups.map((line, i) =>
      fly({
        from: source(line),
        to: centre(find(targetOf(scene.main, line)!, ".hi")),
        colour: line.delta > 0 ? token("--up") : token("--danger"),
        label: signed(line.delta),
        radius: 7,
        duration: 0.75,
        delay: i * 0.14,
        onLand: () => landGroup(line, scene),
      }),
    ),
  );
  await sleep(250);
  if (!vote) return;
  const pill = find(scene.main, "#fv"),
    point = centre(find(pill, ".n"));
  const movers = groups.filter((line) => (scene.rows.get(line.id)?.votes ?? 0) > 0);
  await Promise.all(
    movers.map((line, i) =>
      fly({
        from: centre(find(targetOf(scene.main, line)!, ".hi")),
        to: point,
        colour: token("--ink"),
        radius: 4.5,
        coin: true,
        duration: 0.6,
        arc: 0.2,
        delay: i * 0.08,
      }),
    ),
  );
  const colour = vote.to >= vote.from ? token("--up") : token("--danger");
  const rolling = land(vote, scene, 500);
  changeTag(pill, vote.delta, colour);
  ring(point.x, point.y, colour, 40, 3);
  if (!reduced()) animate(pill, { scale: [1, 1.1, 1] }, { duration: 0.35 });
  whyTag(scene, pill, vote.delta, vote.why, colour);
  await rolling;
  await sleep(500);
}

/** Where a change starts: its line on the receipt when it has one, else the receipt, else the chamber. */
export function lineSource(scene: Scene, stage: "now" | "pass" | "fail", line: ReviewLine): Point {
  const row = scene.main.querySelector(
    `#pb [data-k="${CSS.escape(`${stage}:${line.target}:${line.id}`)}"]`,
  );
  return centre(row ?? scene.main.querySelector("#pb") ?? find(scene.main, "#stage"));
}

/** Sign: the button charges, then the shockwave runs out from the pen and shoves every panel it passes. */
export async function signWave(scene: Scene, button: HTMLElement) {
  const charge = find(button, ".chg"),
    ink = token("--ink");
  let level = 0,
    charging = true;
  addToLayer({
    step(seconds, context) {
      level = charging ? Math.min(1, level + seconds / 0.75) : Math.max(0, level - seconds * 3);
      const glow = context.createRadialGradient(
        innerWidth / 2,
        innerHeight / 2,
        innerHeight * (0.62 - 0.2 * level),
        innerWidth / 2,
        innerHeight / 2,
        innerHeight,
      );
      glow.addColorStop(0, "transparent");
      glow.addColorStop(1, ink);
      context.globalAlpha = 0.2 * level;
      context.fillStyle = glow;
      context.fillRect(0, 0, innerWidth, innerHeight);
      context.globalAlpha = 1;
      return charging || level > 0;
    },
  });
  sfx("charge");
  await play(charge, { scaleX: [0, 1] }, { duration: 0.75 * pace(), ease: "easeIn" });
  charging = false;
  sfx("release");
  const origin = centre(button),
    accent = token("--accent");
  let time = 0;
  addToLayer({
    step(seconds, context) {
      time += seconds;
      const progress = time / 0.3;
      if (progress > 1) return false;
      context.fillStyle = accent;
      context.globalAlpha = 0.14 * (1 - progress);
      context.fillRect(0, 0, innerWidth, innerHeight);
      context.globalAlpha = 1;
    },
  });
  burst(origin.x, origin.y, {
    count: 40,
    colours: [accent, token("--navy"), "#e9b949"],
    speed: 800,
    gravity: 150,
    drag: 0.3,
    size: 3,
    shape: "fleck",
    life: 1,
  });
  shake(8, 360);
  const targets = [
    ...scene.main.querySelectorAll(".led, #fv, .hm, .st-h, .hemi-w, .tly, .gleg, .vpick"),
  ];
  await wave(origin.x, origin.y, {
    colour: accent,
    targets,
    hit(target) {
      if (reduced()) return;
      const dx = target.x - origin.x,
        dy = target.y - origin.y,
        distance = Math.hypot(dx, dy) || 1;
      animate(
        target.el,
        { x: [0, (dx / distance) * 12, 0], y: [0, (dy / distance) * 12, 0] },
        { duration: 0.5, ease: [0.2, 0.9, 0.3, 1] },
      );
    },
  });
}

/** Shows the call chip with a waiting line while a slow answer (the vote, End turn) is out; hides it when it lands. */
export async function waitFor<T>(pending: Promise<T>, scene: Scene, words: string): Promise<T> {
  const quick = await Promise.race([pending.then(() => true), sleep(150).then(() => false)]);
  if (quick) return pending;
  const call = document.createElement("div"),
    label = document.createElement("b");
  call.className = "call";
  label.textContent = words;
  call.append(iconNode("i-ballot"), label);
  find(scene.main, "#stfx").replaceChildren(call);
  const pulse = animate(
    call,
    { opacity: [0.55, 1] },
    { duration: 0.8, repeat: Infinity, repeatType: "reverse" },
  );
  try {
    return await pending;
  } finally {
    pulse.stop();
    call.remove();
  }
}

/** The count, seat by seat: sure votes speed up, then each hesitant seat is called by name. */
export async function countVotes(scene: Scene, verdict: Verdict) {
  const { main, spots } = scene,
    size = spots.length;
  main.classList.add("floor");
  if (!reduced())
    animate(find(main, "#stage"), { scale: [1, 1.02] }, { duration: 0.6, ease: "easeOut" });
  paintCentre(main, 0, `for · ${verdict.need} needed`);
  paintTally(main, 0, 0, size);
  const circles = [...main.querySelectorAll<SVGCircleElement>("#hemi .seat")];
  const seatOf = bindSeats(spots, verdict);
  circles.forEach((circle) => circle.setAttribute("class", "seat v-wait"));
  let yes = 0,
    no = 0;
  const mark = (seat: Verdict["order"][number]) => {
    seat.yes ? yes++ : no++;
    circles[seatOf.get(seat.member)!]?.setAttribute("class", seat.yes ? "seat v-yes" : "seat v-no");
  };
  const sure = verdict.order.filter((seat) => !seat.hesitant),
    unsure = verdict.order.filter((seat) => seat.hesitant);
  // Reduced motion: the count's end state at once, with no seat called one by one.
  if (reduced()) {
    verdict.order.forEach(mark);
    paintTally(main, yes, no, size);
    paintCentre(main, yes, `for · ${verdict.need} needed`);
    await sleep(300);
    return;
  }
  let owed = 0;
  for (let i = 0; i < sure.length; i++) {
    mark(sure[i]);
    animate(circles[seatOf.get(sure[i].member)!], { scale: [1.7, 1] }, { duration: 0.22 });
    paintTally(main, yes, no, size);
    paintCentre(main, yes, `for · ${verdict.need} needed`);
    sfx("seat", yes);
    owed += 45 + (10 - 45) * Math.min(1, i / (sure.length * 0.65));
    if (owed >= 16) {
      await sleep(owed);
      owed = 0;
    }
  }
  const call = document.createElement("div");
  call.className = "call";
  find(main, "#stfx").replaceChildren(call);
  const beat = Math.min(1, 3 / Math.max(1, unsure.length));
  for (const seat of unsure) {
    const circle = circles[seatOf.get(seat.member)!];
    const name = document.createElement("b");
    name.textContent = scene.names.get(seat.member) ?? seat.member;
    call.replaceChildren(iconNode("i-ballot"), name, document.createElement("span"));
    await play(call, { opacity: [0, 1], y: [-10, 0] }, { duration: 0.18 });
    circle?.setAttribute("class", "seat p-hes");
    if (circle) animate(circle, { scale: [1, 1.35, 1] }, { duration: 0.45 });
    await sleep(520 * beat);
    mark(seat);
    const answer = document.createElement("span");
    answer.className = seat.yes ? "vv" : "vv no";
    answer.textContent = seat.yes ? "Yes" : "No";
    call.append(answer);
    if (circle) animate(circle, { scale: [2, 1] }, { type: "spring", stiffness: 600, damping: 12 });
    paintTally(main, yes, no, size);
    paintCentre(main, yes, `for · ${verdict.need} needed`);
    shake(2.5, 160);
    await sleep(520 * beat);
    await play(call, { opacity: 0 }, { duration: 0.12 });
  }
}

// Each member gets a seat in its faction's wedge: sure seats on the far side (yes before no), hesitant ones nearest the
// centre, matching the preview's paint so a hesitant seat is called where it was shown.
function bindSeats(spots: SeatSpot[], verdict: Verdict): Map<string, number> {
  const bound = new Map<string, number>();
  for (const factionId of new Set(spots.map((spot) => spot.faction.id))) {
    const wedge = spots.filter((spot) => spot.faction.id === factionId);
    const left = wedge.reduce((sum, spot) => sum + spot.angle, 0) / wedge.length > Math.PI / 2;
    const members = verdict.order.filter((seat) => seat.faction === factionId);
    const order = [
      ...members.filter((seat) => !seat.hesitant && seat.yes),
      ...members.filter((seat) => !seat.hesitant && !seat.yes),
      ...members.filter((seat) => seat.hesitant),
    ];
    const seats = left ? wedge : [...wedge].reverse();
    order.forEach((seat, i) => seats[i] && bound.set(seat.member, seats[i].index));
  }
  return bound;
}

/** The verdict: the court dims to 12%, the word sets letter by letter, then the whole desk stands up or sinks. */
export async function verdictMoment(
  scene: Scene,
  verdict: Verdict,
  words: { pass: string; fail: string },
) {
  const { main, desk, spots } = scene,
    pass = verdict.passed,
    word = pass ? words.pass : words.fail;
  main.classList.remove("floor");
  const box = document.createElement("div"),
    letters = document.createElement("div"),
    score = document.createElement("span");
  box.className = pass ? "vd" : "vd fail";
  letters.className = "vw";
  letters.setAttribute("aria-label", word);
  for (const character of word)
    letters.append(Object.assign(document.createElement("span"), { textContent: character }));
  score.className = "vs num";
  score.textContent = `${verdict.yes} to ${verdict.no}`;
  box.append(letters, score);
  find(main, "#stfx").append(box);
  find(main, ".hemi-w").classList.add("dim");
  const spans = [...letters.children] as HTMLElement[];
  const circles = [...main.querySelectorAll<SVGCircleElement>("#hemi .seat")];
  const yesSeats = circles
    .filter((circle) => circle.classList.contains("v-yes"))
    .sort((a, b) => spots[Number(b.dataset.i)].angle - spots[Number(a.dataset.i)].angle);
  sfx(pass ? "verdict-pass" : "verdict-fail");
  if (pass) {
    yesSeats.forEach(
      (circle, i) =>
        !reduced() && animate(circle, { scale: [1, 1.7, 1] }, { duration: 0.36, delay: i * 0.007 }),
    );
    if (!reduced())
      animate(
        find(main, ".ty-bar .ln"),
        { scaleY: [1, 3, 1], scaleX: [1, 3, 1] },
        { duration: 0.5 },
      );
  } else
    yesSeats.forEach((circle, i) =>
      setTimeout(() => circle.classList.add("v-dark"), reduced() ? 0 : i * 9),
    );
  box.style.opacity = "1";
  if (!reduced()) {
    spans.forEach((_, i) => setTimeout(() => shake(pass ? 2.5 : 3.5, 90), (i * 0.05 + 0.2) * 1000));
    await play(
      spans,
      { y: [-70, 0], scale: [1.9, 1], opacity: [0, 1] },
      { duration: 0.22, delay: stagger(0.05), ease: [0.6, 0, 1, 0.6] },
    );
    animate(score, { opacity: [0, 1], y: [8, 0] }, { duration: 0.25 });
  }
  const stageCentre = centre(find(main, "#stage"));
  const panels = [".top", ".rim-l", ".rim-r", "#stage", "#tagw", ".cmp"]
    .map((selector) => find(main, selector))
    .map((el) => ({
      el,
      distance: Math.hypot(centre(el).x - stageCentre.x, centre(el).y - stageCentre.y),
    }))
    .sort((a, b) => a.distance - b.distance);
  if (pass) {
    shake(9, 420);
    if (!reduced()) {
      panels.forEach((panel) =>
        animate(
          panel.el,
          { y: [0, -9, 0], scale: [1, 1.012, 1] },
          { duration: 0.75, delay: panel.distance / 1600, ease: [0.2, 0.9, 0.3, 1] },
        ),
      );
      const sweep = document.createElement("div");
      sweep.className = "sweep";
      desk.append(sweep);
      animate(sweep, { x: ["-60%", "160%"] }, { duration: 1.1, ease: [0.4, 0, 0.2, 1] }).then(() =>
        sweep.remove(),
      );
      const colours = [token("--accent"), token("--navy"), "#e9b949", token("--card")];
      const confetti = {
        count: 70,
        spread: 0.9,
        speed: 1100,
        gravity: 520,
        drag: 0.35,
        size: 5,
        shape: "fleck" as const,
        life: 2.4,
        colours,
      };
      burst(0, -10, { ...confetti, direction: Math.PI * 0.3 });
      burst(innerWidth, -10, { ...confetti, direction: Math.PI * 0.7 });
    }
  } else {
    shake(15, 520, [0, 1]);
    if (!reduced()) {
      panels.forEach((panel) =>
        animate(
          panel.el,
          { y: [0, 8, 3] },
          { duration: 0.55, delay: panel.distance / 2200, ease: [0.3, 0, 0.3, 1] },
        ),
      );
      main.animate(
        [
          { filter: "none" },
          { filter: "saturate(.3) brightness(.96)", offset: 0.15 },
          { filter: "saturate(.3) brightness(.96)", offset: 0.75 },
          { filter: "none" },
        ],
        { duration: 1700 },
      );
      const ink = token("--ink");
      let time = 0;
      addToLayer({
        step(seconds, context) {
          time += seconds;
          const progress = time / 1.7;
          if (progress > 1) return false;
          const edge = context.createRadialGradient(
            innerWidth / 2,
            innerHeight / 2,
            innerHeight * 0.3,
            innerWidth / 2,
            innerHeight / 2,
            innerHeight,
          );
          edge.addColorStop(0, "transparent");
          edge.addColorStop(1, ink);
          context.globalAlpha =
            0.4 *
            Math.sin((Math.min(1, progress * 1.6) * Math.PI) / 2) *
            (1 - Math.max(0, progress - 0.7) / 0.3);
          context.fillStyle = edge;
          context.fillRect(0, 0, innerWidth, innerHeight);
          context.globalAlpha = 1;
        },
      });
      spans
        .slice(-3)
        .forEach((letter, i) =>
          animate(
            letter,
            { rotate: [0, (i + 1) * 5], y: [0, (i + 1) * 4] },
            { duration: 0.6, delay: 0.15 + i * 0.08, ease: [0.5, 0, 0.7, 1] },
          ),
        );
    }
  }
  await sleep(1500);
  if (!reduced())
    panels.forEach((panel) => animate(panel.el, { y: 0, scale: 1 }, { duration: 0.4 }));
  await play(box, { opacity: 0, scale: 0.7 }, { duration: 0.3 });
  box.remove();
  find(main, ".hemi-w").classList.remove("dim");
  const verdictMark = document.createElement("span");
  verdictMark.className = pass ? "vmark" : "vmark fail";
  verdictMark.textContent = `${word} · ${verdict.yes} to ${verdict.no}`;
  find(main, "#stv").replaceChildren(verdictMark);
  if (!reduced()) {
    animate(verdictMark, { scale: [1.6, 1] }, { type: "spring", stiffness: 500, damping: 14 });
    animate(find(main, "#stage"), { scale: 1 }, { duration: 0.4 });
  }
}

/** A defeat: the knots fall off what they were tied to. */
export async function dropKnots(scene: Scene) {
  scene.main
    .querySelectorAll<HTMLElement>(".knot")
    .forEach((knot, i) =>
      reduced()
        ? knot.remove()
        : animate(
            knot,
            { y: [0, 28], opacity: [1, 0], rotate: [0, i % 2 ? 25 : -25] },
            { duration: 0.45, delay: i * 0.03 },
          ).then(() => knot.remove()),
    );
  await sleep(500);
}

/** Two requests' reviews as one: the same target keeps its first from and its last to, and both reasons. */
export function mergeReview(...lists: (ReviewLine[] | null | undefined)[]): ReviewLine[] {
  const merged = new Map<string, ReviewLine>();
  for (const line of lists.flatMap((list) => list ?? [])) {
    const key = `${line.target}:${line.id}`,
      earlier = merged.get(key);
    merged.set(
      key,
      earlier
        ? {
            ...line,
            from: earlier.from,
            delta: line.to - earlier.from,
            why: earlier.why === line.why ? line.why : `${earlier.why}; ${line.why}`,
          }
        : line,
    );
  }
  return [...merged.values()].filter((line) => line.delta !== 0);
}
