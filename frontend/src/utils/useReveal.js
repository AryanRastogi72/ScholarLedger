import { useEffect, useRef } from 'react';

// Moves focus to the returned ref and scrolls it into view when `trigger` becomes truthy or changes.
// Needed on small screens, where a result can render below the fold.
export function useReveal(trigger) {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (!trigger || !el) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    el.focus({ preventScroll: true });
    el.scrollIntoView({ block: 'start', behavior: reduce ? 'auto' : 'smooth' });
  }, [trigger]);
  return ref;
}
