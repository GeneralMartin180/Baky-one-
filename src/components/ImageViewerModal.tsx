import { useState, useEffect } from 'react';
import { useDialog } from './useDialog';
import {
  X,
  ExternalLink,
  ChevronLeft,
  ChevronRight,
  Maximize2,
  Minimize2,
  Share2,
} from 'lucide-react';
import { SearchResult, AppSettings } from '../types';

interface ImageViewerModalProps {
  images: SearchResult[];
  initialIndex: number;
  onClose: () => void;
  settings: AppSettings;
}

export default function ImageViewerModal({
  images,
  initialIndex,
  onClose,
  settings,
}: ImageViewerModalProps) {
  const dialogRef = useDialog(onClose);
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [isFullScreen, setIsFullScreen] = useState(false);
  const [imgLoaded, setImgLoaded] = useState(false);
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState(false);

  const currentImage = images[currentIndex];

  useEffect(() => { setCopied(false); setCopyError(false); }, [currentImage?.url]);
  useEffect(() => {
    if (!copied) return;
    const timeout = window.setTimeout(() => setCopied(false), 2000);
    return () => window.clearTimeout(timeout);
  }, [copied]);

  const handlePrev = () => {
    setImgLoaded(false);
    setCurrentIndex((prev) => (prev > 0 ? prev - 1 : images.length - 1));
  };

  const handleNext = () => {
    setImgLoaded(false);
    setCurrentIndex((prev) => (prev < images.length - 1 ? prev + 1 : 0));
  };

  // Keyboard navigation (Esc to close, Left/Right arrows)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        handlePrev();
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        handleNext();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [images.length]);

  useEffect(() => {
    const sync = () => setIsFullScreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', sync);
    return () => {
      document.removeEventListener('fullscreenchange', sync);
      if (document.fullscreenElement && document.exitFullscreen) document.exitFullscreen().catch(() => {});
    };
  }, []);

  const toggleFullScreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen?.().catch(() => {});
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen().catch(() => {});
      }
    }
  };

  const handleShare = async () => {
    if (!currentImage) return;
    setCopied(false);
    setCopyError(false);
    try {
      if (!navigator.clipboard) throw new Error('Clipboard unavailable');
      await navigator.clipboard.writeText(currentImage.url);
      setCopied(true);
    } catch { setCopyError(true); }
  };

  if (!currentImage) return null;

  return (
    <div
      id="image-fullscreen-modal"
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-label="Prehliadač obrázkov"
      tabIndex={-1}
      className="fixed inset-0 z-50 bg-[#111214]/95 backdrop-blur-md flex flex-col select-none animate-in fade-in duration-200"
    >
      {/* Top action bar */}
      <header className="flex flex-wrap gap-2 items-center justify-between px-3 sm:px-6 py-3 border-b border-white/10 bg-black/30 shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <span className="text-white/80 text-xs font-mono bg-white/10 px-2.5 py-1 rounded-full">
            {currentIndex + 1} / {images.length}
          </span>
          <h2 className="text-white text-sm font-medium truncate max-w-[280px] sm:max-w-md md:max-w-lg">
            {currentImage.title}
          </h2>
        </div>

        <div className="flex flex-wrap items-center gap-1 sm:gap-2 min-w-0">
          <button
            type="button"
            onClick={handleShare}
            className="p-2 text-white/70 hover:text-white hover:bg-white/10 rounded-full transition-colors cursor-pointer"
            title="Kopírovať odkaz"
            aria-label="Kopírovať odkaz"
          >
            <Share2 className="w-4.5 h-4.5" />
          </button>

          <button
            type="button"
            onClick={toggleFullScreen}
            disabled={!document.documentElement.requestFullscreen}
            className="p-2 text-white/70 hover:text-white hover:bg-white/10 rounded-full transition-colors cursor-pointer disabled:opacity-40"
            title={isFullScreen ? 'Ukončiť celú obrazovku' : 'Celá obrazovka'}
          >
            {isFullScreen ? (
              <Minimize2 className="w-4.5 h-4.5" />
            ) : (
              <Maximize2 className="w-4.5 h-4.5" />
            )}
          </button>

          <a
            href={currentImage.url}
            target={settings.openInNewTab ? '_blank' : '_self'}
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-xs font-medium text-white bg-[#1a73e8] hover:bg-[#1558d6] px-3 py-1.5 rounded-full transition-colors"
          >
            <span>Zdrojový web</span>
            <ExternalLink className="w-3 h-3" />
          </a>

          <button
            type="button"
            onClick={onClose}
            className="p-2 text-white/80 hover:text-white hover:bg-white/10 rounded-full transition-colors cursor-pointer ml-1"
            title="Zavrieť (Esc)"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </header>

      {copyError && <div role="alert" className="border-b border-white/10 bg-black/60 px-4 py-3 text-xs text-white">
        <p className="mb-2">Kopírovanie nie je dostupné. Označte a skopírujte odkaz ručne:</p>
        <input aria-label="Odkaz na zdrojový web" readOnly value={currentImage.url} className="w-full select-all rounded border border-white/30 bg-white/10 px-3 py-2 text-white" />
      </div>}

      {/* Main Image Stage */}
      <div className="relative flex-1 min-h-0 w-full flex items-center justify-center p-2 sm:p-6 overflow-hidden">
        {/* Navigation Arrow: Left */}
        <button
          type="button"
          onClick={handlePrev}
          className="absolute left-2 sm:left-6 z-20 w-11 h-11 sm:w-13 sm:h-13 rounded-full bg-black/60 hover:bg-black/85 text-white flex items-center justify-center transition-all duration-150 cursor-pointer border border-white/15 hover:scale-105 active:scale-95 shadow-xl"
          title="Predchádzajúci obrázok (Šípka doľava)"
          aria-label="Predchádzajúci obrázok"
        >
          <ChevronLeft className="w-6 h-6 sm:w-7 sm:h-7" />
        </button>

        {/* Display Image */}
        <div className="relative max-w-full max-h-full flex items-center justify-center">
          <img
            key={currentImage.thumbnail}
            src={currentImage.thumbnail}
            alt={currentImage.title}
            className="max-h-full max-w-full object-contain rounded-lg shadow-2xl transition-opacity duration-200"
            referrerPolicy="no-referrer"
            onLoad={() => setImgLoaded(true)}
          />
        </div>

        {/* Navigation Arrow: Right */}
        <button
          type="button"
          onClick={handleNext}
          className="absolute right-2 sm:right-6 z-20 w-11 h-11 sm:w-13 sm:h-13 rounded-full bg-black/60 hover:bg-black/85 text-white flex items-center justify-center transition-all duration-150 cursor-pointer border border-white/15 hover:scale-105 active:scale-95 shadow-xl"
          title="Nasledujúci obrázok (Šípka doprava)"
          aria-label="Nasledujúci obrázok"
        >
          <ChevronRight className="w-6 h-6 sm:w-7 sm:h-7" />
        </button>

        {copied && (
          <div role="status" className="absolute top-4 left-1/2 -translate-x-1/2 bg-black/80 text-white text-xs px-3 py-1.5 rounded-full border border-white/20 shadow-lg z-30">
            Odkaz bol skopírovaný do schránky!
          </div>
        )}
      </div>

      {/* Bottom Thumbnail Strip & Details Bar */}
      <footer className="shrink-0 bg-black/40 border-t border-white/10 px-4 sm:px-6 py-2.5">
        <div className="flex items-center justify-between gap-4 mb-2">
          <div className="min-w-0">
            <span className="text-white/60 text-xs truncate block">
              Zdroj: <span className="text-white/90 font-medium">{currentImage.siteName || currentImage.displayUrl}</span>
            </span>
          </div>

          <div className="text-[11px] text-white/50 hidden sm:block">
            Použite šípky ← a → na klávesnici na posúvanie obrázkov
          </div>
        </div>

        {/* Horizontal scrollable thumbnail bar */}
        <div className="flex items-center gap-2 overflow-x-auto py-1 scrollbar-none">
          {images.map((img, idx) => (
            <button
              key={img.id || idx}
              type="button"
              onClick={() => {
                setImgLoaded(false);
                setCurrentIndex(idx);
              }}
              className={`relative shrink-0 w-16 h-12 rounded-md overflow-hidden transition-all duration-150 cursor-pointer border-2 ${
                idx === currentIndex
                  ? 'border-[#1a73e8] scale-105 shadow-md shadow-blue-500/20 opacity-100'
                  : 'border-transparent opacity-50 hover:opacity-80'
              }`}
            >
              <img
                src={img.thumbnail}
                alt={img.title}
                className="w-full h-full object-cover"
                referrerPolicy="no-referrer"
                loading="lazy"
              />
            </button>
          ))}
        </div>
      </footer>
    </div>
  );
}
