import type { KeyboardEvent, ReactNode } from "react";
import { Icon, type IconName } from "./icons";
import type { PinItem } from "./Peek";

export const TABS = ["feed", "country", "room", "record", "pinned"] as const;
export type Tab = (typeof TABS)[number];

const GLYPH: Record<Tab, IconName> = {
  feed: "post",
  country: "region",
  room: "seat",
  record: "vote",
  pinned: "pin",
};

export default function Rail({
  label,
  tab,
  onTab,
  unread,
  pins,
  onUnpin,
  children,
}: {
  label: Record<Tab, string>;
  tab: Tab;
  onTab: (t: Tab) => void;
  unread: string[];
  pins: PinItem[];
  onUnpin: (key: string) => void;
  children: ReactNode;
}) {
  const i = TABS.indexOf(tab);
  const keys = (e: KeyboardEvent<HTMLButtonElement>) => {
    const d = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
    const j = d
      ? (i + d + TABS.length) % TABS.length
      : e.key === "Home"
        ? 0
        : e.key === "End"
          ? TABS.length - 1
          : -1;
    if (j < 0) return;
    e.preventDefault();
    onTab(TABS[j]);
    document.getElementById(`tab-${TABS[j]}`)?.focus();
  };
  return (
    <>
      <div className="tabbar" role="tablist" aria-label="The rail">
        {TABS.map((t) => {
          const n = t === "pinned" ? pins.length : 0;
          const mark = unread.includes(t);
          return (
            <button
              key={t}
              id={`tab-${t}`}
              role="tab"
              aria-selected={tab === t}
              aria-controls={`panel-${t}`}
              tabIndex={tab === t ? 0 : -1}
              onKeyDown={keys}
              onClick={() => onTab(t)}
            >
              <Icon name={GLYPH[t]} sm />
              <span>{label[t]}</span>
              {n ? (
                <b className="badge num">{n}</b>
              ) : mark ? (
                <b className="badge dot" aria-label="new">
                  &nbsp;
                </b>
              ) : null}
            </button>
          );
        })}
      </div>
      <div className="railbody">
        <div
          className="tabpanel"
          role="tabpanel"
          id={`panel-${tab}`}
          aria-labelledby={`tab-${tab}`}
          tabIndex={0}
        >
          {tab === "pinned" ? (
            pins.length ? (
              pins.map((p) => (
                <div key={p.key} className={`pinned ${p.hue}`}>
                  <h4>{p.title}</h4>
                  {p.lines.map(([k, val], j) => (
                    <div key={j} className="line">
                      <span>{k}</span>
                      <b className="num">{val}</b>
                    </div>
                  ))}
                  <button className="unpin" onClick={() => onUnpin(p.key)}>
                    Unpin
                  </button>
                </div>
              ))
            ) : (
              <p className="note">
                Nothing pinned. Open a ledger or a holder, then press Pin to keep it here.
              </p>
            )
          ) : (
            children
          )}
        </div>
      </div>
    </>
  );
}
