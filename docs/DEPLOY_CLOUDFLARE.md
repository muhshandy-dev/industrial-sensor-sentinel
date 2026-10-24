# Deploy ke Cloudflare Pages

Website statis tanpa build. Yang dipublikasikan adalah folder `web/public`.

## Langkah (di dashboard Cloudflare milik pemilik repo)

1. Workers and Pages, Create, Pages, Connect to Git, pilih `industrial-sensor-sentinel`.
2. Project name: `industrial-sensor-sentinel`.
3. Production branch: `main`.
4. Build command: kosongkan. Build output directory: `web/public`.
5. Simpan dan deploy. URL: `https://industrial-sensor-sentinel.pages.dev`.
6. Opsional: matikan preview build untuk branch non-produksi di Settings, Builds. Kuota build gratis (500 per bulan) dipakai bersama semua proyek.

## Catatan

- `web/public/_headers` memasang CSP ketat, `X-Frame-Options`, dan header keamanan lain. Tidak ada skrip atau gaya sebaris dan tidak ada permintaan ke pihak ketiga.
- Berkas terbesar sekitar 120 KB, jauh di bawah batas 25 MiB per berkas.
- Situs statis tidak "tidur": tidak ada server yang perlu dinyalakan ulang.
- Data website dibuat oleh `sentinel evaluate --web-out web/public/data` dan di-commit. Mengubah model berarti menjalankan ulang perintah itu lalu commit.
