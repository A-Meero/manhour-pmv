import "server-only";

import { checkShiftEnds } from "@/lib/shifts";
import { autoStopStale } from "@/lib/work-sessions";

/**
 * Background checks, started once per server process from src/instrumentation.ts.
 * Safe with several processes: each session is stopped by a conditional update, so only one process acts on it.
 */

const EVERY_MS = 60_000;
const state = globalThis as unknown as { __manhourScheduler?: ReturnType<typeof setInterval> };
let running = false;

async function tick() {
  if (running) return;
  running = true;
  try {
    const { reminded, stopped, emailed } = await checkShiftEnds();
    if (reminded || stopped) console.info(`[scheduler] ${reminded} after-shift reminder(s), ${stopped} session(s) stopped at the hour limit, ${emailed} alert email(s) sent`);
    await autoStopStale();
  } catch (error) {
    console.error("[scheduler] check failed", error);
  } finally {
    running = false;
  }
}

export function startScheduler() {
  if (state.__manhourScheduler) return;
  state.__manhourScheduler = setInterval(tick, EVERY_MS);
  // First run shortly after start-up, once the server is ready.
  setTimeout(tick, 15_000);
}
