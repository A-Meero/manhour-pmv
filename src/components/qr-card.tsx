import { Download, Printer } from "lucide-react";

/** A QR code block: the code, what scanning it does, and download / print-label buttons. */
export function QrCard({ dataUrl, alt, caption, labelHref, downloadName }: { dataUrl: string; alt: string; caption: string; labelHref: string; downloadName: string }) {
  return (
    <div className="card flex flex-col items-center gap-2 p-4 text-center sm:flex-row sm:text-left">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={dataUrl} alt={alt} width={140} height={140} className="shrink-0" />
      <div className="space-y-2">
        <p className="text-sm text-gray-600">{caption}</p>
        <div className="flex flex-wrap justify-center gap-2 sm:justify-start">
          <a className="btn btn-sm" href={labelHref} target="_blank" rel="noreferrer">
            <Printer className="h-3.5 w-3.5" /> Print label
          </a>
          <a className="btn btn-sm" href={dataUrl} download={downloadName}>
            <Download className="h-3.5 w-3.5" /> Download QR
          </a>
        </div>
      </div>
    </div>
  );
}
