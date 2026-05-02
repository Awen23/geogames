import { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import type { CityRevealCity } from '@shared/cityRevealTypes';
import { flagEmoji } from '@shared/cityRevealTypes';
import { searchCityRevealCities } from '../../lib/cityRevealSearch';
import type { CityRevealSearchResult } from '../../lib/cityRevealSearch';
import styles from './CityInput.module.css';

interface CityInputProps {
  cities: CityRevealCity[];
  guessedIds: Set<string>;
  onGuess: (city: CityRevealCity) => void;
  disabled: boolean;
  loading: boolean;
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

export function CityInput({ cities, guessedIds, onGuess, disabled, loading }: CityInputProps) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [highlightIdx, setHighlightIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const filtered = useMemo<CityRevealSearchResult[]>(() => {
    return searchCityRevealCities(cities, query, guessedIds);
  }, [query, cities, guessedIds]);

  // Close dropdown on click outside
  useEffect(() => {
    function onPointerDown(e: PointerEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('pointerdown', onPointerDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
    };
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
    if (!open || filtered.length === 0) {
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightIdx((i) => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (filtered[highlightIdx]) {
        handleSelect(filtered[highlightIdx].city);
      }
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
          onFocus={() => {
            if (query) {
              setOpen(true);
            }
          }}
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
          {filtered.map((result, i) => (
            <li
              key={result.city.id}
              role="option"
              aria-selected={i === highlightIdx}
              aria-label={`${result.city.name} ${result.city.country}`}
              className={`${styles.option} ${i === highlightIdx ? styles.optionHighlighted : ''}`}
              onPointerDown={(e) => {
                // Use pointerdown so the input blur doesn't close the list first
                e.preventDefault();
                handleSelect(result.city);
              }}
              onMouseEnter={() => {
                setHighlightIdx(i);
              }}
            >
              <span className={styles.flag}>{flagEmoji(result.city.countryCode)}</span>
              <span className={styles.cityName}>
                {renderHighlightedText(result.city.name, result.cityMatchIndices)}
              </span>
              <span className={styles.countryName}>
                {renderHighlightedText(result.city.country, result.countryMatchIndices)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
