import { useState } from 'react';
import { Play, ExternalLink } from 'lucide-react';
import { AppSettings, YouTubeVideoItem } from '../types';
import { YouTubeShortsIcon } from './YouTubeIcon';

interface YouTubeShortsCardProps {
  short: YouTubeVideoItem;
  onPlay?: (short: YouTubeVideoItem) => void;
  key?: string | number;
  settings?: AppSettings;
}

export default function YouTubeShortsCard({ short, onPlay, settings }: YouTubeShortsCardProps) {
  const [imgError, setImgError] = useState(false);

  const fallbackThumb = `https://i.ytimg.com/vi/${short.videoId}/hqdefault.jpg`;
  const thumbSrc = !imgError && short.thumbnail ? short.thumbnail : fallbackThumb;

  const handleClick = () => {
    if (onPlay) {
      onPlay(short);
    } else {
      const url = short.url || `https://www.youtube.com/shorts/${short.videoId}`;
      if (settings?.openInNewTab === false) window.location.assign(url);
      else window.open(url, '_blank', 'noopener,noreferrer');
    }
  };

  return (
    <article
      id={`youtube-short-card-${short.videoId}`}
      className="group relative flex flex-col aspect-[9/16] w-full rounded-2xl overflow-hidden bg-neutral-900 border border-neutral-200 hover:border-neutral-400 hover:shadow-xl transition-all duration-200 cursor-pointer select-none"
    >
      <button type="button" onClick={handleClick} aria-label={`Prehrať krátke video: ${short.title}`} className="absolute inset-0 z-20 focus-visible:outline-offset-[-4px]" />
      {/* Background Image / Thumbnail */}
      <img
        src={thumbSrc}
        alt={short.title}
        onError={() => setImgError(true)}
        className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
        loading="lazy"
        referrerPolicy="no-referrer"
      />

      {/* Top Overlay: YouTube Shorts Badge */}
      <div className="absolute top-2.5 left-2.5 right-2.5 flex items-center justify-between z-30 pointer-events-none">
        <div className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-black/70 backdrop-blur-xs text-white text-[11px] font-semibold tracking-wide shadow-sm">
          <YouTubeShortsIcon className="w-3.5 h-3.5" />
          <span>Shorts</span>
        </div>

        <a
          href={short.url || `https://www.youtube.com/shorts/${short.videoId}`}
          target={settings?.openInNewTab === false ? '_self' : '_blank'}
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="relative pointer-events-auto p-1.5 rounded-full bg-black/60 text-white/80 hover:text-white hover:bg-black/90 transition-colors shadow-sm"
          title="Otvoriť na YouTube Shorts"
        >
          <ExternalLink className="w-3.5 h-3.5" />
        </a>
      </div>

      {/* Hover Center Play Button */}
      <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-200 z-10 bg-black/20">
        <div className="w-12 h-12 rounded-full bg-red-600 text-white flex items-center justify-center shadow-lg transform group-hover:scale-110 transition-transform duration-200 pl-0.5">
          <Play className="w-5 h-5 fill-current" />
        </div>
      </div>

      {/* Bottom Gradient and Info */}
      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/95 via-black/70 to-transparent pt-16 pb-3 px-3 z-10 text-white flex flex-col justify-end">
        <h3
          className="text-xs sm:text-[13px] font-semibold leading-snug line-clamp-2 drop-shadow-sm group-hover:text-red-300 transition-colors"
          title={short.title}
        >
          {short.title}
        </h3>

        <div className="mt-1.5 flex items-center justify-between text-[11px] text-white/80">
          <span className="truncate max-w-[65%] font-medium">{short.channel || 'YouTube Shorts'}</span>
          {short.views && (
            <span className="shrink-0 font-medium text-white/90 drop-shadow-xs">{short.views}</span>
          )}
        </div>
      </div>
    </article>
  );
}
