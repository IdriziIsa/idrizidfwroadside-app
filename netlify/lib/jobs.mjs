import crypto from "node:crypto";

const flat = (s, n) => String(s ?? "").replace(/[\u0000-\u001f\u007f]+/g, " ").trim().slice(0, n);
export const STATUSES = ["New", "Quoted", "Booked", "Done"];
export const newId = () => crypto.randomBytes(16).toString("hex");
export const isId = s => /^[a-f0-9]{32}$/.test(String(s || ""));
export const newRef = () => crypto.randomBytes(4).toString("hex").slice(0, 6).toUpperCase();
export const isRef = s => /^[A-Z0-9]{6}$/.test(String(s || ""));

export function cleanFields(b = {}) {
  const f = { service: flat(b.service, 40), when: flat(b.when, 60), name: flat(b.name, 80), phone: flat(b.phone, 30),
    loc: flat(b.loc, 200), map: flat(b.map, 200), veh: flat(b.veh, 120), vin: flat(b.vin, 80), notes: flat(b.notes, 600) };
  if (!/^https:\/\/maps\.google\.com\//.test(f.map)) f.map = "";
  const m = f.map.match(/q=(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/);
  if (m) { f.lat = parseFloat(m[1]); f.lng = parseFloat(m[2]); }
  return f;
}

/* Same layout the customer's text message uses, so the quote page can parse it. */
export function buildRaw(f, ref) {
  return [
    "QUOTE REQUEST",
    [f.service && "Service: " + f.service, f.when && "When: " + f.when],
    [f.name && "Name: " + f.name, f.phone && "Phone: " + f.phone],
    [f.loc && "Location: " + f.loc, f.map && "Map: " + f.map],
    [f.veh && "Vehicle: " + f.veh, f.vin && "VIN: " + f.vin],
    f.notes && "Notes: " + f.notes,
    ref && "Ref: " + ref,
  ].map(x => Array.isArray(x) ? x.filter(Boolean).join("\n") : x).filter(Boolean).join("\n\n");
}

const getF = (t, label) => { const m = String(t).match(new RegExp("^\\s*" + label + "\\s*:\\s*(.*)$", "im")); return m ? m[1].trim() : ""; };
export function parseRaw(t) {
  const f = cleanFields({ service: getF(t, "Service"), when: getF(t, "When"), name: getF(t, "Name"), phone: getF(t, "Phone"),
    loc: getF(t, "Location"), map: getF(t, "Map"), veh: getF(t, "Vehicle"), vin: getF(t, "VIN"), notes: getF(t, "Notes") });
  const ref = getF(t, "Ref").toUpperCase();
  return { fields: f, ref: isRef(ref) ? ref : "" };
}

export function makeJob({ id, ref, fields, raw, status = "New" }) {
  return { id, ref, ts: Date.now(), status, ...fields, raw: flat(raw, 2000).length ? String(raw).slice(0, 2000) : buildRaw(fields, ref), price: "", miles: "" };
}

export const json = (data, status = 200) => Response.json(data, { status, headers: { "cache-control": "no-store" } });

export async function rateLimit(s, ip, bucket, max) {
  const key = "rl/" + bucket + "/" + String(ip || "x").replace(/[^a-zA-Z0-9.:]/g, "") + "/" + Math.floor(Date.now() / 3600000);
  const n = (await s.get(key, { type: "json" })) || 0;
  if (n >= max) return false;
  await s.setJSON(key, n + 1);
  return true;
}

/* Optional email alert. Needs RESEND_API_KEY and NOTIFY_EMAIL in Netlify environment variables. */
export async function notify(subject, text) {
  const key = process.env.RESEND_API_KEY, to = process.env.NOTIFY_EMAIL;
  if (!key || !to) return;
  try {
    await fetch("https://api.resend.com/emails", {
      method: "POST", headers: { authorization: "Bearer " + key, "content-type": "application/json" },
      body: JSON.stringify({ from: process.env.NOTIFY_FROM || "Idrizi DFW Roadside <onboarding@resend.dev>", to: [to], subject, text }),
    });
  } catch (e) { /* alerts are best effort */ }
}
