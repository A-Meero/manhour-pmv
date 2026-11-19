"use client";

import Link from "next/link";
import { X } from "lucide-react";

export function Modal({
  title,
  onClose,
  children,
  wide,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center sm:p-4" onClick={onClose}>
      <div
        className={`max-h-[92vh] w-full overflow-y-auto rounded-t-xl bg-white shadow-xl sm:rounded-xl ${wide ? "sm:max-w-3xl" : "sm:max-w-lg"}`}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-gray-200 bg-white px-5 py-3">
          <h2 className="text-base font-bold text-gray-900">{title}</h2>
          <button onClick={onClose} className="rounded p-1 text-gray-500 hover:bg-gray-100" aria-label="Close">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="px-5 py-4">{children}</div>
      </div>
    </div>
  );
}

export function Alert({ kind = "error", children }: { kind?: "error" | "success" | "info" | "warning"; children: React.ReactNode }) {
  const styles = {
    error: "bg-red-50 text-red-800 border-red-200",
    success: "bg-green-50 text-green-800 border-green-200",
    info: "bg-blue-50 text-blue-800 border-blue-200",
    warning: "bg-amber-50 text-amber-900 border-amber-200",
  };
  return <div className={`rounded-md border px-3 py-2 text-sm ${styles[kind]}`}>{children}</div>;
}

export function PageHeader({ title, description, actions }: { title: string; description?: string; actions?: React.ReactNode }) {
  return (
    <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="page-title">{title}</h1>
        {description && <p className="mt-1 text-sm text-gray-500">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

/** Link-based pagination that keeps the other query parameters. */
export function Pagination({
  page,
  pageSize,
  total,
  basePath,
  params,
}: {
  page: number;
  pageSize: number;
  total: number;
  basePath: string;
  params: Record<string, string>;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const href = (target: number) => {
    const query = new URLSearchParams({ ...params, page: String(target) });
    return `${basePath}?${query.toString()}`;
  };
  return (
    <div className="mt-3 flex items-center justify-between text-sm text-gray-600">
      <span>
        {total === 0 ? "No results" : `${(page - 1) * pageSize + 1}–${Math.min(page * pageSize, total)} of ${total}`}
      </span>
      <div className="flex gap-2">
        {page > 1 ? <Link className="btn btn-sm" href={href(page - 1)}>Previous</Link> : <span className="btn btn-sm opacity-40">Previous</span>}
        {page < pages ? <Link className="btn btn-sm" href={href(page + 1)}>Next</Link> : <span className="btn btn-sm opacity-40">Next</span>}
      </div>
    </div>
  );
}

export function StatusBadge({ active }: { active: boolean }) {
  return active ? (
    <span className="badge bg-green-100 text-green-800">Active</span>
  ) : (
    <span className="badge bg-gray-200 text-gray-700">Inactive</span>
  );
}

export const SOURCE_LABEL: Record<string, string> = { MANUAL: "Manual", EXCEL: "Excel", API: "API", PHOTO: "Photo", QR: "QR scan" };
