import { useEffect, useId, useState } from 'react';
import type { ChangeEvent, KeyboardEvent } from 'react';
import type { AppSettings } from '../types';

interface Options {
  query: string;
  onChange: (query: string) => void;
  onSelect: (query: string) => void;
  settings?: Pick<AppSettings, 'region' | 'safeSearch'>;
}

export function useSearchSuggestions({ query, onChange, onSelect, settings }: Options) {
  const id = useId();
  const [editing, setEditing] = useState(false);
  const [composing, setComposing] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [response, setResponse] = useState<{ url: string; items: string[] } | null>(null);
  const term = query.trim();
  const url = editing && !composing && term.length >= 2 && term.length <= 160
    ? `/api/suggestions?${new URLSearchParams({ q: term, region: settings?.region ?? 'sk', safeSearch: settings?.safeSearch === false ? '0' : '1' })}`
    : '';
  const items = url && response?.url === url ? response.items : [];
  const open = items.length > 0;

  useEffect(() => {
    if (!url) return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      if (document.visibilityState === 'hidden') return;
      try {
        const result = await fetch(url, { cache: 'no-store', signal: controller.signal });
        if (!result.ok || controller.signal.aborted) return;
        const data = await result.json();
        if (controller.signal.aborted || !Array.isArray(data?.suggestions)) return;
        const items = data.suggestions.filter((item: unknown): item is string => typeof item === 'string' && Boolean(item.trim())).slice(0, 7);
        setResponse({ url, items });
        setActiveIndex(-1);
      } catch {
        // The search form still works when suggestions are unavailable.
      }
    }, 220);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [url]);

  const dismiss = () => {
    setEditing(false);
    setComposing(false);
    setResponse(null);
    setActiveIndex(-1);
  };

  const select = (suggestion: string) => {
    onChange(suggestion);
    onSelect(suggestion);
  };

  const change = (event: ChangeEvent<HTMLInputElement>) => {
    const value = event.currentTarget.value;
    if (value.trim() !== term) setResponse(null);
    setEditing(true);
    setActiveIndex(-1);
    onChange(value);
  };

  const keyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (composing || event.nativeEvent.isComposing || event.keyCode === 229) return;
    if (event.key === 'Escape' && url) {
      event.preventDefault();
      event.stopPropagation();
      dismiss();
    } else if (open && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
      event.preventDefault();
      const step = event.key === 'ArrowDown' ? 1 : -1;
      const next = activeIndex < 0 ? (step > 0 ? 0 : items.length - 1) : (activeIndex + step + items.length) % items.length;
      setActiveIndex(next);
      document.getElementById(`${id}-${next}`)?.scrollIntoView?.({ block: 'nearest' });
    } else if (event.key === 'Enter' && items[activeIndex]) {
      event.preventDefault();
      select(items[activeIndex]);
    }
  };

  return {
    dismiss,
    inputProps: {
      role: 'combobox',
      'aria-autocomplete': 'list' as const,
      'aria-expanded': open,
      'aria-controls': open ? id : undefined,
      'aria-activedescendant': open && items[activeIndex] ? `${id}-${activeIndex}` : undefined,
      onChange: change,
      onKeyDown: keyDown,
      onBlur: dismiss,
      onCompositionStart: () => {
        setComposing(true);
        setResponse(null);
        setActiveIndex(-1);
      },
      onCompositionEnd: () => setComposing(false),
    },
    listProps: { id, query: term, items, activeIndex, onSelect: select },
  };
}
