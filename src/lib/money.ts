/** Costs are in Kuwaiti dinar with 3 decimals (fils). Shared by the server and the browser. */
export const CURRENCY = "KWD";

export const round3 = (value: number) => Math.round(value * 1000) / 1000;

export function formatMoney(value: number, withCurrency = true) {
  const text = round3(value).toLocaleString("en-US", { minimumFractionDigits: 3, maximumFractionDigits: 3 });
  return withCurrency ? `${text} ${CURRENCY}` : text;
}

export function formatQty(value: number) {
  return value.toLocaleString("en-US", { maximumFractionDigits: 3 });
}
