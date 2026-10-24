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
- Header tambahan: `Strict-Transport-Security` (tanpa `includeSubDomains` dan tanpa preload), `Cross-Origin-Opener-Policy` dan `Cross-Origin-Resource-Policy` bernilai `same-origin`.

## Status deploy

- Produksi: https://industrial-sensor-sentinel.pages.dev/ (di-deploy oleh pemilik repo dari branch `main`).
- Sesi pengembangan tidak dapat membuka domain `pages.dev`, jadi isi situs live diperiksa oleh pemilik repo. Isi folder `web/public` di `main` adalah yang diuji e2e di CI.

## Bila integrasi GitHub berstatus "disconnected"

Peringatan ini biasanya berarti aplikasi GitHub milik Cloudflare tidak lagi punya akses ke repo. Akibatnya push ke `main` tidak memicu deploy baru, walau situs lama tetap tampil. Perbaiki tanpa membuat proyek baru:

1. Di GitHub: avatar, Settings, Applications, tab Installed GitHub Apps, lalu **Cloudflare Workers and Pages**, Configure.
2. Di Repository access, pastikan `industrial-sensor-sentinel` termasuk (pilih All repositories, atau tambahkan repo ini di Only select repositories). Save.
3. Di Cloudflare: Workers and Pages, proyek `industrial-sensor-sentinel`, Settings, Build. Pada bagian Git repository, pilih Manage atau Reconnect bila tersedia, lalu pilih akun GitHub yang sama dan repo `industrial-sensor-sentinel`. Pastikan production branch `main`, build command kosong, output `web/public`.
4. Uji: di tab Deployments pilih Retry deployment pada deploy terakhir, atau merge commit kecil ke `main`. Deploy baru harus muncul dengan hash commit terbaru. Pada pull request berikutnya, Cloudflare biasanya menambahkan status atau komentar berisi URL preview; itu tanda integrasi sudah tersambung.

Bila proyek dibuat lewat **Direct Upload** (unggah folder manual), proyek itu memang tidak punya koneksi Git dan Cloudflare tidak menyediakan cara mengubahnya menjadi proyek berbasis Git. Pilihannya: tetap unggah ulang folder `web/public` setiap ada perubahan (Create deployment pada proyek yang sama), atau, bila ingin deploy otomatis, membuat proyek Git baru dengan nama lain lalu memindahkan nama domain. Jalan kedua mengubah URL, jadi sebaiknya dihindari kecuali diperlukan.
