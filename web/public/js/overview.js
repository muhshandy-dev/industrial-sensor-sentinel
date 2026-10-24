import { h, clear } from "./dom.js";
import { num, pct, MODEL_LABEL } from "./format.js";

export function renderOverview(root, summary) {
  clear(root);
  const p = summary.profil;
  const a = summary.kinerja.p1_kalibrasi_awal;
  const models = Object.keys(MODEL_LABEL);
  const sens = models.map((m) => ({ m, r: a[m].sensitif.uji }));
  const best = [...sens].sort((x, y) => y.r.f1 - x.r.f1)[0];
  const test = summary.pembagian.test.length;
  const delays = sens.map((x) => x.r.tunda_deteksi_median_detik).filter((d) => d != null);
  const caught = sens.map((x) => x.r.recall_kejadian);

  root.append(
    h("p", { class: "eyebrow" }, "Deteksi anomali dan peringatan dini sensor industri"),
    h("h1", null, "Industrial Sensor Sentinel"),
    h("p", { class: "lead" }, "Sistem ini mempelajari kondisi normal sebuah pompa air dari delapan sensor, lalu menyalakan alarm ketika pola sensor berubah dari biasanya. Semua angka berasal dari rekaman uji coba laboratorium SKAB dan dinilai pada rekaman yang tidak pernah dipakai untuk melatih model."),
    h("div", { class: "callout" },
      h("p", null, "Yang perlu diketahui: halaman ini menampilkan hasil perhitungan yang sudah dijalankan sebelumnya. Tidak ada sensor yang terhubung, dan ini bukan sistem pemantauan langsung atau pemeliharaan prediktif. Anda tetap bisa menggeser batas alarm, dan alarm dihitung ulang di browser dari skor yang tersimpan.")),
    h("div", { class: "grid k4" },
      stat("Rekaman uji coba", num(p.eksperimen_berlabel, 0), `${num(p.total_baris_berlabel, 0)} pengukuran, sekitar satu per detik`),
      stat("Rekaman untuk penilaian akhir", num(test, 0), "Tidak dipakai untuk melatih atau menyetel model"),
      stat("Kejadian yang tertangkap", `${pct(Math.min(...caught) * 100, 0)} sampai ${pct(Math.max(...caught) * 100, 0)}`, "Pada rekaman uji, tergantung model, mode sensitif"),
      stat("Waktu sampai alarm", `${num(Math.min(...delays), 0)} sampai ${num(Math.max(...delays), 0)} detik`, "Median sejak anomali dimulai, mode sensitif"),
    ),
    h("h2", null, "Mulai dari mana"),
    h("div", { class: "grid k3" },
      card("#/konsol", "Konsol pemantauan", "Pilih satu rekaman, lalu lihat kapan alarm menyala dibandingkan dengan kejadian sebenarnya, lengkap dengan delapan sensor."),
      card("#/kinerja", "Kinerja model", "Bandingkan tiga cara deteksi, dari yang paling sederhana sampai yang lebih rumit."),
      card("#/kesalahan", "Analisis kesalahan", "Lihat kejadian mana yang terlewat dan kapan alarm palsu muncul."),
    ),
    h("h2", null, "Temuan utama"),
    h("ul", { class: "clean" }, findings(summary, best).map((t) => h("li", null, t))),
    h("h2", null, "Seberapa yakin hasil ini?"),
    h("ul", { class: "clean" },
      h("li", null, `Penilaian akhir hanya memakai ${test} rekaman, masing-masing dengan satu kejadian. Satu kejadian yang terlewat sudah mengubah hasil sebesar 10 persen, jadi perbedaan kecil antar model belum bisa dianggap pasti.`),
      h("li", null, "Semua data berasal dari satu alat uji kecil di laboratorium. Hasil ini belum terbukti berlaku untuk pompa atau mesin lain di pabrik."),
      h("li", null, "Peringatan dini di sini berarti alarm menyala tak lama setelah perubahan dimulai. Ini bukan ramalan kerusakan sebelum terjadi."),
    ),
    h("h2", null, "Cara membaca hasil"),
    h("ul", { class: "clean" },
      h("li", null, "Setiap rekaman berisi satu gangguan yang sengaja dibuat, misalnya katup ditutup atau air panas dialirkan. Waktu gangguan sudah ditandai oleh pembuat data."),
      h("li", null, "Alarm dianggap benar hanya bila mulai menyala saat gangguan berlangsung. Alarm yang menyala lebih awal dihitung sebagai alarm palsu."),
      h("li", null, "Model belajar tanpa diberi tahu mana yang gangguan. Tanda gangguan hanya dipakai untuk memilih batas alarm pada rekaman lama, lalu dinilai sekali pada rekaman uji."),
    ),
  );
}

function findings(summary, best) {
  const a = summary.kinerja.p1_kalibrasi_awal;
  const b = summary.kinerja.p2_riwayat_normal;
  const models = Object.keys(MODEL_LABEL);
  const f = (x, m, mode) => x[m][mode].uji.f1;
  const lo = Math.min(...models.map((m) => f(a, m, "sensitif")));
  const hi = Math.max(...models.map((m) => f(a, m, "sensitif")));
  const out = [];
  out.push(`Ketiga model mendapat skor F1 ${num(lo, 2)} sampai ${num(hi, 2)} pada rekaman uji (skala 0 sampai 1, makin tinggi makin baik). Tertinggi: ${MODEL_LABEL[best.m]}. Namun rentang ketidakpastiannya saling bertumpuk, jadi belum ada pemenang yang jelas.`);
  const pc = summary.perbandingan_berpasangan["p1_kalibrasi_awal|sensitif|pca_dikurangi_ambang_statistik"];
  if (pc) out.push(`Cara paling sederhana, ambang statistik, hampir sama baiknya dengan model yang lebih rumit. Keunggulan PCA hanya ${num(pc.selisih_f1, 2)} poin skor F1 (skala 0 sampai 1).`);
  const drop = f(a, "pca", "sensitif") - f(b, "pca", "sensitif");
  out.push(`Kalibrasi ulang di awal setiap pemantauan lebih andal daripada memakai model lama. Bila model hanya belajar dari rekaman sebelumnya, skornya turun (PCA turun ${num(drop, 2)} poin) karena kondisi mesin berubah dari hari ke hari.`);
  out.push("Mode hemat alarm mengurangi alarm palsu, tetapi sebagian gangguan kecil tidak lagi tertangkap.");
  return out;
}

function stat(l, v, sub) {
  return h("div", { class: "panel stat" }, h("div", { class: "l" }, l), h("div", { class: "v" }, v), h("div", { class: "s" }, sub));
}
function card(href, title, text) {
  return h("a", { class: "panel pad", href }, h("h3", null, title), h("p", { class: "s" }, text));
}
