/** Runs once when the server starts: starts the background checks (shift ends, stale QR sessions). */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.DISABLE_SCHEDULER === "true") return;
  const { startScheduler } = await import("@/lib/scheduler");
  startScheduler();
}
