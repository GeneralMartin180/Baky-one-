import { Search } from 'lucide-react';

interface Props {
  id: string;
  query: string;
  items: string[];
  activeIndex: number;
  onSelect: (suggestion: string) => void;
}

export default function SearchSuggestions({ id, query, items, activeIndex, onSelect }: Props) {
  if (!items.length) return null;

  return (
    <ul
      id={id}
      role="listbox"
      aria-label="Návrhy vyhľadávania"
      className="baky-search-suggestions absolute max-h-[min(21rem,46dvh)] overflow-y-auto overscroll-contain px-1.5 py-1.5 [scrollbar-width:thin]"
    >
      {items.map((suggestion, index) => {
        const selected = index === activeIndex;
        const prefixLength = suggestion.toLowerCase().startsWith(query.toLowerCase()) ? query.length : 0;
        return (
          <li
            key={suggestion}
            id={`${id}-${index}`}
            role="option"
            aria-selected={selected}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => onSelect(suggestion)}
            className={`flex min-h-11 cursor-pointer items-center gap-3 rounded-xl px-3.5 py-2 text-[15px] text-[#202124] ${selected ? 'bg-[#e8f0fe]' : 'hover:bg-[#f1f3f4]'}`}
          >
            <Search aria-hidden="true" className="size-4 shrink-0 text-[#5f6368]" />
            <span className="min-w-0 flex-1 break-words">
              {suggestion.slice(0, prefixLength)}<span className="font-semibold">{suggestion.slice(prefixLength)}</span>
            </span>
          </li>
        );
      })}
    </ul>
  );
}
