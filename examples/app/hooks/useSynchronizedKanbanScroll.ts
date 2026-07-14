"use client";

import { useEffect, useRef, useState } from "react";

type UseSynchronizedKanbanScrollOptions = {
  enabled: boolean;
  dependencyKey: string;
};

export function useSynchronizedKanbanScroll({
  enabled,
  dependencyKey,
}: UseSynchronizedKanbanScrollOptions) {
  const boardRef = useRef<HTMLElement | null>(null);
  const topScrollRef = useRef<HTMLDivElement | null>(null);
  const syncingRef = useRef(false);
  const [scrollWidth, setScrollWidth] = useState(0);

  useEffect(() => {
    if (!enabled) return;

    const board = boardRef.current;
    const topScroll = topScrollRef.current;
    if (!board || !topScroll) return;

    const update = () => {
      setScrollWidth(board.scrollWidth);
      topScroll.scrollLeft = board.scrollLeft;
    };

    const animationFrame = window.requestAnimationFrame(update);
    const resizeObserver = new ResizeObserver(update);
    resizeObserver.observe(board);
    Array.from(board.children).forEach((child) => resizeObserver.observe(child));
    window.addEventListener("resize", update);

    return () => {
      window.cancelAnimationFrame(animationFrame);
      resizeObserver.disconnect();
      window.removeEventListener("resize", update);
    };
  }, [enabled, dependencyKey]);

  function synchronize(source: HTMLElement | null, target: HTMLElement | null) {
    if (!source || !target || syncingRef.current) return;

    syncingRef.current = true;
    target.scrollLeft = source.scrollLeft;
    window.requestAnimationFrame(() => {
      syncingRef.current = false;
    });
  }

  return {
    boardRef,
    topScrollRef,
    scrollWidth,
    synchronize,
  };
}
