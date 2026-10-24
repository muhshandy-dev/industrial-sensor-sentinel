const nf = (d) => new Intl.NumberFormat("id-ID", { minimumFractionDigits: d, maximumFractionDigits: d });
const cache = {};
export function num(x, d = 2) {
  if (x == null || Number.isNaN(x)) return "tidak ada";
  return (cache[d] ||= nf(d)).format(x);
}
export const pct = (x, d = 1) => (x == null ? "tidak ada" : `${num(x, d)}%`);
export function seconds(x) {
  if (x == null) return "tidak ada";
  if (x < 120) return `${num(x, 0)} detik`;
  return `${num(x / 60, 1)} menit`;
}
export function ci(range, d = 2) {
  return range ? `${num(range[0], d)} sampai ${num(range[1], d)}` : "tidak ada";
}
export const MODEL_LABEL = {
  ambang_statistik: "Ambang statistik",
  pca: "PCA",
  isolation_forest: "Isolation Forest",
};
export const MODE_LABEL = { sensitif: "Sensitif", hemat_alarm: "Hemat alarm" };
export const SCHEME_LABEL = {
  p1_kalibrasi_awal: "Skema A: kalibrasi awal",
  p2_riwayat_normal: "Skema B: riwayat normal",
};
export const SCHEME_SHORT = { p1_kalibrasi_awal: "Skema A", p2_riwayat_normal: "Skema B" };
