/** The ways man-hours can be logged. Each can be switched off in Settings (admins can still use it). */
export const LOGGING_METHODS = ["manual", "excel", "photo", "qr"] as const;
export type LoggingMethod = (typeof LOGGING_METHODS)[number];

export const LOGGING_METHOD_INFO: Record<LoggingMethod, { label: string; description: string; settingKey: string }> = {
  manual: { label: "New Entry", description: "Typing records into the sheet-shaped form.", settingKey: "methodManual" },
  excel: { label: "Import Records", description: "Uploading the Excel records template.", settingKey: "methodExcel" },
  photo: { label: "Scan Sheet", description: "Photographing a filled paper sheet.", settingKey: "methodPhoto" },
  qr: { label: "Job card QR", description: "Technicians scan the job card QR code to start and stop work.", settingKey: "methodQr" },
};

/** Which switch controls records of each source. API record imports count as Excel imports. */
export const METHOD_FOR_SOURCE: Record<string, LoggingMethod> = {
  MANUAL: "manual",
  EXCEL: "excel",
  API: "excel",
  PHOTO: "photo",
  QR: "qr",
};
