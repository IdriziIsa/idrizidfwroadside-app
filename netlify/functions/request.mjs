import { store, readJSON } from "../lib/store.mjs";
import { cleanFields, buildRaw, makeJob, newId, newRef, isRef, json, rateLimit, notify } from "../lib/jobs.mjs";

/* Public: a customer's quote request from the website. */
export default async (req, context) => {
  if (req.method !== "POST") return json({ error: "method" }, 405);
  let b; try { b = await req.json(); } catch (e) { return json({ error: "bad_json" }, 400); }
  if (b.hp) return json({ ok: true });                       // honeypot field, bots fill it in
  const f = cleanFields(b);
  if (!f.name || !f.service || f.phone.replace(/\D/g, "").length < 10 || (!f.loc && !f.map)) return json({ error: "missing" }, 400);
  const s = store();
  if (!(await rateLimit(s, context?.ip, "req", 12))) return json({ error: "slow_down" }, 429);
  const ref = isRef(b.ref) ? b.ref : newRef();
  const seen = await readJSON(s, "ref/" + ref);
  if (seen) return json({ ok: true, ref });                  // double tap, already saved
  const id = newId();
  const job = makeJob({ id, ref, fields: f, raw: buildRaw(f, ref) });
  await s.setJSON("job/" + id, job);
  await s.setJSON("ref/" + ref, id);
  await notify("New request: " + f.service + " - " + f.name, job.raw);
  return json({ ok: true, ref });
};
export const config = { path: "/api/request" };
