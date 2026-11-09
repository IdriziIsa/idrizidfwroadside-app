import { store, readJSON } from "../lib/store.mjs";
import { sendPush } from "../lib/push.mjs";
import { isId, json, rateLimit, notify } from "../lib/jobs.mjs";

const DAY = 24 * 3600 * 1000;
const view = j => ({ name: (j.name || "").split(/\s+/)[0], service: j.service, status: j.status, price: j.quote?.price || "", eta: j.quote?.eta || "", note: j.quote?.note || "",
  expired: !!j.quote && j.status === "Quoted" && Date.now() - j.quote.ts > 2 * DAY });

/* Public: the customer's tap-to-book link. Knowing the long random id is the permission. */
export default async (req, context) => {
  const s = store();
  const url = new URL(req.url);
  let id = url.searchParams.get("j");
  let post = req.method === "POST";
  if (post) { try { id = (await req.json()).j; } catch (e) { return json({ error: "bad_json" }, 400); } }
  if (!isId(id)) return json({ error: "not_found" }, 404);
  if (!(await rateLimit(s, context?.ip, "conf", 60))) return json({ error: "slow_down" }, 429);
  const job = await readJSON(s, "job/" + id);
  if (!job) return json({ error: "not_found" }, 404);
  if (post && job.status === "Quoted" && job.quote) {
    if (Date.now() - job.quote.ts > 2 * DAY) return json({ error: "expired", job: view(job) }, 410);
    job.status = "Booked"; job.confirmed = true; job.confirmedTs = Date.now();
    await s.setJSON("job/" + id, job);
    await Promise.all([
      notify("Customer booked: " + job.service + " - " + job.name, "Booked at $" + job.quote.price + ". Phone: " + job.phone),
      sendPush(s, { title: (job.name || "Customer") + " booked", body: job.service + " · $" + job.quote.price, url: "/jobs.html?ref=" + (job.ref || ""), tag: "book-" + job.id }),
    ]);
  } else if (post && job.status === "New") {
    return json({ error: "no_quote", job: view(job) }, 409);
  }
  return json({ job: view(job) });
};
export const config = { path: "/api/confirm" };
