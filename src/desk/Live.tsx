// Text the desk's moments also write by hand. React sets it only when the value changes, through textContent, so a
// roll in flight is never overwritten and React never loses its own text node to a moment.
import { createElement, useLayoutEffect, useRef } from "react";

export function Live({
  as = "b",
  className,
  text,
}: {
  as?: "b" | "span";
  className?: string;
  text: string | number;
}) {
  const ref = useRef<HTMLElement>(null);
  useLayoutEffect(() => {
    if (ref.current) ref.current.textContent = String(text);
  }, [text]);
  return createElement(as, { ref, className });
}
