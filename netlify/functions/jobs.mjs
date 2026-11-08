import crypto from "node:crypto";
import { store, readJSON } from "../lib/store.mjs";
import { STATUSES, parseRaw, makeJob, newId, isId, isRef, newRef, json } from "../lib/jobs.mjs";

function authed(req) {
  const pin = process.env.QUEUE_PIN;
  if (!pin) return "off";
  const a = Buffer.from(req.headers.get("x-queue-pin") || ""), b = Buffer.from(pin);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
const str = (v, n) => String(v ?? "").replace(/[\u0000-\u001f]+/g, " ").trim().slice(0, n);

async function allJobs(s) {
  const { blobs } = await s.list({ prefix: "job/" });
  const jobs = (await Promise.all(blobs.map(b => readJSON(s, b.key)))).filter(Boolean);
  return jobs.sort((a, b) => a.ts - b.ts);
}

/* Private (PIN): Omer's queue. */
export default async (req) => {
  const ok = authed(req);
  if (ok === "off") return json({ error: "not_configured" }, 503);
  if (!ok) { await new Promise(r => setTimeout(r, 1000)); return json({ error: "bad_pin" }, 401); }
  const s = store();
  if (req.method === "GET") return json({ jobs: await allJobs(s) });
  if (req.method !== "POST") return json({ error: "method" }, 405);
  let b; try { b = await req.json(); } catch (e) { return json({ error: "bad_json" }, 400); }

  if (b.action === "create") {
    const { fields, ref } = parseRaw(b.raw || "");
    if (!fields.phone && !fields.name && !fields.service) return json({ error: "not_a_request" }, 422);
    if (ref) { const old = await readJSON(s, "ref/" + ref); const j = old && await readJSON(s, "job/" + old); if (j) return json({ job: j, existing: true }); }
    const id = isId(b.id) ? b.id : newId();
    if (await readJSON(s, "job/" + id)) return json({ job: await readJSON(s, "job/" + id), existing: true });
    const r = ref || newRef();
    const job = makeJob({ id, ref: r, fields, raw: b.raw });
    if (b.quote && STATUSES.includes(b.status)) { job.status = b.status; job.price = str(b.quote.price, 12); job.quote = { price: str(b.quote.price, 12), eta: str(b.quote.eta, 6), note: str(b.quote.note, 300), ts: Date.now() }; }
    await s.setJSON("job/" + id, job); await s.setJSON("ref/" + r, id);
    return json({ job });
  }

  if (b.action === "import") {
    const out = [];
    for (const o of (Array.isArray(b.jobs) ? b.jobs : []).slice(0, 200)) {
      const { fields } = parseRaw(o.raw || "");
      if (!fields.phone && !fields.name) continue;
      const id = newId(), ref = newRef(), job = makeJob({ id, ref, fields, raw: o.raw });
      job.ts = Number(o.ts) || job.ts;
      if (STATUSES.includes(o.status)) job.status = o.status;
      job.price = str(o.price, 12); job.miles = str(o.miles, 12); job.sched = str(o.sched, 20);
      await s.setJSON("job/" + id, job); await s.setJSON("ref/" + ref, id); out.push(job);
    }
    return json({ imported: out.length });
  }

  if (!isId(b.id)) return json({ error: "bad_id" }, 400);
  const job = await readJSON(s, "job/" + b.id);
  if (!job) return json({ error: "not_found" }, 404);

  if (b.action === "delete") { await s.delete("job/" + b.id); if (job.ref) await s.delete("ref/" + job.ref); return json({ ok: true }); }

  if (b.action === "update") {
    const p = b.patch || {};
    if (STATUSES.includes(p.status)) {
      const lock = p.status === "Quoted" && (job.status === "Booked" || job.status === "Done");   // a resent quote must not undo a booking
      if (!lock) { job.status = p.status; if (p.status === "Done") job.doneTs = Date.now(); if (p.status !== "Booked" && p.status !== "Done") job.confirmed = false; }
    }
    if ("price" in p) job.price = str(p.price, 12);
    if ("miles" in p) job.miles = str(p.miles, 12);
    if ("sched" in p) job.sched = str(p.sched, 20);
    if (p.quote && typeof p.quote === "object") job.quote = { price: str(p.quote.price, 12), eta: str(p.quote.eta, 6), note: str(p.quote.note, 300), ts: Date.now() };
    await s.setJSON("job/" + b.id, job);
    return json({ job });
  }
  return json({ error: "unknown_action" }, 400);
};
export const config = { path: "/api/jobs" };
