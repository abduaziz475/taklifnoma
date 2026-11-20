import express from "express";
import helmet from "helmet";
import bcrypt from "bcryptjs";
import { DatabaseSync } from "node:sqlite";
import { createHash, randomBytes, randomInt } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

const app = express();
const port = Number(process.env.PORT || 3001);
const isProduction = process.env.NODE_ENV === "production";
const demoEnabled = process.env.DEMO_MODE !== "false";
const databasePath = resolve(process.env.DB_PATH || "./data/mehr.sqlite");
mkdirSync(dirname(databasePath), { recursive: true });
const db = new DatabaseSync(databasePath);
db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    first_name TEXT NOT NULL, last_name TEXT NOT NULL, phone TEXT NOT NULL UNIQUE,
    birth_date TEXT NOT NULL DEFAULT '', city TEXT NOT NULL,
    telegram TEXT NOT NULL DEFAULT '', about TEXT NOT NULL DEFAULT '',
    consent TEXT NOT NULL DEFAULT 'pending', created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS appointments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    date TEXT NOT NULL, start_time TEXT NOT NULL, end_time TEXT NOT NULL DEFAULT '',
    type TEXT NOT NULL, venue TEXT NOT NULL, address TEXT NOT NULL,
    duration TEXT NOT NULL DEFAULT '', note TEXT NOT NULL DEFAULT '',
    wish TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'pending',
    ticket_code TEXT NOT NULL UNIQUE, created_at TEXT NOT NULL, admin_note TEXT NOT NULL DEFAULT ''
  );
  CREATE TABLE IF NOT EXISTS otp_challenges (
    id TEXT PRIMARY KEY, phone TEXT NOT NULL, code_hash TEXT NOT NULL,
    payload TEXT NOT NULL, attempts INTEGER NOT NULL DEFAULT 0,
    expires_at INTEGER NOT NULL, created_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT PRIMARY KEY, user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    is_admin INTEGER NOT NULL DEFAULT 0, expires_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    sender TEXT NOT NULL CHECK(sender IN ('user','admin')),
    body TEXT NOT NULL,
    created_at TEXT NOT NULL,
    read_at TEXT
  );
  CREATE INDEX IF NOT EXISTS messages_user_created ON messages(user_id, created_at);
  CREATE TABLE IF NOT EXISTS consent_responses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    invitation_id INTEGER,
    answer TEXT NOT NULL CHECK(answer IN ('yes','no','pending')),
    response_date TEXT NOT NULL,
    response_time TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS consent_responses_user ON consent_responses(user_id, created_at);
  CREATE TABLE IF NOT EXISTS meeting_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    meeting_id INTEGER NOT NULL REFERENCES appointments(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    previous_date TEXT,
    previous_start_time TEXT,
    previous_end_time TEXT,
    previous_status TEXT,
    reason TEXT NOT NULL DEFAULT '',
    changed_by TEXT NOT NULL DEFAULT 'system',
    created_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS meeting_history_meeting ON meeting_history(meeting_id, created_at);
  CREATE TABLE IF NOT EXISTS notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    admin_only INTEGER NOT NULL DEFAULT 0,
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    type TEXT NOT NULL DEFAULT 'info',
    read_at TEXT,
    created_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS notifications_recipient ON notifications(user_id, created_at);
  CREATE INDEX IF NOT EXISTS appointments_conflict ON appointments(date, start_time, end_time, status);
  CREATE TABLE IF NOT EXISTS activity_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    actor TEXT NOT NULL,
    action TEXT NOT NULL,
    entity TEXT NOT NULL,
    entity_id TEXT NOT NULL DEFAULT '',
    details TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL
  );
`);

function setting(key, fallback) {
  const row = db.prepare("SELECT value FROM settings WHERE key = ?").get(key);
  return row ? row.value : fallback;
}

function setSetting(key, value) {
  db.prepare("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(key, value);
}

for (const [key, value] of Object.entries({
  site_name: "ELITE MEETING",
  welcome_title: "Har bir uchrashuv yangi bir hikoyaning boshlanishi.",
  proposal_title: "Sizga bir taklifim bor...",
  accent_color: "#c89c72",
  meeting_types: JSON.stringify(["Kafe", "Restoran", "Sayr", "Park", "Kino", "Boshqa"]),
})) {
  if (!db.prepare("SELECT key FROM settings WHERE key = ?").get(key)) setSetting(key, value);
}
if (setting("site_name", "") === "Mehr") setSetting("site_name", "ELITE MEETING");
if (setting("welcome_title", "") === "Sizni maxsus uchrashuvga taklif qilamiz") {
  setSetting("welcome_title", "Har bir uchrashuv yangi bir hikoyaning boshlanishi.");
}
if (setting("proposal_title", "") === "Sizga bir taklifim bor...") {
  setSetting("proposal_title", "Sizga maxsus taklifim bor...");
}
if (setting("accent_color", "") === "#c89c72") setSetting("accent_color", "#c66b87");
if (setting("meeting_types", "") === '["Kafe","Restoran","Sayr","Park","Kino","Boshqa"]') {
  setSetting("meeting_types", JSON.stringify(["Restoran", "Kafe", "Sayr", "Park", "Kino", "Sayohat", "Maxsus tadbir", "Boshqa"]));
}

const adminLogin = process.env.ADMIN_LOGIN || "admin";
const adminPassword = process.env.ADMIN_PASSWORD || "Mehr2026!";
if (!db.prepare("SELECT key FROM settings WHERE key = 'admin_hash'").get()) {
  setSetting("admin_hash", bcrypt.hashSync(adminPassword, 12));
}

app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json({ limit: "64kb" }));
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", process.env.APP_ORIGIN || "http://localhost:5173");
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PATCH,DELETE,OPTIONS");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

const nowIso = () => new Date().toISOString();
const hash = (value) => createHash("sha256").update(value).digest("hex");
const clean = (value, max = 180) => typeof value === "string" ? value.trim().slice(0, max) : "";

function cookieOptions(maxAge) {
  return `HttpOnly; Path=/; SameSite=Lax; Max-Age=${maxAge}${isProduction ? "; Secure" : ""}`;
}

function readCookie(req, name) {
  const header = req.headers.cookie || "";
  const match = header.match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`));
  return match ? decodeURIComponent(match[1]) : "";
}

function createSession(res, userId, isAdmin = false) {
  const token = randomBytes(32).toString("base64url");
  const expiry = Date.now() + 1000 * 60 * 60 * 24 * 14;
  db.prepare("INSERT INTO sessions (token_hash, user_id, is_admin, expires_at) VALUES (?, ?, ?, ?)")
    .run(hash(token), userId, isAdmin ? 1 : 0, expiry);
  res.setHeader("Set-Cookie", `mehr_session=${encodeURIComponent(token)}; ${cookieOptions(60 * 60 * 24 * 14)}`);
}

function session(req) {
  const token = readCookie(req, "mehr_session");
  if (!token) return null;
  const current = db.prepare("SELECT * FROM sessions WHERE token_hash = ? AND expires_at > ?").get(hash(token), Date.now());
  if (!current) return null;
  if (current.is_admin) return { admin: true };
  const user = db.prepare("SELECT * FROM users WHERE id = ?").get(current.user_id);
  return user ? { admin: false, user } : null;
}

function requireUser(req, res, next) {
  const current = session(req);
  if (!current || current.admin) return res.status(401).json({ error: "Davom etish uchun telefon raqamingiz bilan kiring." });
  req.currentUser = current.user;
  next();
}

function requireAdmin(req, res, next) {
  if (!session(req)?.admin) return res.status(401).json({ error: "Admin hisobiga kirish talab qilinadi." });
  next();
}

function normalizePhone(phone) {
  const digits = String(phone || "").replace(/\D/g, "");
  const normalized = digits.startsWith("998") ? digits : `998${digits.replace(/^0/, "")}`;
  return /^\d{12}$/.test(normalized) ? `+${normalized}` : "";
}

function validDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function validTime(value) {
  const match = value.match(/^(\d{2}):(\d{2})$/);
  return Boolean(match && Number(match[1]) < 24 && Number(match[2]) < 60);
}

function maySendCode(phone) {
  const since = Date.now() - 10 * 60_000;
  const recent = db.prepare("SELECT COUNT(*) count FROM otp_challenges WHERE phone = ? AND created_at > ?").get(phone, since);
  return recent.count < 3;
}

function validateProfile(input) {
  const phone = normalizePhone(input.phone);
  const profile = {
    first_name: clean(input.firstName, 70),
    last_name: clean(input.lastName, 70),
    phone,
    birth_date: clean(input.birthDate, 10),
    city: clean(input.city, 80),
    telegram: clean(input.telegram, 40).replace(/^@/, ""),
    about: clean(input.about, 500),
  };
  if (!profile.first_name || !profile.last_name || !profile.phone || !profile.city) return null;
  if (profile.birth_date && !/^\d{4}-\d{2}-\d{2}$/.test(profile.birth_date)) return null;
  return profile;
}

async function sendSms(phone, code) {
  const { TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER } = process.env;
  if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || !TWILIO_FROM_NUMBER) {
    throw new Error("Haqiqiy SMS yuborish uchun Twilio sozlamalari kiritilmagan.");
  }
  const body = new URLSearchParams({ To: phone, From: TWILIO_FROM_NUMBER, Body: `ELITE MEETING tasdiqlash kodi: ${code}` });
  const auth = Buffer.from(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`).toString("base64");
  const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`, {
    method: "POST",
    headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!response.ok) throw new Error(`SMS provayderi xatoligi (${response.status}).`);
}

app.get("/api/config", (_req, res) => {
  res.json({
    demoMode: demoEnabled && setting("demo_mode", "true") !== "false",
    siteName: setting("site_name", "Mehr"),
    welcomeTitle: setting("welcome_title", "Sizni maxsus uchrashuvga taklif qilamiz"),
    proposalTitle: setting("proposal_title", "Sizga bir taklifim bor..."),
    accentColor: setting("accent_color", "#c89c72"),
    logoData: setting("logo_data", ""),
    meetingTypes: JSON.parse(setting("meeting_types", '["Kafe","Restoran","Sayr","Park","Kino","Boshqa"]')),
  });
});

app.post("/api/auth/start", async (req, res) => {
  const phone = normalizePhone(req.body?.phone);
  if (!phone) return res.status(400).json({ error: "Telefon raqamini +998 bilan to‘g‘ri kiriting." });
  if (!maySendCode(phone)) return res.status(429).json({ error: "Bu raqamga kod ko‘p so‘raldi. 10 daqiqadan keyin urinib ko‘ring." });
  const intent = req.body?.intent === "login" ? "login" : "signup";
  const existing = db.prepare("SELECT id FROM users WHERE phone = ?").get(phone);
  if (intent === "signup" && existing) return res.status(409).json({ error: "Bu raqam ro‘yxatdan o‘tgan. Kabinetga kirib ko‘ring." });
  if (intent === "login" && !existing) return res.status(404).json({ error: "Bu raqam bilan profil topilmadi. Avval ro‘yxatdan o‘ting." });
  const profile = intent === "signup" ? validateProfile({ ...req.body, phone }) : null;
  if (intent === "signup" && !profile) return res.status(400).json({ error: "Ism, familiya, telefon va shahar maydonlarini to‘g‘ri to‘ldiring." });

  const code = String(randomInt(0, 1000000)).padStart(6, "0");
  const id = randomBytes(18).toString("base64url");
  const created = Date.now();
  db.prepare("INSERT INTO otp_challenges (id, phone, code_hash, payload, expires_at, created_at) VALUES (?, ?, ?, ?, ?, ?)")
    .run(id, phone, hash(`${id}:${code}`), JSON.stringify({ intent, profile }), created + 5 * 60_000, created);
  try {
    const demo = demoEnabled && setting("demo_mode", "true") !== "false";
    if (!demo) await sendSms(phone, code);
    res.json({ challengeId: id, demoCode: demo ? code : undefined, expiresIn: 300, message: demo ? "Demo rejim: kod ushbu oynada ko‘rsatilgan." : "Telefon raqamingizga tasdiqlash kodi yuborildi." });
  } catch (error) {
    db.prepare("DELETE FROM otp_challenges WHERE id = ?").run(id);
    res.status(503).json({ error: error.message || "SMS yuborilmadi. Keyinroq qayta urinib ko‘ring." });
  }
});

app.post("/api/auth/verify", (req, res) => {
  const id = clean(req.body?.challengeId, 80);
  const code = clean(req.body?.code, 6);
  const challenge = db.prepare("SELECT * FROM otp_challenges WHERE id = ?").get(id);
  if (!challenge || challenge.expires_at < Date.now()) {
    if (challenge) db.prepare("DELETE FROM otp_challenges WHERE id = ?").run(id);
    return res.status(400).json({ error: "Kod muddati tugagan. Yangi kod so‘rang." });
  }
  if (challenge.attempts >= 5) {
    db.prepare("DELETE FROM otp_challenges WHERE id = ?").run(id);
    return res.status(429).json({ error: "Urinishlar soni oshib ketdi. Yangi kod so‘rang." });
  }
  if (hash(`${id}:${code}`) !== challenge.code_hash) {
    db.prepare("UPDATE otp_challenges SET attempts = attempts + 1 WHERE id = ?").run(id);
    return res.status(400).json({ error: "Tasdiqlash kodi noto‘g‘ri." });
  }
  const payload = JSON.parse(challenge.payload);
  let user;
  if (payload.intent === "signup") {
    const profile = payload.profile;
    try {
      const result = db.prepare(`INSERT INTO users (first_name,last_name,phone,birth_date,city,telegram,about,created_at)
        VALUES (?,?,?,?,?,?,?,?)`).run(profile.first_name, profile.last_name, challenge.phone, profile.birth_date, profile.city, profile.telegram, profile.about, nowIso());
      user = db.prepare("SELECT * FROM users WHERE id = ?").get(result.lastInsertRowid);
    } catch {
      return res.status(409).json({ error: "Bu telefon raqami allaqachon ro‘yxatdan o‘tgan." });
    }
  } else {
    user = db.prepare("SELECT * FROM users WHERE phone = ?").get(challenge.phone);
  }
  db.prepare("DELETE FROM otp_challenges WHERE phone = ?").run(challenge.phone);
  createSession(res, user.id);
  res.json({ user: publicUser(user) });
});

app.post("/api/auth/resend", async (req, res) => {
  const old = db.prepare("SELECT * FROM otp_challenges WHERE id = ?").get(clean(req.body?.challengeId, 80));
  if (!old || Date.now() - old.created_at < 30_000) return res.status(429).json({ error: "Yangi kodni 30 soniyadan so‘ng so‘rashingiz mumkin." });
  if (!maySendCode(old.phone)) return res.status(429).json({ error: "Bu raqamga kod ko‘p so‘raldi. 10 daqiqadan keyin urinib ko‘ring." });
  const code = String(randomInt(0, 1000000)).padStart(6, "0");
  const id = randomBytes(18).toString("base64url");
  const demo = demoEnabled && setting("demo_mode", "true") !== "false";
  try {
    if (!demo) await sendSms(old.phone, code);
    db.prepare("DELETE FROM otp_challenges WHERE id = ?").run(old.id);
    db.prepare("INSERT INTO otp_challenges (id,phone,code_hash,payload,expires_at,created_at) VALUES (?,?,?,?,?,?)")
      .run(id, old.phone, hash(`${id}:${code}`), old.payload, Date.now() + 5 * 60_000, Date.now());
    res.json({ challengeId: id, demoCode: demo ? code : undefined, expiresIn: 300, message: demo ? "Demo rejim: yangi kod ekranda ko‘rsatilgan." : "Yangi tasdiqlash kodi yuborildi." });
  } catch (error) {
    res.status(503).json({ error: error.message || "SMS yuborilmadi." });
  }
});

function publicUser(user) {
  return {
    id: user.id, firstName: user.first_name, lastName: user.last_name, phone: user.phone,
    birthDate: user.birth_date, city: user.city, telegram: user.telegram, about: user.about,
    consent: user.consent, createdAt: user.created_at,
  };
}

function publicAppointment(row) {
  return {
    id: row.id, userId: row.user_id, date: row.date, startTime: row.start_time, endTime: row.end_time,
    type: row.type, venue: row.venue, address: row.address, duration: row.duration, note: row.note,
    wish: row.wish, status: row.status, ticketCode: row.ticket_code, createdAt: row.created_at, adminNote: row.admin_note,
  };
}

app.get("/api/me", requireUser, (req, res) => {
  const appointments = db.prepare("SELECT * FROM appointments WHERE user_id = ? ORDER BY created_at DESC").all(req.currentUser.id);
  res.json({ user: publicUser(req.currentUser), appointments: appointments.map(publicAppointment) });
});

app.patch("/api/me", requireUser, (req, res) => {
  const profile = validateProfile({ ...req.body, phone: req.currentUser.phone });
  if (!profile) return res.status(400).json({ error: "Ism, familiya va shahar maydonlarini to‘g‘ri to‘ldiring." });
  db.prepare("UPDATE users SET first_name=?,last_name=?,birth_date=?,city=?,telegram=?,about=? WHERE id=?")
    .run(profile.first_name, profile.last_name, profile.birth_date, profile.city, profile.telegram, profile.about, req.currentUser.id);
  res.json({ user: publicUser(db.prepare("SELECT * FROM users WHERE id = ?").get(req.currentUser.id)) });
});

app.post("/api/consent", requireUser, (req, res) => {
  const consent = req.body?.consent;
  if (!["yes", "no", "pending"].includes(consent)) return res.status(400).json({ error: "Tanlov noto‘g‘ri." });
  db.prepare("UPDATE users SET consent = ? WHERE id = ?").run(consent, req.currentUser.id);
  const now = nowIso();
  db.prepare(`INSERT INTO consent_responses (user_id,answer,response_date,response_time,status,created_at,updated_at)
    VALUES (?,?,?,?,?,?,?)`).run(req.currentUser.id, consent, now.slice(0,10), now.slice(11,19), "active", now, now);
  if (consent === "no") db.prepare("UPDATE appointments SET status='cancelled' WHERE user_id=? AND status='pending'").run(req.currentUser.id);
  db.prepare("INSERT INTO notifications (admin_only,title,body,type,created_at) VALUES (1,?,?,?,?)")
    .run("Yangi rozilik javobi", `${req.currentUser.first_name} ${req.currentUser.last_name}: ${consent}`, "consent", now);
  res.json({ consent });
});

app.post("/api/appointments", requireUser, (req, res) => {
  const input = req.body || {};
  const date = clean(input.date, 10);
  const startTime = clean(input.startTime, 5);
  const type = clean(input.type, 50);
  const venue = clean(input.venue, 120);
  const address = clean(input.address, 200);
  if (!validDate(date) || date < new Date().toISOString().slice(0, 10) || !validTime(startTime) || (input.endTime && (!validTime(clean(input.endTime, 5)) || clean(input.endTime, 5) <= startTime)) || !type || !venue || !address) {
    return res.status(400).json({ error: "Sana, boshlanish vaqti, joy va manzilni to‘liq kiriting." });
  }
  if (req.currentUser.consent !== "yes") return res.status(403).json({ error: "Uchrashuvni rejalashdan oldin taklifga rozilik bering." });
  const conflict = db.prepare(`SELECT id FROM appointments WHERE date=? AND status NOT IN ('cancelled','declined')
    AND start_time < ? AND COALESCE(NULLIF(end_time,''),? ) > ? LIMIT 1`).get(date, clean(input.endTime,5) || "23:59", clean(input.endTime,5) || "23:59", startTime);
  if (conflict) return res.status(409).json({ error: "Bu sana va vaqtda boshqa uchrashuv mavjud. Boshqa vaqt tanlang." });
  const ticketCode = `EM-${new Date().getFullYear()}-${randomBytes(3).toString("hex").toUpperCase()}`;
  const result = db.prepare(`INSERT INTO appointments
    (user_id,date,start_time,end_time,type,venue,address,duration,note,wish,ticket_code,created_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`).run(
    req.currentUser.id, date, startTime, clean(input.endTime, 5), type, venue, address,
    clean(input.duration, 40), clean(input.note, 500), clean(input.wish, 500), ticketCode, nowIso(),
  );
  res.status(201).json({ appointment: publicAppointment(db.prepare("SELECT * FROM appointments WHERE id = ?").get(result.lastInsertRowid)) });
});

app.get("/api/messages", requireUser, (req, res) => {
  const messages = db.prepare("SELECT id, sender, body, created_at createdAt, read_at readAt FROM messages WHERE user_id = ? ORDER BY created_at, id")
    .all(req.currentUser.id);
  db.prepare("UPDATE messages SET read_at = ? WHERE user_id = ? AND sender = 'admin' AND read_at IS NULL")
    .run(nowIso(), req.currentUser.id);
  res.json({ messages });
});

app.get("/api/notifications", requireUser, (req, res) => {
  const rows = db.prepare("SELECT * FROM notifications WHERE user_id=? OR user_id IS NULL ORDER BY created_at DESC LIMIT 100").all(req.currentUser.id);
  res.json({ notifications: rows.map((row) => ({ id: row.id, title: row.title, body: row.body, type: row.type, readAt: row.read_at, createdAt: row.created_at })) });
});

app.post("/api/notifications/read", requireUser, (req, res) => {
  db.prepare("UPDATE notifications SET read_at=? WHERE read_at IS NULL AND (user_id=? OR user_id IS NULL)").run(nowIso(), req.currentUser.id);
  res.json({ ok: true });
});

app.get("/api/meeting-history/:id", requireUser, (req, res) => {
  const meetingId = Number(req.params.id);
  const owned = db.prepare("SELECT id FROM appointments WHERE id=? AND user_id=?").get(meetingId, req.currentUser.id);
  if (!owned) return res.status(404).json({ error: "Uchrashuv topilmadi." });
  const rows = db.prepare("SELECT * FROM meeting_history WHERE meeting_id=? ORDER BY created_at DESC").all(meetingId);
  res.json({ history: rows });
});

app.post("/api/messages", requireUser, (req, res) => {
  const body = typeof req.body?.body === "string" ? req.body.body.trim() : "";
  if (!body || body.length > 2000) return res.status(400).json({ error: "Xabar 1 dan 2000 belgigacha bo‘lishi kerak." });
  const createdAt = nowIso();
  const result = db.prepare("INSERT INTO messages (user_id, sender, body, created_at) VALUES (?, 'user', ?, ?)")
    .run(req.currentUser.id, body, createdAt);
  res.status(201).json({ message: { id: Number(result.lastInsertRowid), sender: "user", body, createdAt, readAt: null } });
});

app.post("/api/auth/logout", (req, res) => {
  const token = readCookie(req, "mehr_session");
  if (token) db.prepare("DELETE FROM sessions WHERE token_hash = ?").run(hash(token));
  res.setHeader("Set-Cookie", `mehr_session=; ${cookieOptions(0)}`);
  res.json({ ok: true });
});

app.post("/api/admin/login", (req, res) => {
  const login = clean(req.body?.login, 100);
  const password = clean(req.body?.password, 200);
  const storedHash = setting("admin_hash", "");
  const validLogin = login === setting("admin_login", adminLogin);
  if (!validLogin || !bcrypt.compareSync(password, storedHash)) return res.status(401).json({ error: "Login yoki parol noto‘g‘ri." });
  createSession(res, null, true);
  res.json({ ok: true });
});

app.get("/api/admin/me", requireAdmin, (_req, res) => res.json({ ok: true }));

app.get("/api/admin/dashboard", requireAdmin, (_req, res) => {
  const counts = db.prepare(`SELECT
    (SELECT COUNT(*) FROM users) totalUsers,
    (SELECT COUNT(*) FROM users WHERE date(created_at)=date('now','localtime')) newUsers,
    (SELECT COUNT(*) FROM users WHERE consent='yes') yesCount,
    (SELECT COUNT(*) FROM users WHERE consent='no') noCount,
    (SELECT COUNT(*) FROM appointments WHERE status='pending') pendingCount,
    (SELECT COUNT(*) FROM appointments WHERE status='confirmed') confirmedCount,
    (SELECT COUNT(*) FROM appointments WHERE status='cancelled') cancelledCount,
    (SELECT COUNT(*) FROM appointments WHERE date=date('now','localtime') AND status!='cancelled') todayCount`).get();
  const daily = db.prepare(`SELECT date(created_at) day, COUNT(*) count FROM users
    WHERE created_at >= datetime('now','-6 days') GROUP BY date(created_at) ORDER BY day`).all();
  const monthly = db.prepare(`SELECT strftime('%Y-%m',created_at) month, COUNT(*) count FROM users
    WHERE created_at >= datetime('now','-5 months') GROUP BY strftime('%Y-%m',created_at) ORDER BY month`).all();
  res.json({ counts, daily, monthly, consent: [{ name: "Ha", value: counts.yesCount }, { name: "Yo‘q", value: counts.noCount }, { name: "Kutilmoqda", value: counts.totalUsers - counts.yesCount - counts.noCount }] });
});

app.get("/api/admin/users", requireAdmin, (req, res) => {
  const q = `%${clean(req.query.q, 100)}%`;
  const users = db.prepare(`SELECT u.*, a.date appointment_date, a.start_time appointment_time, a.status appointment_status
    FROM users u LEFT JOIN appointments a ON a.id=(SELECT id FROM appointments WHERE user_id=u.id ORDER BY created_at DESC LIMIT 1)
    WHERE u.first_name LIKE ? OR u.last_name LIKE ? OR u.phone LIKE ? OR u.city LIKE ? ORDER BY u.created_at DESC`).all(q, q, q, q);
  res.json({ users: users.map((user) => ({ ...publicUser(user), appointmentDate: user.appointment_date, appointmentTime: user.appointment_time, appointmentStatus: user.appointment_status })) });
});

app.get("/api/admin/appointments", requireAdmin, (req, res) => {
  const rows = db.prepare(`SELECT a.*, u.first_name, u.last_name, u.phone FROM appointments a
    JOIN users u ON u.id=a.user_id ORDER BY a.date DESC, a.start_time`).all();
  res.json({ appointments: rows.map((row) => ({ ...publicAppointment(row), firstName: row.first_name, lastName: row.last_name, phone: row.phone })) });
});

app.patch("/api/admin/appointments/:id", requireAdmin, (req, res) => {
  const current = db.prepare("SELECT * FROM appointments WHERE id = ?").get(Number(req.params.id));
  if (!current) return res.status(404).json({ error: "Uchrashuv topilmadi." });
  const status = clean(req.body?.status, 20);
  const allowed = ["pending", "confirmed", "cancelled", "completed"];
  if (status && !allowed.includes(status)) return res.status(400).json({ error: "Uchrashuv holati noto‘g‘ri." });
  const date = clean(req.body?.date || current.date, 10);
  const startTime = clean(req.body?.startTime || current.start_time, 5);
  if (!validDate(date) || !validTime(startTime) || (req.body?.endTime && (!validTime(clean(req.body.endTime, 5)) || clean(req.body.endTime, 5) <= startTime))) return res.status(400).json({ error: "Sana yoki vaqt noto‘g‘ri." });
  const previousStatus = current.status;
  const nextStatus = status || previousStatus;
  db.prepare(`UPDATE appointments SET status=?,date=?,start_time=?,end_time=?,venue=?,address=?,admin_note=? WHERE id=?`)
    .run(nextStatus, date, startTime, clean(req.body?.endTime ?? current.end_time, 5), clean(req.body?.venue ?? current.venue, 120), clean(req.body?.address ?? current.address, 200), clean(req.body?.adminNote ?? current.admin_note, 500), current.id);
  if (date !== current.date || startTime !== current.start_time || clean(req.body?.endTime ?? current.end_time, 5) !== current.end_time || nextStatus !== previousStatus) {
    db.prepare(`INSERT INTO meeting_history (meeting_id,user_id,previous_date,previous_start_time,previous_end_time,previous_status,reason,changed_by,created_at)
      VALUES (?,?,?,?,?,?,?,?,?)`).run(current.id,current.user_id,current.date,current.start_time,current.end_time,previousStatus,clean(req.body?.reason,500),"admin",nowIso());
  }
  db.prepare("INSERT INTO notifications (user_id,title,body,type,created_at) VALUES (?,?,?,?,?)")
    .run(current.user_id, "Uchrashuv yangilandi", `Uchrashuv holati: ${nextStatus}. Sana: ${date} ${startTime}.`, "meeting", nowIso());
  res.json({ appointment: publicAppointment(db.prepare("SELECT * FROM appointments WHERE id=?").get(current.id)) });
});

app.post("/api/admin/appointments", requireAdmin, (req, res) => {
  const userId = Number(req.body?.userId);
  const user = db.prepare("SELECT id FROM users WHERE id=?").get(userId);
  const date = clean(req.body?.date, 10);
  const startTime = clean(req.body?.startTime, 5);
  const venue = clean(req.body?.venue, 120);
  const address = clean(req.body?.address, 200);
  if (!user || !validDate(date) || !validTime(startTime) || !venue || !address) return res.status(400).json({ error: "Foydalanuvchi va uchrashuv ma’lumotlarini tekshiring." });
  const code = `EM-${new Date().getFullYear()}-${randomBytes(3).toString("hex").toUpperCase()}`;
  const result = db.prepare(`INSERT INTO appointments (user_id,date,start_time,end_time,type,venue,address,status,ticket_code,created_at)
    VALUES (?,?,?,?,?,?,?,?,?,?)`).run(userId, date, startTime, clean(req.body?.endTime, 5), clean(req.body?.type, 50) || "Boshqa", venue, address, "confirmed", code, nowIso());
  res.status(201).json({ appointment: publicAppointment(db.prepare("SELECT * FROM appointments WHERE id=?").get(result.lastInsertRowid)) });
});

app.get("/api/admin/messages", requireAdmin, (req, res) => {
  const query = `%${clean(req.query.q, 100)}%`;
  const rows = db.prepare(`SELECT m.id, m.user_id userId, m.sender, m.body, m.created_at createdAt, m.read_at readAt,
      u.first_name firstName, u.last_name lastName, u.phone
    FROM messages m JOIN users u ON u.id = m.user_id
    WHERE m.body LIKE ? OR u.first_name LIKE ? OR u.last_name LIKE ? OR u.phone LIKE ?
    ORDER BY m.created_at, m.id`).all(query, query, query, query);
  db.prepare("UPDATE messages SET read_at = ? WHERE sender = 'user' AND read_at IS NULL").run(nowIso());
  res.json({ messages: rows });
});

app.post("/api/admin/messages/:userId", requireAdmin, (req, res) => {
  const userId = Number(req.params.userId);
  const user = db.prepare("SELECT id FROM users WHERE id = ?").get(userId);
  const body = typeof req.body?.body === "string" ? req.body.body.trim() : "";
  if (!user) return res.status(404).json({ error: "Foydalanuvchi topilmadi." });
  if (!body || body.length > 2000) return res.status(400).json({ error: "Xabar 1 dan 2000 belgigacha bo‘lishi kerak." });
  const createdAt = nowIso();
  const result = db.prepare("INSERT INTO messages (user_id, sender, body, created_at) VALUES (?, 'admin', ?, ?)")
    .run(userId, body, createdAt);
  res.status(201).json({ message: { id: Number(result.lastInsertRowid), userId, sender: "admin", body, createdAt, readAt: null } });
});

app.patch("/api/admin/users/:id", requireAdmin, (req, res) => {
  const user = db.prepare("SELECT * FROM users WHERE id=?").get(Number(req.params.id));
  if (!user) return res.status(404).json({ error: "Foydalanuvchi topilmadi." });
  const profile = validateProfile({ ...req.body, phone: user.phone });
  if (!profile) return res.status(400).json({ error: "Ism, familiya va shahar maydonlarini tekshiring." });
  db.prepare("UPDATE users SET first_name=?,last_name=?,birth_date=?,city=?,telegram=?,about=? WHERE id=?")
    .run(profile.first_name, profile.last_name, profile.birth_date, profile.city, profile.telegram, profile.about, user.id);
  res.json({ user: publicUser(db.prepare("SELECT * FROM users WHERE id=?").get(user.id)) });
});

app.delete("/api/admin/users/:id", requireAdmin, (req, res) => {
  const result = db.prepare("DELETE FROM users WHERE id=?").run(Number(req.params.id));
  if (!result.changes) return res.status(404).json({ error: "Foydalanuvchi topilmadi." });
  res.json({ ok: true });
});

app.get("/api/admin/settings", requireAdmin, (_req, res) => {
  res.json({
    siteName: setting("site_name", "ELITE MEETING"), welcomeTitle: setting("welcome_title", "Har bir uchrashuv yangi bir hikoyaning boshlanishi."),
    proposalTitle: setting("proposal_title", "Sizga bir taklifim bor..."), accentColor: setting("accent_color", "#c89c72"),
    logoData: setting("logo_data", ""),
    meetingTypes: JSON.parse(setting("meeting_types", '["Kafe","Restoran","Sayr","Park","Kino","Boshqa"]')),
    demoMode: demoEnabled && setting("demo_mode", "true") !== "false",
    adminLogin: setting("admin_login", adminLogin),
  });
});

app.patch("/api/admin/settings", requireAdmin, (req, res) => {
  const input = req.body || {};
  if (input.siteName !== undefined) setSetting("site_name", clean(input.siteName, 60) || "Mehr");
  if (input.welcomeTitle !== undefined) setSetting("welcome_title", clean(input.welcomeTitle, 160));
  if (input.proposalTitle !== undefined) setSetting("proposal_title", clean(input.proposalTitle, 160));
  if (input.accentColor !== undefined && /^#[0-9a-fA-F]{6}$/.test(input.accentColor)) setSetting("accent_color", input.accentColor);
  if (input.logoData !== undefined) {
    if (input.logoData && (typeof input.logoData !== "string" || input.logoData.length > 44_000 || !/^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/]+=*$/.test(input.logoData))) {
      return res.status(400).json({ error: "Logo PNG, JPG yoki WebP formatida va 30 KB dan kichik bo‘lishi kerak." });
    }
    setSetting("logo_data", input.logoData);
  }
  if (input.meetingTypes !== undefined && Array.isArray(input.meetingTypes) && input.meetingTypes.length) setSetting("meeting_types", JSON.stringify(input.meetingTypes.map((x) => clean(x, 40)).filter(Boolean).slice(0, 12)));
  if (input.demoMode !== undefined) {
    if (input.demoMode && !demoEnabled) return res.status(400).json({ error: "Demo rejimi serverdagi DEMO_MODE=false sozlamasi bilan o‘chirilgan." });
    setSetting("demo_mode", input.demoMode ? "true" : "false");
  }
  if (input.adminLogin !== undefined) {
    const newLogin = clean(input.adminLogin, 80);
    if (newLogin.length < 3) return res.status(400).json({ error: "Admin login kamida 3 belgidan iborat bo‘lsin." });
    setSetting("admin_login", newLogin);
  }
  if (input.newPassword !== undefined) {
    const password = String(input.newPassword);
    if (password.length < 10) return res.status(400).json({ error: "Yangi parol kamida 10 belgidan iborat bo‘lsin." });
    setSetting("admin_hash", bcrypt.hashSync(password, 12));
  }
  res.json({ ok: true });
});

app.get("/api/admin/export.csv", requireAdmin, (_req, res) => {
  const users = db.prepare(`SELECT u.id,u.first_name,u.last_name,u.phone,u.city,u.created_at,u.consent,a.date appointment_date,a.start_time appointment_time,a.status
    FROM users u LEFT JOIN appointments a ON a.id=(SELECT id FROM appointments WHERE user_id=u.id ORDER BY created_at DESC LIMIT 1)
    ORDER BY u.created_at DESC`).all();
  const fields = ["id", "first_name", "last_name", "phone", "city", "created_at", "consent", "appointment_date", "appointment_time", "status"];
  const csv = [fields.join(","), ...users.map((row) => fields.map((field) => {
    const value = String(row[field] ?? "");
    const safeValue = /^[\t\r\n ]*[=+\-@]/.test(value) ? `'${value}` : value;
    return `"${safeValue.replaceAll('"', '""')}"`;
  }).join(","))].join("\r\n");
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", "attachment; filename=elite-meeting-foydalanuvchilar.csv");
  res.send(`\uFEFF${csv}`);
});

app.use((error, _req, res, _next) => {
  console.error(error);
  res.status(500).json({ error: "Serverda kutilmagan xatolik yuz berdi." });
});

if (isProduction) {
  const clientDir = resolve("dist");
  app.use(express.static(clientDir));
  app.get("/{*path}", (req, res, next) => req.path.startsWith("/api/") ? next() : res.sendFile(resolve(clientDir, "index.html")));
}

app.listen(port, () => console.log(`ELITE MEETING API ${port}-portda ishga tushdi${demoEnabled ? " (demo rejim)" : ""}.`));
