import { AlertTriangle } from 'lucide-react';
import { sanitizeFormattedText } from '@/lib/textFormatting';
import { CHURCH_PRESET } from '@/lib/projectorLayout';

interface PreviewSection {
  label: string;
  type: string;
  sectionNumber: number;
  projector: {
    fitsSingleSlide: boolean;
    slideCount: number;
    slides: Array<{
      text: string;
      lineCount: number;
      slideNo: number;
      songSlideNo: number;
    }>;
  };
}

interface SongProjectorPreviewProps {
  projectorPreview: PreviewSection[];
  totalSlides: number;
  multiSlideWarnings: PreviewSection[];
}

export function SongProjectorPreview({ projectorPreview, totalSlides, multiSlideWarnings }: SongProjectorPreviewProps) {
  return (
    <div className="rounded-xl border border-border bg-black p-4 space-y-3">
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-medium text-white/60">Podgląd projektorowy — {totalSlides} slajdów</p>
        {multiSlideWarnings.length > 0 && (
          <p className="text-xs text-yellow-400 flex items-center gap-1">
            <AlertTriangle className="w-3 h-3" />
            {multiSlideWarnings.length} sekcji na 2+ slajdy
          </p>
        )}
      </div>
      {projectorPreview.map((section, si) => (
        <div key={si} className="space-y-1.5">
          <p className="text-[10px] text-white/40 uppercase tracking-wider">
            §{section.sectionNumber} {section.label} — {section.projector.slideCount} slajd{section.projector.slideCount > 1 ? 'ów' : ''}
            {!section.projector.fitsSingleSlide && (
              <span className="text-yellow-400 ml-2">⚠ wieloslajdowa</span>
            )}
          </p>
          {section.projector.slides.map((slide, slideIdx) => (
            <div
              key={slideIdx}
              className="rounded-lg bg-black border border-white/10 px-4 py-3 text-center"
              style={{
                fontFamily: CHURCH_PRESET.fontFamily,
                fontWeight: CHURCH_PRESET.fontWeight,
                fontSize: '14px',
                lineHeight: CHURCH_PRESET.lineHeight,
                color: '#fff',
                letterSpacing: `${CHURCH_PRESET.letterSpacingEm}em`,
                whiteSpace: 'pre-line',
              }}
            >
              {slide.text.includes('<') ? (
                <span dangerouslySetInnerHTML={{ __html: sanitizeFormattedText(slide.text).replace(/\n/g, '<br/>') }} />
              ) : (
                slide.text
              )}
              <p className="text-[9px] text-white/30 mt-1.5 font-sans font-normal">
                {slide.lineCount} linii • slajd {slide.slideNo}/{section.projector.slideCount}
                <span className="ml-2 text-white/20">({slide.songSlideNo}/{totalSlides})</span>
              </p>
            </div>
          ))}
        </div>
      ))}
      {projectorPreview.length === 0 && (
        <p className="text-xs text-white/30 text-center py-4">Dodaj tekst do zwrotek aby zobaczyć podgląd</p>
      )}
    </div>
  );
}
