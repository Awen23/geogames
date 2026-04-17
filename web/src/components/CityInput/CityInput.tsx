import { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import type { CityRevealCity } from '@shared/cityRevealTypes';
import { flagEmoji } from '@shared/cityRevealTypes';
import styles from './CityInput.module.css';

interface CityInputProps {
  cities: CityRevealCity[];
  guessedIds: Set<string>;
  onGuess: (city: CityRevealCity) => void;
  disabled: boolean;
  loading: boolean;
}

export function CityInput({ cities, guessedIds, onGuess, disabled, loading }: CityInputProps) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [highlightIdx, setHighlightIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const filtered = useMemo<CityRevealCity[]>(() => {
    const q = query.trim().toLowerCase();
    if (!q) { return []; }
    return cities
      .filter((c) => !guessedIds.has(c.id))
      .filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          c.country.toLowerCase().includes(q),
      )
      .sort((a, b) => {
        // Exact city-name prefix sorts first
        const aStarts = a.name.toLowerCase().startsWith(q) ? 0 : 1;
        const bStarts = b.name.toLowerCase().startsWith(q) ? 0 : 1;
        return aStarts - bStarts || a.name.localeCompare(b.name);
      })
      .slice(0, 8);
  }, [query, cities, guessedIds]);

  // Close dropdown on click outside
  useEffect(() => {
    function onPointerDown(e: PointerEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('pointerdown', onPointerDown);
    return () => { document.removeEventListener('pointerdown', onPointerDown); };
  }, []);

  const handleSelect = useCallback(
    (city: CityRevealCity) => {
      onGuess(city);
      setQuery('');
      setOpen(false);
      inputRef.current?.focus();
    },
    [onGuess],
  );

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!open || filtered.length === 0) { return; }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightIdx((i) => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (filtered[highlightIdx]) { handleSelect(filtered[highlightIdx]); }
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  }

  const isDisabled = disabled || loading;

  return (
    <div ref={containerRef} className={styles.container}>
      <div className={styles.inputRow}>
        <input
          ref={inputRef}
          type="text"
          role="combobox"
          aria-expanded={open}
          aria-autocomplete="list"
          aria-label="Enter a city name"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
            setHighlightIdx(0);
          }}
          onFocus={() => { if (query) { setOpen(true); } }}
          onKeyDown={handleKeyDown}
          placeholder="Enter a city or country…"
          disabled={isDisabled}
          className={styles.input}
          autoComplete="off"
          spellCheck={false}
        />
        {loading && <span className={styles.spinner} aria-hidden="true" />}
      </div>

      {open && filtered.length > 0 && (
        <ul className={styles.dropdown} role="listbox" aria-label="City suggestions">
          {filtered.map((city, i) => (
            <li
              key={city.id}
              role="option"
              aria-selected={i === highlightIdx}
              className={`${styles.option} ${i === highlightIdx ? styles.optionHighlighted : ''}`}
              onPointerDown={(e) => {
                // Use pointerdown so the input blur doesn't close the list first
                e.preventDefault();
                handleSelect(city);
              }}
              onMouseEnter={() => { setHighlightIdx(i); }}
            >
              <span className={styles.flag}>{flagEmoji(city.countryCode)}</span>
              <span className={styles.cityName}>{city.name},</span>
              <span className={styles.countryName}>{city.country}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
