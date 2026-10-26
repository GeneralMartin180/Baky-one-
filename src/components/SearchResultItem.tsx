import React, { useState, Key } from 'react';
import { MoreVertical } from 'lucide-react';
import { SearchResult, AppSettings } from '../types';
import { YouTubeIcon } from './YouTubeIcon';
import {
  RedditIcon,
  XTwitterIcon,
  LinkedInIcon,
  FacebookIcon,
  QuoraIcon,
  WikidataIcon,
} from './SocialBrandIcons';

interface SearchResultItemProps {
  key?: Key;
  item: SearchResult;
  settings: AppSettings;
  index: number;
}

// Google Favicon Circle with Official Social & Brand Vector Icons
function ResultFavicon({ item }: { item: SearchResult }) {
  const [imgError, setImgError] = useState(false);
  const matchesHost = (host: string) => {
    try { const actual = new URL(item.url).hostname; return actual === host || actual.endsWith(`.${host}`); }
    catch { return false; }
  };

  // 1. Reddit
  if (matchesHost('reddit.com')) {
    return (
      <div className="w-7 h-7 rounded-full bg-[#ff4500] text-white flex items-center justify-center shrink-0 shadow-2xs">
        <RedditIcon className="w-4 h-4" />
      </div>
    );
  }

  // 2. X / Twitter
  if (matchesHost('x.com') || matchesHost('twitter.com')) {
    return (
      <div className="w-7 h-7 rounded-full bg-black text-white flex items-center justify-center shrink-0 shadow-2xs">
        <XTwitterIcon className="w-3.5 h-3.5" />
      </div>
    );
  }

  // 3. LinkedIn
  if (matchesHost('linkedin.com')) {
    return (
      <div className="w-7 h-7 rounded-full bg-[#0a66c2] text-white flex items-center justify-center shrink-0 shadow-2xs">
        <LinkedInIcon className="w-4 h-4" />
      </div>
    );
  }

  // 4. Facebook
  if (matchesHost('facebook.com') || matchesHost('fb.com')) {
    return (
      <div className="w-7 h-7 rounded-full bg-[#1877f2] text-white flex items-center justify-center shrink-0 shadow-2xs">
        <FacebookIcon className="w-4 h-4" />
      </div>
    );
  }

  // 5. Quora
  if (matchesHost('quora.com')) {
    return (
      <div className="w-7 h-7 rounded-full bg-[#b92b27] text-white flex items-center justify-center shrink-0 shadow-2xs">
        <QuoraIcon className="w-3.5 h-3.5" />
      </div>
    );
  }

  // 6. Wikidata
  if (matchesHost('wikidata.org')) {
    return (
      <div className="w-7 h-7 rounded-full bg-white border border-[#dadce0] flex items-center justify-center shrink-0 shadow-2xs overflow-hidden p-1">
        <WikidataIcon className="w-4 h-3.5" />
      </div>
    );
  }

  // 7. YouTube
  if (matchesHost('youtube.com') || matchesHost('youtu.be')) {
    return (
      <div className="w-7 h-7 rounded-full bg-[#f1f3f4] flex items-center justify-center shrink-0">
        <YouTubeIcon className="w-4 h-3 rounded-xs" />
      </div>
    );
  }

  // 8. GitHub
  if (matchesHost('github.com')) {
    return (
      <div className="w-7 h-7 rounded-full bg-[#f1f3f4] flex items-center justify-center shrink-0">
        <div className="w-4 h-4 rounded-full bg-black flex items-center justify-center text-white">
          <svg className="w-2.5 h-2.5 fill-current" viewBox="0 0 24 24">
            <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
          </svg>
        </div>
      </div>
    );
  }

  let domain = '';
  try {
    domain = new URL(item.url).hostname.replace(/^www\./, '');
  } catch {}

  const faviconUrl = domain ? `/api/favicon?host=${encodeURIComponent(domain)}` : undefined;

  return (
    <div className="w-7 h-7 rounded-full bg-[#f1f3f4] flex items-center justify-center shrink-0 overflow-hidden">
      {!imgError && faviconUrl ? (
        <img
          src={faviconUrl}
          alt=""
          className="w-4 h-4 object-contain"
          width={16}
          height={16}
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          onError={() => setImgError(true)}
        />
      ) : (
        <span className="text-[11px] font-medium text-[#5f6368] uppercase">
          {item.siteName?.charAt(0) || domain.charAt(0) || 'W'}
        </span>
      )}
    </div>
  );
}

// Format breadcrumb in exact clean style: "https://github.com › GeneralMartin180 › releases"
function formatGoogleBreadcrumb(item: SearchResult): string {
  try {
    const parsed = new URL(item.url);
    const hostWithProtocol = `${parsed.protocol}//${parsed.hostname}`;
    const paths = parsed.pathname
      .split('/')
      .map((p) => decodeURIComponent(p).trim())
      .filter((p) => p && !p.endsWith('.html') && !p.endsWith('.php'));

    if (paths.length === 0) {
      return hostWithProtocol;
    }

    return `${hostWithProtocol} › ${paths.join(' › ')}`;
  } catch {
    return item.displayUrl || item.url;
  }
}

export default function SearchResultItem({ item, settings, index }: SearchResultItemProps) {
  const breadcrumbText = formatGoogleBreadcrumb(item);
  const [showMenu, setShowMenu] = useState(false);

  const handleLinkClick = (e: React.MouseEvent) => {
    // Stop propagation so parent containers don't interfere
    e.stopPropagation();
  };

  return (
    <article
      id={`result-card-${item.id}`}
      className="group pb-6 sm:pb-7 transition-colors max-w-[652px]"
    >
      {/* 1. Favicon circle + Site name + URL breadcrumb + Direct Open (Exact Google UI) */}
      <div className="flex items-center justify-between gap-2 mb-1">
        <a
          href={item.url}
          target={settings.openInNewTab ? '_blank' : '_self'}
          rel="noopener noreferrer"
          onClick={handleLinkClick}
          className="flex items-center gap-3 min-w-0 flex-1 no-underline group/site cursor-pointer"
          title={`Otvoriť ${item.siteName || item.url}`}
        >
          <ResultFavicon key={item.url} item={item} />

          <div className="flex flex-col text-xs leading-none min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[14px] text-[#202124] font-medium truncate group-hover/site:underline">
                {item.siteName || 'Web'}
              </span>
              {item.url.includes('wikidata.org') && (
                <span className="text-[11px] font-normal text-[#006699] bg-sky-50 px-2 py-0.5 rounded-full">
                  Wikidata
                </span>
              )}
            </div>
            <div className="flex items-center gap-1.5 mt-1 text-[#4d5156]">
              <span className="text-[12px] text-[#4d5156] truncate">{breadcrumbText}</span>
            </div>
          </div>
        </a>

        {/* 3-dots Menu / Direct Open helper */}
        <div className="relative inline-flex items-center shrink-0" onKeyDown={(event) => { if (event.key === 'Escape') { setShowMenu(false); (event.currentTarget.firstElementChild as HTMLElement)?.focus(); } }}>
          <button
            type="button"
            onClick={() => setShowMenu(!showMenu)}
            className="p-1 text-[#70757a] hover:text-[#202124] rounded-full transition-colors cursor-pointer"
            title="O tomto výsledku"
            aria-label="O tomto výsledku"
            aria-expanded={showMenu}
          >
            <MoreVertical className="w-3.5 h-3.5" />
          </button>

          {showMenu && (
            <div className="absolute right-0 top-full mt-1 w-56 bg-white rounded-xl shadow-lg border border-[#dadce0] p-3 z-30 text-xs text-[#3c4043] animate-in fade-in duration-100">
              <div className="font-medium text-[#202124] mb-1">O tomto výsledku</div>
              <p className="text-[11px] text-[#5f6368] mb-2 leading-relaxed">
                Zdroj výsledku: {item.siteName || 'web'}.
              </p>
              <a
                href={item.url}
                target={settings.openInNewTab ? '_blank' : '_self'}
                rel="noopener noreferrer"
                onClick={handleLinkClick}
                className="text-[#1a73e8] font-medium hover:underline block pt-2 border-t border-neutral-100"
              >
                Otvoriť stránku ↗
              </a>
            </div>
          )}
        </div>
      </div>

      {/* 2. Title: Google Iconic Blue Link (#1a0dab) - Always reliable target="_blank" */}
      <h2 className="text-[19px] sm:text-[20px] font-normal leading-[1.3] my-1">
        <a
          href={item.url}
          target={settings.openInNewTab ? '_blank' : '_self'}
          rel="noopener noreferrer"
          onClick={handleLinkClick}
          className="text-[#1a0dab] hover:underline cursor-pointer block break-words"
        >
          {item.title}
        </a>
      </h2>

      {/* 3. Snippet Text (Exact Google Gray #4d5156, leading 1.58) */}
      <div className="text-[14px] text-[#4d5156] leading-[1.58]">
        {item.date && (
          <span className="text-[#70757a] font-normal mr-1.5">
            {item.date} —
          </span>
        )}
        <span>{item.snippet}</span>
      </div>
    </article>
  );
}
