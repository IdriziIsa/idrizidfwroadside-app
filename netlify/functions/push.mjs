import crypto from "node:crypto";
import { store } from "../lib/store.mjs";
import { json } from "../lib/jobs.mjs";
import { pushReady, subKey } from "../lib/push.mjs";

function authed(req) {
  const pin = process.env.QUEUE_PIN; if (!pin) return false;
  const a = Buffer.from(req.headers.get("x-queue-pin") || ""), b = Buffer.from(pin);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/* Private (PIN): register or remove this phone for alerts. */
export default async (req) => {
  if (!authed(req)) { await new Promise(r => setTimeout(r, 1000)); return json({ error: "bad_pin" }, 401); }
  if (!pushReady()) return json({ error: "push_not_configured" }, 503);
  if (req.method === "GET") return json({ key: process.env.VAPID_PUBLIC });
  let b; try { b = await req.json(); } catch (e) { return json({ error: "bad_json" }, 400); }
  const sub = b.sub;
  if (!sub || typeof sub.endpoint !== "string" || !/^https:\/\//.test(sub.endpoint) || !sub.keys || !sub.keys.p256dh || !sub.keys.auth) return json({ error: "bad_subscription" }, 400);
  const s = store();
  if (req.method === "POST") { await s.setJSON(subKey(sub.endpoint), { endpoint: sub.endpoint, keys: { p256dh: String(sub.keys.p256dh), auth: String(sub.keys.auth) } }); return json({ ok: true }); }
  if (req.method === "DELETE") { await s.delete(subKey(sub.endpoint)); return json({ ok: true }); }
  return json({ error: "method" }, 405);
};
export const config = { path: "/api/push" };
