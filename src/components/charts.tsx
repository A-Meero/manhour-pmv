"use client";

import { useState } from "react";

const SERIES = "#2a78d6";
const GRID = "#e7e6e2";

function niceMax(value: number) {
  if (value <= 0) return 10;
  const power = 10 ** Math.floor(Math.log10(value));
  const step = [1, 2, 2.5, 5, 10].find((s) => s * power >= value / 4) ?? 10;
  return Math.ceil(value / (step * power)) * step * power;
}

const fmt = (value: number) => (Number.isInteger(value) ? value.toLocaleString() : value.toLocaleString(undefined, { maximumFractionDigits: 1 }));

/** Single-series column chart with a hover tooltip. */
export function ColumnChart({ data, unit = "h", height = 220 }: { data: { label: string; detail: string; value: number }[]; unit?: string; height?: number }) {
  const [hover, setHover] = useState<number | null>(null);
  const max = niceMax(Math.max(0, ...data.map((d) => d.value)));
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => t * max);
  const left = 44;
  const bottom = 26;
  const top = 10;
  const width = Math.max(320, data.length * 36 + left);
  const plotH = height - top - bottom;
  const band = (width - left) / Math.max(1, data.length);
  const barW = Math.min(24, band * 0.6);
  const labelEvery = Math.ceil(data.length / 12);

  if (data.length === 0) return <p className="py-8 text-center text-sm text-gray-500">No data.</p>;

  return (
    <div className="relative overflow-x-auto">
      <svg viewBox={`0 0 ${width} ${height}`} className="h-auto w-full min-w-[320px]" role="img" aria-label="Column chart">
        {ticks.map((tick) => {
          const y = top + plotH - (tick / max) * plotH;
          return (
            <g key={tick}>
              <line x1={left} x2={width} y1={y} y2={y} stroke={GRID} strokeWidth={1} />
              <text x={left - 6} y={y + 4} textAnchor="end" fontSize={10} fill="#52514e">{fmt(tick)}</text>
            </g>
          );
        })}
        {data.map((d, i) => {
          const h = (d.value / max) * plotH;
          const x = left + i * band + (band - barW) / 2;
          const y = top + plotH - h;
          const r = Math.min(4, h / 2, barW / 2);
          const path =
            h <= 0
              ? ""
              : `M${x},${top + plotH} V${y + r} Q${x},${y} ${x + r},${y} H${x + barW - r} Q${x + barW},${y} ${x + barW},${y + r} V${top + plotH} Z`;
          return (
            <g key={d.label + i} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} onClick={() => setHover(i)}>
              <rect x={left + i * band} y={top} width={band} height={plotH} fill={hover === i ? "rgba(0,0,0,0.04)" : "transparent"} />
              {path && <path d={path} fill={SERIES} />}
              {i % labelEvery === 0 && (
                <text x={left + i * band + band / 2} y={height - 8} textAnchor="middle" fontSize={10} fill="#52514e">{d.label}</text>
              )}
            </g>
          );
        })}
      </svg>
      {hover !== null && data[hover] && (
        <div className="pointer-events-none absolute top-0 rounded-md border border-gray-200 bg-white px-2 py-1 text-xs shadow" style={{ left: `${Math.min(80, ((hover + 0.5) / data.length) * 100)}%` }}>
          <div className="text-gray-500">{data[hover].detail}</div>
          <div className="font-semibold text-gray-900">
            {fmt(data[hover].value)}
            {unit}
          </div>
        </div>
      )}
    </div>
  );
}

/** Ranked horizontal bars with the value at the tip. */
export function BarList({ data, unit = "h", limit = 10 }: { data: { label: string; sub?: string; value: number }[]; unit?: string; limit?: number }) {
  const rows = data.slice(0, limit);
  const max = Math.max(0, ...rows.map((d) => d.value)) || 1;
  if (rows.length === 0) return <p className="py-8 text-center text-sm text-gray-500">No data.</p>;
  return (
    <ul className="space-y-2">
      {rows.map((row, index) => (
        <li key={row.label + index} title={`${row.label}: ${fmt(row.value)}${unit}`}>
          <div className="flex items-baseline justify-between gap-2 text-sm">
            <span className="truncate text-gray-800">
              {row.label}
              {row.sub && <span className="ml-1 text-xs text-gray-500">{row.sub}</span>}
            </span>
          </div>
          <div className="mt-1 flex items-center gap-2">
            <div className="h-2.5 flex-1 rounded-r bg-transparent">
              <div className="h-2.5 rounded-r" style={{ width: `${(row.value / max) * 100}%`, background: SERIES, minWidth: row.value > 0 ? 2 : 0 }} />
            </div>
            <span className="w-16 shrink-0 text-right text-xs font-semibold text-gray-900">
              {fmt(row.value)}
              {unit}
            </span>
          </div>
        </li>
      ))}
    </ul>
  );
}
