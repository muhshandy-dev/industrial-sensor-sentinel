# Industrial Sensor Sentinel: Handoff Final

Tanggal: 24 Oktober 2026. Cabang `final/finalisasi`, PR #5 (draft, belum di-merge).

## A. Ringkasan eksekutif

Industrial Sensor Sentinel mendeteksi anomali pada 8 sensor pompa air dari dataset publik SKAB, lalu menampilkannya di website statis berbentuk konsol pemutar rekaman. Tiga model tanpa label dibandingkan dengan jujur: PCA hanya sedikit lebih baik dari baseline ambang statistik (F1 0,77 lawan 0,73 pada 10 rekaman uji, selisih 0,04 dengan selang 95 persen 0,003 sampai 0,071). Evaluasi dijalankan ulang penuh dan hasilnya identik byte per byte. Semua pengujian lokal lulus. Website publik belum dapat diverifikasi langsung dari sesi pengembangan.

**Keputusan: PASS WITH ISSUES** (alasan di bagian N).

## B. Status komponen

| Komponen | Status |
|---|---|
| Data SKAB (commit terkunci, checksum) | Selesai |
| Pembagian data dan pemeriksaan kebocoran | Selesai, otomatis di tes |
| Tiga model dan dua skema evaluasi | Selesai |
| Metrik, bootstrap, perbandingan berpasangan | Selesai |
| Analisis kesalahan | Selesai |
| Website (5 halaman, pemutar, grafik interaktif) | Selesai |
| Pengujian otomatis dan CI | Selesai lokal; CI PR #5 menunggu hasil GitHub Actions |
| Dokumentasi | Selesai |
| Notebook Kaggle | Tersedia, **belum dijalankan di Kaggle** |
| Deploy Cloudflare Pages | Dilakukan pemilik; **NOT VERIFIED** dari sesi ini |

## C. Hasil pengujian

Dijalankan di sesi pengembangan pada 24 Oktober 2026 (commit `6b4e072` dan perubahan dokumen sesudahnya).

| Pemeriksaan | Perintah | Hasil |
|---|---|---|
| Unit dan integrasi Python | `pytest` | 55 lulus, 0 gagal |
| Lint dan format | `ruff check .`, `ruff format --check .` | bersih, 29 berkas |
| Pemeriksa independen | `python tools/verify_published.py` | 10 rekaman, 60 konfigurasi, semua cocok |
| Evaluasi model ulang | `sentinel evaluate` | identik byte per byte dengan `reports/results.json` |
| Logika web | `npm test` | 9 lulus, 0 gagal |
| Build | `npm run build` | OK, 32 berkas, 1.518 KiB, berkas terbesar 135 KB |
| Browser e2e + aksesibilitas axe | `npm run e2e` | 178 pemeriksaan lulus, 0 gagal |
| e2e dengan CPU diperlambat 4x | `CPU_THROTTLE=4 npm run e2e` | 178 lulus; 50 sampai 52 fps saat memutar |
| Keamanan dependensi | `npm audit`, `pip-audit` | 0 kerentanan |
| Galat konsol | dipantau di e2e dan skrip screenshot | 0 |
| Pencarian rahasia | grep pola token, kunci, kata sandi | tidak ada (hanya kata "token" di teks lisensi GPL) |

**Tidak dijalankan:**
- Notebook di Kaggle (Kaggle tidak dapat dijangkau dari sesi).
- Pemeriksaan website publik di pages.dev (domain tidak dapat dijangkau dari sesi). Semua uji browser dilakukan pada salinan lokal `web/public` yang sama persis.
- Uji di Safari dan Firefox asli; e2e memakai Chromium.
- Uji pembaca layar manual; aksesibilitas diperiksa otomatis dengan axe (WCAG 2 AA) dan uji keyboard.
- CI GitHub Actions untuk PR #5: menunggu hasil.

## D. Evaluasi ML

Skema A (kalibrasi 300 detik pertama tiap rekaman), 10 rekaman uji:

| Model | Mode | F1 (selang 95%) | Presisi | Recall | PR-AUC | Recall kejadian | Alarm palsu per jam | Tunda median |
|---|---|---|---|---|---|---|---|---|
| Ambang statistik | sensitif | 0,730 (0,60 sampai 0,82) | 0,747 | 0,713 | 0,838 | 0,9 | 6,69 | 53 dtk |
| Ambang statistik | hemat alarm | 0,697 (0,55 sampai 0,81) | 0,776 | 0,633 | 0,838 | 0,8 | 2,51 | 69 dtk |
| PCA | sensitif | 0,768 (0,61 sampai 0,87) | 0,822 | 0,721 | 0,813 | 0,8 | 1,67 | 55 dtk |
| PCA | hemat alarm | 0,745 (0,56 sampai 0,87) | 0,863 | 0,656 | 0,813 | 0,8 | 1,67 | 58 dtk |
| Isolation Forest | sensitif | 0,793 (0,70 sampai 0,86) | 0,771 | 0,816 | 0,706 | 1,0 | 8,36 | 39 dtk |
| Isolation Forest | hemat alarm | 0,371 (0,10 sampai 0,62) | 0,906 | 0,233 | 0,706 | 0,4 | 1,67 | 106,5 dtk |

**Definisi singkat:** presisi, recall, dan F1 dihitung per detik dan digabung dari semua rekaman uji. PR-AUC dari skor mentah sebelum aturan alarm, jadi sama untuk kedua mode. Alarm palsu per jam = episode alarm yang mulai di luar kejadian dibagi 1,196 jam waktu normal teramati. Tunda = median detik dari awal kejadian ke alarm pertama. Hitungan TP, FP, FN, TN dan definisi lengkap ada di `docs/EVALUATION_REPORT.md`.

**Bukti reproduksi:** evaluasi penuh dijalankan ulang dari CSV mentah dalam 3 menit 6 detik; SHA-256 `results.json` sama (`7f9284630a005a22...`); 11 berkas data website identik; sel pembanding notebook Kaggle menyatakan 12 dari 12 nilai F1 sama. Setiap angka di website dicocokkan ulang oleh `tools/verify_published.py`.

**Metrik yang tidak tersedia:** biaya kesalahan, waktu sebelum kerusakan, skor NAB resmi SKAB, kinerja pada data pabrik nyata.

## E. Kebocoran dan batas generalisasi

- Pembagian per rekaman, urut waktu dalam tiap sesi: 16 latih, 6 validasi, 2 pemisah, 10 uji. `check_no_leakage` memastikan tidak ada rekaman di dua himpunan dan uji selalu lebih baru.
- Fitur bergulir hanya melihat ke belakang (ada tes khusus). Standarisasi memakai data fit saja.
- Ambang, ketekunan, penahanan, dan jendela fitur dipilih hanya dari latih dan validasi (skema A) atau validasi (skema B).
- Catatan terbuka: hasil uji sempat dilihat selama pengembangan, sebelum definisi alarm diperketat dan rentang ambang diperluas. Keduanya berlaku sama untuk semua model dan dicatat di Model Card.
- Batas generalisasi: satu rig laboratorium, satu kejadian per rekaman, 10 rekaman uji. Skema B menunjukkan model turun saat kondisi mesin bergeser. Tidak teruji di mesin lain.

## F. Animasi dan interaksi

Diuji otomatis dalam e2e (178 pemeriksaan) dan rekaman video:

| Skenario | Hasil |
|---|---|
| Animasi pembuka, navigasi 5 halaman | lulus |
| Pilih rekaman, model, mode, sensor | lulus |
| Putar, Jeda, Mulai ulang, kecepatan 10x sampai 120x, tombol panah | lulus |
| Sinkron grafik, timeline, status, dan penanda kejadian dan alarm | lulus (status cocok dengan episode alarm di lebih dari 40 ribu titik) |
| Ubah batas alarm, termasuk saat animasi berjalan | lulus, jumlah alarm sama dengan perhitungan ulang |
| Putar sampai akhir lalu putar lagi | lulus, berhenti tepat di detik terakhir lalu mulai dari awal |
| Ganti rekaman atau model saat memutar, pindah halaman saat memutar | lulus, satu pemutar, keadaan bersih |
| Grafik evaluasi (kurva PR, sapuan batas, garis waktu kesalahan) | lulus, paritas dengan Python |
| Ganti tema | lulus |
| Keyboard (Tab, Enter, panah) | lulus |
| prefers-reduced-motion | lulus, 0 animasi berjalan |
| Laju bingkai | 60 fps normal, 50 sampai 52 fps dengan CPU 4x lebih lambat, 0 tugas panjang |

## G. UI/UX desktop dan ponsel

- Diperiksa di 320, 375, 390, 768, dan 1440 piksel, tema gelap dan terang. Tidak ada luapan horizontal halaman.
- Identitas visual: gaya instrumen netral, warna hanya untuk data dan status. Berbeda dari Data Trust Observatory.
- Perbaikan di tahap ini: keterangan tabel yang panjang terpotong saat tabel digeser di ponsel; kini dipindah ke atas tabel.
- Tabel lebar di ponsel tetap bisa digeser ke samping (dengan label aksesibilitas).
- Teks website tidak memuat garis bawah, istilah internal, atau kode proyek (dijaga oleh e2e).

## H. Deploy

- URL produksi: https://industrial-sensor-sentinel.pages.dev/ (**NOT VERIFIED** dari sesi ini).
- Pengaturan Cloudflare Pages yang benar: cabang produksi `main`, perintah build kosong, direktori keluaran `web/public`.
- Tidak bergantung pada Kaggle, API, atau server yang bisa tidur. Semua data, font, dan skrip disajikan dari domain sendiri.

## I. Commit, PR, CI

| PR | Isi | Status |
|---|---|---|
| #1 | pipeline, model, website, CI | merged |
| #2 | review produksi, pemeriksa independen | merged |
| #3 | pemutar interaktif dan animasi | merged |
| #4 | rombak desain dan perbaikan cache | merged |
| #5 | finalisasi ini | draft, menunggu CI dan persetujuan Shandy |

## J. Masalah yang diperbaiki di tahap ini

1. Dua transisi CSS (kartu status dan lampu) tetap berjalan saat gerak dikurangi. Kini semua transisi hanya aktif bila gerak tidak dikurangi.
2. Aturan CSS mati dan garis playhead yang tidak terlihat dihapus.
3. Keterangan tabel panjang terpotong di ponsel. Dipindah ke atas tabel.
4. Uji kasus ekstrem ditambahkan dan satu ekspektasi uji yang keliru dikoreksi (batas alarm maksimum 100 masih di bawah skor PCA tertinggi, jadi alarm memang tetap ada).

## K. Masalah terbuka

- **Critical:** tidak ada.
- **High:** tidak ada.
- **Medium:**
  - Website publik belum diverifikasi langsung dari sesi. Perlu dicek Shandy setelah merge.
  - Notebook belum dijalankan di Kaggle.
- **Low:**
  - Hanya 10 rekaman uji; selang kepercayaan lebar.
  - Check "Workers Builds" yang gagal di GitHub mungkin masih muncul (Worker lama, bukan proyek Pages). Cara membersihkannya di `docs/DEPLOY_CLOUDFLARE.md`.
  - Uji browser hanya di Chromium.

## L. Bukti

- Hasil: `reports/results.json`, `reports/error_analysis.json`, `reports/data_profile.json`
- Laporan: `docs/EVALUATION_REPORT.md`, `docs/MODEL_CARD.md`, `docs/DATA_CARD.md`, `docs/REPRODUCE.md`, `docs/ARCHITECTURE.md`
- Screenshot di repo: `docs/screenshots/`
- Screenshot lengkap (5 halaman x 2 lebar x 2 tema) dan video demo desktop dan ponsel: folder proyek `industrial-sensor-sentinel/final/` di Library
- Uji: `tests/`, `web/tests/e2e.mjs`, `web/tests/*.test.mjs`, `tools/verify_published.py`

## M. Kartu portofolio Magic UI

- **Judul:** Industrial Sensor Sentinel
- **Tagline:** Deteksi anomali sensor pompa air dengan alarm yang bisa diputar ulang dan diuji.
- **Deskripsi:** Tiga detektor tanpa label dinilai pada 8 sensor dataset SKAB dengan pembagian bebas kebocoran. Website konsol memutar ulang 10 rekaman uji dan menghitung ulang dampak batas alarm langsung di browser.
- **Angka:** F1 0,77 (PCA) lawan baseline 0,73; 80 sampai 100 persen kejadian tertangkap; reproduksi identik byte per byte.
- **Teknologi:** Python, scikit-learn, JavaScript tanpa framework, SVG, Playwright, GitHub Actions, Cloudflare Pages.
- **Tautan:** https://industrial-sensor-sentinel.pages.dev/ dan https://github.com/muhshandy-dev/industrial-sensor-sentinel
- Versi lengkap beserta peran pengembang: `docs/portfolio-card.md`.

## N. Keputusan

**PASS WITH ISSUES.**

Alasan PASS: semua pengujian lokal lulus dengan hitungan nyata, evaluasi bisa direproduksi identik, tidak ada kebocoran yang ditemukan, angka website cocok dengan eksperimen, dan klaim di website jujur (pemutaran rekaman, bukan pemantauan langsung).

Alasan WITH ISSUES: website publik belum diverifikasi langsung, notebook belum dijalankan di Kaggle, dan PR #5 masih menunggu CI dan persetujuan merge.

Langkah untuk menutup: (1) Shandy menyetujui merge PR #5; (2) setelah merge, Shandy membuka website dan memeriksa daftar di `docs/DEPLOY_CLOUDFLARE.md`; (3) opsional, jalankan notebook di Kaggle.
