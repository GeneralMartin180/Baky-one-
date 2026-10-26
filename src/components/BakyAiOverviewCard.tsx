import { useState } from 'react';
import { BookOpen, ExternalLink, Copy, Check } from 'lucide-react';
import type { SearchResult, WikipediaSummary } from '../types';

interface Props { query: string; results: SearchResult[]; wikiSummary?: WikipediaSummary | null; onOpenExternalAi?: () => void; openInNewTab?: boolean }

export default function BakyAiOverviewCard({ query, wikiSummary, openInNewTab = true }: Props) {
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState(false);
  if (!wikiSummary?.extract) return <div id="baky-ai-overview-card" className="mb-6 p-4 border border-blue-100 rounded-2xl bg-blue-50/30 text-sm text-[#5f6368]">Pre „{query}“ momentálne nie je dostupný prehľad zdrojov.</div>;
  const sources = wikiSummary.sources?.length ? wikiSummary.sources : wikiSummary.pageUrl ? [{ title: wikiSummary.sourceName || wikiSummary.title, url: wikiSummary.pageUrl }] : [];
  const copy = async () => {
    try {
      if (!navigator.clipboard) throw new Error('Clipboard unavailable');
      await navigator.clipboard.writeText(wikiSummary.extract);
      setCopied(true);
      setCopyError(false);
    } catch { setCopyError(true); }
  };
  return <section id="baky-ai-overview-card" aria-label="Prehľad zdrojov" className="mb-6 rounded-2xl border border-blue-200/90 bg-gradient-to-b from-[#f8fafd] to-white p-4 sm:p-5">
    <div className="flex items-center justify-between gap-3 pb-3 border-b border-blue-100">
      <div className="flex gap-2 items-center min-w-0"><BookOpen className="w-5 h-5 text-[#1a73e8] shrink-0" /><div><h2 className="font-semibold text-base">Prehľad zdrojov</h2><p className="text-xs text-[#5f6368]">Text z verejných zdrojov k téme</p></div></div>
      <button type="button" onClick={copy} aria-label="Kopírovať prehľad" className="p-2 rounded-lg hover:bg-blue-50 shrink-0">{copied ? <Check className="w-4 h-4 text-green-700" /> : <Copy className="w-4 h-4" />}</button>
    </div>
    <h3 className="font-medium mt-3 mb-2">{wikiSummary.title}</h3>
    <p className="text-sm leading-relaxed whitespace-pre-line">{wikiSummary.extract}</p>
    {wikiSummary.bullets?.length ? <ul className="list-disc pl-5 mt-3 text-sm space-y-2">{wikiSummary.bullets.map((bullet, index) => <li key={index}>{bullet.title && <strong>{bullet.title}: </strong>}{bullet.text}</li>)}</ul> : null}
    {sources.length > 0 && <div className="mt-4 pt-3 border-t border-blue-100"><p className="text-xs text-[#5f6368] mb-2">Zdroje prehľadu:</p><div className="flex flex-wrap gap-2">{sources.map((source) => <a key={source.url} href={source.url} target={openInNewTab ? '_blank' : '_self'} rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-xs text-[#1a73e8] border border-blue-100 bg-white rounded-full px-3 py-1.5"><span className="break-words">{source.title}</span><ExternalLink className="w-3 h-3 shrink-0" /></a>)}</div></div>}
    {copied && <p role="status" className="mt-2 text-xs text-green-700">Prehľad bol skopírovaný.</p>}
    {copyError && <p role="alert" className="mt-2 text-xs text-red-700">Kopírovanie nie je dostupné. Označte a skopírujte text ručne.</p>}
  </section>;
}
