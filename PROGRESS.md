# PROGRESS.md — יומן התקדמות פרויקט RTM

> רשומות בהמשך למטה (לא מוחקים היסטוריה). כל משימה: כותרת, קבצים, החלטות, פקודות, מה לבדוק.

---

## משימה 1.0 — תשתית פתרון .NET 8

**סטטוס:** ✅ הושלם

### קבצים שנוצרו/שונו
- `RTM.sln` — פתרון ראשי.
- `src/RTM.Api/RTM.Api.csproj` — WebAPI net8.0, Nullable+ImplicitUsings, **TreatWarningsAsErrors=true**.
- `src/RTM.Api/Program.cs` — minimal hosting, Swagger (Dev), Health endpoint `/health`, `public partial class Program` (לאינטגרציה באינטגרציה).
- `tests/RTM.Tests/RTM.Tests.csproj` — xUnit net8.0, TreatWarningsAsErrors=true, ProjectReference ל-API.
- `.gitignore` — bin/, obj/, node_modules/, .vs/, dist/ וכו'.
- `CLAUDE.md` — חוקי העבודה (בשימוש בכל סשן).
- נמחקו קבצי הדוגמה של template (`WeatherForecast`, `UnitTest1.cs`).

### החלטות עיצוב + סיבה
- **TreatWarningsAsErrors** — הועתק מפרופיל האיכות (Part 3): כל אזהרה = build נכשל => forced high quality.
- **`public partial class Program`** — הכרחי כדי להשתמש ב-`WebApplicationFactory` בבדיקות אינטגרציה (משימה 2.1), מוסיף גישה ל-Program בהרשאה.
- **Health endpoint** — needed ל-tests ימצאו את ה-API חי, ושלכל container/k8s probe.
- **אקטיבל branch main** במקום master (עדכון).
- ללא תלות SF חדש — רק תבניות בסיס; חבילות עתידיות יגיעו בכל משימה.

### פקודות שהורצו + פלט
```
dotnet new sln -n RTM
dotnet new webapi -n RTM.Api -o src/RTM.Api --framework net8.0 --no-restore
dotnet new xunit -n RTM.Tests -o tests/RTM.Tests --framework net8.0 --no-restore
dotnet sln RTM.sln add src/RTM.Api tests/RTM.Tests
dotnet build   → Build succeeded. 0 Warning(s), 0 Error(s)
dotnet test    → no tests yet (תבנית תקינה בתשתית)
git commit 3995bd0 → 10 files changed, 265 insertions
```

### מה כדאי לבדוק בעצמי
- פתח את `RTM.sln` ב-Visual Studio/VS Code — שני פרויקטים רשומים.
- הרץ `dotnet run --project src/RTM.Api` ופתח `/health` — מחזיר `{"status":"ok",...}`.
- ודא ש-`dotnet test` רץ (אף של אין עדיין בדיקות — זה תקין בשלב זה).

---

## משימה 1.1 — Redis Cache Provider עם fallback ל-InMemory

**סטטוס:** ✅ הושלם (אומת build+test)

### קבצים שנוצרו/שונו
- `src/RTM.Api/Caching/ICacheProvider.cs` — חוזה אחיד (Set/Get/Remove/IsConnected), async + CancellationToken.
- `src/RTM.Api/Caching/RedisCacheProvider.cs` — wrap של StackExchange.Redis, Best-Effort (כישלון Redis רק נדחק לאזהרת לוג, לא hard failure).
- `src/RTM.Api/Caching/InMemoryCacheProvider.cs` — fallback שקוף Thread-Safe (ConcurrentDictionary + lazy TTL cleanup).
- `src/RTM.Api/Caching/CacheRegistration.cs` — הרשמת DI; ב-factor: מנסה חיבור אמיתי (timeout 2s), נכשל → InMemory. Redis config מ-appsettings.
- `src/RTM.Api/appsettings.json` — קטע `Redis: { Enabled, Configuration }` (localhost:6379).
- `src/RTM.Api/Program.cs` — `AddCacheProvider(configuration)`.
- `tests/RTM.Tests/Caching/InMemoryCacheProviderTests.cs` — 5 בדיקות (fallback עובד בלי Redis, miss→null, overwrite/remove, TTL expiry, concurrency).
- חבילה: `StackExchange.Redis` 3.1.13 נוספה **ל-RTM.Api בלבד**.

### החלטת fallback (חשובה)
- **Best-Effort, לא hard failure:** בהרשמת ה-Provider מנסים `ConnectionMultiplexer.Connect` עם `AbortOnConnectFail=false` ו-ConnectTimeout=2s. אם אין שרת Redis → חוזרים ל-`InMemoryCacheProvider` (שקוף, thread-safe) ולא מפילים את האפליקציה. אם Redis מגיע בהמשך (בונוס 3.5) — פשוט מפעילים בבלוק Redis, והקוד כבר מוכן.
- `IsConnected` מאפשר לדעת איזה Provider פעיל (השימוש יהיה בהמשך, למשל היסטוריה ב-SignalR).

### פקודות שהורצו + פלט
```
dotnet add RTM.Api package StackExchange.Redis   → 3.1.13 added (API only)
dotnet restore → success
dotnet build   → Build succeeded. 0 Warning(s), 0 Error(s)
dotnet test    → Passed! Failed: 0, Passed: 5, Skipped: 0, Total: 5
```

### מה כדאי לבדוק בעצמי
- הפעל את הבדיקות ב-Test Explorer (5 ירוקות).
- `InMemoryCacheProviderTests` — במיוחד `Provider_WorksWithoutRedis_WithInMemoryFallback` (ה-Red-fallbackסקריפט).
- הרץ את ה-API בלי Redis (`dotnet run --project src/RTM.Api`) — בעקוב של-logs תראה "Unable to reach Redis ... using in-memory fallback cache" ואי-פני באג. ה-`/health` מחזיר OK. אם תרצה, תחבר קונטיינר Redis מאוחר יותר והלוג יְראה "Redis connected".

---

## משימה 1.2 — מודל Transaction (5 שדות + Validation)

**סטטוס:** ✅ הושלם (אומת build+test, 18 בדיקות ירוקות)

### קבצים שנוצרו/שונו
- `src/RTM.Api/Domain/Transaction.cs` — מחלקה `Transaction` (משמרת חוקיות בלתי נשברת) + enum `TransactionStatus { Pending, Completed, Failed }`.
- `tests/RTM.Tests/Domain/TransactionTests.cs` — בדיקות יחידה: עסקה חוקית, amount שלילי נדחה, currency באורך פסול נדחה, transactionId חייב GUID תקין, כל הערכים של status תקפים, amount 0 מתקבל.

### החלטות עיצוב + סיבה
- **כדי לשמור על אובייקטים תמיד-חוקיים** (invariant protection), הבנייה של `Transaction` עוברת דרך Constructor עם validation (fail-fast) — כך שאין מצב של מופע לא-חוקי במערכת. (ידרש זה עמידה ב"חוקיות בשמירה" — RTM-criteria.)
- **`amount >= 0`** — פועל לפי הדרישה ("amount >= 0"); אפס חוקי, שלילי נדחה.
- **`currency`** — חייב להיות באורך בדיוק 3 אותיות (לא ריק, לא whitespace).
- **`transactionId`** — `Guid` (לא GUID ריק). הבחירה: לשמור ב-C# כסוג `Guid` (אמיתי, ממוקד), עם קידוד JSON ל-string כ"guid-string" בתשובות (יעשה ב-endpoint 2.1).
- **`timestamp`** — `DateTimeOffset` (UTC) — שומר אזור זמן, עומד ISO-8601.
- **`status`** — enum, ברור בטיפוס.
- TDD: תחילה הבדיקות (Red), המימוש עושה אותן ירוקות (Green).

### פקודות שהורצו + פלט
```
dotnet restore → success
dotnet build   → Build succeeded. 0 Warning(s), 0 Error(s)
dotnet test    → Passed! Failed: 0, Passed: 18, Skipped: 0, Total: 18
git commit ed0b34b → Task 1.2: Transaction domain model (5 fields) with invariant validation
```
בדרך: Red — 3 בדיקות נכשלו כי `amount` השלילי זרק `ArgumentOutOfRangeException` והבדיקה ציפתה ל-`ArgumentException`. תיקון: איחוד לכל `ArgumentException` במודל (אחידות).

> 📌 **git:** הותקן Git 2.47.1 (C:\Program Files\Git) וה-commit של 1.2 נבצע — `ed0b34b`. שים לב: הסשן של VS Code חייב להפעיל מחדש כדי ש-git יופיע ב-PATH (לכן בפרוטוקול להלן משתמשים בנתיב מלא).
### מה כדאי לבדוק בעצמי
- `TransactionTests` ב-Test Explorer — 13 בדיקות ירוקות (פלוס 5 של משימה 1.1 = 18).
- שימו לב: המודל משתמש ב-`Guid` עבור transactionId — ב-JSON יוצגוך `string` (GUID format) דרך קונסנציית הסריאליזציה (יתבהר ב-2.1).

---

## רשומה — ADR ראשוני (Redis cache + SignalR) — תיעוד החלטות ארכיטקטוניות מוקדם

**סטטוס:** ✅ הושלם

### קבצים שנוצרו/שונו
- `docs/ADR-001-redis-cache.md` — החלטה: Redis Cache-Aside עם fallback שקוף ל-InMemory (graceful degradation). Context/Decision/Consequences.
- `docs/ADR-002-signalr.md` — החלטה: SignalR של מיקרוסופט (ולא WebSocket נאיבי) עבור השכבה החיה. Context/Decision/Consequences.
- `PROGRESS.md` — רשומה זו.

### מטרה
תיעוד ארכיטקטוני מוקדם (לכאורה) לשני נושאי מפתח (קאש + רטיים) טרם כתיבת שירות הפעולות — כך שההחלטות מתועדות עם ההקשר הנכון, לפי פורמט ADR סטנדרטי (Context/Decision/Consequences), קצר (1–2 דקות קריאה כל אחד), בעברית.

### החלטות מתועדות
- **קאש:** Cache-Aside על Redis + fallback שקוף ל-InMemory (Thread-Safe, TTL) — אמינות + ביצועים, כאשר החלטה אינה תלויה בשרת יחיד.
- **SignalR:** בחירה ב-ASP.NET Core SignalR (ניהול חיבורים/heartbeat/reconnect מובנה) על פני WebSocket ידני — פשטות + scalability עתידי דרך Redis backplane.

### הערה ל-git
מתעדכן אחרי אישור המשתמש (לפי חוק CLAUDE.md המעודכן — upload ל-git רק באישור).

### מה כדאי לבדוק בעצמי
- פתח את שני קובצי ה-ADR — מבנה אחיד (Decision/Context/Consequences), קצר וקריא בעברית.
- וודא שהקישור אליהם בתיקיית docs/ הוא בפורמט ADR סטנדרטי.
