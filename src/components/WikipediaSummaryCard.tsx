import { useState } from 'react';
import { BookOpen, ChevronDown, ChevronUp, ExternalLink } from 'lucide-react';
import { SearchOverview } from '../types';

interface WikipediaSummaryCardProps {
  summary: SearchOverview;
  query: string;
}

export default function WikipediaSummaryCard({ summary }: WikipediaSummaryCardProps) {
  const [expanded, setExpanded] = useState(false);

  const extract = summary.extract || '';
  const isLong = extract.length > 280;
  const displayText = !expanded && isLong ? `${extract.slice(0, 280).trim()}...` : extract;

  return (
    <div
      id="search-wikipedia-card"
      className="my-4 pb-4 border-b border-[#dadce0] text-[#202124]"
    >
      {/* 1. Header: Wikipédia + BookOpen Icon */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2 text-[#202124]">
          <BookOpen className="w-4.5 h-4.5 text-[#5f6368]" />
          <span className="text-[15px] sm:text-[16px] font-medium tracking-tight">
            Wikipédia
          </span>
        </div>
        <span className="text-[11px] px-2.5 py-0.5 rounded-full bg-[#f1f3f4] text-[#5f6368] font-normal">
          Encyklopédia
        </span>
      </div>

      {/* 2. Main Content */}
      <div className="text-[14.5px] sm:text-[15px] leading-[1.6] text-[#202124]">
        <div className="flex flex-col sm:flex-row gap-4 items-start justify-between">
          <div className="flex-1">
            <p className="text-[#202124]">
              {summary.title && (
                <strong className="font-semibold text-[#1a0dab] mr-1.5 hover:underline cursor-pointer">
                  {summary.pageUrl ? (
                    <a
                      href={summary.pageUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[#1a0dab] hover:underline"
                    >
                      {summary.title}
                    </a>
                  ) : (
                    summary.title
                  )}
                </strong>
              )}
              {summary.description && (
                <span className="text-[#5f6368] font-normal italic mr-1">
                  ({summary.description}) —{' '}
                </span>
              )}
              <span>{displayText}</span>
              {summary.pageUrl && (
                <a
                  href={summary.pageUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center ml-1.5 text-[#1a0dab] hover:underline text-xs"
                  title="Celý článok na Wikipédii"
                >
                  <span className="mr-0.5">Viac na Wikipédii</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              )}
            </p>
          </div>

          {/* Thumbnail if available from Wikipedia */}
          {summary.thumbnailUrl && (
            <div className="shrink-0 w-24 h-24 sm:w-28 sm:h-28 rounded-lg overflow-hidden border border-neutral-200 bg-neutral-50 shadow-2xs self-center sm:self-start">
              <img
                src={summary.thumbnailUrl}
                alt={summary.title}
                className="w-full h-full object-cover"
                referrerPolicy="no-referrer"
              />
            </div>
          )}
        </div>

        {/* Expand toggle if text is long */}
        {isLong && (
          <div className="mt-2.5 flex justify-start">
            <button
              type="button"
              onClick={() => setExpanded(!expanded)}
              className="inline-flex items-center gap-1 text-xs font-medium text-[#1a0dab] hover:underline cursor-pointer"
            >
              <span>{expanded ? 'Zobraziť menej' : 'Čítať viac'}</span>
              {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
