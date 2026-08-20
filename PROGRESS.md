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

---

## משימה 1.3 — ITransactionStore + In-Memory (ConcurrentDictionary) Thread-Safe

**סטטוס:** ✅ הושלם (אומת build+test, 24 בדיקות ירוקות)

### קבצים שנוצרו/שונו
- `src/RTM.Api/Domain/ITransactionStore.cs` — interface (Core/Domain, טהור):
  - `Task AddAsync(Transaction t, CancellationToken ct)`
  - `Task<IEnumerable<Transaction>> GetAllAsync(CancellationToken ct)`
  - `Task<Transaction?> GetByIdAsync(string id, CancellationToken ct)`
- `src/RTM.Api/Services/InMemoryTransactionStore.cs` — מימוש (Services): `ConcurrentDictionary<string, Transaction>`, key = guid-string. אין לוגיקה עסקית — רק אחסון.
- `tests/RTM.Tests/Services/InMemoryTransactionStoreTests.cs` — 6 בדיקות TDD (נכתבו קודם — Red, מימוש שיקף אותן — Green).
- `src/RTM.Api/Program.cs` — רישום DI: `AddSingleton<ITransactionStore, InMemoryTransactionStore>()`.

### החלטות עיצוב + סיבה
- **Thread-Safety:** `ConcurrentDictionary` (+ `CancellationToken` בכל פעולה). כל mutation אטומי (indexer write = add-or-replace). `GetAllAsync` מחזיר snapshot (`.Values.ToList()`) — תקיעות קריאה עקבית גם בזמן כתיבה.
- **התנהגות על id כפול (duplicate):** בחירה מתועדת — **Replace (latest wins)**. הוספת אותו transactionId שוב מחליפה את הרשומה, נשמרת בדיוק ערך אחד. (חלופה הדחה נדחתה — גישה "אחרון מנצח" פשוטה ועקבית עם מודל אחסון keyed.) בקוד תודה.
- **DI: Singleton** — שכן בגוף של זמן-אמת כל החיבורים חייבים לחלוק **אותה** פנייה ל-store (אחרת מופעים נפרדים יפיצו נתונים מבודדים). In-Memory עם Singleton = עקביות בתוך מופע אחד.
- **`GetByIdAsync(string)` לעומת `Transaction.Guid`:** ה-interface מקבל string (guid-string) לפי הדרישה; המימוש משתמש בו ישירות כפתח ב-ConcurrentDictionary — `TryGetValue` מחזיר null עבור מפתח לא-תקין/לא-קיים (התנהגות נתמכת).
- אין לוגיקה עסקית נוספת — רק אחסון, עמידה בציווי ה-Layered (Services → Core).

### פקודות שהורצו + פלט
```
dotnet restore → All projects are up-to-date for restore
dotnet build   → Build succeeded. 0 Warning(s), 0 Error(s)
dotnet test    → Passed! Failed: 0, Passed: 24, Skipped: 0, Total: 24
```
### מה כדאי לבדוק בעצמי
- 6 הבדיקות החדשות ב-`InMemoryTransactionStoreTests` — כולל בדיקת ה-concurrency (50 כותבים במקביל) ו-CancellationToken.
- רישום ה-DI ב-Program.cs — `AddSingleton<ITransactionStore, InMemoryTransactionStore>()`.

---

## משימה 1.4 — Service Layer: ITransactionService + TransactionService (TDD, Result pattern)

**סטטוס:** ✅ הושלם (אומת build+test, 31 בדיקות ירוקות)

### קבצים שנוצרו/שונו
- `src/RTM.Api/Domain/Result.cs` — `Result<T>` value object (Success/Failure). התשתית ל-Result pattern — שגיאות צפויות כערכים, לא Exceptions.
- `src/RTM.Api/Domain/ITransactionService.cs` — interface (Core, טהור, ללא תלות חיצונית):
  - `Task<Result<Transaction>> ProcessAsync(Guid id, decimal amount, string currency, TransactionStatus status, DateTimeOffset timestamp, CancellationToken ct)`
  - `Task<Result<IReadOnlyList<Transaction>>> GetAllAsync(CancellationToken ct)`
- `src/RTM.Api/Services/TransactionService.cs` — מימוש (Services): מאמת payload גולמי → בונה Transaction → שומר ב-`ITransactionStore` (הוזרק).
- `tests/RTM.Tests/Services/TransactionServiceTests.cs` — 7 בדיקות TDD + Fake ידני ל-Store (ללא framework חיצוני).
- `src/RTM.Api/Program.cs` — DI: `AddSingleton<ITransactionService, TransactionService>()`.

### החלטת design מרכזית (נשאל המשתמש ואושר)
**`ProcessAsync` מקבל raw values (guid/amount/currency/status/timestamp) — לא `Transaction`.**
הסיבה: ה-`Transaction` הוא value object עם constructor fail-fast, כך שאובייקט לא-חוקי לעולם לא יכול להתקיים; לו ניגש ProcessAsync(Transaction), בדיקות "amount שלילי / currency פסול" היו בלתי-אפשריות (הבנייה עצמה הייתה זורקת). הבחירה המקצועית: **ה-Service יוצר את ה-Transaction בעצמו** ומחזיר `Result.Failure` על payload לא-חוקי (בלי Exception).

### כללי validation (במימוש, לפני הבנייה)
- `transactionId == Guid.Empty` → Failure
- `amount < 0` → Failure
- `currency` ריק או אורך ≠ 3 → Failure
- `timestamp` רחוק בעתיד (`> now + 5min` — הניית clock-skew) → Failure
- אחרת → בונה Transaction, `AddAsync` ל-Store, `Result.Success(transaction)`.

### CancellationToken — החלטה מתועדת
ביטול (cancellation) משוטח כ-**`OperationCanceledException`** (משוחרר מה-store), **לא** `Result.Failure` — זה אות shutdown/חריג, ולא שגיאה צפויה. מתועד בבדיקה `Process_CancelledToken_ThrowsOperationCanceledException`.

### פקודות שהורצו + פלט
```
dotnet restore → All projects are up-to-date for restore
dotnet build   → Build succeeded. 0 Warning(s), 0 Error(s)
dotnet test    → Passed! Failed: 0, Passed: 31, Skipped: 0, Total: 31
```
(31 = 24 קודמים + 7 חדשים.)

### מה כדאי לבדוק בעצמי
- 7 בדיקות חדשות ב-`TransactionServiceTests` — במיוחד: `Process_NegativeAmount_ReturnsFailure_NoException` (ללא Exception), `Process_FarFutureTimestamp_ReturnsFailure`, `Process_CancelledToken_ThrowsOperationCanceledException`.
- רישום ה-DI ב-Program.cs — `AddSingleton<ITransactionService, TransactionService>()`.

### git
- לא נגענו ב-git (per request — לשאול אישור לפני upload). השינויים ב-working tree ממתינים לאישורך.
