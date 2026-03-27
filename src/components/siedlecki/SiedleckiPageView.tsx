import { useRef, useEffect, useCallback } from 'react';

interface Props {
  leftSrc: string;
  rightSrc: string;
  showRight: boolean;
  zoom: number;
  animClass: { left: string; right: string };
  onNext: () => void;
  onPrev: () => void;
  onAutoZoom: (zoom: number) => void;
}

export function SiedleckiPageView({ leftSrc, rightSrc, showRight, zoom, animClass, onNext, onPrev, onAutoZoom }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const touchXRef = useRef<number | null>(null);

  const calcAutoZoom = useCallback(() => {
    const container = wrapRef.current;
    const inner = innerRef.current;
    if (!container || !inner) return;
    inner.style.transform = 'scale(1)';
    const contentW = inner.scrollWidth;
    const contentH = inner.scrollHeight;
    const isMobile = window.innerWidth <= 768;
    const pad = isMobile ? 12 : 28;
    const availW = container.clientWidth - pad;
    const availH = container.clientHeight - pad;
    const fit = Math.min(availW / contentW, availH / contentH);
    const clamped = Math.max(0.5, Math.min(2.2, +fit.toFixed(2)));
    inner.style.transform = `scale(${clamped})`;
    onAutoZoom(clamped);
  }, [onAutoZoom]);

  useEffect(() => {
    calcAutoZoom();
    const observer = new ResizeObserver(() => calcAutoZoom());
    if (wrapRef.current) observer.observe(wrapRef.current);
    return () => observer.disconnect();
  }, [calcAutoZoom]);

  useEffect(() => {
    if (wrapRef.current) {
      wrapRef.current.scrollTop = 0;
      wrapRef.current.scrollLeft = 0;
    }
  }, [leftSrc]);

  const handleTouchStart = (e: React.TouchEvent) => { touchXRef.current = e.changedTouches[0].clientX; };
  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchXRef.current === null) return;
    const dx = e.changedTouches[0].clientX - touchXRef.current;
    if (dx < -50) onNext();
    if (dx > 50) onPrev();
    touchXRef.current = null;
  };

  return (
    <div
      ref={wrapRef}
      className="overflow-auto p-3.5 h-full max-[768px]:p-1.5"
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      <div
        ref={innerRef}
        className="grid grid-cols-2 gap-3.5 items-start min-w-[820px] max-w-[2200px] mx-auto
          max-[1100px]:min-w-[720px]
          max-[768px]:grid-cols-1 max-[768px]:min-w-0 max-[768px]:gap-2"
        style={{ transform: `scale(${zoom})`, transformOrigin: 'top center' }}
      >
        <div className={`bg-muted rounded-[14px] shadow-[0_12px_34px_rgba(0,0,0,0.35)] p-2.5 overflow-hidden ${animClass.left}`}>
          <img src={leftSrc} alt="Strona lewa" className="block w-full h-auto rounded-lg bg-white" loading="eager" />
        </div>
        <div className={`bg-muted rounded-[14px] shadow-[0_12px_34px_rgba(0,0,0,0.35)] p-2.5 overflow-hidden ${animClass.right} ${!showRight ? 'invisible' : ''} max-[768px]:hidden`}>
          <img src={rightSrc} alt="Strona prawa" className="block w-full h-auto rounded-lg bg-white" loading="eager" />
        </div>
      </div>
    </div>
  );
}
