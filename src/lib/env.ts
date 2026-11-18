export function isProduction(): boolean {
  return process.env.NODE_ENV === "production";
}

function read(name: string): string {
  const value = process.env[name];
  return value && value.trim() !== "" ? value.trim() : "";
}

export const appConfig = {
  databaseUrl: (): string => {
    const value = read("DATABASE_URL");
    if (!value) throw new Error("DATABASE_URL is not set.");
    return value;
  },
  authSecret: (): string => {
    const value = read("AUTH_SECRET");
    if (value) return value;
    if (isProduction()) throw new Error("AUTH_SECRET is required in production.");
    return "dev-auth-secret-change-me";
  },
  /** Folder where photographed sheets are stored */
  uploadDir: (): string => read("UPLOAD_DIR") || "./uploads",
  /** Optional local folder holding Tesseract language data (eng.traineddata). Empty = download from CDN on first use. */
  tessdataDir: (): string => read("TESSDATA_DIR"),
};
