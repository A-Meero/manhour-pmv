import { NextResponse } from "next/server";
import { withUser } from "@/lib/http";
import { vapidKeys } from "@/lib/push";

/** The public key browsers subscribe to push with. */
export const GET = withUser(async () => NextResponse.json({ publicKey: (await vapidKeys()).publicKey }));
