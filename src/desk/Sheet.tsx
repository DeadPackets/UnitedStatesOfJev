// The resources sheet: three stat cards (P3 round 1 A) that slide in from the right on a spring, pips counting up in
// blocks of five; a change landing while it is open lights what filled or drained it. The In force block (not in the
// mock) lists the acts still running, with Withdraw where no one must agree.
import { useEffect, useLayoutEffect, useRef, type CSSProperties } from "react";
import type { ResourceCard, ReviewLine } from "../../worker/desk";
import type { InForce } from "../api";
import { meter, reduced, roll, signed, spring } from "./fx";
import { Icon, RESOURCE_ICON } from "./Icon";
import { Live } from "./Live";
import { RESOURCE_TOKEN } from "./paint";

/** Set while the sheet is open: a resource line landing paints its card. */
export let paintSheet: ((line: ReviewLine) => void) | null = null;
const pipsOn = (value: number) => Math.min(20, Math.round(value / 5));
const capitalise = (text: string) => (text ? text[0].toUpperCase() + text.slice(1) : text);

function paintCard(sheet: HTMLElement, line: ReviewLine) {
  if (line.target !== "resource") return;
  const card = sheet.querySelector<HTMLElement>(`.rk[data-k="${CSS.escape(line.id)}"]`);
  if (!card) return;
  const delta = line.to - line.from,
    was = pipsOn(line.from),
    now = pipsOn(line.to),
    pips = [...card.querySelectorAll<HTMLElement>(".pips i")];
  card.classList.toggle("z", line.to === 0);
  pips.forEach((pip, j) =>
    pip.style.setProperty(
      "--d",
      String(delta >= 0 ? Math.max(0, j - was) : Math.max(0, was - 1 - j)),
    ),
  );
  pips.forEach((pip, j) => pip.classList.toggle("on", j < now));
  roll(
    card.querySelector(".rk-h b")!,
    line.from,
    line.to,
    reduced() ? 0 : 200 + Math.abs(now - was) * 28,
  );
  if (!delta) return;
  const change = card.querySelector<HTMLElement>(".rk-h .dlt")!;
  change.textContent = signed(delta);
  change.className = `dlt num ${delta > 0 ? "up" : "dn"}`;
  const column = card.querySelector<HTMLElement>(delta > 0 ? ".in" : ".out")!;
  if (reduced()) {
    change.style.opacity = "1";
    column.classList.add("lit");
    return;
  }
  change.animate(
    [
      { opacity: 0, transform: "translateY(10px)" },
      { opacity: 1, transform: "none", offset: 0.15 },
      { opacity: 1, offset: 0.8 },
      { opacity: 0 },
    ],
    { duration: 2200 },
  );
  column.animate(
    [
      { backgroundColor: "transparent" },
      {
        backgroundColor: `color-mix(in srgb,var(--${delta > 0 ? "up" : "danger"}) 16%,transparent)`,
        offset: 0.2,
      },
      { backgroundColor: "transparent" },
    ],
    { duration: 1600, easing: "ease-out" },
  );
  card.animate(
    delta < 0
      ? [
          { transform: "none" },
          { transform: "translateX(-6px)" },
          { transform: "translateX(4px)" },
          { transform: "none" },
        ]
      : [
          { transform: "none" },
          { transform: "translateY(-4px) scale(1.012)" },
          { transform: "none" },
        ],
    { duration: 380 },
  );
}

type Props = {
  resources: ResourceCard[];
  turnWord: string;
  inForce: InForce[];
  onWithdraw: (id: string, button: HTMLElement) => void;
  onClose: () => void;
};

export function Sheet({ resources, turnWord, inForce, onWithdraw, onClose }: Props) {
  const sheet = useRef<HTMLElement>(null),
    scrim = useRef<HTMLDivElement>(null),
    closing = useRef(false);
  useLayoutEffect(() => {
    const el = sheet.current!,
      cards = el.querySelector<HTMLElement>(".rks")!;
    el.querySelector<HTMLElement>("#rs-x")!.focus({ preventScroll: true });
    // A short screen tightens the cards step by step before any text drops under 16 px.
    const over = () =>
      [...cards.querySelectorAll<HTMLElement>(".rk")].some(
        (card) => card.scrollHeight > card.clientHeight + 1,
      );
    for (const fit of ["f1", "f2", "f3", "f4"]) {
      if (!over()) break;
      cards.classList.add(fit);
    }
    paintSheet = (line) => paintCard(el, line);
    if (!reduced()) {
      scrim.current!.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 220 });
      meter("open resources", 1500);
      el.animate([{ transform: "translateX(105%)" }, { transform: "none" }], spring(210, 24));
      el.querySelectorAll<HTMLElement>(".rk").forEach((card, i) => {
        const value = resources[i].value,
          on = pipsOn(value),
          pips = [...card.querySelectorAll<HTMLElement>(".pips i")];
        card.animate(
          [
            { transform: "translateX(60px)", opacity: 0 },
            { transform: "none", opacity: 1 },
          ],
          {
            duration: 420,
            delay: 120 + i * 90,
            easing: "cubic-bezier(.22,1,.36,1)",
            fill: "backwards",
          },
        );
        pips.forEach((pip, j) => {
          pip.classList.remove("on");
          pip.style.setProperty("--d", String(j));
        });
        setTimeout(
          () => {
            pips.forEach((pip, j) => pip.classList.toggle("on", j < on));
            roll(card.querySelector(".rk-h b")!, 0, value, on * 28 + 200);
          },
          260 + i * 90,
        );
        card
          .querySelectorAll(".tr i")
          .forEach((bar, j) =>
            bar.animate([{ transform: "scaleY(0)" }, { transform: "none" }], {
              duration: 480,
              delay: 380 + i * 90 + j * 40,
              easing: "cubic-bezier(.22,1,.36,1)",
              fill: "backwards",
            }),
          );
      });
    }
    return () => {
      paintSheet = null;
    };
  }, []); // eslint-disable-line

  const close = () => {
    if (closing.current) return;
    closing.current = true;
    if (reduced()) return onClose();
    scrim.current!.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 220, fill: "forwards" });
    sheet
      .current!.animate([{ transform: "none" }, { transform: "translateX(105%)" }], {
        duration: 280,
        easing: "cubic-bezier(.5,0,.75,0)",
        fill: "forwards",
      })
      .finished.then(onClose);
  };
  useEffect(() => {
    const key = (event: KeyboardEvent) => event.key === "Escape" && close();
    addEventListener("keydown", key);
    return () => removeEventListener("keydown", key);
  }); // eslint-disable-line

  return (
    <>
      <div className="scrim" ref={scrim} onClick={close} />
      <section
        className="rsheet"
        role="dialog"
        aria-modal="true"
        aria-label="Resources"
        ref={sheet}
      >
        <header className="rs-h">
          <h2>Resources</h2>
          <button className="fc-x" id="rs-x" aria-label="Close resources" onClick={close}>
            <Icon id="i-x" />
          </button>
        </header>
        <div className="rks">
          {resources.map((card) => {
            const first = card.history[0],
              last = card.history.at(-1)!,
              top = Math.max(...card.history, 10),
              on = pipsOn(card.value);
            return (
              <article
                key={card.key}
                className={`rk${card.value === 0 ? " z" : ""}`}
                data-k={card.key}
                style={{ "--c": `var(--${RESOURCE_TOKEN[card.key]})` } as CSSProperties}
              >
                <div className="rk-h">
                  <span className="gem">
                    <Icon id={RESOURCE_ICON[card.icon]} />
                  </span>
                  <h3>{card.name}</h3>
                  <span className="dlt num" />
                  <Live className="num" text={card.value} />
                </div>
                <div className="rk-m">
                  <div>
                    <div className="pips" aria-hidden="true">
                      {Array.from({ length: 20 }, (_, i) => (
                        <i key={i} className={i < on ? "on" : ""} />
                      ))}
                    </div>
                    <div className="pk num">
                      <span>0</span>
                      <span>50</span>
                      <span>100</span>
                    </div>
                  </div>
                  <div>
                    <div
                      className="tr"
                      aria-label={`The last ${card.history.length} ${turnWord}s: ${card.history.join(", ")}`}
                    >
                      {card.history.map((value, i) => (
                        <i
                          key={i}
                          style={{ "--h": Math.max(4, (value / top) * 100) } as CSSProperties}
                        />
                      ))}
                    </div>
                    <div className="trc">
                      {card.history.length} {turnWord}
                      {card.history.length === 1 ? "" : "s"}{" "}
                      <b className="num">{signed(last - first) || "±0"}</b>
                    </div>
                  </div>
                </div>
                <div className="rk-g">
                  <div className="in">
                    <h4>
                      <Icon id="i-arrow" />
                      Fills it
                    </h4>
                    <ul>
                      {card.earn.map((line) => (
                        <li key={line}>{line}</li>
                      ))}
                    </ul>
                  </div>
                  <div className="out">
                    <h4>
                      <Icon id="i-lose" />
                      Drains it
                    </h4>
                    <ul>
                      {card.spend.map((line) => (
                        <li key={line}>{line}</li>
                      ))}
                    </ul>
                  </div>
                </div>
                {card.fails ? (
                  <p className="zero">
                    <b>At 0</b>
                    <span>{capitalise(card.fails)}</span>
                  </p>
                ) : null}
              </article>
            );
          })}
          {inForce.length ? (
            <section className="rinf">
              <h4 className="kicker">In force</h4>
              <ul>
                {inForce.map((act) => (
                  <li key={act.id}>
                    <span>{act.title}</span>
                    {act.repealVetoes.length ? (
                      <small>needs a repeal</small>
                    ) : (
                      <button
                        className="btn"
                        onClick={(event) => onWithdraw(act.id, event.currentTarget)}
                      >
                        Withdraw
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>
      </section>
    </>
  );
}
