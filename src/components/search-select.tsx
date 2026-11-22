"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { ChevronDown, X } from "lucide-react";

export type SearchOption = { value: string; label: string };

/** A dropdown with a search box: type part of a name or number to narrow the list. */
export function SearchSelect({
  value,
  options,
  onChange,
  placeholder = "Type to search…",
  noneLabel = "— None —",
  maxShown = 50,
}: {
  value: string;
  options: SearchOption[];
  onChange: (value: string) => void;
  placeholder?: string;
  /** Label of the empty choice; pass null for no empty choice */
  noneLabel?: string | null;
  maxShown?: number;
}) {
  const listId = useId();
  const box = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const selected = options.find((option) => option.value === value) ?? null;

  const found = useMemo(() => {
    const words = query.toLowerCase().split(/\s+/).filter(Boolean);
    return words.length ? options.filter((option) => words.every((word) => option.label.toLowerCase().includes(word))) : options;
  }, [options, query]);
  const matches = found.slice(0, maxShown);
  const total = found.length;
  const choices: (SearchOption | null)[] = noneLabel !== null && !query ? [null, ...matches] : matches;

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => {
      if (box.current && !box.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  function openList() {
    setQuery("");
    setActive(0);
    setOpen(true);
  }

  function pick(option: SearchOption | null) {
    onChange(option?.value ?? "");
    setOpen(false);
    setQuery("");
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (!open && (event.key === "ArrowDown" || event.key === "Enter")) {
      event.preventDefault();
      openList();
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActive((i) => Math.min(i + 1, choices.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (event.key === "Enter") {
      event.preventDefault();
      if (choices[active] !== undefined) pick(choices[active]);
    } else if (event.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    <div ref={box} className="relative">
      <div className="relative">
        <input
          ref={input}
          className="input pr-14"
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          placeholder={open ? placeholder : selected ? "" : (noneLabel ?? placeholder)}
          value={open ? query : (selected?.label ?? "")}
          onFocus={() => !open && openList()}
          onClick={() => !open && openList()}
          onChange={(event) => {
            setQuery(event.target.value);
            setActive(0);
            setOpen(true);
          }}
          onKeyDown={onKeyDown}
        />
        <div className="absolute inset-y-0 right-2 flex items-center gap-1 text-gray-400">
          {selected && noneLabel !== null && (
            <button type="button" className="rounded p-0.5 hover:text-gray-700" aria-label="Clear" onMouseDown={(e) => e.preventDefault()} onClick={() => pick(null)}>
              <X className="h-4 w-4" />
            </button>
          )}
          <ChevronDown className="pointer-events-none h-4 w-4" />
        </div>
      </div>
      {open && (
        <ul id={listId} role="listbox" className="absolute z-20 mt-1 max-h-64 w-full overflow-y-auto rounded-md border border-gray-200 bg-white py-1 text-sm shadow-lg">
          {choices.length === 0 && <li className="px-3 py-2 text-gray-500">No match for “{query}”</li>}
          {choices.map((option, index) => (
            <li
              key={option?.value ?? "__none"}
              role="option"
              aria-selected={(option?.value ?? "") === value}
              className={`cursor-pointer px-3 py-2 ${index === active ? "bg-blue-50" : ""} ${(option?.value ?? "") === value ? "font-semibold" : ""} ${option ? "" : "text-gray-500"}`}
              onMouseEnter={() => setActive(index)}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => pick(option)}
            >
              {option?.label ?? noneLabel}
            </li>
          ))}
          {total > matches.length && <li className="px-3 py-2 text-xs text-gray-500">{total - matches.length} more – keep typing to narrow the list</li>}
        </ul>
      )}
    </div>
  );
}
