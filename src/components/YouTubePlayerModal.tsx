import { X, ExternalLink } from 'lucide-react';
import { AppSettings, YouTubeVideoItem } from '../types';
import { YouTubeIcon, YouTubeShortsIcon } from './YouTubeIcon';
import { useDialog } from './useDialog';

interface YouTubePlayerModalProps {
  video: YouTubeVideoItem | null;
  onClose: () => void;
  settings?: AppSettings;
}

export default function YouTubePlayerModal({ video, onClose, settings }: YouTubePlayerModalProps) {
  const dialogRef = useDialog(onClose, Boolean(video));
  if (!video) return null;

  const isShort = video.isShort || video.url?.includes('/shorts/');

  return (
    <div
      id="youtube-player-modal"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/85 backdrop-blur-xs animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={video.title}
        tabIndex={-1}
        className={`relative w-full ${
          isShort ? 'max-w-sm' : 'max-w-4xl'
        } max-h-[calc(100dvh-24px)] overflow-y-auto bg-neutral-950 rounded-2xl shadow-2xl border border-neutral-800 text-white flex flex-col`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between px-4 py-2.5 bg-neutral-900 border-b border-neutral-800 shrink-0">
          <div className="flex items-center gap-2 min-w-0 pr-4">
            {isShort ? (
              <YouTubeShortsIcon className="w-4 h-4 shrink-0 text-red-600" />
            ) : (
              <YouTubeIcon className="w-5 h-3.5 shrink-0 shadow-xs" />
            )}
            <span className="font-semibold text-xs sm:text-sm truncate">
              {isShort ? `Shorts: ${video.title}` : video.title}
            </span>
          </div>

          <button
            type="button"
            id="close-youtube-modal-btn"
            onClick={onClose}
            className="p-1.5 rounded-full text-neutral-400 hover:text-white hover:bg-neutral-800 transition-colors cursor-pointer shrink-0"
            title="Zatvoriť prehrávač"
            aria-label="Zatvoriť prehrávač"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Video Player: 9:16 for Shorts or 16:9 for Standard Video */}
        <div className={`relative ${isShort ? 'aspect-[9/16] max-h-[60dvh]' : 'aspect-video'} w-full bg-black shrink-0`}>
          <iframe
            src={`https://www.youtube-nocookie.com/embed/${video.videoId}?autoplay=1&rel=0&modestbranding=1`}
            title={video.title}
            className="w-full h-full border-0"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowFullScreen
          />
        </div>

        {/* Video Details Footer */}
        <div className="p-3 bg-neutral-900 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 text-xs">
          <div className="space-y-0.5 min-w-0">
            <p className="font-medium text-neutral-200 text-xs truncate">{video.channel}</p>
            <div className="flex items-center gap-1.5 text-neutral-400 text-[11px]">
              {video.views && <span>{video.views}</span>}
              {video.published && <span>• {video.published}</span>}
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <a
              href={video.url || (isShort ? `https://www.youtube.com/shorts/${video.videoId}` : `https://www.youtube.com/watch?v=${video.videoId}`)}
              target={settings?.openInNewTab === false ? '_self' : '_blank'}
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white font-semibold transition-colors shadow cursor-pointer text-xs"
            >
              <span>{isShort ? 'YouTube Shorts' : 'Na YouTube'}</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </a>

            <button
              type="button"
              onClick={onClose}
              className="px-2.5 py-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-300 transition-colors cursor-pointer text-xs"
            >
              Zavrieť
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
