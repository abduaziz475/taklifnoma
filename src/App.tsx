import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import {
  ArrowDownRight, ArrowLeft, ArrowRight, ArrowUpRight, CalendarDays, Check, CheckCircle2,
  ChevronDown, ChevronRight, Clock3, Coffee, Download, Eye, EyeOff,
  FileHeart, Heart, HeartHandshake, Inbox, LayoutDashboard, LogOut, MapPin, Menu, MessageCircle,
  MoreHorizontal, PenLine, Phone, Plus, Search, Settings, Shield, Sparkles, Ticket,
  Sun, Moon, Trash2, UserRound, Users, X, type LucideIcon,
} from "lucide-react";
import {
  Area, AreaChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";

type User = {
  id: number; firstName: string; lastName: string; phone: string; birthDate: string; city: string;
  telegram: string; about: string; consent: "pending" | "yes" | "no"; createdAt: string;
};
type Appointment = {
  id: number; userId: number; date: string; startTime: string; endTime: string; type: string;
  venue: string; address: string; duration: string; note: string; wish: string; status: string;
  ticketCode: string; createdAt: string; adminNote?: string; firstName?: string; lastName?: string; phone?: string;
};
type Config = { demoMode: boolean; siteName: string; welcomeTitle: string; proposalTitle: string; accentColor: string; logoData?: string; meetingTypes: string[] };
type ProfileForm = { firstName: string; lastName: string; phone: string; birthDate: string; city: string; telegram: string; about: string };
type Message = { id: number; userId?: number; sender: "user" | "admin"; body: string; createdAt: string; readAt: string | null; firstName?: string; lastName?: string; phone?: string };
const defaultConfig: Config = { demoMode: true, siteName: "ELITE MEETING", welcomeTitle: "Har bir uchrashuv yangi bir hikoyaning boshlanishi.", proposalTitle: "Sizga maxsus taklifim bor...", accentColor: "#c66b87", meetingTypes: ["Restoran", "Kafe", "Sayr", "Park", "Kino", "Sayohat", "Maxsus tadbir", "Boshqa"] };
const demoReasons = [
  "Balki yana bir o‘ylab ko‘rarsiz? 😊",
  "Siz bilan suhbatlashish juda yoqimli bo‘lardi!",
  "Bir piyola qahva uchun ham imkon bermaysizmi? ☕",
  "Mayli, qaroringizni hurmat qilaman ❤️",
];
const api = async <T,>(url: string, init?: RequestInit): Promise<T> => {
  const response = await fetch(url, { credentials: "include", ...init, headers: { "Content-Type": "application/json", ...init?.headers } });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "So‘rov bajarilmadi.");
  return data as T;
};
const dateLabel = (value: string) => value ? new Intl.DateTimeFormat("uz-UZ", { day: "numeric", month: "long", year: "numeric" }).format(new Date(`${value}T12:00:00`)) : "—";
const formatPhone = (value: string) => value || "+998";

function App() {
  const [config, setConfig] = useState(defaultConfig);
  const [user, setUser] = useState<User | null>(null);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [stage, setStage] = useState("loading");
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const [loginMode, setLoginMode] = useState(false);
  const [profile, setProfile] = useState<ProfileForm>({ firstName: "", lastName: "", phone: "+998", birthDate: "", city: "", telegram: "", about: "" });
  const [challenge, setChallenge] = useState<{ id: string; code?: string; message?: string } | null>(null);
  const [code, setCode] = useState("");
  const [resendCountdown, setResendCountdown] = useState(0);
  const otpRefs = useRef<Array<HTMLInputElement | null>>([]);
  const [noCount, setNoCount] = useState(0);
  const [accountTab, setAccountTab] = useState("overview");
  const [theme, setTheme] = useState<"dark" | "light">(() => localStorage.getItem("elite-meeting-theme") === "light" ? "light" : "dark");
  const [messages, setMessages] = useState<Message[]>([]);
  const [messageDraft, setMessageDraft] = useState("");
  const [messageSearch, setMessageSearch] = useState("");
  const [appointmentForm, setAppointmentForm] = useState({ date: "", startTime: "", endTime: "", type: "Kafe", venue: "", address: "", duration: "2 soat", note: "", wish: "" });
  const isAdminPath = window.location.pathname.replace(/\/+$/, "") === "/admin";
  const toggleTheme = () => setTheme((current) => {
    const next = current === "dark" ? "light" : "dark";
    localStorage.setItem("elite-meeting-theme", next);
    return next;
  });

  useEffect(() => {
    if (stage !== "verify" || resendCountdown === 0) return;
    const timer = window.setTimeout(() => setResendCountdown((value) => Math.max(0, value - 1)), 1000);
    return () => window.clearTimeout(timer);
  }, [stage, resendCountdown]);

  const notify = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(""), 3200);
  };
  useEffect(() => {
    if (isAdminPath) { setStage("admin"); return; }
    Promise.all([
      api<Config>("/api/config"),
      api<{ user: User; appointments: Appointment[] }>("/api/me"),
    ]).then(([settings, data]) => {
      setConfig(settings);
      setUser(data.user);
      setAppointments(data.appointments);
      setProfile({ firstName: data.user.firstName, lastName: data.user.lastName, phone: data.user.phone, birthDate: data.user.birthDate, city: data.user.city, telegram: data.user.telegram, about: data.user.about });
      setStage(data.user.consent === "no" ? "declined" : data.user.consent === "yes" ? (data.appointments[0] ? "ticket" : "schedule") : "proposal");
    }).catch(() => api<Config>("/api/config").then((settings) => { setConfig(settings); setStage("welcome"); }).catch((e: Error) => { setError(e.message); setStage("welcome"); }));
  }, [isAdminPath]);

  const startVerification = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    try {
      const payload = loginMode ? { intent: "login", phone: profile.phone } : { intent: "signup", ...profile };
      const result = await api<{ challengeId: string; demoCode?: string; message: string }>("/api/auth/start", { method: "POST", body: JSON.stringify(payload) });
      setChallenge({ id: result.challengeId, code: result.demoCode, message: result.message });
      setCode("");
      setResendCountdown(60);
      setStage("verify");
    } catch (e) { setError((e as Error).message); }
  };
  const verifyCode = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    try {
      const result = await api<{ user: User }>("/api/auth/verify", { method: "POST", body: JSON.stringify({ challengeId: challenge?.id, code }) });
      setUser(result.user);
      setProfile({ firstName: result.user.firstName, lastName: result.user.lastName, phone: result.user.phone, birthDate: result.user.birthDate, city: result.user.city, telegram: result.user.telegram, about: result.user.about });
      setStage(result.user.consent === "yes" ? "schedule" : "proposal");
    } catch (e) { setError((e as Error).message); }
  };
  const resendCode = async () => {
    setError("");
    try {
      const result = await api<{ challengeId: string; demoCode?: string; message: string }>("/api/auth/resend", { method: "POST", body: JSON.stringify({ challengeId: challenge?.id }) });
      setChallenge({ id: result.challengeId, code: result.demoCode, message: result.message });
      setResendCountdown(60);
      notify("Yangi kod yuborildi.");
    } catch (e) { setError((e as Error).message); }
  };
  const consent = async (answer: "yes" | "no" | "pending") => {
    setError("");
    try {
      await api("/api/consent", { method: "POST", body: JSON.stringify({ consent: answer }) });
      setUser((previous) => previous ? { ...previous, consent: answer } : previous);
      if (answer === "yes") setStage("schedule");
      else if (answer === "no") { setNoCount((v) => v + 1); setStage("declined"); }
      else setStage("proposal");
    } catch (e) { setError((e as Error).message); }
  };
  const createAppointment = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    try {
      const result = await api<{ appointment: Appointment }>("/api/appointments", { method: "POST", body: JSON.stringify(appointmentForm) });
      setAppointments((previous) => [result.appointment, ...previous]);
      setStage("ticket");
    } catch (e) { setError((e as Error).message); }
  };
  const saveProfile = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    try {
      const result = await api<{ user: User }>("/api/me", { method: "PATCH", body: JSON.stringify(profile) });
      setUser(result.user);
      notify("Profil ma’lumotlari saqlandi.");
    } catch (e) { setError((e as Error).message); }
  };
  const openAccountTab = async (tab: string) => {
    setAccountTab(tab);
    if (tab === "messages") {
      try {
        const data = await api<{ messages: Message[] }>("/api/messages");
        setMessages(data.messages);
      } catch (e) {
        setError((e as Error).message);
      }
    }
  };
  const sendUserMessage = async (event: FormEvent) => {
    event.preventDefault();
    try {
      const data = await api<{ message: Message }>("/api/messages", { method: "POST", body: JSON.stringify({ body: messageDraft }) });
      setMessages((current) => [...current, data.message]);
      setMessageDraft("");
      notify("Xabaringiz administratorga yuborildi.");
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const logout = async () => {
    await api("/api/auth/logout", { method: "POST" });
    setUser(null);
    setAppointments([]);
    setStage("welcome");
    setLoginMode(false);
    setProfile({ firstName: "", lastName: "", phone: "+998", birthDate: "", city: "", telegram: "", about: "" });
  };

  if (stage === "loading") return <div className="loading-screen"><div className="brand-mark"><Heart size={20} fill="currentColor" /></div><span>ELITE MEETING</span></div>;
  if (stage === "admin") return <AdminApp />;
  const activeAppointment = appointments[0];
  const setField = (key: keyof ProfileForm, value: string) => setProfile((current) => ({ ...current, [key]: value }));

  return (
    <div className={`app-shell ${theme === "light" ? "theme-light" : ""}`} style={{ "--accent": config.accentColor } as React.CSSProperties}>
      <header className="topbar">
        <button className="brand" onClick={() => user ? setStage("account") : setStage("welcome")} aria-label="Bosh sahifa">
          {config.logoData ? <img className="brand-image" src={config.logoData} alt="" /> : <span className="brand-mark"><Heart size={17} fill="currentColor" /></span>}<span>{config.siteName}<small>MUHIM ONLAR UCHUN</small></span>
        </button>
        <div className="topbar-right">
          <span className="secure-label"><Shield size={14} /> Maxfiy va xavfsiz</span>
          <button className="icon-btn theme-toggle" onClick={toggleTheme} aria-label={theme === "dark" ? "Yorug‘ rejimga o‘tish" : "Qorong‘i rejimga o‘tish"}>{theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}</button>
          {user && <button className="icon-btn profile-shortcut" onClick={() => setStage("account")} aria-label="Kabinet"><UserRound size={17} /></button>}
        </div>
      </header>
      <main className="page-wrap">
        <div className="ambient ambient-one" /><div className="ambient ambient-two" />
        {stage === "welcome" && (
          <section className="welcome-layout fade-in">
            <div className="welcome-copy">
              <span className="eyebrow"><Sparkles size={14} /> HAR BIR UCHRASHUV — YANGI HIKOYA</span>
              <h1>{config.welcomeTitle} <span className="heart-inline">♥</span></h1>
              <p className="lead">Maxsus uchrashuvga taklifni qabul qiling va o‘z vaqtingizni belgilang.</p>
              <div className="welcome-note"><HeartHandshake size={20} /><span>Samimiy lahzalar, nafis muhit va esda qolarli xotiralar.</span></div>
              <div className="trust-row"><span><Shield size={14} /> Ma’lumotlaringiz himoyalangan</span><i /><span>1 daqiqada ro‘yxatdan o‘ting</span></div>
            </div>
            <form className="form-card signup-card" onSubmit={startVerification}>
              <div className="form-heading"><div><span className="card-kicker">{loginMode ? "XUSH KELIBSIZ" : "BOSHLAYMIZ"}</span><h2>{loginMode ? "Kabinetga kirish" : "O‘zingiz haqingizda"}</h2></div><div className="step-count">01 <span>/ 02</span></div></div>
              {!loginMode ? <>
                <div className="field-grid two">
                  <Field label="Ismingiz" required><input autoComplete="given-name" placeholder="Masalan, Madina" value={profile.firstName} onChange={(e) => setField("firstName", e.target.value)} required /></Field>
                  <Field label="Familiyangiz" required><input autoComplete="family-name" placeholder="Masalan, Karimova" value={profile.lastName} onChange={(e) => setField("lastName", e.target.value)} required /></Field>
                </div>
                <Field label="Telefon raqamingiz" required><PhoneInput value={profile.phone} onChange={(value) => setField("phone", value)} /></Field>
                <div className="field-grid two">
                  <Field label="Tug‘ilgan sana" hint="Ixtiyoriy"><input type="date" value={profile.birthDate} onChange={(e) => setField("birthDate", e.target.value)} /></Field>
                  <Field label="Shahar" required><input placeholder="Toshkent" value={profile.city} onChange={(e) => setField("city", e.target.value)} required /></Field>
                </div>
                <div className="field-grid two">
                  <Field label="Telegram" hint="Ixtiyoriy"><input placeholder="@username" value={profile.telegram} onChange={(e) => setField("telegram", e.target.value)} /></Field>
                  <Field label="O‘zingiz haqingizda" hint="Ixtiyoriy"><input placeholder="Qisqacha..." value={profile.about} onChange={(e) => setField("about", e.target.value)} /></Field>
                </div>
              </> : <><p className="form-description">Kabinetga kirish uchun profilingizga bog‘langan telefon raqamini kiriting.</p><Field label="Telefon raqamingiz" required><PhoneInput value={profile.phone} onChange={(value) => setField("phone", value)} /></Field></>}
              <ErrorText>{error}</ErrorText>
              <button className="btn btn-primary btn-wide" type="submit">{loginMode ? "Platformaga kirish" : "Taklifnomani ko‘rish"} <ArrowRight size={17} /></button>
              <button type="button" className="text-button centered" onClick={() => { setLoginMode(!loginMode); setError(""); }}> {loginMode ? "Yangi taklifnoma olish" : "Avval ro‘yxatdan o‘tganmisiz? Kabinetga kiring"} </button>
              <p className="privacy-note"><Shield size={13} /> Telefoningiz faqat tasdiqlash va taklifnoma uchun ishlatiladi.</p>
            </form>
          </section>
        )}

        {stage === "verify" && (
          <section className="center-card fade-in">
            <div className="round-icon"><Phone size={23} /></div><span className="eyebrow">TELEFONNI TASDIQLASH</span>
            <h1>Tasdiqlash kodi</h1><p className="muted">{loginMode ? "Kabinetga kirish kodi" : "Telefon raqamingizga tasdiqlash kodi yuborildi"}<br /><b>{formatPhone(profile.phone)}</b></p>
            {challenge?.code && <div className="demo-code-banner"><span>DEMO KOD</span><strong>{challenge.code}</strong><small>Haqiqiy SMS yuborilmadi</small></div>}
            <form onSubmit={verifyCode} className="verify-form">
              <label className="field-label" htmlFor="otp-code-0">6 xonali kod</label>
              <div className="otp-inputs">
                {Array.from({ length: 6 }, (_, index) => (
                  <input
                    key={index}
                    id={`otp-code-${index}`}
                    ref={(element) => { otpRefs.current[index] = element; }}
                    aria-label={`${index + 1}-raqam`}
                    inputMode="numeric"
                    autoComplete={index === 0 ? "one-time-code" : "off"}
                    maxLength={1}
                    value={code[index] || ""}
                    autoFocus={index === 0}
                    onChange={(event) => {
                      const digit = event.target.value.replace(/\D/g, "").slice(-1);
                      const next = code.split("");
                      next[index] = digit;
                      setCode(next.join("").slice(0, 6));
                      if (digit && index < 5) otpRefs.current[index + 1]?.focus();
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "Backspace" && !code[index] && index > 0) otpRefs.current[index - 1]?.focus();
                      if (event.key === "ArrowLeft" && index > 0) otpRefs.current[index - 1]?.focus();
                      if (event.key === "ArrowRight" && index < 5) otpRefs.current[index + 1]?.focus();
                    }}
                    onPaste={(event) => {
                      const pasted = event.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
                      if (!pasted) return;
                      event.preventDefault();
                      setCode(pasted);
                      otpRefs.current[Math.min(pasted.length, 5)]?.focus();
                    }}
                    required
                  />
                ))}
              </div>
              <ErrorText>{error}</ErrorText>
              <button className="btn btn-primary btn-wide" type="submit" disabled={code.length !== 6}>Kodni tasdiqlash <ArrowRight size={17} /></button>
            </form>
            <button className="text-button centered" onClick={resendCode} disabled={resendCountdown > 0}>{resendCountdown > 0 ? `Qayta yuborish · ${resendCountdown} soniya` : "Kodni qayta yuborish"}</button>
            <button className="back-link" onClick={() => setStage("welcome")}><ArrowLeft size={14} /> Ma’lumotlarni o‘zgartirish</button>
          </section>
        )}

        {stage === "proposal" && (
          <section className="proposal-screen fade-in">
            <div className="proposal-visual"><div className="orbit orbit-one" /><div className="orbit orbit-two" /><div className="proposal-heart"><Heart size={56} fill="currentColor" /></div><span className="sparkle s-one">✦</span><span className="sparkle s-two">✧</span></div>
            <span className="eyebrow"><Sparkles size={14} /> SIZ UCHUN MAXSUS</span>
            <h1>{config.proposalTitle} <span className="heart-inline">♥</span></h1>
            <p className="proposal-question">Men bilan unutilmas uchrashuvga borishga rozimisiz?</p>
            <div className="proposal-actions"><button className="btn btn-primary btn-yes" onClick={() => consent("yes")}><Heart size={18} fill="currentColor" /> HA, ROZIMAN ❤️</button><button className="btn btn-no" onClick={() => consent("no")}><Heart size={17} /> Yo‘q</button></div>
            <p className="consent-footnote"><Shield size={13} /> Istalgan javobingiz hurmat qilinadi.</p><ErrorText>{error}</ErrorText>
          </section>
        )}

        {stage === "declined" && (
          <section className="center-card decline-card fade-in">
            <div className="round-icon"><Heart size={24} /></div><span className="eyebrow">JAVOBINGIZ UCHUN RAHMAT</span>
            <h1>{demoReasons[Math.min(Math.max(noCount - 1, 0), demoReasons.length - 1)]}</h1>
            <p className="muted">Qaroringizni hurmat qilaman. Xohlasangiz, taklifni qayta ko‘rib chiqishingiz mumkin.</p>
            <button className="btn btn-outline btn-wide" onClick={() => consent("pending")}>Yana o‘ylab ko‘rish <Heart size={16} /></button>
            <button className="back-link" onClick={logout}><LogOut size={14} /> Chiqish</button>
          </section>
        )}

        {stage === "schedule" && (
          <section className="schedule-layout fade-in">
            <div className="schedule-intro"><button className="back-link" onClick={() => setStage("proposal")}><ArrowLeft size={14} /> Orqaga</button><span className="eyebrow">BIRGALIKDA REJALAYMIZ</span><h1>Uchrashuv tafsilotlari</h1><p>O‘zingizga qulay kun va joyni tanlang. Qolganini birga kelishamiz.</p><div className="schedule-aside"><div className="aside-icon"><CalendarDays size={19} /></div><div><b>Yaxshi lahzalar</b><span>O‘ylangan kichik detallar katta xotiralarga aylanadi.</span></div></div></div>
            <form className="form-card planner-card" onSubmit={createAppointment}>
              <div className="form-heading"><div><span className="card-kicker">UCHRASHUV REJASI</span><h2>Qachon va qayerda?</h2></div><span className="soft-icon"><CalendarDays size={18} /></span></div>
              <div className="field-grid two">
                <Field label="Uchrashuv kuni" required><input type="date" min={new Date().toISOString().slice(0, 10)} value={appointmentForm.date} onChange={(e) => setAppointmentForm({ ...appointmentForm, date: e.target.value })} required /></Field>
                <Field label="Uchrashuv turi" required><select value={appointmentForm.type} onChange={(e) => setAppointmentForm({ ...appointmentForm, type: e.target.value })}>{config.meetingTypes.map((type) => <option key={type}>{type}</option>)}</select></Field>
              </div>
              <div className="field-grid two">
                <Field label="Boshlanish vaqti" required><input type="time" value={appointmentForm.startTime} onChange={(e) => setAppointmentForm({ ...appointmentForm, startTime: e.target.value })} required /></Field>
                <Field label="Tugash vaqti"><input type="time" value={appointmentForm.endTime} onChange={(e) => setAppointmentForm({ ...appointmentForm, endTime: e.target.value })} /></Field>
              </div>
              <div className="field-grid two">
                <Field label="Uchrashuv joyi" required><input placeholder="Masalan, Bon! kafesi" value={appointmentForm.venue} onChange={(e) => setAppointmentForm({ ...appointmentForm, venue: e.target.value })} required /></Field>
                <Field label="Manzil" required><input placeholder="Shahar, ko‘cha, bino" value={appointmentForm.address} onChange={(e) => setAppointmentForm({ ...appointmentForm, address: e.target.value })} required /></Field>
              </div>
              <Field label="Davomiyligi"><select value={appointmentForm.duration} onChange={(e) => setAppointmentForm({ ...appointmentForm, duration: e.target.value })}><option>1 soat</option><option>2 soat</option><option>3 soat</option><option>Yarim kun</option><option>Kelishamiz</option></select></Field>
              <Field label="Maxsus tilak" hint="Ixtiyoriy"><input placeholder="Yoqimli bir tilak yozing..." value={appointmentForm.wish} onChange={(e) => setAppointmentForm({ ...appointmentForm, wish: e.target.value })} /></Field>
              <Field label="Izoh" hint="Ixtiyoriy"><textarea rows={2} placeholder="Qo‘shimcha taklif yoki eslatma..." value={appointmentForm.note} onChange={(e) => setAppointmentForm({ ...appointmentForm, note: e.target.value })} /></Field>
              <ErrorText>{error}</ErrorText><button className="btn btn-primary btn-wide" type="submit">Uchrashuvni tasdiqlash <ArrowRight size={17} /></button>
              <p className="privacy-note"><Heart size={13} /> Taklifingiz admin tomonidan tasdiqlangandan so‘ng yakuniy bo‘ladi.</p>
            </form>
          </section>
        )}

        {stage === "ticket" && user && activeAppointment && (
          <section className="ticket-layout fade-in">
            <div className="success-heading"><div className="success-check"><Check size={24} /></div><span className="eyebrow">BIRINCHI QADAM TAYYOR</span><h1>Bu uchrashuv esda qoladi.</h1><p>Mana, siz uchun maxsus tayyorlangan taklifnoma.</p></div>
            <article className="ticket-card" id="print-ticket">
              <div className="ticket-top"><div className="ticket-brand"><span className="brand-mark"><Heart size={15} fill="currentColor" /></span>{config.siteName}</div><span className={`status-badge ${activeAppointment.status}`}>{statusText(activeAppointment.status)}</span></div>
              <div className="ticket-decoration"><span>♥</span><i /></div>
              <span className="ticket-kicker">MAXSUS TAKLIFNOMA</span>
              <h2>{user.firstName} {user.lastName}</h2><p className="ticket-quote">“{activeAppointment.wish || "Eng go‘zal lahzalar samimiy suhbatdan boshlanadi."}”</p>
              <div className="ticket-details">
                <TicketDetail icon={CalendarDays} label="SANA" value={dateLabel(activeAppointment.date)} />
                <TicketDetail icon={Clock3} label="VAQT" value={`${activeAppointment.startTime}${activeAppointment.endTime ? ` – ${activeAppointment.endTime}` : ""}`} />
                <TicketDetail icon={MapPin} label="UCHRASHUV JOYI" value={`${activeAppointment.venue}, ${activeAppointment.address}`} />
                <TicketDetail icon={Coffee} label="UCHRASHUV TURI" value={activeAppointment.type} />
              </div>
              <div className="ticket-bottom"><div><small>TAKLIFNOMA RAQAMI</small><b>{activeAppointment.ticketCode}</b></div><div className="ticket-heart"><Heart size={22} fill="currentColor" /></div></div>
            </article>
            <div className="ticket-actions"><button className="btn btn-primary" onClick={() => window.print()}><Download size={16} /> PDF sifatida saqlash</button><button className="btn btn-outline" onClick={() => window.open(`https://t.me/share/url?url=${encodeURIComponent(window.location.origin)}&text=${encodeURIComponent(`ELITE MEETING taklifnomasi: ${dateLabel(activeAppointment.date)}, ${activeAppointment.startTime} — ${activeAppointment.venue}. Raqam: ${activeAppointment.ticketCode}`)}`, "_blank", "noopener,noreferrer")}><MessageCircle size={16} /> Telegram’da ulashish</button><button className="btn btn-ghost" onClick={() => setStage("account")}><UserRound size={16} /> Kabinet</button></div>
            <ErrorText>{error}</ErrorText>
          </section>
        )}

        {stage === "account" && user && (
          <section className="account-layout fade-in">
            <aside className="account-sidebar"><div className="account-user"><div className="avatar">{user.firstName.charAt(0)}{user.lastName.charAt(0)}</div><div><b>{user.firstName} {user.lastName}</b><span>{user.phone}</span></div></div><nav className="account-nav"><button className={accountTab === "overview" ? "active" : ""} onClick={() => void openAccountTab("overview")}><LayoutDashboard size={16} /> Bosh sahifa</button><button className={accountTab === "profile" ? "active" : ""} onClick={() => void openAccountTab("profile")}><UserRound size={16} /> Profilim</button><button className={accountTab === "meetings" ? "active" : ""} onClick={() => void openAccountTab("meetings")}><CalendarDays size={16} /> Uchrashuvlar</button><button className={accountTab === "calendar" ? "active" : ""} onClick={() => void openAccountTab("calendar")}><CalendarDays size={16} /> Taqvim</button><button className={accountTab === "messages" ? "active" : ""} onClick={() => void openAccountTab("messages")}><Inbox size={16} /> Xabarlar</button><button className={accountTab === "settings" ? "active" : ""} onClick={() => void openAccountTab("settings")}><Settings size={16} /> Sozlamalar</button></nav><button className="account-logout" onClick={logout}><LogOut size={15} /> Chiqish</button></aside>
            <div className="account-main"><div className="section-title"><div><span className="eyebrow">ELITE MEETING · SHAXSIY KABINET</span><h1>{accountTab === "overview" ? `Xush kelibsiz, ${user.firstName}` : ({ profile: "Mening profilim", meetings: "Uchrashuvlarim", calendar: "Uchrashuv taqvimi", messages: "Xabarlar markazi", settings: "Sozlamalar" } as Record<string, string>)[accountTab]}</h1></div><button className="icon-btn mobile-logout" onClick={logout}><LogOut size={16} /></button></div>
              {accountTab === "overview" && <><div className="account-summary-grid"><div className="summary-card"><span>TAKLIF HOLATI</span><b><span className={`status-dot ${user.consent}`} />{user.consent === "yes" ? "Rozilik bildirildi" : user.consent === "no" ? "Rad etildi" : "Javob kutilmoqda"}</b></div><div className="summary-card"><span>UCHRASHUVLAR</span><b>{appointments.length} ta</b></div><div className="summary-card"><span>RO‘YXATDAN O‘TGAN</span><b>{dateLabel(user.createdAt.slice(0, 10))}</b></div></div>
                <div className="panel-card"><div className="panel-heading"><div><span className="card-kicker">YAQINLASHAYOTGAN LAHZA</span><h2>Uchrashuv holati</h2></div>{activeAppointment && <span className={`status-badge ${activeAppointment.status}`}>{statusText(activeAppointment.status)}</span>}</div>
                  {activeAppointment ? <><div className="meeting-row"><div className="meeting-date"><b>{new Date(`${activeAppointment.date}T12:00:00`).getDate()}</b><span>{new Intl.DateTimeFormat("uz-UZ", { month: "short" }).format(new Date(`${activeAppointment.date}T12:00:00`))}</span></div><div className="meeting-info"><b>{activeAppointment.venue}</b><span><CalendarDays size={14} />{dateLabel(activeAppointment.date)} · {activeAppointment.startTime}</span><span><MapPin size={14} />{activeAppointment.address}</span></div><button className="btn btn-outline btn-small" onClick={() => setStage("ticket")}><Ticket size={15} /> Taklifnoma</button></div>{activeAppointment.adminNote && <div className="admin-message"><MessageCircle size={15} /><span><b>Admin izohi</b>{activeAppointment.adminNote}</span></div>}{user.consent === "yes" && activeAppointment.status !== "cancelled" && <button className="text-button withdraw-button" onClick={() => window.confirm("Roziligingizni qaytarib olib, taklifni rad etasizmi?") && consent("no")}>Roziligimni qaytarib olaman</button>}</> : <div className="empty-state"><CalendarDays size={25} /><b>Hozircha rejalashtirilgan uchrashuv yo‘q</b><button className="text-button" onClick={() => user.consent === "yes" ? setStage("schedule") : setStage("proposal")}>Taklifni ko‘rish <ArrowRight size={14} /></button></div>}
                </div><div className="panel-card"><div className="panel-heading"><div><span className="card-kicker">SO‘NGGI FAOLLIK</span><h2>Taklifnoma tarixi</h2></div></div>{appointments.length ? appointments.map((item) => <div className="history-row" key={item.id}><span className="history-icon"><FileHeart size={16} /></span><div><b>{item.type} — {item.venue}</b><small>{dateLabel(item.date)} · {item.ticketCode}</small></div><span className={`status-badge ${item.status}`}>{statusText(item.status)}</span></div>) : <p className="muted">Uchrashuv yaratilgach, uning tarixi shu yerda ko‘rinadi.</p>}</div></>}
              {accountTab === "profile" && <form className="panel-card edit-profile" onSubmit={saveProfile}><div className="field-grid two"><Field label="Ism" required><input value={profile.firstName} onChange={(e) => setField("firstName", e.target.value)} required /></Field><Field label="Familiya" required><input value={profile.lastName} onChange={(e) => setField("lastName", e.target.value)} required /></Field></div><div className="field-grid two"><Field label="Telefon raqami"><input value={profile.phone} disabled /></Field><Field label="Tug‘ilgan sana"><input type="date" value={profile.birthDate} onChange={(e) => setField("birthDate", e.target.value)} /></Field></div><div className="field-grid two"><Field label="Shahar" required><input value={profile.city} onChange={(e) => setField("city", e.target.value)} required /></Field><Field label="Telegram"><input value={profile.telegram} onChange={(e) => setField("telegram", e.target.value)} /></Field></div><Field label="O‘zingiz haqingizda"><textarea rows={3} value={profile.about} onChange={(e) => setField("about", e.target.value)} /></Field><ErrorText>{error}</ErrorText><button className="btn btn-primary" type="submit"><Check size={16} /> O‘zgarishlarni saqlash</button></form>}
              {accountTab === "meetings" && <div className="panel-card">{appointments.length ? appointments.map((item) => <div className="history-row" key={item.id}><span className="history-icon"><CalendarDays size={16} /></span><div><b>{item.venue}</b><small>{dateLabel(item.date)} · {item.startTime} · {item.address}</small></div><span className={`status-badge ${item.status}`}>{statusText(item.status)}</span></div>) : <div className="empty-state">Uchrashuvlar hali yo‘q.</div>}</div>}
              {accountTab === "calendar" && <CalendarPanel appointments={appointments} />}
              {accountTab === "messages" && <div className="panel-card message-center"><div className="panel-heading"><div><span className="card-kicker">ADMINISTRATOR BILAN ALOQA</span><h2>Xabarlar tarixi</h2></div><Inbox size={18} /></div><div className="message-search"><Search size={16} /><input placeholder="Xabarlardan qidirish..." value={messageSearch} onChange={(e) => setMessageSearch(e.target.value)} /></div><div className="message-thread">{messages.filter((item) => item.body.toLowerCase().includes(messageSearch.toLowerCase())).map((item) => <div className={`message-bubble ${item.sender}`} key={item.id}><span>{item.sender === "admin" ? "ELITE MEETING · ADMIN" : "Siz"}</span><p>{item.body}</p><small>{new Intl.DateTimeFormat("uz-UZ", { dateStyle: "medium", timeStyle: "short" }).format(new Date(item.createdAt))}</small></div>)}{messages.length === 0 && <div className="empty-state"><MessageCircle size={23} /><b>Hozircha xabarlar yo‘q</b><span>Savolingiz bo‘lsa, pastdan yozishingiz mumkin.</span></div>}</div><form className="message-compose" onSubmit={sendUserMessage}><Field label="Yangi xabar"><textarea rows={3} maxLength={2000} value={messageDraft} onChange={(e) => setMessageDraft(e.target.value)} placeholder="Xabaringizni yozing..." required /></Field><ErrorText>{error}</ErrorText><button className="btn btn-primary" disabled={!messageDraft.trim()}><MessageCircle size={15} /> Yuborish</button></form></div>}
              {accountTab === "settings" && <div className="panel-card settings-info"><div className="panel-heading"><div><span className="card-kicker">HISOB XAVFSIZLIGI</span><h2>Maxfiylik va xavfsizlik</h2></div><Shield size={18} /></div><p>Telefon raqamingiz tasdiqlash uchun ishlatiladi. Profil va uchrashuv ma’lumotlaringiz ushbu hisob bilan himoyalangan.</p><div className="history-row"><span className="history-icon"><Phone size={16} /></span><div><b>Tasdiqlangan telefon</b><small>{user.phone}</small></div><span className="status-badge confirmed">Faol</span></div><button className="btn btn-outline withdraw-button" onClick={() => void logout()}><LogOut size={15} /> Hisobdan chiqish</button></div>}
            </div>
          </section>
        )}
      </main>
      <footer className="site-footer"><span>© {new Date().getFullYear()} {config.siteName}</span><span>Samimiyat bilan yaratilgan <Heart size={12} fill="currentColor" /></span><span /></footer>
      {toast && <div className="toast"><CheckCircle2 size={17} />{toast}</div>}
    </div>
  );
}

export default App;

function CalendarPanel({ appointments }: { appointments: Appointment[] }) {
  const [month, setMonth] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [selectedDate, setSelectedDate] = useState("");
  const year = month.getFullYear();
  const monthIndex = month.getMonth();
  const firstWeekday = new Date(year, monthIndex, 1).getDay();
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
  const monthLabel = new Intl.DateTimeFormat("uz-UZ", { month: "long", year: "numeric" }).format(month);
  const dateKey = (day: number) => `${year}-${String(monthIndex + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  const dates = Array.from({ length: Math.ceil((firstWeekday + daysInMonth) / 7) * 7 }, (_, index) => {
    const day = index - firstWeekday + 1;
    return day > 0 && day <= daysInMonth ? day : null;
  });
  const selectedMeetings = appointments.filter((item) => item.date === selectedDate);
  return <div className="calendar-panel panel-card">
    <div className="calendar-toolbar"><div><span className="card-kicker">REJALAR</span><h2>{monthLabel}</h2></div><div className="calendar-controls"><button className="icon-btn" aria-label="Oldingi oy" onClick={() => setMonth(new Date(year, monthIndex - 1, 1))}>‹</button><button className="btn btn-outline btn-small" onClick={() => { const today = new Date(); setMonth(new Date(today.getFullYear(), today.getMonth(), 1)); setSelectedDate(`${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`); }}>Bugun</button><button className="icon-btn" aria-label="Keyingi oy" onClick={() => setMonth(new Date(year, monthIndex + 1, 1))}>›</button></div></div>
    <div className="calendar-grid">{["Ya", "Du", "Se", "Cho", "Pa", "Ju", "Sha"].map((day) => <span className="calendar-weekday" key={day}>{day}</span>)}{dates.map((day, index) => {
      if (!day) return <span className="calendar-empty" key={`empty-${index}`} />;
      const key = dateKey(day);
      const events = appointments.filter((item) => item.date === key);
      return <button key={key} className={`calendar-day ${selectedDate === key ? "selected" : ""} ${events.length ? "has-events" : ""}`} onClick={() => setSelectedDate(key)}><b>{day}</b>{events.slice(0, 2).map((item) => <i className={`calendar-event ${item.status}`} key={item.id} title={`${item.startTime} · ${item.venue}`} />)}</button>;
    })}</div>
    <div className="calendar-legend"><span><i className="pending" /> Kutilmoqda</span><span><i className="confirmed" /> Tasdiqlangan</span><span><i className="cancelled" /> Bekor qilingan</span></div>
    {selectedDate && <div className="calendar-day-details"><div className="panel-heading"><div><span className="card-kicker">TANLANGAN SANA</span><h2>{dateLabel(selectedDate)}</h2></div></div>{selectedMeetings.length ? selectedMeetings.map((item) => <div className="history-row" key={item.id}><span className={`calendar-event-icon ${item.status}`}><CalendarDays size={16} /></span><div><b>{item.startTime} · {item.venue}</b><small>{item.type} · {item.address}</small></div><span className={`status-badge ${item.status}`}>{statusText(item.status)}</span></div>) : <div className="empty-state">Bu sanada rejalashtirilgan uchrashuv yo‘q.</div>}</div>}
  </div>;
}

function Field({ label, hint, required, children }: { label: string; hint?: string; required?: boolean; children: ReactNode }) {
  return <label className="field"><span className="field-label">{label}{required && <i>*</i>}{hint && <small>{hint}</small>}</span>{children}</label>;
}
function ErrorText({ children }: { children: string }) { return children ? <p className="error-text" role="alert">{children}</p> : null; }
function PhoneInput({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const digits = value.replace(/\D/g, "").replace(/^998/, "").slice(0, 9);
  return <div className="phone-input"><span>🇺🇿 +998</span><input type="tel" inputMode="numeric" placeholder="90 123 45 67" value={digits} onChange={(e) => onChange(`+998${e.target.value.replace(/\D/g, "").slice(0, 9)}`)} required /></div>;
}
function TicketDetail({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: string }) {
  return <div className="ticket-detail"><span className="detail-icon"><Icon size={16} /></span><div><small>{label}</small><b>{value}</b></div></div>;
}
function statusText(status: string) {
  return ({ pending: "Kutilmoqda", confirmed: "Tasdiqlangan", cancelled: "Bekor qilingan", completed: "Yakunlangan" } as Record<string, string>)[status] || status;
}

type AdminUser = User & { appointmentDate?: string; appointmentTime?: string; appointmentStatus?: string };
type DashboardData = { counts: Record<string, number>; daily: { day: string; count: number }[]; monthly: { month: string; count: number }[]; consent: { name: string; value: number }[] };
function AdminApp() {
  const [theme, setTheme] = useState<"dark" | "light">(() => localStorage.getItem("elite-meeting-theme") === "light" ? "light" : "dark");
  const [authenticated, setAuthenticated] = useState(false);
  const [checking, setChecking] = useState(true);
  const [login, setLogin] = useState("admin");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [section, setSection] = useState("overview");
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [meetings, setMeetings] = useState<Appointment[]>([]);
  const [settings, setSettings] = useState<Record<string, any>>({});
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [toast, setToast] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const [sort, setSort] = useState<"new" | "old">("new");
  const [chartPeriod, setChartPeriod] = useState<"week" | "month">("week");
  const [showNewMeeting, setShowNewMeeting] = useState(false);
  const [selectedUser, setSelectedUser] = useState<AdminUser | null>(null);
  const [adminMessages, setAdminMessages] = useState<Message[]>([]);
  const [activeConversation, setActiveConversation] = useState<number | null>(null);
  const [replyDraft, setReplyDraft] = useState("");
  const [adminMessageSearch, setAdminMessageSearch] = useState("");
  const [newMeeting, setNewMeeting] = useState({ userId: "", date: "", startTime: "", endTime: "", type: "Kafe", venue: "", address: "" });
  const notify = (message: string) => { setToast(message); window.setTimeout(() => setToast(""), 3000); };
  const reload = useCallback(async () => {
    const [stats, customerData, meetingData, siteSettings] = await Promise.all([
      api<DashboardData>("/api/admin/dashboard"), api<{ users: AdminUser[] }>("/api/admin/users"),
      api<{ appointments: Appointment[] }>("/api/admin/appointments"), api<Record<string, any>>("/api/admin/settings"),
    ]);
    setDashboard(stats); setUsers(customerData.users); setMeetings(meetingData.appointments); setSettings(siteSettings);
  }, []);
  const loadAdminMessages = useCallback(async () => {
    const data = await api<{ messages: Message[] }>("/api/admin/messages");
    setAdminMessages(data.messages);
    setActiveConversation((current) => current ?? data.messages[0]?.userId ?? null);
  }, []);
  useEffect(() => {
    api("/api/admin/me").then(() => { setAuthenticated(true); return reload(); }).catch(() => {}).finally(() => setChecking(false));
  }, [reload]);
  useEffect(() => {
    if (authenticated && section === "messages") loadAdminMessages().catch((e: Error) => notify(e.message));
  }, [authenticated, section, loadAdminMessages]);
  const adminLogin = async (event: FormEvent) => {
    event.preventDefault(); setError("");
    try {
      await api("/api/admin/login", { method: "POST", body: JSON.stringify({ login, password }) });
      setAuthenticated(true); await reload();
    } catch (e) { setError((e as Error).message); }
  };
  const logout = async () => { await api("/api/auth/logout", { method: "POST" }); setAuthenticated(false); setPassword(""); };
  const updateMeeting = async (id: number, patch: Record<string, string>) => {
    try { await api(`/api/admin/appointments/${id}`, { method: "PATCH", body: JSON.stringify(patch) }); await reload(); notify("Uchrashuv yangilandi."); }
    catch (e) { notify((e as Error).message); }
  };
  const deleteUser = async (id: number) => {
    if (!window.confirm("Foydalanuvchini va unga tegishli uchrashuvlarni o‘chirmoqchimisiz?")) return;
    try { await api(`/api/admin/users/${id}`, { method: "DELETE" }); await reload(); notify("Foydalanuvchi o‘chirildi."); }
    catch (e) { notify((e as Error).message); }
  };
  const saveSettings = async (event: FormEvent) => {
    event.preventDefault();
    try {
      const body = { ...settings };
      delete body.adminLogin;
      if (!body.newPassword) delete body.newPassword;
      await api("/api/admin/settings", { method: "PATCH", body: JSON.stringify(body) });
      setSettings((current) => ({ ...current, newPassword: "" }));
      notify("Sozlamalar saqlandi.");
    } catch (e) { notify((e as Error).message); }
  };
  const exportCsv = async () => {
    try {
      const response = await fetch("/api/admin/export.csv", { credentials: "include" });
      if (!response.ok) throw new Error("CSV eksportida xatolik yuz berdi.");
      const blob = await response.blob(); const url = URL.createObjectURL(blob);
      const link = document.createElement("a"); link.href = url; link.download = "elite-meeting-foydalanuvchilar.csv"; link.click(); URL.revokeObjectURL(url);
    } catch (e) { notify((e as Error).message); }
  };
  const filteredUsers = useMemo(() => users.filter((item) => {
    const text = `${item.firstName} ${item.lastName} ${item.phone} ${item.city}`.toLowerCase();
    return text.includes(query.toLowerCase()) && (filter === "all" || item.consent === filter);
  }).sort((a, b) => sort === "new" ? b.id - a.id : a.id - b.id), [users, query, filter, sort]);
  const conversations = useMemo(() => {
    const grouped = new Map<number, Message[]>();
    for (const item of adminMessages) {
      if (item.userId === undefined) continue;
      grouped.set(item.userId, [...(grouped.get(item.userId) || []), item]);
    }
    return [...grouped.entries()].map(([userId, items]) => ({
      userId,
      firstName: items[0].firstName || "Foydalanuvchi",
      lastName: items[0].lastName || "",
      phone: items[0].phone || "",
      latest: items[items.length - 1],
      items,
    })).filter((item) => `${item.firstName} ${item.lastName} ${item.phone} ${item.latest.body}`.toLowerCase().includes(adminMessageSearch.toLowerCase()))
      .sort((a, b) => b.latest.createdAt.localeCompare(a.latest.createdAt));
  }, [adminMessages, adminMessageSearch]);
  const activeThread = adminMessages.filter((item) => item.userId === activeConversation);
  const sendAdminReply = async (event: FormEvent) => {
    event.preventDefault();
    if (!activeConversation) return;
    try {
      await api(`/api/admin/messages/${activeConversation}`, { method: "POST", body: JSON.stringify({ body: replyDraft }) });
      setReplyDraft("");
      await loadAdminMessages();
      notify("Javob yuborildi.");
    } catch (e) {
      notify((e as Error).message);
    }
  };
  if (checking) return <div className="loading-screen"><div className="brand-mark"><Heart size={20} fill="currentColor" /></div><span>Admin tekshirilmoqda...</span></div>;
  if (!authenticated) return <div className="admin-login-screen"><div className="login-ornament"><div className="brand-mark"><Heart size={19} fill="currentColor" /></div><span>ELITE MEETING <small>ADMINISTRATOR</small></span></div><form className="admin-login-card" onSubmit={adminLogin}><div className="admin-shield"><Shield size={22} /></div><span className="eyebrow">XAVFSIZ KIRISH</span><h1>Admin CRM</h1><p>Davom etish uchun administrator hisobingizga kiring.</p><Field label="Login"><input value={login} onChange={(e) => setLogin(e.target.value)} required autoComplete="username" /></Field><Field label="Parol"><div className="password-field"><input type={showPassword ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="current-password" /><button type="button" onClick={() => setShowPassword(!showPassword)} aria-label="Parolni ko‘rsatish">{showPassword ? <EyeOff size={16} /> : <Eye size={16} />}</button></div></Field><ErrorText>{error}</ErrorText><button className="btn btn-primary btn-wide">Xavfsiz kirish <ArrowRight size={16} /></button><a className="back-link" href="/">← Saytga qaytish</a></form><p className="admin-login-foot">Kirish ma’lumotlari server muhit o‘zgaruvchilarida saqlanadi.</p></div>;
  const counts = dashboard?.counts || {};
  const chartData = chartPeriod === "week" ? dashboard?.daily || [] : dashboard?.monthly || [];
  const nav = [{ id: "overview", label: "Dashboard", icon: LayoutDashboard }, { id: "users", label: "Foydalanuvchilar", icon: Users }, { id: "meetings", label: "Uchrashuvlar", icon: CalendarDays }, { id: "calendar", label: "Taqvim", icon: CalendarDays }, { id: "messages", label: "Xabarlar", icon: Inbox }, { id: "settings", label: "Sozlamalar", icon: Settings }];
  const handleNewMeeting = async (event: FormEvent) => {
    event.preventDefault();
    try { await api("/api/admin/appointments", { method: "POST", body: JSON.stringify({ ...newMeeting, userId: Number(newMeeting.userId) }) }); setShowNewMeeting(false); await reload(); notify("Yangi uchrashuv yaratildi."); }
    catch (e) { notify((e as Error).message); }
  };
  return <div className={`admin-shell ${theme === "light" ? "theme-light" : ""}`}>
    <aside className={`admin-sidebar ${menuOpen ? "open" : ""}`}><a className="admin-brand" href="/"><span className="brand-mark"><Heart size={16} fill="currentColor" /></span><span>ELITE MEETING<small>ADMIN CRM</small></span></a><span className="nav-caption">BOSHQARUV</span><nav>{nav.map((item) => <button key={item.id} className={section === item.id ? "active" : ""} onClick={() => { setSection(item.id); setMenuOpen(false); }}><item.icon size={17} />{item.label}{section === item.id && <ChevronRight className="nav-arrow" size={15} />}</button>)}</nav><div className="sidebar-bottom"><div className="secure-box"><Shield size={16} /><div><b>Himoyalangan panel</b><span>Server autentifikatsiyasi</span></div></div><button className="admin-user" onClick={logout}><span className="admin-avatar">A</span><span><b>Administrator</b><small>Chiqish uchun bosing</small></span><LogOut size={15} /></button></div></aside>
    <main className="admin-main"><header className="admin-topbar"><button className="mobile-menu" onClick={() => setMenuOpen(!menuOpen)}><Menu size={19} /></button><div className="breadcrumbs">ELITE MEETING <ChevronRight size={14} /> <b>{nav.find((item) => item.id === section)?.label}</b></div><div className="admin-top-right"><span className="live-indicator"><i /> Tizim faol</span><button className="icon-btn theme-toggle" aria-label={theme === "dark" ? "Yorug‘ rejimga o‘tish" : "Qorong‘i rejimga o‘tish"} onClick={() => setTheme((current) => { const next = current === "dark" ? "light" : "dark"; localStorage.setItem("elite-meeting-theme", next); return next; })}>{theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}</button><span className="admin-top-avatar">A</span></div></header>
      <div className="admin-content">
        {section === "overview" && <>
          <div className="admin-page-heading"><div><span className="eyebrow">BOSHQARUV MARKAZI</span><h1>Umumiy ko‘rinish</h1><p>Platformadagi so‘nggi faollik va asosiy ko‘rsatkichlar.</p></div><button className="btn btn-outline btn-small" onClick={reload}><span className="refresh-icon">↻</span> Yangilash</button></div>
          <div className="stat-grid">{[
            ["Jami foydalanuvchilar", counts.totalUsers || 0, Users, "Barcha profillar"],
            ["Bugun yangi", counts.newUsers || 0, ArrowUpRight, "Bugungi ro‘yxatlar"],
            ["Rozilik bildirgan", counts.yesCount || 0, Heart, "Ha deganlar"],
            ["Javob kutilmoqda", counts.pendingCount || 0, Clock3, "Yangi takliflar"],
            ["Tasdiqlangan", counts.confirmedCount || 0, CheckCircle2, "Rejalashtirilgan"],
            ["Bugungi uchrashuvlar", counts.todayCount || 0, CalendarDays, "Bugun bo‘lib o‘tadi"],
          ].map(([label, value, Icon, description], index) => {
            const StatIcon = Icon as LucideIcon;
            return <div className="stat-card" key={String(label)}><div className="stat-card-top"><span>{String(label)}</span><i className={`stat-icon tone-${index}`}><StatIcon size={17} /></i></div><b>{value as number}</b><small>{String(description)}</small></div>;
          })}</div>
          <div className="chart-grid"><div className="admin-panel chart-panel"><div className="panel-heading"><div><span className="card-kicker">FAOLLIK</span><h2>Yangi ro‘yxatdan o‘tishlar</h2></div><button className="chart-range" onClick={() => setChartPeriod(chartPeriod === "week" ? "month" : "week")}>{chartPeriod === "week" ? "Oxirgi 7 kun" : "Oxirgi 6 oy"} <ChevronDown size={14} /></button></div><div className="chart-area"><ResponsiveContainer width="100%" height="100%"><AreaChart data={chartData} margin={{ left: -20, right: 7, top: 8 }}><defs><linearGradient id="activityFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#c89c72" stopOpacity={0.24} /><stop offset="95%" stopColor="#c89c72" stopOpacity={0} /></linearGradient></defs><CartesianGrid stroke="#29252a" vertical={false} /><XAxis dataKey={chartPeriod === "week" ? "day" : "month"} tickFormatter={(value: string) => chartPeriod === "week" ? value.slice(5) : value.slice(2)} tickLine={false} axisLine={false} stroke="#8c858c" fontSize={11} /><YAxis allowDecimals={false} tickLine={false} axisLine={false} stroke="#8c858c" fontSize={11} /><Tooltip contentStyle={{ background: "#211b21", border: "1px solid #39303a", borderRadius: 9, color: "#f8f2f4" }} /><Area type="monotone" dataKey="count" name="Foydalanuvchilar" stroke="#d6aa82" strokeWidth={2} fill="url(#activityFill)" /></AreaChart></ResponsiveContainer></div></div>
          <div className="admin-panel consent-panel"><div className="panel-heading"><div><span className="card-kicker">TAKLIF NATIJALARI</span><h2>Rozilik statistikasi</h2></div><MoreHorizontal size={19} /></div><div className="consent-chart"><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={dashboard?.consent || []} dataKey="value" nameKey="name" innerRadius={56} outerRadius={76} paddingAngle={4} stroke="none">{(dashboard?.consent || []).map((entry, index) => <Cell key={entry.name} fill={["#d6aa82", "#9d6570", "#544852"][index]} />)}</Pie><Tooltip contentStyle={{ background: "#211b21", border: "1px solid #39303a", borderRadius: 8 }} /></PieChart></ResponsiveContainer><div className="donut-label"><b>{counts.totalUsers || 0}</b><span>jami</span></div></div><div className="legend-list">{(dashboard?.consent || []).map((item, index) => <div key={item.name}><i style={{ background: ["#d6aa82", "#9d6570", "#544852"][index] }} />{item.name}<b>{item.value}</b></div>)}</div></div></div>
          <div className="admin-panel overview-meetings"><div className="panel-heading"><div><span className="card-kicker">YANGI FAOLLIK</span><h2>So‘nggi uchrashuvlar</h2></div><button className="text-button" onClick={() => setSection("meetings")}>Barchasi <ArrowRight size={14} /></button></div><AdminMeetingRows items={meetings.slice(0, 4)} onUpdate={updateMeeting} /></div>
        </>}
        {section === "users" && <><div className="admin-page-heading"><div><span className="eyebrow">MIJOZLAR BAZASI</span><h1>Foydalanuvchilar</h1><p>Ro‘yxatdan o‘tgan foydalanuvchilarni boshqaring.</p></div><button className="btn btn-outline btn-small" onClick={exportCsv}><Download size={15} /> CSV eksport</button></div><div className="admin-panel user-table-panel"><div className="table-toolbar"><div className="search-box"><Search size={16} /><input placeholder="Ism, telefon yoki shahar bo‘yicha..." value={query} onChange={(e) => setQuery(e.target.value)} /></div><select value={filter} onChange={(e) => setFilter(e.target.value)}><option value="all">Barcha holatlar</option><option value="yes">Rozilik bildirgan</option><option value="no">Rad etgan</option><option value="pending">Javob kutilmoqda</option></select><button className="sort-button" onClick={() => setSort(sort === "new" ? "old" : "new")}><ArrowDownRight size={15} />{sort === "new" ? "Yangi avval" : "Eski avval"}</button></div><div className="table-wrap"><table><thead><tr><th>FOYDALANUVCHI</th><th>TELEFON</th><th>SHAHAR</th><th>RO‘YXAT SANA</th><th>ROZILIK</th><th>UCHRASHUV</th><th /></tr></thead><tbody>{filteredUsers.map((item) => <tr key={item.id}><td><div className="table-person"><span>{item.firstName.charAt(0)}{item.lastName.charAt(0)}</span><div><b>{item.firstName} {item.lastName}</b><small>ID: {String(item.id).padStart(4, "0")}</small></div></div></td><td>{item.phone}</td><td>{item.city}</td><td>{dateLabel(item.createdAt.slice(0, 10))}</td><td><span className={`status-badge ${item.consent}`}>{item.consent === "yes" ? "Rozilik" : item.consent === "no" ? "Rad etgan" : "Kutilmoqda"}</span></td><td>{item.appointmentDate ? `${dateLabel(item.appointmentDate)} · ${item.appointmentTime || ""}` : "—"}</td><td><button className="table-icon" title="Ma’lumotlarni ko‘rish va tahrirlash" onClick={() => setSelectedUser(item)}><Eye size={15} /></button><button className="table-icon" title="Foydalanuvchini o‘chirish" onClick={() => deleteUser(item.id)}><Trash2 size={15} /></button></td></tr>)}</tbody></table>{filteredUsers.length === 0 && <div className="empty-table">Foydalanuvchilar topilmadi.</div>}</div><div className="table-footer">{filteredUsers.length} ta foydalanuvchi ko‘rsatilmoqda</div></div></>}
        {section === "meetings" && <><div className="admin-page-heading"><div><span className="eyebrow">REJALAR VA TAKLIFLAR</span><h1>Uchrashuvlar</h1><p>Barcha uchrashuvlar va ularning holatlarini boshqaring.</p></div><button className="btn btn-primary btn-small" onClick={() => setShowNewMeeting(true)}><Plus size={16} /> Yangi uchrashuv</button></div><div className="meeting-stats"><span><i className="dot pending" /> Kutilmoqda <b>{meetings.filter((x) => x.status === "pending").length}</b></span><span><i className="dot confirmed" /> Tasdiqlangan <b>{meetings.filter((x) => x.status === "confirmed").length}</b></span><span><i className="dot cancelled" /> Bekor qilingan <b>{meetings.filter((x) => x.status === "cancelled").length}</b></span></div><div className="admin-panel all-meetings"><div className="panel-heading"><div><span className="card-kicker">UCHRASHUVLAR RO‘YXATI</span><h2>{meetings.length} ta uchrashuv</h2></div><CalendarDays size={18} /></div><AdminMeetingRows items={meetings} onUpdate={updateMeeting} empty="Hozircha uchrashuvlar mavjud emas." /></div><div className="calendar-note"><CalendarDays size={17} /><span>Ro‘yxatda barcha uchrashuvlar sana va holat bo‘yicha ko‘rsatiladi. Uchrashuv holatini o‘ng tomondagi amallar orqali yangilashingiz mumkin.</span></div></>}
        {section === "calendar" && <><div className="admin-page-heading"><div><span className="eyebrow">UCHRASHUVLAR REJASI</span><h1>Uchrashuv taqvimi</h1><p>Tasdiqlangan, kutilayotgan va bekor qilingan uchrashuvlarni ko‘ring.</p></div></div><CalendarPanel appointments={meetings} /></>}
        {section === "messages" && <><div className="admin-page-heading"><div><span className="eyebrow">MIJOZLAR BILAN ALOQA</span><h1>Xabarlar markazi</h1><p>Foydalanuvchilar bilan yozishmalar va javoblarni boshqaring.</p></div><button className="btn btn-outline btn-small" onClick={() => void loadAdminMessages()}><span className="refresh-icon">↻</span> Yangilash</button></div><div className="admin-inbox"><div className="admin-panel inbox-list"><div className="message-search"><Search size={16} /><input placeholder="Ism, telefon yoki xabar..." value={adminMessageSearch} onChange={(e) => setAdminMessageSearch(e.target.value)} /></div>{conversations.map((thread) => <button key={thread.userId} className={`conversation-row ${activeConversation === thread.userId ? "active" : ""}`} onClick={() => setActiveConversation(thread.userId)}><span className="table-avatar">{thread.firstName[0]}{thread.lastName[0] || ""}</span><span><b>{thread.firstName} {thread.lastName}</b><small>{thread.latest.body}</small><small>{thread.phone}</small></span><time>{new Intl.DateTimeFormat("uz-UZ", { hour: "2-digit", minute: "2-digit" }).format(new Date(thread.latest.createdAt))}</time></button>)}{conversations.length === 0 && <div className="empty-state"><Inbox size={24} /><b>Hozircha yozishmalar yo‘q</b></div>}</div><div className="admin-panel inbox-conversation">{activeConversation && conversations.find((item) => item.userId === activeConversation) ? <><div className="panel-heading"><div><span className="card-kicker">FOYDALANUVCHI</span><h2>{conversations.find((item) => item.userId === activeConversation)?.firstName} {conversations.find((item) => item.userId === activeConversation)?.lastName}</h2></div><span className="status-badge confirmed">{conversations.find((item) => item.userId === activeConversation)?.phone}</span></div><div className="message-thread">{activeThread.map((item) => <div className={`message-bubble ${item.sender}`} key={item.id}><span>{item.sender === "admin" ? "ADMINISTRATOR" : "FOYDALANUVCHI"}</span><p>{item.body}</p><small>{new Intl.DateTimeFormat("uz-UZ", { dateStyle: "medium", timeStyle: "short" }).format(new Date(item.createdAt))}</small></div>)}</div><form className="message-compose" onSubmit={sendAdminReply}><Field label="Javob"><textarea rows={3} maxLength={2000} value={replyDraft} onChange={(e) => setReplyDraft(e.target.value)} placeholder="Javobingizni yozing..." required /></Field><button className="btn btn-primary" disabled={!replyDraft.trim()}><MessageCircle size={15} /> Javob yuborish</button></form></> : <div className="empty-state"><MessageCircle size={24} /><b>Yozishmani tanlang</b><span>Foydalanuvchiga javob yozish uchun chapdagi ro‘yxatdan tanlang.</span></div>}</div></div></>}
        {section === "settings" && <><div className="admin-page-heading"><div><span className="eyebrow">PLATFORMA NAZORATI</span><h1>Sozlamalar</h1><p>Sayt mazmuni, uchrashuv turlari va administrator xavfsizligi.</p></div></div><form className="settings-form" onSubmit={saveSettings}><div className="admin-panel settings-panel"><div className="panel-heading"><div><span className="card-kicker">UMUMIY</span><h2>Sayt ko‘rinishi</h2></div><Settings size={18} /></div><div className="settings-grid"><Field label="Sayt nomi"><input value={settings.siteName || ""} onChange={(e) => setSettings({ ...settings, siteName: e.target.value })} /></Field><Field label="Logo yuklash" hint="PNG, JPG yoki WebP · 30 KB gacha"><input type="file" accept="image/png,image/jpeg,image/webp" onChange={(e) => { const file = e.target.files?.[0]; if (!file) return; if (file.size > 30_000) { notify("Logo 30 KB dan kichik bo‘lishi kerak."); e.target.value = ""; return; } const reader = new FileReader(); reader.onload = () => setSettings((current) => ({ ...current, logoData: String(reader.result) })); reader.onerror = () => notify("Logo faylini o‘qib bo‘lmadi."); reader.readAsDataURL(file); }} /></Field><Field label="Asosiy taklif matni"><input value={settings.welcomeTitle || ""} onChange={(e) => setSettings({ ...settings, welcomeTitle: e.target.value })} /></Field><Field label="Romantik taklif sarlavhasi"><input value={settings.proposalTitle || ""} onChange={(e) => setSettings({ ...settings, proposalTitle: e.target.value })} /></Field><Field label="Asosiy rang"><div className="color-input"><input type="color" value={settings.accentColor || "#c89c72"} onChange={(e) => setSettings({ ...settings, accentColor: e.target.value })} /><input value={settings.accentColor || "#c89c72"} onChange={(e) => setSettings({ ...settings, accentColor: e.target.value })} /></div></Field><Field label="Uchrashuv turlari" hint="Vergul bilan ajrating"><input value={(settings.meetingTypes || []).join(", ")} onChange={(e) => setSettings({ ...settings, meetingTypes: e.target.value.split(",").map((x: string) => x.trim()).filter(Boolean) })} /></Field>{settings.logoData && <div className="logo-preview"><img src={settings.logoData} alt="Yuklangan logo" /><span>Joriy logo</span><button type="button" className="text-button" onClick={() => setSettings({ ...settings, logoData: "" })}>Logoni olib tashlash</button></div>}</div></div><div className="admin-panel settings-panel"><div className="panel-heading"><div><span className="card-kicker">XAVFSIZLIK</span><h2>Administrator hisob qaydnomasi</h2></div><Shield size={18} /></div><div className="settings-grid"><Field label="Admin login"><input value={settings.adminLogin || ""} onChange={(e) => setSettings({ ...settings, adminLogin: e.target.value })} /></Field><Field label="Yangi admin paroli" hint="O‘zgartirish ixtiyoriy"><input type="password" autoComplete="new-password" placeholder="Kamida 10 belgi" value={settings.newPassword || ""} onChange={(e) => setSettings({ ...settings, newPassword: e.target.value })} /></Field><label className="demo-toggle"><span><b>Demo SMS rejimi</b><small>Demo tasdiqlash kodi ekranda ko‘rsatiladi; haqiqiy SMS yuborilmaydi.</small></span><input type="checkbox" checked={Boolean(settings.demoMode)} onChange={(e) => setSettings({ ...settings, demoMode: e.target.checked })} /><i /></label></div></div><div className="settings-submit"><span><Shield size={14} /> O‘zgarishlar serverda saqlanadi.</span><button className="btn btn-primary"><Check size={16} /> Sozlamalarni saqlash</button></div></form></>}
      </div>
    </main>
    {showNewMeeting && <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && setShowNewMeeting(false)}><form className="modal-card" onSubmit={handleNewMeeting}><div className="panel-heading"><div><span className="card-kicker">YANGI REJA</span><h2>Uchrashuv yaratish</h2></div><button type="button" className="icon-btn" onClick={() => setShowNewMeeting(false)}><X size={17} /></button></div><Field label="Foydalanuvchi" required><select value={newMeeting.userId} onChange={(e) => setNewMeeting({ ...newMeeting, userId: e.target.value })} required><option value="">Tanlang</option>{users.map((item) => <option key={item.id} value={item.id}>{item.firstName} {item.lastName} · {item.phone}</option>)}</select></Field><div className="field-grid two"><Field label="Sana" required><input type="date" value={newMeeting.date} onChange={(e) => setNewMeeting({ ...newMeeting, date: e.target.value })} required /></Field><Field label="Boshlanish vaqti" required><input type="time" value={newMeeting.startTime} onChange={(e) => setNewMeeting({ ...newMeeting, startTime: e.target.value })} required /></Field></div><div className="field-grid two"><Field label="Joy" required><input value={newMeeting.venue} onChange={(e) => setNewMeeting({ ...newMeeting, venue: e.target.value })} required /></Field><Field label="Manzil" required><input value={newMeeting.address} onChange={(e) => setNewMeeting({ ...newMeeting, address: e.target.value })} required /></Field></div><div className="modal-actions"><button type="button" className="btn btn-ghost" onClick={() => setShowNewMeeting(false)}>Bekor qilish</button><button className="btn btn-primary">Yaratish <ArrowRight size={15} /></button></div></form></div>}
    {selectedUser && <AdminUserModal user={selectedUser} onClose={() => setSelectedUser(null)} onSaved={async () => { setSelectedUser(null); await reload(); notify("Foydalanuvchi ma’lumotlari yangilandi."); }} />}
    {toast && <div className="toast"><CheckCircle2 size={17} />{toast}</div>}
  </div>;
}

function AdminMeetingRows({ items, onUpdate, empty = "Hozircha uchrashuvlar yo‘q." }: { items: Appointment[]; onUpdate: (id: number, patch: Record<string, string>) => void; empty?: string }) {
  const [editingId, setEditingId] = useState<number | null>(null);
  const [draft, setDraft] = useState<Appointment | null>(null);
  if (!items.length) return <div className="empty-state"><CalendarDays size={24} /><b>{empty}</b></div>;
  return <div className="admin-meeting-list">{items.map((item) => <div className="admin-meeting-wrap" key={item.id}><div className="admin-meeting-row"><div className="mini-date"><b>{new Date(`${item.date}T12:00:00`).getDate()}</b><small>{new Intl.DateTimeFormat("uz-UZ", { month: "short" }).format(new Date(`${item.date}T12:00:00`))}</small></div><div className="admin-meeting-person"><span className="table-avatar">{(item.firstName || "U").charAt(0)}{(item.lastName || " ").charAt(0)}</span><div><b>{item.firstName || "Foydalanuvchi"} {item.lastName || ""}</b><small>{item.phone || ""}</small></div></div><div className="meeting-place"><b>{item.venue}</b><small><MapPin size={12} />{item.address}</small></div><div className="meeting-time"><Clock3 size={14} />{item.startTime} · {dateLabel(item.date)}</div><span className={`status-badge ${item.status}`}>{statusText(item.status)}</span><select aria-label="Uchrashuv holati" className="meeting-status-select" value={item.status} onChange={(e) => onUpdate(item.id, { status: e.target.value })}><option value="pending">Kutilmoqda</option><option value="confirmed">Tasdiqlangan</option><option value="cancelled">Bekor</option><option value="completed">Yakunlangan</option></select><button className="table-icon" title="Uchrashuvni tahrirlash" onClick={() => { setEditingId(item.id); setDraft({ ...item }); }}><PenLine size={14} /></button></div>{editingId === item.id && draft && <div className="meeting-edit-row"><div className="field-grid two"><Field label="Sana"><input type="date" value={draft.date} onChange={(e) => setDraft({ ...draft, date: e.target.value })} /></Field><Field label="Boshlanish vaqti"><input type="time" value={draft.startTime} onChange={(e) => setDraft({ ...draft, startTime: e.target.value })} /></Field><Field label="Tugash vaqti"><input type="time" value={draft.endTime} onChange={(e) => setDraft({ ...draft, endTime: e.target.value })} /></Field><Field label="Uchrashuv joyi"><input value={draft.venue} onChange={(e) => setDraft({ ...draft, venue: e.target.value })} /></Field></div><Field label="Manzil"><input value={draft.address} onChange={(e) => setDraft({ ...draft, address: e.target.value })} /></Field><Field label="Foydalanuvchiga izoh"><textarea rows={2} placeholder="Ushbu izoh foydalanuvchi kabinetida ko‘rinadi." value={draft.adminNote || ""} onChange={(e) => setDraft({ ...draft, adminNote: e.target.value })} /></Field><div className="meeting-edit-actions"><button className="btn btn-primary btn-small" onClick={() => { onUpdate(item.id, { date: draft.date, startTime: draft.startTime, endTime: draft.endTime, venue: draft.venue, address: draft.address, adminNote: draft.adminNote || "" }); setEditingId(null); }}><Check size={14} /> Saqlash</button><button className="btn btn-ghost btn-small" onClick={() => setEditingId(null)}>Bekor qilish</button></div></div>}</div>)}</div>;
}

function AdminUserModal({ user, onClose, onSaved }: { user: AdminUser; onClose: () => void; onSaved: () => Promise<void> }) {
  const [form, setForm] = useState<ProfileForm>({ firstName: user.firstName, lastName: user.lastName, phone: user.phone, birthDate: user.birthDate, city: user.city, telegram: user.telegram, about: user.about });
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setSaving(true); setError("");
    try { await api(`/api/admin/users/${user.id}`, { method: "PATCH", body: JSON.stringify(form) }); await onSaved(); }
    catch (e) { setError((e as Error).message); }
    finally { setSaving(false); }
  };
  const field = (key: keyof ProfileForm, value: string) => setForm((current) => ({ ...current, [key]: value }));
  return <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}><form className="modal-card" onSubmit={submit}><div className="panel-heading"><div><span className="card-kicker">PROFIL · ID {String(user.id).padStart(4, "0")}</span><h2>Foydalanuvchi ma’lumotlari</h2></div><button type="button" className="icon-btn" onClick={onClose}><X size={17} /></button></div><div className="field-grid two"><Field label="Ism" required><input value={form.firstName} onChange={(e) => field("firstName", e.target.value)} required /></Field><Field label="Familiya" required><input value={form.lastName} onChange={(e) => field("lastName", e.target.value)} required /></Field></div><div className="field-grid two"><Field label="Telefon"><input value={form.phone} disabled /></Field><Field label="Tug‘ilgan sana"><input type="date" value={form.birthDate} onChange={(e) => field("birthDate", e.target.value)} /></Field></div><div className="field-grid two"><Field label="Shahar" required><input value={form.city} onChange={(e) => field("city", e.target.value)} required /></Field><Field label="Telegram"><input value={form.telegram} onChange={(e) => field("telegram", e.target.value)} /></Field></div><Field label="O‘zi haqida"><textarea rows={2} value={form.about} onChange={(e) => field("about", e.target.value)} /></Field><p className="modal-readonly">Rozilik holati: <b>{user.consent === "yes" ? "Rozilik bildirgan" : user.consent === "no" ? "Rad etgan" : "Javob kutilmoqda"}</b> · Ro‘yxat sanasi: {dateLabel(user.createdAt.slice(0, 10))}</p><ErrorText>{error}</ErrorText><div className="modal-actions"><button type="button" className="btn btn-ghost" onClick={onClose}>Yopish</button><button className="btn btn-primary" disabled={saving}><Check size={15} /> O‘zgarishlarni saqlash</button></div></form></div>;
}
