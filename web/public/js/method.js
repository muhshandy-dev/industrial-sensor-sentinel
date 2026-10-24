import { h, clear } from "./dom.js";
import { num } from "./format.js";

const P1 = "p1_kalibrasi_awal|";

export function renderMethod(root, summary) {
  clear(root);
  const sp = summary.pembagian;
  const p = summary.profil;
  const sessionRows = Object.entries(p.sesi).map(([date, n]) => {
    const inSession = (list) => list.filter((e) => sp.session_of[e] === date);
    return h("tr", null,
      h("th", { scope: "row" }, date),
      h("td", { class: "n" }, String(n)),
      h("td", null, inSession(sp.train).join(", ")),
      h("td", null, inSession(sp.val).join(", ")),
      h("td", null, inSession(sp.purge).join(", ") || "tidak ada"),
      h("td", null, inSession(sp.test).join(", ")));
  });
  root.append(
    h("header", { class: "page-head" },
      h("h1", null, "Metodologi"),
      h("p", { class: "lead" }, "Data, pembagian rekaman, model, dan cara menilai, beserta batasannya.")),
    h("h2", null, "Apa yang dimaksud peringatan dini"),
    h("p", null, "Peringatan dini di sini berarti alarm menyala ketika pola sensor mulai berbeda dari kondisi normal, idealnya dalam hitungan detik setelah gangguan dimulai. Ini bukan ramalan kapan mesin akan rusak, bukan perkiraan sisa umur komponen, dan bukan sistem pemeliharaan prediktif. Website ini juga tidak terhubung ke sensor mana pun: semua skor dihitung sebelumnya dari rekaman yang tersimpan, lalu ditampilkan ulang."),
    h("h2", null, "Data"),
    h("p", null, `Skoltech Anomaly Benchmark (SKAB), versi pada commit ${summary.sumber_data.commit.slice(0, 7)}, lisensi GPL-3.0. Ada ${p.jumlah_berkas} berkas: ${p.eksperimen_berlabel} rekaman berlabel dan satu rekaman normal tanpa label. Tiap rekaman berisi delapan sensor yang dicatat sekitar tiap detik, dan tepat satu kejadian anomali yang berurutan.`),
    h("h2", null, "Pembagian data tanpa kebocoran"),
    h("p", null, "Pembagian dilakukan per rekaman, bukan per baris, karena baris yang bertetangga hampir sama. Dalam tiap sesi perekaman (tanggal yang sama, pengaturan pompa yang sama), rekaman diurutkan menurut waktu: bagian awal untuk latih, lalu validasi, satu rekaman pemisah, dan bagian paling akhir untuk uji."),
    h("div", { class: "table-wrap", tabindex: 0, role: "region", "aria-label": "Tabel. Geser ke samping untuk melihat kolom lain." }, h("table", null,
      h("caption", null, "Pembagian rekaman per sesi"),
      h("thead", null, h("tr", null, h("th", null, "Sesi"), h("th", { class: "n" }, "Rekaman"), h("th", null, "Latih"), h("th", null, "Validasi"), h("th", null, "Pemisah"), h("th", null, "Uji"))),
      h("tbody", null, sessionRows))),
    h("h2", null, "Dua skema evaluasi"),
    h("ul", { class: "clean" },
      h("li", null, `Skema A, kalibrasi awal (utama): model dikalibrasi dari ${summary.kalibrasi_awal_detik} detik pertama tiap rekaman, yang normal. Ambang, ketekunan, dan jendela fitur dipilih pada rekaman latih dan validasi, lalu dinilai sekali pada rekaman uji. Rekaman yang anomalinya muncul sebelum kalibrasi selesai tidak bisa dinilai dengan skema ini.`),
      h("li", null, "Skema B, riwayat normal: satu model per sesi dilatih dari bagian normal rekaman latih, ambang dipilih pada rekaman validasi, lalu dinilai pada rekaman uji yang lebih baru."),
    ),
    h("h2", null, "Model"),
    h("ul", { class: "clean" },
      h("li", null, "Ambang statistik: skor adalah simpangan terbesar sensor dari rata-rata normalnya. Ini baseline."),
      h("li", null, "PCA: skor dari dua ukuran, T2 (jarak di dalam pola normal) dan Q (sisa yang tidak dijelaskan pola normal)."),
      h("li", null, "Isolation Forest: skor dari seberapa mudah suatu titik dipisahkan dari data normal."),
      h("li", null, "Semua model tanpa label. Fitur hanya memakai data sampai saat ini, tidak melihat ke depan."),
    ),
    h("h2", null, "Metrik"),
    h("ul", { class: "clean" },
      h("li", null, "Ketepatan alarm (presisi): dari seluruh waktu alarm menyala, berapa bagian yang memang anomali. Cakupan anomali (recall): dari seluruh waktu anomali, berapa bagian yang memicu alarm. Skor F1: rata-rata harmonik keduanya, 0 sampai 1. Ketiganya dihitung per pengukuran (sekitar satu per detik), digabung dari semua rekaman uji."),
      h("li", null, "PR-AUC: kualitas skor sebelum diberi batas alarm, dirangkum dari semua kemungkinan batas. Nilai tebakan acak sama dengan porsi waktu yang anomali."),
      h("li", null, "Kejadian tertangkap (recall kejadian): alarm menyala pada suatu saat selama kejadian berlangsung. Waktu sampai alarm (tunda deteksi): detik dari awal kejadian sampai alarm pertama yang menyala selama kejadian, diringkas dengan nilai tengah (median)."),
      h("li", null, "Alarm palsu: alarm yang mulai menyala di luar kejadian, dihitung per jam waktu normal teramati. Selisih waktu lebih dari 5 detik antar pengukuran tidak dihitung sebagai waktu teramati."),
      h("li", null, "Kasus khusus: bila alarm sudah menyala sebelum kejadian dan terus menyala sampai kejadian dimulai, alarm itu dihitung satu alarm palsu, tetapi kejadiannya tetap dihitung tertangkap dengan waktu 0 detik. Ini terjadi pada rekaman valve1/15 untuk ambang statistik dan PCA, serta valve2/2 untuk Isolation Forest mode sensitif. Alarm tersebut mulai menyala sekitar 40 sampai 70 detik sebelum label. Bisa jadi sensor sudah berubah lebih awal dari label, tetapi hal itu tidak bisa dibuktikan dari data."),
      h("li", null, "Rentang 95 persen dihitung dengan sampel ulang rekaman (bootstrap per rekaman, bukan per baris), 1000 kali. Perbandingan dengan ambang statistik memakai sampel ulang berpasangan pada rekaman yang sama."),
    ),
    h("h2", null, "Detail analisis kesalahan"),
    h("ul", { class: "clean" },
      h("li", null, "Besar perubahan sensor: selisih rata-rata sensor selama kejadian dibanding sebelum kejadian, dibagi simpangan baku sensor itu saat normal. Yang dipakai adalah sensor dengan perubahan terbesar."),
      h("li", null, `Hubungan antara besar perubahan dan bagian anomali tanpa alarm diukur dengan korelasi peringkat Spearman pada ${sp.test.length} rekaman uji, Skema A: ${rhoRange(summary)}. Nilai negatif berarti perubahan kecil lebih sering terlewat. Dengan ${sp.test.length} titik data, ini hanya indikasi.`),
      h("li", null, "Alarm palsu sesudah kejadian dihitung terpisah karena label SKAB berakhir saat gangguan dihentikan, padahal sensor masih butuh waktu untuk kembali normal."),
    ),
    h("h2", null, "Transparansi proses pengembangan"),
    h("ul", { class: "clean" },
      h("li", null, "Pembagian latih, validasi, dan uji ditetapkan sebelum model dilatih, dan diperiksa otomatis agar tidak ada rekaman uji yang lebih lama dari rekaman latih dalam sesi yang sama."),
      h("li", null, "Ambang, ketekunan, tahan alarm, dan jendela fitur dipilih hanya dari rekaman latih dan validasi. Tidak ada parameter yang dipilih memakai rekaman uji."),
      h("li", null, "Hasil uji sempat dilihat selama pengembangan. Setelah itu definisi alarm diperketat, karena definisi lama bisa diakali oleh alarm yang menyala terus. Perubahan ini membuat penilaian lebih ketat untuk semua model dan tidak memilih model tertentu."),
      h("li", null, "Rentang ambang yang dicoba diperluas setelah ambang terpilih sempat berada di tepi rentang pada data penyetelan. Kini tidak ada ambang terpilih yang berada di tepi rentang."),
      h("li", null, "Sebuah skrip pemeriksa independen di repositori menghitung ulang semua angka website dari data mentah dan hasil evaluasi."),
    ),
    h("h2", null, "Keterbatasan"),
    h("ul", { class: "clean" },
      h("li", null, `Hanya ${sp.test.length} rekaman uji dengan ${sp.test.length} kejadian. Selang kepercayaan lebar, dan perbedaan kecil antar model tidak bisa dianggap pasti.`),
      h("li", null, "Semua data berasal dari satu rig uji kecil dengan air. Hasil tidak otomatis berlaku untuk mesin lain."),
      h("li", null, "Label SKAB dibuat manual dan satu kejadian per rekaman. Batas awal dan akhir kejadian bisa tidak tepat, terutama pada fase pemulihan."),
      h("li", null, "Cap waktu beberapa rekaman bertetangga saling tumpang tindih, sehingga urutan antar rekaman hanya memakai waktu mulai. Rekaman pemisah dipakai untuk mengurangi pengaruhnya."),
      h("li", null, "Skema A memerlukan awal rekaman yang normal. Bila mesin sudah bermasalah saat pemantauan dimulai, kalibrasi menjadi salah."),
      h("li", null, "Angka di sini tidak dapat dibandingkan langsung dengan papan peringkat SKAB, karena protokol pembagian dan definisi alarm berbeda."),
      h("li", null, "Website ini menampilkan hasil batch, bukan pemantauan waktu nyata, dan bukan pemeliharaan prediktif."),
      h("li", null, "Notebook Kaggle disediakan di repositori untuk mereproduksi hasil, tetapi belum dijalankan di Kaggle. Hasil di sini dibuat dengan kode yang sama dan diperiksa ulang otomatis di GitHub Actions."),
    ),
    h("h2", null, "Reproduksi"),
    h("p", null, h("a", { href: "https://github.com/muhshandy-dev/industrial-sensor-sentinel", rel: "noopener" }, "Repositori GitHub"), " memuat kode, Data Card, Model Card, dan langkah reproduksi."),
  );
}

function rhoRange(summary) {
  const vals = Object.entries(summary.analisis_kesalahan)
    .filter(([k]) => k.startsWith(P1))
    .map(([, a]) => a.korelasi_pergeseran_dan_proporsi_terlewat_spearman)
    .filter((v) => v != null);
  if (!vals.length) return "tidak tersedia";
  return `antara ${num(Math.min(...vals), 2)} dan ${num(Math.max(...vals), 2)}, tergantung model dan mode`;
}
