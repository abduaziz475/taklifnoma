# Mehr — premium uchrashuv taklifnomasi

O‘zbek tilidagi to‘liq ishlaydigan uchrashuv platformasi: React/Vite mijoz interfeysi, Express API va SQLite ma’lumotlar bazasi. Ro‘yxat, rozilik, uchrashuvlar, admin sozlamalari va sessiyalar serverda saqlanadi.

## Ishga tushirish

Talab: Node.js 22.13 yoki undan yangi versiya.

```powershell
npm install
npm run dev
```

Mijoz interfeysi `http://localhost:5173`, maxfiy admin paneli `http://localhost:5173/admin` manzilida ochiladi. SQLite bazasi `data/mehr.sqlite` faylida yaratiladi. `data/` versiya nazoratiga qo‘shilmaydi.

### Demo kirish

- Admin login: `admin`
- Admin parol: `Mehr2026!`
- Telefon tasdiqlash kodi: ro‘yxatdan o‘tish/kirish oynasida har safar alohida ko‘rsatiladi; haqiqiy SMS yuborilmaydi.

Admin parolini paneldagi **Sozlamalar** bo‘limidan almashtiring. Birinchi marta ishga tushirishdan oldin `.env.example` faylini `.env` ga nusxalab, `ADMIN_LOGIN` va `ADMIN_PASSWORD` qiymatlarini o‘rnatish ham mumkin.

## Asosiy imkoniyatlar

- Telefon raqami bo‘yicha ro‘yxatdan o‘tish va OTP tasdiqlash; 5 daqiqalik kod va xato urinish cheklovi.
- Rozilikni bildirish yoki rad etish; foydalanuvchining tanlovi saqlanadi va o‘zgarishi mumkin.
- Sana, vaqt, joy va izohlar bilan uchrashuv rejalash, taklifnoma raqami, chop etish/PDF va Telegram orqali ulashish.
- Foydalanuvchi kabineti, profil tahriri, uchrashuvlar tarixi va administrator izohlari.
- Admin CRM: statistikalar, haftalik/oylik grafiklar, foydalanuvchilarni qidirish/filtrlash/saralash, tahrirlash/o‘chirish, CSV eksport, uchrashuvlarni boshqarish va sayt sozlamalari.
- Admin autentifikatsiyasi serverda tekshiriladi; parol bcrypt bilan xeshlanadi, sessiya tokenining faqat xeshi bazada saqlanadi.

## Haqiqiy SMS

Demo rejimi ekranda demo kodni ko‘rsatadi va SMS yuborilmaganini ochiq bildiradi. Haqiqiy SMS uchun `.env` da quyidagilarni sozlang:

```env
DEMO_MODE=false
TWILIO_ACCOUNT_SID=...
TWILIO_AUTH_TOKEN=...
TWILIO_FROM_NUMBER=...
```

Twilio sozlanmagan bo‘lsa, SMS rejimi aniq xatolik bilan to‘xtaydi. Maxfiy kalitlarni frontendga yoki repoga qo‘shmang. Uchrashuv bo‘yicha administrator izohlari foydalanuvchi kabinetida saqlanadi; tashqi xabarnoma provayderi sozlanmagan.

## Production

1. Maxfiy qiymatlarni server hosting muhitida o‘rnating; `.env` faylini GitHub’ga yubormang.
2. `ADMIN_LOGIN`, `ADMIN_PASSWORD` bilan alohida kuchli admin hisobini birinchi ishga tushirishdan oldin sozlang yoki admin panelidan parolni o‘zgartiring.
3. `NODE_ENV=production`, `DEMO_MODE=false`, `APP_ORIGIN=https://sizning-domeningiz.uz` va doimiy diskdagi `DB_PATH` ni belgilang.
4. `npm run build`, so‘ng `npm start` ni bajaring. Express `dist/` statik fayllarini va API’ni bir portda taqdim etadi.
5. HTTPS va muntazam SQLite zaxira nusxalarini hosting darajasida yoqing.

Bu loyiha SQLite’dan foydalanadi; bir nechta server nusxasi yoki yuqori trafik uchun boshqariladigan PostgreSQL/Supabase’ga migratsiya va umumiy sessiya ombori qo‘shish kerak. Server, baza diski, domen, Twilio hisobi va production sirlarini loyiha kodi o‘zi taqdim eta olmaydi.
