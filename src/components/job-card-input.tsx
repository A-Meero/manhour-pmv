"use client";

import { useEffect, useId, useState } from "react";

/** Text input with suggestions from the active job card list. */
export function JobCardInput({
  value,
  onChange,
  className = "input",
  invalid,
}: {
  value: string;
  onChange: (value: string) => void;
  className?: string;
  invalid?: boolean;
}) {
  const listId = useId();
  const [options, setOptions] = useState<string[]>([]);

  useEffect(() => {
    const query = value.trim();
    if (query.length < 1) {
      setOptions([]);
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(() => {
      fetch(`/api/job-cards/search?q=${encodeURIComponent(query)}`, { signal: controller.signal })
        .then((response) => (response.ok ? response.json() : []))
        .then((codes: string[]) => setOptions(codes))
        .catch(() => undefined);
    }, 200);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [value]);

  return (
    <>
      <input
        className={`${className} ${invalid ? "border-red-400 bg-red-50" : ""}`}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        list={listId}
        autoComplete="off"
        placeholder="Job card no."
        aria-label="Job card no."
      />
      <datalist id={listId}>
        {options.map((code) => (
          <option key={code} value={code} />
        ))}
      </datalist>
    </>
  );
}
