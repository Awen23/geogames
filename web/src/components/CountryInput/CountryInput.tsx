import { useState, useRef, useCallback, useEffect, useId } from 'react';
import { type CountryEntry, type CountrySearchResult, iso2ToFlag, searchCountryMatches } from '@shared/guessCountries';
import styles from './CountryInput.module.css';

interface CountryInputProps {
  onSelect: (iso3: string) => void;
  excludeIso3s?: string[];
  disabled?: boolean;
  /** Clears the input after selection when true (default: true) */
  clearOnSelect?: boolean;
}

function renderHighlightedText(value: string, matchIndices: Set<number>) {
  return Array.from(value).map((char, index) => (
    matchIndices.has(index) ? (
      <strong key={`${char}-${index}`} className={styles.match}>
        {char}
      </strong>
    ) : (
      <span key={`${char}-${index}`}>{char}</span>
    )
  ));
}

export function CountryInput({
  onSelect,
  excludeIso3s = [],
  disabled = false,
  clearOnSelect = true,
}: CountryInputProps) {
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState<CountrySearchResult[]>([]);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const listboxId = useId();

  const updateSuggestions = useCallback(
    (q: string) => {
      if (!q) {
        setSuggestions([]);
        setOpen(false);
        return;
      }
      const results = searchCountryMatches(q, 8).filter((result) => !excludeIso3s.includes(result.country.iso3));
      setSuggestions(results);
      setOpen(results.length > 0);
      setActiveIndex(-1);
    },
    [excludeIso3s],
  );

  const commit = useCallback(
    (entry: CountryEntry) => {
      onSelect(entry.iso3);
      if (clearOnSelect) {
        setQuery('');
        setSuggestions([]);
        setOpen(false);
        setActiveIndex(-1);
        inputRef.current?.focus();
      }
    },
    [onSelect, clearOnSelect],
  );

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setQuery(val);
    updateSuggestions(val);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!open) {
      return;
    }
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setActiveIndex((i) => Math.min(i + 1, suggestions.length - 1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setActiveIndex((i) => Math.max(i - 1, -1));
        break;
      case 'Enter':
        e.preventDefault();
        if (activeIndex >= 0 && suggestions[activeIndex]) {
          commit(suggestions[activeIndex].country);
        } else if (suggestions.length === 1) {
          commit(suggestions[0].country);
        }
        break;
      case 'Escape':
        setOpen(false);
        setActiveIndex(-1);
        break;
    }
  };

  // Scroll active item into view
  useEffect(() => {
    if (activeIndex < 0 || !listRef.current) {
      return;
    }
    const item = listRef.current.children[activeIndex] as HTMLElement | undefined;
    item?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex]);

  // Close on outside click
  useEffect(() => {
    const handle = (e: MouseEvent) => {
      if (
        inputRef.current &&
        !inputRef.current.closest(`.${styles.wrapper}`)?.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, []);

  // Refresh suggestions when excluded countries change (after a guess)
  useEffect(() => {
    if (query) {
      updateSuggestions(query);
    }
  }, [excludeIso3s, query, updateSuggestions]);

  return (
    <div className={styles.wrapper}>
      <input
        ref={inputRef}
        className={styles.input}
        type="text"
        role="combobox"
        aria-expanded={open}
        aria-haspopup="listbox"
        value={query}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onFocus={() => {
          if (query) {
            updateSuggestions(query);
          }
        }}
        placeholder="Type a country name…"
        disabled={disabled}
        autoComplete="off"
        spellCheck={false}
        aria-label="Country name"
        aria-autocomplete="list"
        aria-controls={listboxId}
        aria-activedescendant={activeIndex >= 0 ? `${listboxId}-option-${activeIndex}` : undefined}
        data-testid="country-input"
      />
      {open && (
        <ul
          ref={listRef}
          id={listboxId}
          className={styles.dropdown}
          role="listbox"
          aria-label="Country suggestions"
        >
          {suggestions.map((suggestion, i) => (
            <li
              key={suggestion.country.iso3}
              id={`${listboxId}-option-${i}`}
              role="option"
              aria-selected={i === activeIndex}
              className={`${styles.option} ${i === activeIndex ? styles.optionActive : ''}`}
              onMouseDown={(e) => {
                e.preventDefault(); // keep focus on input
                commit(suggestion.country);
              }}
              onMouseEnter={() => {
                setActiveIndex(i);
              }}
            >
              <span className={styles.flag}>{iso2ToFlag(suggestion.country.iso2)}</span>
              <span className={styles.optionName}>
                {renderHighlightedText(suggestion.country.name, suggestion.nameMatchIndices)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
