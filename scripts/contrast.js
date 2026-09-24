// The contrast audit scripts/desk-e2e.py runs in the page: every visible text node, and each empty input's placeholder,
// against the colour under it. Returns how many texts it checked and each one under 4.5:1.
(() => {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 1;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  const rgba = (css) => {
    context.clearRect(0, 0, 1, 1);
    context.fillStyle = "#000";
    context.fillStyle = css;
    context.fillRect(0, 0, 1, 1);
    const [r, g, b, a] = context.getImageData(0, 0, 1, 1).data;
    return [r, g, b, a / 255];
  };
  const over = (top, bottom) => {
    const a = top[3];
    return [0, 1, 2].map((i) => top[i] * a + bottom[i] * (1 - a)).concat(1);
  };
  const lum = ([r, g, b]) => {
    const f = (c) => ((c /= 255) <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  };
  const ratio = (x, y) => {
    const [a, b] = [lum(x), lum(y)].sort((p, q) => q - p);
    return (a + 0.05) / (b + 0.05);
  };
  const ground = (el) => {
    const chain = [];
    for (let node = el; node && node.nodeType === 1; node = node.parentElement) chain.unshift(node);
    let colour = rgba(getComputedStyle(document.body).backgroundColor);
    if (colour[3] < 1) colour = over(colour, [255, 255, 255, 1]);
    const mid = el.getBoundingClientRect();
    const x = mid.left + mid.width / 2,
      y = mid.top + mid.height / 2;
    for (const node of chain) {
      const box = node.getBoundingClientRect();
      // a ground only counts under the text: a marker the text floats beside is not behind it
      if (x < box.left || x > box.right || y < box.top || y > box.bottom) continue;
      const style = getComputedStyle(node);
      const fill = rgba(style.backgroundColor);
      if (fill[3] > 0) colour = over(fill, colour);
      // an opaque gradient (the receipt head): its darkest and lightest stops both sit under the text
      const stops = style.backgroundImage.includes("gradient(")
        ? (style.backgroundImage.match(/rgba?\([^)]*\)/g) ?? [])
            .map(rgba)
            .filter((stop) => stop[3] === 1)
        : [];
      if (stops.length >= 2 && !style.backgroundImage.includes("repeating")) return stops;
    }
    return [colour];
  };
  const opacity = (el) => {
    let value = 1;
    for (let node = el; node && node.nodeType === 1; node = node.parentElement)
      value *= Number(getComputedStyle(node).opacity);
    return value;
  };
  const failures = [];
  let checked = 0;
  const seen = new Set();
  const check = (el, colourCss, text) => {
    if (el.closest(":disabled, [aria-hidden=true], .scrim")) return;
    // a text fading in or out (a why-tag leaving, a review line arriving) is judged when it settles, not mid-fade
    for (let node = el; node && node.nodeType === 1; node = node.parentElement)
      if (node.getAnimations().some((animation) => animation.playState === "running")) return;
    if (!el.checkVisibility({ opacityProperty: true, visibilityProperty: true })) return;
    const box = el.getBoundingClientRect();
    if (!box.width || !box.height || box.bottom < 0 || box.top > innerHeight) return;
    const grounds = ground(el);
    const pairs = grounds.map((bg) => [
      over([...rgba(colourCss).slice(0, 3), rgba(colourCss)[3] * opacity(el)], bg),
      bg,
    ]);
    const [fg, bg] = pairs.reduce((worst, pair) =>
      ratio(...pair) < ratio(...worst) ? pair : worst,
    );
    const value = ratio(fg, bg);
    checked++;
    const key = `${el.className?.baseVal ?? el.className}|${text.slice(0, 30)}`;
    if (value < 4.5 && !seen.has(key)) {
      seen.add(key);
      const hex = (c) =>
        "#" +
        c
          .slice(0, 3)
          .map((v) => Math.round(v).toString(16).padStart(2, "0"))
          .join("");
      failures.push({
        text: text.trim().slice(0, 50),
        where:
          el.tagName.toLowerCase() +
          (el.id ? "#" + el.id : "") +
          "." +
          String(el.className?.baseVal ?? el.className)
            .split(" ")
            .join("."),
        fg: hex(fg),
        bg: hex(bg),
        ratio: Math.round(value * 100) / 100,
      });
    }
  };
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (!node.textContent.trim()) continue;
    const el = node.parentElement;
    if (!el || ["SCRIPT", "STYLE"].includes(el.tagName)) continue;
    const svg = el instanceof SVGElement;
    check(el, svg ? getComputedStyle(el).fill : getComputedStyle(el).color, node.textContent);
  }
  for (const input of document.querySelectorAll("input[placeholder]"))
    if (!input.value)
      check(input, getComputedStyle(input, "::placeholder").color, input.placeholder);
  return { checked, failures };
})();
