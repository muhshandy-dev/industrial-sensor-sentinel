# Reproduksi

Semua langkah deterministik (seed tetap, tanpa GPU). Seluruh evaluasi memakan sekitar 3 menit pada satu inti CPU.

## Lokal

```bash
python -m venv .venv && .venv/bin/pip install -e ".[dev]"
.venv/bin/sentinel data fetch                     # unduh SKAB pada commit terkunci, verifikasi checksum
.venv/bin/sentinel profile                        # reports/data_profile.json
.venv/bin/sentinel evaluate --web-out web/public/data
.venv/bin/pytest                                  # termasuk tes data asli dan reproduksi hasil
cd web && npm ci && npm test && npm run build && npm run e2e
```

`pytest` memuat tes yang menghitung ulang metrik uji dari konfigurasi tersimpan dan membandingkannya dengan `reports/results.json` (selisih nol). `npm test` membandingkan alarm yang dihitung browser dengan hasil Python.

## Bukti reproduksi terakhir

24 Oktober 2026: `sentinel evaluate` dijalankan ulang dari CSV mentah (3 menit 6 detik, satu inti CPU). `reports/results.json` hasil ulang identik byte per byte dengan versi di repo (SHA-256 berawalan `7f9284630a005a22`), dan semua berkas `web/public/data` identik. Sel pembanding notebook Kaggle, dijalankan lokal terhadap hasil ulang itu, menyatakan 12 dari 12 nilai F1 sama.

## Kaggle

1. Buat notebook baru di Kaggle, impor `notebooks/kaggle_train.ipynb`.
2. Pengaturan: Internet **On**, Accelerator **None** (CPU).
3. Jalankan semua sel. Sel terakhir mencetak perbandingan skor F1 uji dengan `reports/results.json` dan menyatakan apakah semuanya sama.

Notebook ini belum pernah dijalankan oleh pembuat repo karena Kaggle tidak dapat dijangkau dari sesi pengembangan. Bila hasilnya berbeda sedikit, penyebab paling mungkin adalah versi pustaka (scikit-learn, NumPy) yang berbeda.

## Versi yang dipakai

Python 3.13.17, NumPy 2.5.4, pandas 3.1.0, scikit-learn 1.9.1, SciPy 1.18.1, Node.js 22. Batas versi minimum ada di `pyproject.toml`.

## Keluaran

| Berkas | Isi |
|---|---|
| `reports/results.json` | konfigurasi terpilih, metrik penyetelan dan uji, selang 95%, perbandingan berpasangan |
| `reports/error_analysis.json` | kesalahan per rekaman uji, per model dan mode |
| `reports/data_profile.json` | profil data |
| `web/public/data/*.json` | data statis website (hanya rekaman uji) |
