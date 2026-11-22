import "server-only";

import { activeProviders } from "@/lib/ai-providers";
import { askProvider } from "@/lib/ai-vision";
import { parseDate, toIsoDate } from "@/lib/dates";

/**
 * Reads the printed header of an original job card (the other system's "JOB CARD" form) from a photo or PDF.
 * Only the computer-printed text is used; handwriting added in the workshop is ignored.
 */

export type JobCardDraft = {
  code: string;
  assetCode: string;
  description: string;
  plateNo: string;
  chassisNo: string;
  yearOfMake: string;
  previousReading: string;
  currentReading: string;
  /** YYYY-MM-DD */
  dateIn: string;
  jobType: string;
  repairAt: string;
  project: string;
  operatorName: string;
  receivedBy: string;
  createdByName: string;
  tasks: { description: string; fromDate: string }[];
};

export const emptyDraft = (): JobCardDraft => ({
  code: "",
  assetCode: "",
  description: "",
  plateNo: "",
  chassisNo: "",
  yearOfMake: "",
  previousReading: "",
  currentReading: "",
  dateIn: "",
  jobType: "",
  repairAt: "",
  project: "",
  operatorName: "",
  receivedBy: "",
  createdByName: "",
  tasks: [],
});

const PROMPT = `This is a photo or PDF of a printed vehicle / equipment workshop "JOB CARD" form. If it has several pages, read the first job card only.
Read ONLY the computer-printed (typed) text. IGNORE everything handwritten in pen (handwritten parts lists, technician names,
signatures, handwritten dates, hours or numbers written over the form). If a box only contains handwriting, return "".

Return ONLY a JSON object, no markdown, with exactly these keys (strings unless noted):
{
  "repOrderNumber": the printed number under "Rep.Order Number" (this is the job card number),
  "assetCode": the printed value after "Code" at the top left (e.g. "SUV172", "DT41", "BS#76"),
  "description": the printed description line under "Description" (e.g. "MITSUBISHI PAJERO SPORT SUV"),
  "plate": the value after "PLATE:",
  "chassis": the value after "CHASS:",
  "yearOfMake": the value after "YoM:",
  "previousReading": printed number under "Previous HM/KM",
  "currentReading": printed number under "Current HM/KM",
  "dateIn": printed "Date In" exactly as printed (DD-MM-YYYY),
  "jobType": printed value under "Job Type" (e.g. "Break Down", "Routine Check", "Traffic Passing"),
  "repairAt": printed value after "Repair at",
  "project": printed value after "Project",
  "operatorName": printed value after "Operator Name",
  "receivedBy": printed value after "Received By",
  "createdBy": printed value after "Created By",
  "workDone": array of the printed "Work Done" task lines: [{ "description": "...", "from": printed "From" value or "" }]
}
Use "" for anything that is empty, handwritten only, or unreadable. Do not guess.`;

const str = (value: unknown, max = 200) => (typeof value === "string" || typeof value === "number" ? String(value).trim().replace(/\s+/g, " ").slice(0, max) : "");
const digits = (value: unknown) => str(value).replace(/[,\s]/g, "").match(/^\d+(\.\d+)?$/)?.[0] ?? "";

/** "24-Oct" (no year) → that day in the year of the date in. */
function taskDate(value: string, dateIn: string) {
  if (!value) return "";
  const full = parseDate(value);
  if (full) return toIsoDate(full);
  const match = value.match(/^(\d{1,2})[-\s/.]([A-Za-z]{3})/);
  if (!match || !dateIn) return "";
  const month = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"].indexOf(match[2].toLowerCase());
  if (month < 0) return "";
  const date = new Date(Date.UTC(Number(dateIn.slice(0, 4)), month, Number(match[1])));
  return Number.isNaN(date.getTime()) ? "" : toIsoDate(date);
}

export function coerceDraft(value: unknown): JobCardDraft {
  const v = (value && typeof value === "object" ? value : {}) as Record<string, unknown>;
  const dateIn = toIsoDate(parseDate(str(v.dateIn)));
  const tasks = Array.isArray(v.workDone) ? v.workDone : [];
  return {
    code: str(v.repOrderNumber, 100).toUpperCase(),
    assetCode: str(v.assetCode, 40).toUpperCase(),
    description: str(v.description),
    plateNo: str(v.plate, 30),
    chassisNo: str(v.chassis, 40).replace(/\s+/g, "").toUpperCase(),
    yearOfMake: str(v.yearOfMake).match(/^(19|20)\d{2}$/)?.[0] ?? "",
    previousReading: digits(v.previousReading),
    currentReading: digits(v.currentReading),
    dateIn,
    jobType: str(v.jobType),
    repairAt: str(v.repairAt),
    project: str(v.project),
    operatorName: str(v.operatorName),
    receivedBy: str(v.receivedBy),
    createdByName: str(v.createdBy),
    tasks: tasks
      .map((task) => {
        const t = (task && typeof task === "object" ? task : { description: task }) as Record<string, unknown>;
        return { description: str(t.description, 500), fromDate: taskDate(str(t.from), dateIn) };
      })
      .filter((task) => task.description)
      .slice(0, 50),
  };
}

export type JobCardReadResult = { draft: JobCardDraft; engine: string; warning: string; error: string };

/** Tries the enabled AI providers in priority order (Settings › Photo reading); the next one on failure. */
export async function readJobCardPhoto(data: Buffer, mimeType: string): Promise<JobCardReadResult> {
  const providers = await activeProviders();
  if (!providers.length) {
    return { draft: emptyDraft(), engine: "", warning: "", error: "Photo reading is not set up (Settings › Photo reading), so please type the details." };
  }
  const failures: string[] = [];
  for (const provider of providers) {
    try {
      const text = await askProvider(provider, { prompt: PROMPT, image: { data, mimeType }, maxTokens: 4096 });
      const start = text.indexOf("{");
      const end = text.lastIndexOf("}");
      if (start < 0 || end < start) throw new Error("the answer did not contain readable data");
      const draft = coerceDraft(JSON.parse(text.slice(start, end + 1)));
      if (!draft.code && !draft.assetCode && !draft.description) throw new Error("no job card details were found in the photo");
      return { draft, engine: `${provider.name} · ${provider.model}`, warning: failures.length ? `${failures.join(" ")} ${provider.name} was used instead.` : "", error: "" };
    } catch (error) {
      failures.push(`${provider.name} could not read it (${error instanceof Error ? error.message : "unknown error"}).`);
    }
  }
  return { draft: emptyDraft(), engine: "", warning: "", error: `${failures.join(" ")} Please type the details.` };
}
