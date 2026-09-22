import { useState } from "react";
import { api, ApiError, type GameView, type ViewBill } from "./api";
import type { Act } from "./App";

const LIMIT = 240;
type Post = GameView["posts"][number];

const REACTIONS: { mark: string; label: string; of: (p: Post) => number }[] = [
  { mark: "✓", label: "likes", of: (p) => p.likes },
  { mark: "✕", label: "boos", of: (p) => p.boos },
  { mark: "↗", label: "shares", of: (p) => p.shares },
  { mark: "○", label: "quiet", of: (p) => p.ignores },
];

/** The four counts as ink marks, 60 ms apart. */
function Reactions({ post }: { post: Post }) {
  return (
    <span className="reacts">
      {REACTIONS.map((r, i) => (
        <span key={r.label} className="react rise" style={{ animationDelay: `${i * 60}ms` }}>
          <i aria-hidden="true">{r.mark}</i><b className="num">{r.of(post)}</b><span className="sr">{r.label}</span>
        </span>
      ))}
    </span>
  );
}

/** The duel, once the sample answered. A failed reply call leaves no rival and no sample. */
function Duel({ post, v }: { post: Post; v: GameView["pack"]["vocabulary"] }) {
  const n = post.agree.mine + post.agree.rival;
  if (!n) return null;
  return <span className={`stampsm tiny ${post.won ? "pass" : "fail"}`}>{post.won ? v.pass : v.fail} {post.agree.mine} of {n}</span>;
}

/** The one line the Turn tab shows under the bill card, for the bill on the desk. */
export function FeedLine({ game, bill }: { game: GameView; bill?: ViewBill }) {
  const v = game.pack.vocabulary;
  const post = game.posts.find((p) => p.turn === (bill?.id ?? game.turn));
  if (!post) return <p className="small muted feedline">Nothing sent this {v.turn}.</p>;
  return <p className="small feedline"><Reactions post={post} /><Duel post={post} v={v} /></p>;
}

export default function Feed({ game, bill, act, busy }: { game: GameView; bill?: ViewBill; act: Act; busy: boolean }) {
  const v = game.pack.vocabulary;
  const [text, setText] = useState("");
  // The box belongs to the bill on the desk: the vote shuts it, and clearing the desk opens the next one.
  const turn = bill?.id ?? game.turn;
  const sent = game.posts.some((p) => p.turn === turn);
  const shut = sent || game.stage !== "session" || !!bill?.votes;
  const left = LIMIT - text.length;
  const region = (id: string) => game.pack.regions.find((r) => r.id === id)?.name ?? id;
  const home = (name: string) => { const c = game.citizens.find((x) => x.name === name); return c ? `${name}, ${region(c.region)}` : name; };
  const send = async () => {
    if (await act(() => api.price(game, text.trim(), "proclaim").then((v) => { if (v.refusal) throw new ApiError(409, v.refusal.line); return api.act(game); }))) setText("");
  };

  return (
    <div className="feed">
      <div className="panel">
        <label className="kicker" htmlFor="post" style={{ display: "block", marginBottom: 8 }}>{v.post}</label>
        <textarea id="post" value={text} rows={3} maxLength={LIMIT} disabled={shut} aria-describedby="postleft"
          placeholder={`Up to ${LIMIT} characters. Optional.`} onChange={(e) => setText(e.target.value)} />
        <div className="actions">
          <button className={`btn ${busy ? "busy" : ""}`} disabled={busy || shut || !text.trim()} onClick={send}>
            {busy ? "Sending" : v.post}
          </button>
          <span id="postleft" className={`small num ${left < 20 ? "fail" : "muted"}`}>{left}<span className="sr"> characters left</span></span>
        </div>
      </div>

      {[...game.posts].reverse().map((p) => (
        <article key={p.turn} className="post panel rise">
          <div className="kicker num">{v.turn} {p.turn}</div>
          <p className="lede" style={{ margin: "6px 0 10px" }}>{p.text}</p>
          <Reactions post={p} />
          {p.hot.length ? <p className="small muted" style={{ margin: "8px 0 0" }}>Loud in {p.hot.map(region).join(", ")}.</p> : null}
          {p.replies.length ? (
            <div className="quotes" style={{ marginTop: 12 }}>
              {p.replies.map((r, i) => (
                <blockquote key={r.name} className="pull rise" style={{ animationDelay: `${240 + i * 60}ms` }}>
                  {r.text}<cite>{home(r.name)}</cite>
                </blockquote>
              ))}
            </div>
          ) : null}
          {p.rival ? (
            <div className="rivalpost rise" style={{ animationDelay: "420ms" }}>
              <div className="kicker">The other side</div>
              <p style={{ margin: "4px 0 0" }}>{p.rival}</p>
            </div>
          ) : null}
          <div style={{ marginTop: 12 }}><Duel post={p} v={v} /></div>
        </article>
      ))}
    </div>
  );
}
