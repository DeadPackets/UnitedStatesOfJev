// Six cues, all synthesized. Off until the first user gesture (autoplay policy); mute persists per browser.
let ctx: AudioContext | null = null;
const get = () => (ctx ??= new AudioContext());
export const sound = {
  get muted() {
    try {
      return localStorage.getItem("usoj:mute") === "1";
    } catch {
      return false;
    }
  },
  set muted(v: boolean) {
    try {
      localStorage.setItem("usoj:mute", v ? "1" : "0");
    } catch {}
  },
  unlock() {
    try {
      const c = get();
      if (c.state === "suspended") c.resume();
    } catch {}
  },
  play(
    name: "tick" | "chime" | "click" | "gavel" | "thud" | "slide",
    opt: { pitch?: number } = {},
  ) {
    if (sound.muted) return;
    try {
      CUES[name](get(), opt.pitch ?? 0);
    } catch {}
  },
};

function tone(
  c: AudioContext,
  freq: number,
  dur: number,
  type: OscillatorType,
  gain = 0.08,
  at = 0,
) {
  const o = c.createOscillator(),
    g = c.createGain(),
    t = c.currentTime + at;
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(gain, t + 0.005);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(c.destination);
  o.start(t);
  o.stop(t + dur + 0.02);
}
function noise(c: AudioContext, dur: number, cutoff: number, gain: number, at = 0) {
  const n = Math.floor(c.sampleRate * dur),
    buf = c.createBuffer(1, n, c.sampleRate),
    d = buf.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n) ** 2;
  const s = c.createBufferSource(),
    f = c.createBiquadFilter(),
    g = c.createGain(),
    t = c.currentTime + at;
  s.buffer = buf;
  f.type = "lowpass";
  f.frequency.value = cutoff;
  g.gain.value = gain;
  s.connect(f).connect(g).connect(c.destination);
  s.start(t);
}
const CUES: Record<string, (c: AudioContext, pitch: number) => void> = {
  tick: (c, p) => tone(c, 520 + p * 6, 0.05, "square", 0.025),
  chime: (c) => {
    tone(c, 660, 0.25, "sine", 0.06);
    tone(c, 990, 0.35, "sine", 0.05, 0.09);
  },
  click: (c) => tone(c, 1400, 0.03, "triangle", 0.05),
  gavel: (c) => {
    noise(c, 0.09, 900, 0.9);
    tone(c, 180, 0.12, "sine", 0.15);
    noise(c, 0.09, 900, 0.7, 0.16);
    tone(c, 170, 0.12, "sine", 0.12, 0.16);
  },
  thud: (c) => {
    tone(c, 90, 0.35, "sine", 0.18);
    noise(c, 0.2, 300, 0.4);
  },
  slide: (c) => noise(c, 0.25, 2500, 0.12),
};
