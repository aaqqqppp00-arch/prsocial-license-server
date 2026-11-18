# PR.Social Master License Server & Admin Console 🚀

خادم التراخيص المشفر ولوحة تحكم الإدارة لـ **PR.Social Master**، مبني باستخدام Python Flask ويدعم قواعد بيانات **PostgreSQL (Supabase)** مع استضافة سحابية فائقة السرعة على **Render**.

---

## 🌟 مميزات النظام والداشبورد

- **تصميم إداري بدون أي استدارة (Strict Zero Border Radius)**:
  - مستوحى من كبرى المنصات السحابية: **Google Cloud Console**, **Amazon AWS Management Console**, و **Microsoft Azure**.
  - واجهة نهارية (Light Mode) عالية التباين والوضوح والدقة.
- **تشفير وأمان عالي**:
  - حساب المسؤول وكلمة المرور مشفرة بخوارزمية التجزئة الآمنة (Hashed Passwords).
  - توقيع رقمي مشفر (HMAC-SHA256) لكل استجابة متوافق مع طبقة C++ الأصلية في تطبيق الأندرويد.
- **ربط بقاعدة بيانات دائمة (Supabase PostgreSQL)**:
  - حفظ دائم للبيانات والتراخيص وسجلات الأجهزة حتى بعد إعادة تشغيل السيرفر في Render.
- **نظام توليد تراخيص ديناميكي**:
  - توليد مفاتيح بمدد مختلفة: **أسبوع (7 أيام)**، **شهر (30 يوم)**، **سنة (365 يوم)**، أو **مدى الحياة (Lifetime VIP)**.
- **رصد وتتبع متقدم للأجهزة (Telemetry & Anti-Fraud)**:
  - كشف ومراقبة: هل تم تجربة المفتاح؟ هل متصل الآن (Online)؟
  - كشف فوري للاحتيال عند محاولة استخدام نفس المفتاح على أكثر من جهاز (`Multi-Device Fraud Detection`).
  - جمع وتوثيق: عنوان الـ IP، نوع الاتصال (واي فاي WiFi أو باقة الهاتف Mobile Data)، الموقع الجغرافي، إصدار WebView، وبصمة المتصفح (Browser Fingerprint).
- **أزرار تحكم سريعة**:
  - إلغاء فوري للترخيص (Revoke).
  - حظر العتاد والمفتاح (Block).
  - إعادة التنشيط وفك ربط العتاد (Activate / Reset Device ID).
  - حذف نهائي من قاعدة البيانات (Delete).

---

## 🛠️ خطوات الربط بـ Supabase و Render

### 1. إعداد قاعدة بيانات Supabase (PostgreSQL):
1. افتح حسابك في [Supabase](https://supabase.com) وأنشئ مشروعاً جديداً.
2. اذهب إلى **Project Settings** -> **Database**.
3. تحت قسم **Connection string**، اختر **URI** أو **Transaction Pooler** وانسخ الرابط:
   ```text
   postgresql://postgres.[PROJECT_REF]:[YOUR_PASSWORD]@aws-0-eu-central-1.pooler.supabase.com:6543/postgres
   ```
4. السيرفر سيقوم بإنشاء الجداول (`licenses`, `admin_users`, `device_telemetry_logs`) تلقائياً عند أول تشغيل.

---

### 2. النشر على Render:
1. ارفع هذا المجلد كمستودع خاص على **GitHub**.
2. في لوحة تحكم [Render](https://render.com):
   - اضغط **New** -> **Web Service** واربط المستودع من GitHub.
   - أو اضغط **New** -> **Blueprint** وسيتعرف Render تلقائياً على ملف `render.yaml`.
3. اضبط متغيرات البيئة (Environment Variables) في Render:
   - `DATABASE_URL`: رابط اتصال Supabase PostgreSQL.
   - `ADMIN_USERNAME`: اسم مستخدم الأدمن (الافتراضي `admin`).
   - `ADMIN_PASSWORD`: كلمة مرور الأدمن المشفرة (الافتراضي `Admin@PRSocial2026!`).
   - `SECRET_KEY`: مفتاح عشوائي للجلسة.
   - `HMAC_SECRET`: `PRSC_2026_MASTER_SHIELD_AUTH_KEY_98374`
   - `CRYPTO_VALIDATOR_SALT`: `PRSC_CRYPTO_CORE_VALIDATOR_SALT_2026_X99`

---

## 📱 بيانات الدخول الافتراضية للوحة الأدمن
- **رابط اللوحة**: `https://<YOUR_RENDER_URL>/admin`
- **اسم المستخدم**: `admin`
- **كلمة المرور**: `Admin@PRSocial2026!`
*(يمكنك تغييرها في أي وقت من متغيرات البيئة).*
