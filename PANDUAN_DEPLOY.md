# 🧺 Absensi Titik Buket — Pettarani & Samata (1 Server, Online 24 Jam)

Sistem absensi dengan **verifikasi lokasi GPS + foto wajah**.
Absen **DITOLAK otomatis** bila jarak > 1000 m dari toko.
Toleransi keterlambatan **20 menit**. Laporan bulanan per karyawan.
Akun hanya bisa dibuat admin. Peringatan penyimpanan hampir penuh.

## 1. Cara agar link tetap aktif walau laptop admin MATI ⭐

Jangan pakai `localhost` / IP laptop. Deploy ke **Render.com (gratis)** — server jalan di cloud 24 jam.

### Langkah deploy (±10 menit, gratis):

1. Buat akun di https://render.com (login pakai GitHub/Google).
2. Upload folder ini ke GitHub:
   - Buat repo baru di github.com → upload semua file folder ini.
3. Di Render → **New + → Web Service → pilih repo** tersebut.
   - Build Command: `npm install`
   - Start Command: `npm start`
   - Environment: `STORAGE_LIMIT_MB=500` (batas warning), `JWT_SECRET` (isi acak panjang).
   - Klik **Deploy**.
4. Dapat link publik misal: `https://absensi-titik-buket.onrender.com`
   - **Bagikan link ini ke karyawan.** Bisa dibuka walau laptop admin mati.
   - Catatan paket gratis: jika 15 menit tidak dibuka, server tidur & butuh ±30 detik untuk bangun saat pertama dibuka. Itu normal. Agar selalu cepat, upgrade ke paket berbayar $7/bln atau pakai UptimeRobot untuk ping tiap 5 menit.

Alternatif gratis lain: Railway.app, Fly.io, Vercel (butuh adaptasi). Render paling mudah untuk pemula.

### Jalankan di laptop (untuk tes / cadangan lokal):

```powershell
npm install
npm start
# buka http://localhost:3000
# login admin default: admin / admin123
```

## 2. Data Toko (sudah terisi)

| Toko | Alamat | Koordinat awal | Radius |
|---|---|---|---|
| Titik Buket Pettarani | Jl. Andi Pangeran Pettarani II No. 34A, Tamamaung, Panakkukang, Makassar | -5.1455901, 119.4457646 | 1000 m |
| Titik Buket Samata | Jl. Abdul Kadir Daeng Suro No.161, Romangpolong, Somba Opu, Gowa | -5.1962562, 119.4923834 | 1000 m |

> Koordinat Pettarani/Samata di atas adalah titik jalan (hasil geocoding). Setelah deploy, **admin wajib kalibrasi**: buka di toko dengan HP → catat GPS dari Google Maps → menu **🏪 Toko & GPS → Simpan Kalibrasi**. Radius bisa diubah juga (default 1000 m sesuai permintaan).

Jam kerja (WITA):
- **Pettarani**: Shift 1 07.00–16.00, Shift 2 11.00–20.00, Shift 3 15.00–20.00
- **Samata**: Shift 1 08.00–15.00, Shift 2 11.00–20.00, Shift 3 15.00–20.00
- Telat = masuk > jam masuk + 20 menit.

## 3. Alur Pakai

**Admin:**
1. Login → tab 👥 Kelola Akun → buat username+password tiap karyawan.
2. Bagikan link + username/password ke karyawan.
3. Pantau di 📋 Data Absensi, 📊 Laporan Bulanan (filter bulan+toko, Export CSV/Print).
4. 🗑️ Hapus Data: per nama (isi username) / per hari (pilih tanggal) / per bulan (pilih bulan).
5. 💾 Penyimpanan: bila ≥80% muncul banner kuning + bunyi peringatan. Hapus bulan lama untuk melegakan.

**Karyawan:**
1. Buka link → login → pilih Toko + Shift + Masuk/Pulang.
2. Klik 🎥 Buka Kamera → 📸 Ambil Foto → 📡 Ambil Lokasi → ✅ KIRIM ABSEN.
3. Wajib HTTPS (Render sudah HTTPS) + izin kamera & lokasi di HP.
4. Jika di luar 1000 m → muncul **ABSEN DITOLAK** + jarak meter.

## 4. Keamanan & Batasan

- Password di-hash (bcrypt), login pakai JWT 24 jam.
- Foto max 5 MB, format JPG.
- Data tersimpan di `data.json` + folder `uploads/`. Di Render gratis, file bisa hilang saat redeploy — untuk arsip permanen: rutin **Export CSV + download foto**, atau upgrade ke Persistent Disk / S3. Untuk skala 2 toko ini sudah cukup.
- Ganti password admin default setelah deploy (menu Kelola Akun → Reset PW / buat admin baru lalu hapus default tidak disarankan — cukup reset passwordnya dengan edit via API; paling mudah: buat admin baru, pakai itu sehari-hari).
