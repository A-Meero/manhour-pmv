"use client";

import { useEffect } from "react";

/**
 * Login cookies are SameSite=Strict, so a link opened from the phone's camera app arrives without them.
 * Reloading the same address from inside the page is a same-site navigation, which does send them.
 */
export function CookieBounce() {
  useEffect(() => {
    const url = new URL(window.location.href);
    url.searchParams.set("b", "1");
    window.location.replace(url.toString());
  }, []);
  return <p className="p-6 text-center text-sm text-gray-500">Opening…</p>;
}
