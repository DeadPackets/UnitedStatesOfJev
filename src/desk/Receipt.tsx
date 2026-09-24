// The clerk's receipt: a printer head across the slot and three or four stubs that feed out line by line; each line's
// knot lands on the element it moves (no threads, desk feedback 1). The printing is the mock's price() moment.
import { useLayoutEffect, useMemo, useRef } from "react";
import type { DeskView, Floor, Receipt as ReceiptView, ReceiptLine } from "../../worker/desk";
import { fpsStart, fpsStop, play, reduced, scale, sfx, signed, sleep, Stale } from "./fx";
import { Icon } from "./Icon";
import { clearMarks, lockRow, paintKnot, targetOf } from "./paint";

type Props = {
  receipt: ReceiptView;
  words: DeskView["vocabulary"];
  chamberRow: string | null; // the group a law's chamber is on the rim, for its lock badge
  size: number;
  printing: boolean;
  busy: boolean; // a moment runs: nothing on the receipt answers
  signable: boolean;
  onPrinted: () => void;
  onReveal: () => void; // the count reaches the chamber
  onSign: () => void;
  onTear: () => void;
  onAmend?: () => void; // a law short of its count: table it and ask the clerks for drafts
};

const keyOf = (stage: string, line: ReceiptLine) => `${stage}:${line.target}:${line.id}`;

async function print(box: HTMLElement, tie: (row: HTMLElement) => void) {
  const head = box.querySelector<HTMLElement>(".head")!,
    lights = [...head.querySelectorAll("i")];
  fpsStart("pricing");
  sfx("printer");
  if (!reduced()) await play(head, { y: [-18, 0], opacity: [0, 1] }, { duration: 0.22 });
  const papers = [...box.querySelectorAll<HTMLElement>(".paper")];
  const rows = papers.map((paper) => [...paper.children] as HTMLElement[]);
  const longest = Math.max(...rows.map((row) => row.length));
  for (let k = 1; k <= longest; k++) {
    lights.forEach((light, i) => light.classList.toggle("on", (k + i) % 2 === 0));
    papers.forEach((paper, j) => {
      if (k > rows[j].length) return;
      const line = rows[j][k - 1];
      const bottom = line.offsetTop + line.offsetHeight + (k === rows[j].length ? 14 * scale() : 0);
      paper.style.clipPath = `inset(0 0 calc(100% - ${bottom}px) 0)`;
      if (!reduced()) play(paper, { y: [-2, 0] }, { duration: 0.08 }).catch(() => {});
      if (line.dataset.tie)
        sleep(reduced() ? 0 : 220).then(
          () => tie(line),
          () => {},
        );
    });
    sfx("feed");
    await sleep(reduced() ? 0 : 95);
  }
  for (const paper of papers) paper.style.clipPath = "none";
  for (const light of lights) light.classList.remove("on");
  await sleep(1100);
  fpsStop();
}

const theChamber = (label: string) => (/^the /i.test(label) ? label : `The ${label}`);
const tally = (count: NonNullable<ReceiptView["count"]>) => ({
  for: count.factions.reduce((sum, f) => sum + f.for, 0),
  hesitant: count.factions.reduce((sum, f) => sum + f.hesitant, 0),
  against: count.factions.reduce((sum, f) => sum + f.against, 0),
});

export function Receipt({
  receipt,
  words,
  chamberRow,
  size,
  printing,
  busy,
  signable,
  onPrinted,
  onReveal,
  onSign,
  onTear,
  onAmend,
}: Props) {
  const box = useRef<HTMLDivElement>(null);
  const law = receipt.verb === "law";
  const lines = useMemo(() => {
    const all = new Map<string, ReceiptLine>();
    for (const stage of ["now", "pass", "fail"] as const)
      for (const line of receipt[stage]) all.set(keyOf(stage, line), line);
    return all;
  }, [receipt]);

  useLayoutEffect(() => {
    const root = box.current!,
      main = root.closest<HTMLElement>(".dk")!;
    const tie = (row: HTMLElement, animated: boolean) => {
      const key = row.dataset.k!;
      if (key === "ch") return animated && onReveal();
      if (key === "veto") {
        const ids = law ? (chamberRow ? [chamberRow] : []) : receipt.vetoes.map((veto) => veto.id);
        for (const id of ids) {
          const target = targetOf(main, { target: "group", id });
          const refuses = !law && receipt.vetoes.some((veto) => veto.id === id && !veto.agrees);
          if (target) lockRow(target, refuses, animated);
        }
        return;
      }
      const line = lines.get(key),
        target = line && targetOf(main, line);
      if (line && target) paintKnot(target, line.delta, animated);
    };
    if (!printing) {
      clearMarks(main);
      for (const paper of root.querySelectorAll<HTMLElement>(".paper"))
        paper.style.clipPath = "none";
      for (const row of root.querySelectorAll<HTMLElement>("[data-tie]")) tie(row, false);
      return;
    }
    print(root, (row) => tie(row, true)).then(onPrinted, (error) => {
      if (!(error instanceof Stale)) throw error;
    });
  }, [receipt, printing]); // eslint-disable-line

  const passWord = words.pass === "passed" ? "passes" : `is ${words.pass}`;
  const failWord = words.fail === "failed" ? "fails" : `is ${words.fail}`;
  const row = (stage: string, line: ReceiptLine, tie: boolean) => (
    <div
      key={keyOf(stage, line)}
      className={`rl ${stage === "fail" ? "bad" : line.delta > 0 ? "up" : "dn"}`}
      data-k={keyOf(stage, line)}
      data-tie={tie ? "1" : undefined}
    >
      <span className="nm">{line.name}</span>
      <span className="ld" />
      <b>{signed(line.delta)}</b>
      {tie ? <i className="kn" /> : null}
    </div>
  );
  const charge = receipt.now.filter((line) => line.target === "resource" && line.delta < 0);
  const lands = receipt.now.filter(
    (line) => !(line.target === "resource" && line.delta < 0) && line.target !== "group",
  );
  const groups = receipt.now.filter((line) => line.target === "group");
  const count = receipt.count;
  const mustAgree = law ? (
    <div className="rl" data-k="veto" data-tie="1">
      <span className="nm">{theChamber(count?.label ?? "chamber")}</span>
      <span className="ld" />
      <b>
        {count?.need ?? "?"} of {size}
      </b>
      <i className="kn" />
    </div>
  ) : receipt.vetoes.length ? (
    receipt.vetoes.map((veto) => (
      <div key={veto.id} className={`rl${veto.agrees ? "" : " bad"}`} data-k="veto" data-tie="1">
        <span className="nm">{veto.name}</span>
        <span className="ld" />
        <b>{veto.agrees ? "agrees" : "refuses"}</b>
        <i className="kn" />
      </div>
    ))
  ) : (
    <div className="rl">
      <span className="nm">No one</span>
    </div>
  );

  return (
    <div className={law ? "rc" : "rc act"} id="pb" ref={box}>
      <div className="head">
        <i />
        <i />
        <span>The clerk's receipt · {receipt.title}</span>
      </div>
      <div className="stub">
        <div className="paper">
          <h5>Spent when you sign</h5>
          {charge.map((line) => row("now", line, false))}
          <h5>Must agree</h5>
          {mustAgree}
        </div>
      </div>
      <div className="stub">
        <div className="paper">
          {law ? (
            <>
              <h5>If it {passWord}</h5>
              {receipt.pass
                .filter((line) => line.target !== "group")
                .map((line) => row("pass", line, true))}
              {count ? (
                <>
                  <h5>The chamber, need {count.need}</h5>
                  <div className="rl" data-k="ch" data-tie="1">
                    <span className="nm">
                      {tally(count).for} for, {tally(count).hesitant} hesitant
                    </span>
                    <span className="ld" />
                    <b>{tally(count).against} against</b>
                    <i className="kn" />
                  </div>
                </>
              ) : null}
            </>
          ) : (
            <>
              <h5>When you sign</h5>
              {lands.length ? (
                lands.map((line) => row("now", line, true))
              ) : (
                <div className="rl">
                  <span className="nm">Nothing else moves</span>
                </div>
              )}
            </>
          )}
        </div>
      </div>
      <div className="stub">
        <div className="paper">
          <h5>Support, when you sign</h5>
          {groups.map((line) => row("now", line, true))}
          {law && receipt.pass.some((line) => line.target === "group") ? (
            <>
              <h5>Support, if it {passWord}</h5>
              {receipt.pass
                .filter((line) => line.target === "group")
                .map((line) => row("pass", line, true))}
            </>
          ) : null}
        </div>
      </div>
      {law ? (
        <div className="stub">
          <div className="paper">
            <h5>If it {failWord}</h5>
            {receipt.fail.map((line) => row("fail", line, false))}
          </div>
        </div>
      ) : null}
      <div className="acts">
        <button
          className="btn accent"
          id="sign"
          disabled={!signable}
          title={receipt.blocked ? `${receipt.blocked.name}: ${receipt.blocked.reason}` : undefined}
          onClick={onSign}
        >
          <i className="chg" />
          <Icon id="i-pen" />
          Sign it
        </button>
        <button className="btn" id="tear" disabled={busy} onClick={onTear}>
          Tear up
        </button>
        {onAmend && count && tally(count).for < count.need ? (
          <button
            className="btn"
            id="amend"
            title="Tables it now and asks the clerks for three drafts"
            disabled={busy}
            onClick={onAmend}
          >
            Amend
          </button>
        ) : null}
      </div>
    </div>
  );
}

type FloorProps = {
  floor: Floor;
  size: number;
  busy: boolean;
  onVote: () => void;
  onAmend: () => void;
  onAdopt: (draft: number) => void;
};

/** A law signed and waiting for its vote (not in the mock): the clerks' drafts as stubs, Amend once, Call the vote. */
export function FloorSlip({ floor, size, busy, onVote, onAmend, onAdopt }: FloorProps) {
  const count = floor.count;
  return (
    <div className="rc floor" id="pb">
      <div className="head">
        <i />
        <i />
        <span>The clerk's receipt · {floor.title}</span>
      </div>
      {floor.drafts?.length ? (
        floor.drafts.map((draft, i) => (
          <div className="stub" key={draft.title}>
            <div className="paper" title={draft.summary}>
              <h5>Draft {i + 1}</h5>
              <div className="rl">
                <span className="nm">{draft.title}</span>
              </div>
              <div className="rl">
                <span className="nm">Expected</span>
                <span className="ld" />
                <b>{draft.expected} for</b>
              </div>
              <button className="btn term" disabled={busy} onClick={() => onAdopt(i)}>
                Adopt
              </button>
            </div>
          </div>
        ))
      ) : (
        <div className="stub wait">
          <div className="paper">
            <h5>Waits for its vote</h5>
            {count ? (
              <div className="rl">
                <span className="nm">
                  {tally(count).for} for, {tally(count).hesitant} hesitant
                </span>
                <span className="ld" />
                <b>{tally(count).against} against</b>
              </div>
            ) : null}
            <div className="rl">
              <span className="nm">Need</span>
              <span className="ld" />
              <b>
                {count?.need ?? "?"} of {size}
              </b>
            </div>
            <div className="rl">
              <span className="nm">Click a seat to lobby it</span>
            </div>
          </div>
        </div>
      )}
      <div className="acts">
        <button className="btn accent" id="callvote" disabled={busy} onClick={onVote}>
          <Icon id="i-ballot" />
          Call the vote
        </button>
        {floor.drafts === null ? (
          <button className="btn" id="amend" disabled={busy} onClick={onAmend}>
            Amend
          </button>
        ) : null}
      </div>
    </div>
  );
}
