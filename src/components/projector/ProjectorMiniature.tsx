import { useState, useRef, useEffect, useCallback } from 'react';
import { Monitor } from 'lucide-react';
import { getProjectorSettings, getResolvedTextColor } from '@/lib/projectorSettings';
import { getSongSlides, CHURCH_PRESET } from '@/lib/projectorLayout';
import type { Song } from '@/types/projector';

const PROJ_W = CHURCH_PRESET.resolution.width;
const PROJ_H = CHURCH_PRESET.resolution.height;
const PROJ_RATIO = PROJ_W / PROJ_H;

interface ProjectorMiniatureProps {
  text: string;
  isLive: boolean;
  projSettings: ReturnType<typeof getProjectorSettings>;
  playlistLength: number;
  currentSong: Song | null;
  currentVerseIndex: number;
  totalVerses: number;
}

export function ProjectorMiniature({ text, isLive, projSettings, playlistLength, currentSong, currentVerseIndex, totalVerses }: ProjectorMiniatureProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

  const recalc = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    const parentW = el.clientWidth - 16;
    const parentH = el.clientHeight - 16;
    if (parentW <= 0 || parentH <= 0) return;
    const parentRatio = parentW / parentH;
    const s = parentRatio > PROJ_RATIO ? parentH / PROJ_H : parentW / PROJ_W;
    setScale(s);
  }, []);

  useEffect(() => {
    recalc();
    const ro = new ResizeObserver(recalc);
    if (containerRef.current) ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, [recalc]);

  const textColorHex = getResolvedTextColor(projSettings);
  const shadowOpacity = projSettings.shadowIntensity / 10;
  const scaledW = PROJ_W * scale;
  const scaledH = PROJ_H * scale;

  return (
    <div ref={containerRef} className="w-full h-full flex items-center justify-center" style={{ background: '#111' }}>
      <div
        style={{
          width: scaledW, height: scaledH,
          border: '1px solid hsl(217 91% 60% / 0.25)', borderRadius: 4,
          overflow: 'hidden', position: 'relative', flexShrink: 0,
        }}
      >
        <div
          style={{
            width: PROJ_W, height: PROJ_H,
            transform: `scale(${scale})${projSettings.rotation !== 0 ? ` rotate(${projSettings.rotation}deg)` : ''}`,
            transformOrigin: 'top left',
            background: projSettings.background,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            overflow: 'hidden', padding: CHURCH_PRESET.containerPadding,
          }}
        >
          {isLive && text ? (
            <p lang="pl" style={{
              color: textColorHex, fontFamily: CHURCH_PRESET.fontFamily,
              fontWeight: CHURCH_PRESET.fontWeight, fontSize: `${projSettings.fontSize}px`,
              textAlign: CHURCH_PRESET.textAlign, lineHeight: CHURCH_PRESET.lineHeight,
              whiteSpace: CHURCH_PRESET.whiteSpace as any, textTransform: CHURCH_PRESET.textTransform as any,
              hyphens: CHURCH_PRESET.hyphens as any, WebkitHyphens: CHURCH_PRESET.hyphens as any,
              wordBreak: CHURCH_PRESET.wordBreak as any, overflowWrap: CHURCH_PRESET.overflowWrap as any,
              textShadow: `0 2px 10px rgba(0,0,0,${shadowOpacity})`,
              WebkitTextStroke: `${projSettings.strokeWidth}px ${CHURCH_PRESET.strokeColor}`,
              letterSpacing: `${CHURCH_PRESET.letterSpacingEm}em`,
              maxWidth: `${CHURCH_PRESET.textWidthPercent}%`, width: `${CHURCH_PRESET.textWidthPercent}%`,
              padding: 0, margin: 0,
            }}>{text}</p>
          ) : text && !isLive ? (
            <p lang="pl" style={{
              color: 'rgba(255,253,232,0.25)', fontFamily: CHURCH_PRESET.fontFamily,
              fontWeight: CHURCH_PRESET.fontWeight, fontSize: `${projSettings.fontSize}px`,
              textAlign: CHURCH_PRESET.textAlign, lineHeight: CHURCH_PRESET.lineHeight,
              whiteSpace: CHURCH_PRESET.whiteSpace as any, textTransform: CHURCH_PRESET.textTransform as any,
              letterSpacing: `${CHURCH_PRESET.letterSpacingEm}em`,
              maxWidth: `${CHURCH_PRESET.textWidthPercent}%`, width: `${CHURCH_PRESET.textWidthPercent}%`,
              padding: 0, margin: 0,
            }}>{text}</p>
          ) : (
            <div style={{ textAlign: 'center' }}>
              <Monitor style={{ width: 64, height: 64, margin: '0 auto 16px', color: '#333' }} />
              <p style={{ color: '#555', fontSize: 18 }}>
                {playlistLength > 0 ? 'Wybierz pieśń z harmonogramu' : 'Dodaj pieśni do harmonogramu'}
              </p>
            </div>
          )}
          {currentSong && (
            <div style={{
              position: 'absolute', bottom: 8, left: 16, fontSize: 14,
              color: isLive ? 'rgba(255,253,232,0.5)' : 'rgba(255,253,232,0.2)',
            }}>
              {currentSong.title} — {currentVerseIndex + 1}/{totalVerses}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
