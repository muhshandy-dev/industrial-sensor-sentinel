# Arsitektur

Proyek ini punya dua bagian yang dipisah tegas: proses batch di Python yang menghasilkan semua angka, dan website statis yang hanya membaca hasil itu. Tidak ada server, basis data, atau layanan berbayar.

```
CSV SKAB (GitHub waico/SKAB, commit b2c0d46c, SHA-256 diverifikasi)
        │  sentinel data fetch
        ▼
src/sentinel  (Python, CPU, seed tetap)
  data.py         muat CSV, daftar skenario dan sensor
  splits.py       pembagian per rekaman dan urut waktu, check_no_leakage
  features.py     fitur bergulir yang hanya melihat ke belakang (jendela 1, 10, 30 detik)
  models.py       ambang statistik, PCA (T2 dan Q), Isolation Forest, normalisasi skor
  alarms.py       ambang + ketekunan + penahanan menjadi episode alarm
  metrics.py      metrik titik dan kejadian
  experiment.py   skema A dan B, grid penyetelan, bootstrap
  evaluate.py     orkestrasi: setel pada latih/validasi, nilai sekali pada uji
  error_analysis.py, profile.py, export_web.py, cli.py
        │  sentinel evaluate --web-out web/public/data
        ▼
reports/*.json                     web/public/data/*.json
(hasil, profil, analisis kesalahan)   (hanya 10 rekaman uji: sensor, skor, konfigurasi)
                                          │
                                          ▼
web/public  (HTML, CSS, ES module tanpa build, Cloudflare Pages)
  main.js         rute hash: ringkasan, konsol, kinerja, kesalahan, metode
  logic.js        port aturan alarm dan metrik dari Python
  evaluation.js   kurva presisi-recall dan sapuan ambang dari skor tersimpan
  console.js      pemutar rekaman, grafik, tooltip, pengaturan batas alarm
  evalviz.js      grafik evaluasi interaktif
  motion.js       animasi (transform dan opacity), hormat prefers-reduced-motion
```

## Prinsip

- **Satu sumber angka.** Semua metrik dihitung di Python. Browser hanya menghitung ulang aturan alarm dari skor tersimpan saat pengguna menggeser batas alarm, dan hasilnya diuji agar sama persis dengan Python (`web/tests/logic.test.mjs`, `web/tests/evaluation.test.mjs`).
- **Pemutaran, bukan pemantauan langsung.** Pemutar memutar ulang rekaman uji yang tersimpan. Teks di setiap halaman menyatakan hal ini.
- **Tanpa kebocoran.** Pembagian diperiksa otomatis sebelum penyetelan. Fitur hanya melihat ke belakang. Data uji tidak dipakai untuk memilih parameter.
- **Statis dan tahan lama.** Tidak ada ketergantungan pada Kaggle, API, atau server yang bisa tidur. Font disimpan lokal. CSP ketat (`default-src 'none'`, skrip dan gaya hanya dari domain sendiri).

## Pengujian

| Lapisan | Alat | Isi |
|---|---|---|
| Python | pytest (55 tes), ruff | data sintetis dan asli, kebocoran, fitur kausal, metrik, reproduksi hasil |
| Pemeriksa independen | `tools/verify_published.py` | hitung ulang angka website dari CSV mentah tanpa modul metrik proyek |
| Logika web | `node --test` (9 tes) | paritas alarm dan evaluasi browser dengan Python |
| Build | `scripts/check-build.mjs` | referensi berkas, ukuran, tanpa aset pihak ketiga |
| Browser | Playwright + axe (178 pemeriksaan) | 4 lebar layar, 2 tema, navigasi, pemutar, kasus ekstrem, keyboard, gerak dikurangi, aksesibilitas WCAG 2 AA, galat konsol, laju bingkai |
| Keamanan | npm audit, pip-audit | kerentanan dependensi |

Semua dijalankan di GitHub Actions (`.github/workflows/ci.yml`) pada Python 3.11 dan 3.13.

## Deploy

Cloudflare Pages membaca `web/public` langsung dari cabang `main` tanpa perintah build. Header keamanan dan cache ada di `web/public/_headers`. Langkahnya di [DEPLOY_CLOUDFLARE.md](DEPLOY_CLOUDFLARE.md).
