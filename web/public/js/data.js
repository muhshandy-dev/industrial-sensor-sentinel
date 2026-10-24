let summaryPromise = null;
const expCache = new Map();

async function getJson(path) {
  const r = await fetch(path, { headers: { accept: "application/json" } });
  if (!r.ok) throw new Error(`Gagal memuat ${path} (${r.status})`);
  return r.json();
}

export function loadSummary() {
  summaryPromise ||= getJson("data/ringkasan.json");
  return summaryPromise;
}

export function loadExperiment(entry) {
  if (!expCache.has(entry.berkas)) expCache.set(entry.berkas, getJson(`data/${entry.berkas}`));
  return expCache.get(entry.berkas);
}
