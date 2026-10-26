import { useState, MouseEvent, Key } from 'react';
import { Play, ExternalLink, Clock, Eye, X } from 'lucide-react';
import { YouTubeVideoItem, AppSettings } from '../types';
import { YouTubeIcon } from './YouTubeIcon';

interface YouTubeVideoCardProps {
  key?: Key;
  video: YouTubeVideoItem;
  settings?: AppSettings;
  layout?: 'horizontal' | 'grid';
  onPlayModal?: (video: YouTubeVideoItem) => void;
}

export default function YouTubeVideoCard({
  video,
  settings,
  layout = 'horizontal',
  onPlayModal,
}: YouTubeVideoCardProps) {
  const [imgError, setImgError] = useState(false);
  const [isPlayingInline, setIsPlayingInline] = useState(false);

  const fallbackThumbnail = `https://i.ytimg.com/vi/${video.videoId}/hqdefault.jpg`;
  const thumbnailSrc = !imgError && video.thumbnail ? video.thumbnail : fallbackThumbnail;

  const handlePlayClick = (e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (onPlayModal) {
      onPlayModal(video);
    } else {
      setIsPlayingInline(true);
    }
  };

  // If playing inline
  if (isPlayingInline) {
    return (
      <div
        id={`youtube-inline-player-${video.videoId}`}
        className="w-full rounded-2xl overflow-hidden border border-neutral-300 bg-black shadow-md my-3"
      >
        <div className="flex items-center justify-between px-3 py-2 bg-neutral-900 text-white text-xs">
          <div className="flex items-center gap-2 truncate pr-2">
            <YouTubeIcon className="w-5 h-3.5 shrink-0" />
            <span className="font-medium truncate">{video.title}</span>
          </div>
          <button
            type="button"
            onClick={() => setIsPlayingInline(false)}
            className="p-1 rounded-full hover:bg-neutral-800 text-neutral-400 hover:text-white transition-colors cursor-pointer"
            title="Zatvoriť prehrávač"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="relative aspect-video w-full bg-black">
          <iframe
            src={`https://www.youtube-nocookie.com/embed/${video.videoId}?autoplay=1&rel=0`}
            title={video.title}
            className="w-full h-full border-0"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
        </div>
      </div>
    );
  }

  // Grid Layout (For Videos Tab multi-column grid)
  if (layout === 'grid') {
    return (
      <article
        id={`youtube-card-${video.videoId}`}
        className="group flex flex-col rounded-2xl overflow-hidden border border-neutral-200 hover:border-neutral-300 hover:shadow-lg transition-all duration-200 bg-white"
      >
        {/* Thumbnail with Play Badge & Duration */}
        <button
          type="button"
          onClick={handlePlayClick}
          aria-label={`Prehrať video: ${video.title}`}
          className="relative aspect-video w-full bg-neutral-900 overflow-hidden cursor-pointer shrink-0"
        >
          <img
            src={thumbnailSrc}
            alt={video.title}
            onError={() => setImgError(true)}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
            referrerPolicy="no-referrer"
            loading="lazy"
          />

          {/* Dark gradient overlay */}
          <div className="absolute inset-0 bg-black/20 group-hover:bg-black/40 transition-colors flex items-center justify-center">
            <div className="w-12 h-12 rounded-full bg-red-600/95 text-white flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform duration-200 pl-0.5">
              <Play className="w-5 h-5 fill-current" />
            </div>
          </div>

          {/* Duration Badge */}
          {video.duration && (
            <div className="absolute bottom-2 right-2 px-1.5 py-0.5 rounded bg-black/85 text-white text-[11px] font-mono font-medium tracking-tight shadow">
              {video.duration}
            </div>
          )}

          {/* YouTube Pill Badge */}
          <div className="absolute top-2 left-2 flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-black/80 backdrop-blur-xs text-white text-[10px] font-semibold shadow-xs">
            <YouTubeIcon className="w-3.5 h-2.5 shrink-0" />
            <span>YouTube</span>
          </div>
        </button>

        {/* Video Info Content */}
        <div className="p-3.5 flex flex-col flex-1 justify-between">
          <div>
            <h3 className="text-sm font-semibold text-neutral-900 leading-snug line-clamp-2 group-hover:text-red-700 transition-colors">
              <a
                href={video.url}
                target={settings?.openInNewTab ? '_blank' : '_self'}
                rel="noopener noreferrer"
              >
                {video.title}
              </a>
            </h3>

            <div className="mt-2 flex items-center gap-1.5 text-xs text-neutral-600 font-medium">
              <span className="truncate">{video.channel}</span>
            </div>

            <div className="mt-1 flex items-center gap-2 text-[11px] text-neutral-500">
              {video.views && <span>{video.views}</span>}
              {video.views && video.published && <span>•</span>}
              {video.published && <span>{video.published}</span>}
            </div>
          </div>

          <div className="mt-3 pt-2.5 border-t border-neutral-100 flex items-center justify-between text-xs">
            <button
              type="button"
              onClick={handlePlayClick}
              className="inline-flex items-center gap-1 font-semibold text-red-600 hover:text-red-700 cursor-pointer"
            >
              <Play className="w-3.5 h-3.5 fill-current" />
              <span>Prehrať</span>
            </button>

            <a
              href={video.url}
              target={settings?.openInNewTab ? '_blank' : '_self'}
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-neutral-500 hover:text-neutral-800 transition-colors"
              title="Otvoriť na YouTube.com"
            >
              <span>YouTube</span>
              <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        </div>
      </article>
    );
  }

  // Horizontal Layout (Yahoo / Google search results style)
  return (
    <article
      id={`youtube-card-${video.videoId}`}
      className="group relative flex flex-col sm:flex-row gap-3.5 p-3 sm:p-4 rounded-2xl border border-neutral-200/90 hover:border-neutral-300 hover:shadow-md transition-all duration-200 bg-white max-w-[660px] my-2"
    >
      {/* 16:9 Thumbnail (Left on desktop) */}
      <button
        type="button"
        onClick={handlePlayClick}
        aria-label={`Prehrať video: ${video.title}`}
        className="relative w-full sm:w-[200px] md:w-[220px] aspect-video rounded-xl overflow-hidden bg-neutral-900 cursor-pointer shrink-0"
      >
        <img
          src={thumbnailSrc}
          alt={video.title}
          onError={() => setImgError(true)}
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
          referrerPolicy="no-referrer"
          loading="lazy"
        />

        {/* Play Overlay Button */}
        <div className="absolute inset-0 bg-black/20 group-hover:bg-black/40 transition-colors flex items-center justify-center">
          <div className="w-11 h-11 rounded-full bg-red-600/95 text-white flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform duration-200 pl-0.5">
            <Play className="w-5 h-5 fill-current" />
          </div>
        </div>

        {/* Duration Badge */}
        {video.duration && (
          <div className="absolute bottom-1.5 right-1.5 px-1.5 py-0.5 rounded bg-black/85 text-white text-[11px] font-mono font-medium tracking-tight shadow">
            {video.duration}
          </div>
        )}
      </button>

      {/* Video Details & Meta */}
      <div className="flex flex-col justify-between flex-1 min-w-0">
        <div>
          {/* Site name & YouTube branding line */}
          <div className="flex items-center gap-1.5 text-xs text-neutral-500 mb-1">
            <YouTubeIcon className="w-4.5 h-3.2 shrink-0 shadow-2xs" />
            <span className="font-semibold text-neutral-800">YouTube</span>
            <span>›</span>
            <span className="truncate text-neutral-600 font-medium">{video.channel}</span>
          </div>

          {/* Title */}
          <h2 className="text-[16px] sm:text-[17px] font-medium leading-snug text-[#1808b2] hover:underline cursor-pointer line-clamp-2">
            <a
              href={video.url}
              target={settings?.openInNewTab ? '_blank' : '_self'}
              rel="noopener noreferrer"
            >
              {video.title}
            </a>
          </h2>

          {/* Snippet / Description */}
          {video.snippet && (
            <p className="mt-1 text-[13px] text-neutral-600 line-clamp-2 leading-relaxed">
              {video.snippet}
            </p>
          )}

          {/* Views & Date info */}
          <div className="mt-2 flex items-center gap-2 text-xs text-neutral-500">
            {video.views && (
              <span className="flex items-center gap-1 font-medium text-neutral-700">
                <Eye className="w-3.5 h-3.5 text-neutral-400" />
                {video.views}
              </span>
            )}
            {video.views && video.published && <span>·</span>}
            {video.published && (
              <span className="flex items-center gap-1">
                <Clock className="w-3.5 h-3.5 text-neutral-400" />
                {video.published}
              </span>
            )}
          </div>
        </div>

        {/* Action buttons */}
        <div className="mt-3 pt-2 flex items-center gap-3 text-xs">
          <button
            type="button"
            onClick={handlePlayClick}
            className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-red-50 hover:bg-red-100 text-red-700 font-semibold border border-red-200 transition-colors cursor-pointer"
          >
            <Play className="w-3 h-3 fill-current" />
            <span>Spustiť na Baky One</span>
          </button>

          <a
            href={video.url}
            target={settings?.openInNewTab ? '_blank' : '_self'}
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 px-2.5 py-1 text-neutral-600 hover:text-neutral-900 transition-colors"
          >
            <span>Otvoriť na YouTube</span>
            <ExternalLink className="w-3 h-3" />
          </a>
        </div>
      </div>
    </article>
  );
}
