import crypto from "node:crypto";
import * as webpush from "web-push";
import { readJSON } from "./store.mjs";

export const pushReady = () => !!(process.env.VAPID_PUBLIC && process.env.VAPID_PRIVATE);
export const subKey = endpoint => "push/" + crypto.createHash("sha256").update(endpoint).digest("hex").slice(0, 40);

/* Sends a phone alert to every subscribed device. Best effort: never throws, gives up after 4 seconds. */
export async function sendPush(s, payload, wp = webpush) {
  if (!pushReady()) return 0;
  try {
    wp.setVapidDetails(process.env.VAPID_SUBJECT || "mailto:admin@idrizidfwroadside.netlify.app", process.env.VAPID_PUBLIC, process.env.VAPID_PRIVATE);
    const { blobs } = await s.list({ prefix: "push/" });
    let sent = 0;
    await Promise.race([
      Promise.all(blobs.map(async b => {
        const sub = await readJSON(s, b.key); if (!sub) return;
        try { await wp.sendNotification(sub, JSON.stringify(payload), { TTL: 3600, urgency: "high" }); sent++; }
        catch (e) { if (e && (e.statusCode === 404 || e.statusCode === 410)) await s.delete(b.key); }
      })),
      new Promise(r => setTimeout(r, 4000)),
    ]);
    return sent;
  } catch (e) { return 0; }
}
