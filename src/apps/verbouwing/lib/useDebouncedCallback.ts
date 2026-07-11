import { useEffect, useMemo, useRef } from "react";

/**
 * Debounced wrapper: opeenvolgende aanroepen binnen `delay` ms vallen samen tot
 * één. Gebruikt om de realtime-herlaad te coalesceren — één opgeslagen split
 * vuurt meerdere expense/part/receipt-events af, maar dat hoeft maar één
 * herlaad op te leveren.
 */
export function useDebouncedCallback(fn: () => void, delay = 300): () => void {
  const fnRef = useRef(fn);
  useEffect(() => {
    fnRef.current = fn;
  }, [fn]);

  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const debounced = useMemo(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => fnRef.current(), delay);
    },
    [delay],
  );

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  return debounced;
}
