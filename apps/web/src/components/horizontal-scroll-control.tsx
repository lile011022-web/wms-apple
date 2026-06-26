import { type RefObject, useCallback, useEffect, useState } from 'react';

type HorizontalScrollControlProps = {
  targetRef: RefObject<HTMLElement | null>;
};

export function HorizontalScrollControl({ targetRef }: HorizontalScrollControlProps) {
  const [scrollMax, setScrollMax] = useState(0);
  const [scrollLeft, setScrollLeft] = useState(0);

  const syncMetrics = useCallback(() => {
    const target = targetRef.current;
    if (!target) return;
    setScrollMax(Math.max(0, target.scrollWidth - target.clientWidth));
    setScrollLeft(target.scrollLeft);
  }, [targetRef]);

  useEffect(() => {
    const target = targetRef.current;
    if (!target) return undefined;

    syncMetrics();
    const handleScroll = () => setScrollLeft(target.scrollLeft);
    target.addEventListener('scroll', handleScroll);

    const resizeObserver = new ResizeObserver(syncMetrics);
    resizeObserver.observe(target);
    if (target.firstElementChild) {
      resizeObserver.observe(target.firstElementChild);
    }
    window.addEventListener('resize', syncMetrics);

    return () => {
      target.removeEventListener('scroll', handleScroll);
      resizeObserver.disconnect();
      window.removeEventListener('resize', syncMetrics);
    };
  }, [syncMetrics, targetRef]);

  if (scrollMax <= 1) {
    return null;
  }

  return (
    <div className="table-scroll-control">
      <input
        type="range"
        min={0}
        max={scrollMax}
        value={Math.min(scrollLeft, scrollMax)}
        aria-label="横向滑动表格"
        onChange={(event) => {
          const nextLeft = Number(event.target.value);
          setScrollLeft(nextLeft);
          if (targetRef.current) {
            targetRef.current.scrollLeft = nextLeft;
          }
        }}
      />
    </div>
  );
}
