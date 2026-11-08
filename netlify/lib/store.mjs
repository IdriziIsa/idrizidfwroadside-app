import { getStore } from "@netlify/blobs";

/* In-memory stand-in used only by local tests (JOBS_MEMORY_STORE=1). */
const mem = new Map();
const memStore = {
  async get(key) { return mem.has(key) ? JSON.parse(mem.get(key)) : null; },
  async setJSON(key, val) { mem.set(key, JSON.stringify(val)); },
  async delete(key) { mem.delete(key); },
  async list({ prefix = "" } = {}) { return { blobs: [...mem.keys()].filter(k => k.startsWith(prefix)).map(key => ({ key })) }; },
};

export function store() {
  if (process.env.JOBS_MEMORY_STORE === "1") return memStore;
  return getStore({ name: "idrizi-jobs", consistency: "strong" });
}
export const readJSON = (s, key) => s.get(key, { type: "json" });
