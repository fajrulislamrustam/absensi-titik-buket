const express = require('express');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'titik-buket-rahasia-2026-ganti-di-render';
const STORAGE_LIMIT_MB = parseFloat(process.env.STORAGE_LIMIT_MB || '500');
// DATA_DIR: di Render diisi /var/data (disk permanen). Lokal: folder project.
const DATA_DIR = process.env.DATA_DIR || __dirname;
const DATA_FILE = path.join(DATA_DIR, 'data.json');
const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');

if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

app.use(cors());
app.use(express.json({ limit: '12mb' }));
// Frontend: utama dari /public, cadangan dari root repo (jaga-jaga bila index.html terupload di luar public)
const PUBLIC_DIR = fs.existsSync(path.join(__dirname, 'public', 'index.html')) ? path.join(__dirname, 'public') : __dirname;
app.use(express.static(PUBLIC_DIR));
app.use('/uploads', express.static(UPLOAD_DIR));

// ============ KONFIG TOKO (bisa diubah admin via API, tersimpan di data.json) ============
const DEFAULT_STORES = {
  pettarani: {
    id: 'pettarani',
    nama: 'Titik Buket Pettarani',
    alamat: 'Jalan Andi Pangeran Pettarani II No. 34A, Tamamaung, Kec. Panakkukang, Makassar',
    lat: -5.1455901,
    lng: 119.4457646,
    radiusMeter: 1000,
    shifts: [
      { id: 'Shift 1', masuk: '07:00', pulang: '16:00' },
      { id: 'Shift 2', masuk: '11:00', pulang: '20:00' },
      { id: 'Shift 3', masuk: '15:00', pulang: '20:00' }
    ]
  },
  samata: {
    id: 'samata',
    nama: 'Titik Buket Samata',
    alamat: 'Jalan Abdul Kadir Daeng Suro No. 161, Romangpolong, Kec. Somba Opu, Kabupaten Gowa, Sulawesi Selatan',
    lat: -5.1962562,
    lng: 119.4923834,
    radiusMeter: 1000,
    shifts: [
      { id: 'Shift 1', masuk: '08:00', pulang: '15:00' },
      { id: 'Shift 2', masuk: '11:00', pulang: '20:00' },
      { id: 'Shift 3', masuk: '15:00', pulang: '20:00' }
    ]
  }
};
const LATE_TOLERANCE_MIN = 20;

// ============ DB JSON SEDERHANA ============
function loadDB() {
  if (!fs.existsSync(DATA_FILE)) {
    const adminHash = bcrypt.hashSync('admin123', 10);
    const db = {
      stores: DEFAULT_STORES,
      users: [{ id: 'admin-1', username: 'admin', nama: 'Administrator', role: 'admin', passwordHash: adminHash, storeId: 'semua', createdAt: new Date().toISOString() }],
      attendance: []
    };
    fs.writeFileSync(DATA_FILE, JSON.stringify(db, null, 2));
    return db;
  }
  try {
    const db = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    if (!db.stores) db.stores = DEFAULT_STORES;
    if (!db.users) db.users = [];
    if (!db.attendance) db.attendance = [];
    return db;
  } catch (e) {
    console.error('DB rusak, buat baru', e);
    return { stores: DEFAULT_STORES, users: [], attendance: [] };
  }
}
function saveDB(db) { fs.writeFileSync(DATA_FILE, JSON.stringify(db, null, 2)); }

// ============ HELPERS ============
function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}
function nowWITA() {
  // WITA = UTC+8
  const now = new Date(Date.now() + (8 * 60 * 60 * 1000) + new Date().getTimezoneOffset() * 60000);
  return now;
  // Note: pendekatan sederhana; untuk presisi gunakan Intl. Di bawah kita pakai Intl.
}
function witaParts(date = new Date()) {
  const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Makassar', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
  const parts = Object.fromEntries(fmt.formatToParts(date).map(p => [p.type, p.value]));
  return { dateStr: `${parts.year}-${parts.month}-${parts.day}`, timeStr: `${parts.hour}:${parts.minute}:${parts.second}`, ymd: `${parts.year}-${parts.month}-${parts.day}` };
}
function minutesOf(hhmm) { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m; }

function auth(req, res, next) {
  const h = req.headers.authorization || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : null;
  if (!token) return res.status(401).json({ ok: false, message: 'Belum login' });
  try { req.user = jwt.verify(token, JWT_SECRET); next(); }
  catch { return res.status(401).json({ ok: false, message: 'Sesi kedaluwarsa, login ulang' }); }
}
function adminOnly(req, res, next) {
  if (req.user.role !== 'admin') return res.status(403).json({ ok: false, message: 'Khusus admin' });
  next();
}
function dirSizeMB(dir) {
  let total = 0;
  if (!fs.existsSync(dir)) return 0;
  for (const f of fs.readdirSync(dir)) {
    try { total += fs.statSync(path.join(dir, f)).size; } catch {}
  }
  return total / (1024 * 1024);
}

// ============ AUTH ============
app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  const db = loadDB();
  const u = db.users.find(x => x.username.toLowerCase() === String(username || '').toLowerCase());
  if (!u || !bcrypt.compareSync(password || '', u.passwordHash))
    return res.status(401).json({ ok: false, message: 'Username / password salah' });
  const token = jwt.sign({ id: u.id, username: u.username, nama: u.nama, role: u.role, storeId: u.storeId }, JWT_SECRET, { expiresIn: '24h' });
  res.json({ ok: true, token, user: { id: u.id, username: u.username, nama: u.nama, role: u.role, storeId: u.storeId } });
});

// Admin buat akun (hanya admin)
app.post('/api/admin/users', auth, adminOnly, (req, res) => {
  const { username, nama, password, role, storeId } = req.body;
  if (!username || !nama || !password) return res.status(400).json({ ok: false, message: 'username, nama, password wajib diisi' });
  const db = loadDB();
  if (db.users.some(x => x.username.toLowerCase() === username.toLowerCase()))
    return res.status(400).json({ ok: false, message: 'Username sudah dipakai' });
  const nu = { id: 'u-' + Date.now(), username, nama, role: role === 'admin' ? 'admin' : 'karyawan', storeId: storeId || 'semua', passwordHash: bcrypt.hashSync(password, 10), createdAt: new Date().toISOString() };
  db.users.push(nu); saveDB(db);
  res.json({ ok: true, message: 'Akun dibuat', user: { id: nu.id, username, nama, role: nu.role, storeId: nu.storeId } });
});
app.get('/api/admin/users', auth, adminOnly, (req, res) => {
  const db = loadDB();
  res.json({ ok: true, users: db.users.map(u => ({ id: u.id, username: u.username, nama: u.nama, role: u.role, storeId: u.storeId, createdAt: u.createdAt })) });
});
app.delete('/api/admin/users/:id', auth, adminOnly, (req, res) => {
  const db = loadDB();
  const i = db.users.findIndex(u => u.id === req.params.id);
  if (i < 0) return res.status(404).json({ ok: false, message: 'User tidak ditemukan' });
  if (db.users[i].username === 'admin') return res.status(400).json({ ok: false, message: 'Akun admin utama tidak boleh dihapus' });
  db.users.splice(i, 1); saveDB(db);
  res.json({ ok: true, message: 'User dihapus' });
});
app.post('/api/admin/reset-password', auth, adminOnly, (req, res) => {
  const { userId, newPassword } = req.body;
  const db = loadDB();
  const u = db.users.find(x => x.id === userId);
  if (!u) return res.status(404).json({ ok: false, message: 'User tidak ditemukan' });
  u.passwordHash = bcrypt.hashSync(newPassword || '123456', 10); saveDB(db);
  res.json({ ok: true, message: 'Password direset' });
});

// ============ STORES ============
app.get('/api/stores', (req, res) => {
  const db = loadDB();
  res.json({ ok: true, stores: db.stores, lateToleranceMin: LATE_TOLERANCE_MIN });
});
app.put('/api/admin/stores/:id', auth, adminOnly, (req, res) => {
  const db = loadDB();
  const s = db.stores[req.params.id];
  if (!s) return res.status(404).json({ ok: false, message: 'Toko tidak ditemukan' });
  const { lat, lng, radiusMeter } = req.body;
  if (lat !== undefined) s.lat = parseFloat(lat);
  if (lng !== undefined) s.lng = parseFloat(lng);
  if (radiusMeter !== undefined) s.radiusMeter = parseInt(radiusMeter);
  saveDB(db);
  res.json({ ok: true, message: 'Lokasi toko diperbarui (kalibrasi GPS)', store: s });
});

// ============ ABSENSI ============
const upload = multer({ dest: UPLOAD_DIR, limits: { fileSize: 5 * 1024 * 1024 } });

app.post('/api/absen', auth, upload.single('photo'), (req, res) => {
  const { storeId, shift, type, lat, lng } = req.body;
  const db = loadDB();
  const store = db.stores[storeId];
  if (!store) return res.status(400).json({ ok: false, message: 'Toko tidak valid' });
  if (!shift || !type || !lat || !lng) return res.status(400).json({ ok: false, message: 'Data tidak lengkap (toko, shift, tipe, lokasi wajib)' });
  if (!req.file) return res.status(400).json({ ok: false, message: 'Foto wajib diambil' });

  const uLat = parseFloat(lat), uLng = parseFloat(lng);
  const dist = Math.round(haversine(uLat, uLng, store.lat, store.lng));

  // Validasi radius -> TOLAK bila di luar
  if (dist > store.radiusMeter) {
    try { fs.unlinkSync(req.file.path); } catch {}
    return res.status(400).json({ ok: false, rejected: true, message: `ABSEN DITOLAK: Anda ${dist} m dari ${store.nama} (maks ${store.radiusMeter} m). Mendekatlah ke toko lalu coba lagi.`, distance: dist });
  }

  // Validasi jam & keterlambatan (WITA)
  const now = new Date();
  const { dateStr, timeStr } = witaParts(now);
  const shiftDef = store.shifts.find(s => s.id === shift) || store.shifts[0];
  let status = 'tepat_waktu';
  let keterangan = '';
  const nowMin = minutesOf(timeStr.slice(0, 5));
  if (type === 'masuk') {
    const batas = minutesOf(shiftDef.masuk) + LATE_TOLERANCE_MIN;
    if (nowMin > batas) { status = 'terlambat'; const telat = nowMin - minutesOf(shiftDef.masuk); keterangan = `Terlambat ${telat} menit`; }
  } else {
    const pulangMin = minutesOf(shiftDef.pulang);
    if (nowMin < pulangMin - 15) { status = 'pulang_cepat'; keterangan = 'Pulang sebelum waktunya'; }
    else status = 'pulang';
  }

  // Simpan foto — LEWATI bila penyimpanan >= 80% penuh (absen tetap diterima agar laporan tetap masuk)
  let photoPath = null, fotoDiskip = false;
  try {
    let dbSize = 0; try { dbSize = fs.statSync(DATA_FILE).size; } catch {}
    const totalMB = dirSizeMB(UPLOAD_DIR) + dbSize / (1024 * 1024);
    if (totalMB >= STORAGE_LIMIT_MB * 0.8) {
      try { fs.unlinkSync(req.file.path); } catch {}
      fotoDiskip = true;
    }
  } catch { /* jika cek gagal, simpan foto seperti biasa */ }
  if (!fotoDiskip) {
    const ext = path.extname(req.file.originalname || '') || '.jpg';
    const finalName = `${dateStr}_${req.user.username}_${type}_${Date.now()}${ext}`;
    try { fs.renameSync(req.file.path, path.join(UPLOAD_DIR, finalName)); photoPath = '/uploads/' + finalName; } catch {}
  }

  const rec = {
    id: 'a-' + Date.now() + '-' + Math.floor(Math.random() * 9999),
    userId: req.user.id, username: req.user.username, nama: req.user.nama,
    storeId, storeNama: store.nama, shift: shiftDef.id,
    type, timestamp: now.toISOString(), tanggal: dateStr, jamWita: timeStr,
    lat: uLat, lng: uLng, distance: dist, status, keterangan: fotoDiskip ? (keterangan ? keterangan + ' • ' : '') + 'Foto dilewati (penyimpanan hampir penuh)' : keterangan,
    photo: photoPath, fotoDiskip
  };
  db.attendance.push(rec); saveDB(db);
  const okMsg = type === 'masuk'
    ? (status === 'terlambat' ? `Absen masuk tercatat (TERLAMBAT - ${rec.keterangan})` : 'Absen masuk tercatat. Selamat bekerja!')
    : 'Absen pulang tercatat. Terima kasih!';
  res.json({ ok: true, message: fotoDiskip ? okMsg + ' Catatan: foto tidak disimpan karena penyimpanan hampir penuh.' : okMsg, record: rec });
});

app.get('/api/my-attendance', auth, (req, res) => {
  const db = loadDB();
  const rows = db.attendance.filter(a => a.userId === req.user.id).sort((a, b) => b.timestamp.localeCompare(a.timestamp)).slice(0, 60);
  res.json({ ok: true, rows });
});

// ============ ADMIN: DATA, LAPORAN, HAPUS ============
app.get('/api/admin/attendance', auth, adminOnly, (req, res) => {
  const db = loadDB();
  let rows = [...db.attendance];
  const { storeId, tanggal, bulan, nama, shift, status } = req.query;
  if (storeId) rows = rows.filter(r => r.storeId === storeId);
  if (tanggal) rows = rows.filter(r => r.tanggal === tanggal);
  if (bulan) rows = rows.filter(r => r.tanggal.startsWith(bulan)); // YYYY-MM
  if (nama) rows = rows.filter(r => (r.nama + ' ' + r.username).toLowerCase().includes(nama.toLowerCase()));
  if (shift) rows = rows.filter(r => r.shift === shift);
  if (status) rows = rows.filter(r => r.status === status);
  rows.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  res.json({ ok: true, count: rows.length, rows });
});

// Periode laporan: tgl 29 bulan lalu s/d tgl 28 bulan berjalan. Contoh periode=2026-09 -> 2026-08-29 s/d 2026-09-28
function periodRange(periode) {
  const [y, m] = periode.split('-').map(Number);
  const end = `${y}-${String(m).padStart(2, '0')}-28`;
  const pm = m === 1 ? 12 : m - 1, py = m === 1 ? y - 1 : y;
  const start = `${py}-${String(pm).padStart(2, '0')}-29`;
  return { start, end };
}
// Laporan per karyawan: mode kalender (?bulan=YYYY-MM) atau periode 29-28 (?periode=YYYY-MM)
app.get('/api/admin/report', auth, adminOnly, (req, res) => {
  const db = loadDB();
  const { bulan, periode, storeId } = req.query;
  let rows, label;
  if (periode) {
    if (!/^\d{4}-\d{2}$/.test(periode)) return res.status(400).json({ ok: false, message: 'Parameter periode (YYYY-MM) tidak valid' });
    const { start, end } = periodRange(periode);
    rows = db.attendance.filter(r => r.tanggal >= start && r.tanggal <= end);
    label = { mode: 'periode', periode, start, end };
  } else {
    if (!bulan) return res.status(400).json({ ok: false, message: 'Parameter bulan (YYYY-MM) wajib' });
    rows = db.attendance.filter(r => r.tanggal.startsWith(bulan));
    label = { mode: 'bulan', bulan };
  }
  if (storeId) rows = rows.filter(r => r.storeId === storeId);
  const map = {};
  for (const r of rows) {
    const key = r.userId;
    if (!map[key]) map[key] = { userId: r.userId, username: r.username, nama: r.nama, storeId: r.storeId, hadirMasuk: 0, terlambat: 0, tepatWaktu: 0, pulang: 0, pulangCepat: 0, totalMenitTerlambat: 0, tanggalHadir: new Set(), detail: [] };
    const e = map[key];
    e.detail.push(r);
    e.tanggalHadir.add(r.tanggal);
    if (r.type === 'masuk') {
      e.hadirMasuk++;
      if (r.status === 'terlambat') { e.terlambat++; const m = parseInt((r.keterangan.match(/(\d+)/) || [0, 0])[1]); e.totalMenitTerlambat += m; }
      else e.tepatWaktu++;
    } else { e.pulang++; if (r.status === 'pulang_cepat') e.pulangCepat++; }
  }
  const rekap = Object.values(map).map(e => ({ ...e, hariHadir: e.tanggalHadir.size, tanggalHadir: [...e.tanggalHadir].sort(), detail: e.detail.sort((a, b) => a.timestamp.localeCompare(b.timestamp)) }));
  rekap.sort((a, b) => a.nama.localeCompare(b.nama));
  res.json({ ok: true, ...label, jumlahKaryawan: rekap.length, totalAbsen: rows.length, rekap });
});

// Hapus data: per nama (userId/username), per hari (tanggal), per bulan (YYYY-MM), atau satu record
app.delete('/api/admin/attendance', auth, adminOnly, (req, res) => {
  const db = loadDB();
  const { mode, userId, username, tanggal, bulan, id } = req.query;
  let hapus = 0; let fotoHapus = 0;
  const buangFoto = (r) => { if (r.photo) { try { fs.unlinkSync(path.join(DATA_DIR, r.photo.replace(/^\//, ''))); fotoHapus++; } catch {} } };
  if (mode === 'satu' && id) {
    const i = db.attendance.findIndex(r => r.id === id);
    if (i < 0) return res.status(404).json({ ok: false, message: 'Data tidak ditemukan' });
    buangFoto(db.attendance[i]); db.attendance.splice(i, 1); hapus = 1;
  } else if (mode === 'nama' && (userId || username)) {
    const sisa = [];
    for (const r of db.attendance) {
      if ((userId && r.userId === userId) || (username && r.username.toLowerCase() === username.toLowerCase())) { buangFoto(r); hapus++; }
      else sisa.push(r);
    }
    db.attendance = sisa;
  } else if (mode === 'hari' && tanggal) {
    const sisa = [];
    for (const r of db.attendance) { if (r.tanggal === tanggal) { buangFoto(r); hapus++; } else sisa.push(r); }
    db.attendance = sisa;
  } else if (mode === 'bulan' && bulan) {
    const sisa = [];
    for (const r of db.attendance) { if (r.tanggal.startsWith(bulan)) { buangFoto(r); hapus++; } else sisa.push(r); }
    db.attendance = sisa;
  } else return res.status(400).json({ ok: false, message: 'Mode hapus tidak valid. Gunakan mode=satu|nama|hari|bulan dengan parameter yang sesuai.' });
  saveDB(db);
  res.json({ ok: true, message: `${hapus} data absensi dihapus (${fotoHapus} foto ikut dibersihkan)`, hapus });
});

// Hapus FOTO saja (data laporan tetap ada, foto jadi "tanpa foto"). Mode: semua | bulan=YYYY-MM | hari=YYYY-MM-DD | lebih_dari=N (hari)
app.delete('/api/admin/photos', auth, adminOnly, (req, res) => {
  const db = loadDB();
  const { mode, bulan, tanggal, hari } = req.query;
  const beforeMB = dirSizeMB(UPLOAD_DIR);
  let kena = 0;
  const cocok = (r) => {
    if (!r.photo) return false;
    if (mode === 'semua') return true;
    if (mode === 'bulan' && bulan) return r.tanggal.startsWith(bulan);
    if (mode === 'hari' && tanggal) return r.tanggal === tanggal;
    if (mode === 'lebih_dari' && hari) {
      const batas = new Date(); batas.setDate(batas.getDate() - parseInt(hari));
      const tgl = new Date(r.tanggal + 'T00:00:00');
      return tgl < batas;
    }
    return false;
  };
  if (!['semua', 'bulan', 'hari', 'lebih_dari'].includes(mode))
    return res.status(400).json({ ok: false, message: 'Mode tidak valid. Gunakan mode=semua|bulan|hari|lebih_dari.' });
  for (const r of db.attendance) {
    if (cocok(r)) {
      try { fs.unlinkSync(path.join(DATA_DIR, r.photo.replace(/^\//, ''))); } catch {}
      r.photo = null; r.fotoDiskip = true;
      r.keterangan = (r.keterangan ? r.keterangan + ' • ' : '') + 'Foto dihapus admin (hemat penyimpanan)';
      kena++;
    }
  }
  saveDB(db);
  const freed = beforeMB - dirSizeMB(UPLOAD_DIR);
  res.json({ ok: true, message: `${kena} foto dihapus, hemat ${freed.toFixed(1)} MB. Data laporan tetap aman.`, hapus: kena, hematMB: +freed.toFixed(2) });
});

// ============ STORAGE ============
app.get('/api/admin/storage', auth, adminOnly, (req, res) => {
  const db = loadDB();
  const upMB = dirSizeMB(UPLOAD_DIR);
  let dbMB = 0; try { dbMB = fs.statSync(DATA_FILE).size / (1024 * 1024); } catch {}
  const total = upMB + dbMB;
  const pct = Math.round((total / STORAGE_LIMIT_MB) * 100);
  const warning = pct >= 80;
  res.json({ ok: true, uploadsMB: +upMB.toFixed(2), dbMB: +dbMB.toFixed(2), totalMB: +total.toFixed(2), limitMB: STORAGE_LIMIT_MB, percent: pct, warning, message: warning ? `⚠️ Penyimpanan ${pct}% penuh (${total.toFixed(1)}/${STORAGE_LIMIT_MB} MB). Segera hapus data lama via menu Hapus Data (per nama / hari / bulan).` : `Penyimpanan aman (${pct}%).`,
    dataDir: DATA_DIR, permanen: DATA_DIR !== __dirname,
    jumlahUser: db.users.length, jumlahAbsen: db.attendance.length });
});

app.get('/api/health', (req, res) => res.json({ ok: true, time: new Date().toISOString() }));

app.listen(PORT, () => console.log(`✅ Absensi Titik Buket jalan di port ${PORT}`));
