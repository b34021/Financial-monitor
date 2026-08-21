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

---

## משימה 2.0 — אינטגרציית Cache (cache-aside + write-through + fallback)

**סטטוס:** ✅ הושלם (אומת build+test, 35 בדיקות ירוקות)

### קבצים שנוצרו/שונו
- `src/RTM.Api/Domain/ITransactionCache.cs` — (Core, חדש) contract טיפוסי-Transaction: `GetCachedAsync/SetCachedAsync` (עסקה בודדת תחת key `t:{id}`), `GetCachedListAsync/SetCachedListAsync` (כלל-הרשימה תחת key `t:all`), `IsAvailableAsync`. Best-effort: מימושים חייבים לא לזרוק על קאש לא-זמין.
- `src/RTM.Api/Services/TransactionCache.cs` — (Services, חדש) Adapt את `ICacheProvider` הגנרי ל-contract הטיפוסי + serialization JSON; availability = `inner.IsConnected`; כשקאש לא מחובר → reads=miss, writes=skip.
- `src/RTM.Api/Domain/Transaction.cs` — הוספת `[JsonConstructor]` (ל-deserialize בקאש; פרמטרים ממופים לפי שם).
- `src/RTM.Api/Domain/ITransactionService.cs` — הוספת `GetByIdAsync` (cache-aside ל-entry בודד; משלים את `ITransactionStore.GetByIdAsync`).
- `src/RTM.Api/Services/TransactionService.cs` — מורחב: `ProcessAsync` → write-through (Store ואז SetCachedAsync); `GetAllAsync` → cache-aside (רשימה) + populate + fallback; `GetByIdAsync` (חדש) → cache-aside (entry) + populate + fallback.
- `src/RTM.Api/Program.cs` — `AddSingleton<ITransactionCache, TransactionCache>()`.
- `tests/RTM.Tests/Services/TransactionCacheIntegrationTests.cs` — (חדש) 4 TDD.
- `tests/RTM.Tests/Services/TransactionServiceTests.cs` — עדכון ה-constructor (הזרקת cache fake שתמיד לא-זמין → שומר על מסלול ה-Store של הבדיקות הקודמות).

### החלטות עיצוב
- **Cache הוא Services-layer** (עוטף `ICacheProvider` הגנרי משכונת 1.1) — בלי לשבור את ה-DI הקיים; ה-`ITransactionCache` החדש הוא Core-טהור.
- **Availability = `ICacheProvider.IsConnected`**: כש-Redis לא מחובר (או fallback to InMemory שמדווח IsConnected=false), ה-`TransactionCache.IsAvailableAsync` → false, ו-TransactionService נופל ל-Store תמיד. ה-Store הוא מקור האמת; הקאש הוא אופטימיזציה best-effort.
- **write-through** ב-ProcessAsync: Store קודם (תמיד), ואז SetCachedAsync (best-effort, לא זרק). עקבי עם "store as source of truth".
- **cache-aside** ב-GetAllAsync (key `t:all`) וב-GetByIdAsync (key `t:{id}`): miss → store → populate.

### פקודות שהורצו
```
dotnet restore → All projects are up-to-date
dotnet build   → Build succeeded. 0 Warning(s), 0 Error(s)
dotnet test    → Passed! Failed: 0, Passed: 35, Skipped: 0, Total: 35
```

### מה כדאי לבדוק בעצמי
- 4 הבדיקות החדשות ב-`TransactionCacheIntegrationTests`: `GetAll_CacheAside_SecondReadServedFromCache` (counter: store נפגע פעם אחת), `GetAll_CacheUnavailable_FallsBackToStore` (fallback), `Process_WriteThrough_ValueVisibleInCache`, `GetById_CacheAside_PopulatesOnce_ThenServedFromCache` (seed → populate → hit).
- `TransactionCache.cs` — hooks של availability ו-best-effort.

### git
- לא נגענו ב-git — השינויים ב-working tree ממתינים לאישורך.

---

## משימה 2.1 — Ingestion API (POST /api/transactions)

**סטטוס:** ✅ הושלם (אומת build+test, 39 בדיקות ירוקות)

### קבצים שנוצרו/שונו
- `src/RTM.Api/Api/TransactionRequest.cs` — (חדש, Api layer) DTO record: 5 שדות (TransactionId/Guid?, Amount/decimal?, Currency/string?, Status/TransactionStatus?, Timestamp/DateTimeOffset?) + DataAnnotations (`[Required]`, `[Range(0, max)]`, `[StringLength(3,3)]`). ה-Service מקבל raw values — לא בונים Transaction ב-API.
- `src/RTM.Api/Api/TransactionEndpoints.cs` — (חדש) Minimal API `MapTransactionEndpoints()`: `POST /api/transactions` → structural validation (DataAnnotations → `Results.ValidationProblem` 400), ואז `service.ProcessAsync(...)` → Success → `Results.Created` 201 + העסקה; Failure → `Results.BadRequest` 400 + message. `ILogger` (LogWarning/Information) על בקשה/השלמה/דחייה; `CancellationToken` מ-RequestAborted.
- `src/RTM.Api/Program.cs` — `ConfigureHttpJsonOptions` עם `JsonStringEnumConverter` (enum כ-string ב-JSON); `app.MapTransactionEndpoints()`.
- `tests/RTM.Tests/RTM.Tests.csproj` — הוספת `Microsoft.AspNetCore.Mvc.Testing`.
- `tests/RTM.Tests/Api/TransactionIngestionApiTests.cs` — (חדש) 4 Integration Tests על `WebApplicationFactory<Program>` (שרת אחד משותף).

### בדיקות
1. `Post_ValidPayload_Returns201AndEchoesId` — 201 + body transactionId תואם.
2. `Post_NegativeAmount_Returns400` — amount<0 → 400.
3. `Post_InvalidCurrencyLength_Returns400` — currency≠3 → 400.
4. `Post_MissingFields_Returns400` — body `{}` → 400.

### החלטות / ממצאים
- **JsonStringEnumConverter**: ברירת המחדל של System.Text.Json מפענח enum כמספר; בלי התוסף, `"status":"Pending"` (string) נכשל עם 400. ההחלטה: enabling string-enum ב-JSON — כ convention ידידותי ללקוח ומתאים ל-React-client.
- **Validation כפול**: DataAnnotations מסננים פגמים מבניים (missing/range/length) → 400 מוקדם; ה-`ProcessAsync` (שכבות תחתונות) מאמת חוקים עסקיים (far-future timestamp) → 400. אין `new` של שירות — הכול DI.

### וידוא עצמי שנעשה (Claude — סקירת קוד + בדיקות אוטומטיות)
סקירה עצמית מלאה לפי כללי הארכיטקטורה (Layers, DI, Result pattern, CancellationToken,
Nullable, TreatWarningsAsErrors, היעדר `new` של שירות, Logging, sanity עברית/שמות/כיווניות):
- **Api layer ([TransactionEndpoints.cs](src/RTM.Api/Api/TransactionEndpoints.cs))**: HTTP בלבד → מעביר
  ל-Service; לא נוגע ב-Store/Cache ישירות. Result pattern (IsSuccess/Error) → Created/BadRequest.
  CancellationToken מועבר; Logging (Information/Warning) על כל שלב. ✅
- **DTO ([TransactionRequest.cs](src/RTM.Api/Api/TransactionRequest.cs))**: DataAnnotations תקינים
  ([Required], [Range(0,…)], [StringLength(3,3)]); 5 שדות בלבד — עקבי עם המודל. ✅
- **Service ([TransactionService.cs](src/RTM.Api/Services/TransactionService.cs))**: ערך raw, מאמת חוקים
  עסקיים (far-future timestamp) לפני בניית value object; DI מלא; Result pattern. ✅
- **Program.cs**: רישום שירותים מלא; JsonStringEnumConverter (enum כ-string). ✅
- **סניטי**: לא נדרש תיקון קוד — ה-Tests כבר ירוקים, ללא Warnings.

### פקודות שהורצו בפועל (כולן הצליחו)
```
dotnet restore → All projects are up-to-date
dotnet build   → Build succeeded. 0 Warning(s), 0 Error(s)
dotnet test    → Passed! Failed: 0, Passed: 39, Skipped: 0, Total: 39
```

### מה נותר לאמת ידנית (דורש יד אנושית — לא ניתן לאוטומציה)
- הרצה ידנית עם HTTP אמיתי (לא דרך WebApplicationFactory): להריץ את ה-API (`dotnet run`),
  לשלוח `POST /api/transactions` ב-Postman/curl ולבדוק שהתגובות (201/400) תואמות בסביבה חיה.
- אישור סופי של החלטות שהתקבלו (string-enum convention, Validation כפול).

### git
- לא נגענו ב-git — השינויים ב-working tree ממתינים לאישורך.

---

## משימה 2.2 — SignalR Live Layer

**סטטוס:** ✅ הושלם (אומת build+test, 42 בדיקות ירוקות)

### מה נבנה (החלטה ארכיטקטונית מרכזית)
**פרידת השידור מ-Services ל-Core interface** (אופציה B, לפי החלטתך): במקום להזריק
`IHubContext<TransactionHub>` ישירות ל-`TransactionService` (מה שהופך תלות של Services
ל-Api — סתירה לכלל "Depends-on"), הגדרתי:

| שכבה | קובץ | תפקיד |
|------|------|-------|
| Core/Domain | `Domain/ITransactionBroadcaster.cs` | contract בלבד — `ValueTask<int> BroadcastReceivedAsync(Transaction, ct)`; best-effort (אסור ל-throw). |
| Api | `Api/TransactionHub.cs` | `Hub` עם מתודת client `TransactionReceived`; מונה חיבורים (static, per-process) לטלמטריה. |
| Api | `Api/SignalRTransactionBroadcaster.cs` | מימוש ה-interface ע"י `IHubContext<TransactionHub>` + `ILogger`; שואף Failure → LogWarning + swallow (best-effort). |

**התוצאה:** Services תלוי רק ב-Core (הכיוון הנכון); המימוש (SignalR) חי באפי. בדיקות
יחידה מחליפות ב-fake broadcaster. → SOLID + Depends-on + best-effort.

### שינוי ב-TransactionService (Services layer)
- קונסטרוקטור: נוסף `ITransactionBroadcaster _broadcaster` + `ILogger<TransactionService>` (DI, אין new).
- `ProcessAsync`: אחרי `_store.AddAsync` + `_cache.SetCachedAsync` →
  `await _broadcaster.BroadcastReceivedAsync(transaction, ct)` (ct מועבר) +
  `_logger.LogInformation("Broadcasted ... to {ClientCount} client(s).")`.
- Best-effort מובטח: העסקה נשמרה ב-Store **לפני** השידור — אם השידור נכשל/מבוטל,
  העסקה אינה אובדת (הברודקאסטר לוג Warning ומחזיר 0).

### Program.cs
- `builder.Services.AddSignalR()`.
- `builder.Services.AddSingleton<ITransactionBroadcaster, SignalRTransactionBroadcaster>()`.
- `app.MapHub<TransactionHub>("/hubs/transactions")`.

### בדיקות (TDD — ירק; סה"כ 42)
- `TransactionServiceTests`: ה-constructor עודכן ל-4 ארגומנטים (FakeBroadcaster + NullLogger).
  **2 בדיקות חדשות**: (6b) Process-מוצלח → מתפרסם ל-broadcaster; (6c) Process-שנכשל → לא מתפרסם.
- `TransactionCacheIntegrationTests`: ה-constructor עודכן (NullBroadcaster).
- `TransactionIngestionApiTests`: **בדיקה חדשה** `Hub_Negotiate_ReturnsConnection` —
  `POST /hubs/transactions/negotiate?negotiateVersion=1` → 200 + connectionId (מאשר שה-hub ממופה; ללא client חי).

### ממצא/תיקון בתהליך (Red→Green)
- הניסיון הראשוני עם `GET /hubs/transactions/negotiate` החזיר `405 MethodNotAllowed` —
  ברירת מחדל של SignalR דורשת **POST** ל-negotiation. תוקן ב-`POST`. (חשוב ל-client של משימה 3.3.)

### החלטות / הערות
- **מונה החיבורים** (`TransactionHub.ConnectedClients`) הוא **לכל-תהליך** בכוונה:
  עם עיצוב PowerDuplication (5 מופעים, docs/ADR.md) כל מופע מדווח מניינו — לא count
  cluster-wide. טלמטריה בלבד.
- **Cancellation בשידור:** לתפוס `OperationCanceledException` בברודקאסטר (סימן של ביטול בקשת)
  → LogWarning + swallow — לא פוגע ב-Result של ingestion. העסקה בשום מקרה לא אבודה.

### וידוא עצמי (Claude) — build/test הורצו בפועל, ירוק
```
dotnet restore → All projects are up-to-date
dotnet build   → Build succeeded. 0 Warning(s), 0 Error(s)
dotnet test    → Passed! Failed: 0, Passed: 42, Skipped: 0, Total: 42
```
סקירה עצמית: Layers תקינה (Api→Services→Core); DI מלא (אין `new` של שירות); CancellationToken
ב-I/O; Result pattern; Nullable+TreatWarningsAsErrors; Logging ב-ingestion+שידור; sanity עברית.

### מה נותר לאמת ידנית (לא ניתן לאוטומציה)
- **חיבור WebSocket אמיתי** ל-`/hubs/transactions` עם לקוח SignalR חי (client `.ts`/JS) —
  יאשר קבלת שידורים חיים. ⚠️ נדחה למשימה 3.3 (monitor client), כפי שתוכנן.
- הרצת `dotnet run` ובדיקת POST חי (201/400) עם Postman ב-HTTP אמיתי.
- אישור סופי: בחירת אופציה B (interface) — מומלצת.

### git
- לא נגענו ב-git — השינויים (משימה 2.2) ב-working tree ממתינים לאישורך.

---

## אימות ידני (2.1 + 2.2) — 🔎 הורץ בפועל ע"י Claude (ריצה חיה)

**ריצה בפועל של ה-API (לא דרך WebApplicationFactory):**

```
dotnet run --project src/RTM.Api --no-build  (ASPNETCORE_URLS=http://localhost:5248)
→ Now listening on: http://localhost:5248
```

### תוצאות ה-POST החי
| בדיקה | משלוח | תוצאה |
|-------|-------|-------|
| עסקה תקינה (`amount=150.75`, `status=Pending`) | `POST /api/transactions` | ✅ **201 Created** — גוף: `{"transactionId":"11111111-...","amount":150.75,"currency":"USD","status":"Pending","timestamp":"2026-08-20T20:38:12+00:00"}` |
| עסקה לא-תקינה (`amount=-5`) | `POST /api/transactions` | ✅ **400 Bad Request** (ValidationProblem) |

### SignalR negotiation (hub חי)
`POST /hubs/transactions/negotiate?negotiateVersion=1` → ✅ **200** עם
`connectionId: "As2NRV0osA42T8U5JmqIQw"` + `availableTransports:[WebSockets, SSE, LongPolling]`.
→ מאשר שה-`TransactionHub` רשום וממונה בחיים.

### סיום
- השרת הופסק (Ctrl+C) — פורט 5248 שוחרר (אומת: "Port 5248 free").

### הערות
- ריצה ב-**http://localhost:5248** (פרופיל `http`, בלי HTTPS/307 ו-cert נכנס — פשוט יותר ל-Ops).
- ה-POST התקין השקיע עסקה אמיתית בסטור הזיכרון של השרת (מופע חד-פעמי; לא נשמר בין ריצות).
- ההגדרה אמתית ב-PowerShell: הקובץ `TransactionIngestionApiTests` כבר אימת את 201/400 ב-integration; הריצה החיה מעלה את אותו אישור בסביבה אמיתית.

### git
- לא נגענו ב-git — הכול ב-working tree ממתין לאישורך.

### ❗ STOP
- **לא עוברים ל-2.3 עד אישורך.**

---

## משימה 2.3 — היסטוריה מהקאש על חיבור (cache-backed history on connect) ✅

**מטרה:** לקוח שמתחבר ל-`TransactionHub` מקבל מיד את העסקאות הקיימות
(`InitialTransactions`) מהקאש — לא מתחיל ריק.

### מה בוצע
- **`src/RTM.Api/Api/TransactionHub.cs`**
  - נוסף ctor עם `ITransactionService` (הזרקת DI — ה-Hub לא נוגע ב-Store/קאש ישירות).
  - `OnConnectedAsync` מוגדל לאסינכרוני: קורא `_service.GetAllAsync()` ושולח ל
    `Clients.Caller.SendAsync("InitialTransactions", history.Value)`.
  - `GetAllAsync` כבר ממושה כ-cache-aside (קאש כש-Redis פעיל → miss → Store → populate) —
    אין שינוי ל-service; הקאש מספק את ההיסטוריה כאשר Redis מחובר (via `ITransactionCache.IsAvailable`).
  - ה-handoff הוא **best-effort**: try/catch על נתיב כשל/ביטול כדי שהחיבור עצמו לא ייסגר בגלל קריאת היסטוריה שנכשלה.

### TDD (Red → Green)
1. **Red:** נכתבו 2 בדיקות ב-`tests/RTM.Tests/Api/TransactionHubTests.cs` נגד ctor+`OnConnectedAsync` שלא קיימים — ריצה ראשונה נכשלה (אין ctor שלוקח `ITransactionService`).
   - `OnConnected_ExistingHistory_SendsInitialTransactionsToCaller` — קליינט שמתחבר מקבל `InitialTransactions` עם שתי העסקאות.
   - `OnConnected_NoHistory_SendsEmptyInitialTransactions` — קליינט בלי היסטוריה מקבל רשימה ריקה (החוזה מפורש).
   - Fakes: `FakeService` (ITransactionService), `RecordingProxy` (IClientProxy — לוכד method+args), `FakeCallerClients` (IHubCallerClients).
2. **Green:** יישמתי את ה-ctor + `OnConnectedAsync` ב-Hub → `dotnet test` ירוק.

### וידוא עצמי (Claude) — build/test הורצו בפועל, ירוק
```
dotnet restore → All projects are up-to-date
dotnet build   → Build succeeded. 0 Warning(s), 0 Error(s)
dotnet test    → Passed! Failed: 0, Passed: 44, Skipped: 0, Total: 44   (42 קיימים + 2 חדשים)
```
סקירה עצמית (*code review*):
- **Layers:** Api(Hub) → Services(`ITransactionService`) → Core. אין גישה ישירה ל-Store/קאש מה-Hub. ✅
- **DI:** `ITransactionService` מוזרק דרך ctor — אין `new` של שירות. ✅ (SignalR פותר את ה-Hub מ-DI כשמתחבר קליינט.)
- **Result pattern:** ההיסטוריה נבדקת ב-`IsSuccess` לפני שליחה. ✅
- **CancellationToken:** `GetAllAsync(CancellationToken.None)` — חוזה ה-handoff של החיבור לא מעביר token אחר. ✅
- **Best-effort:** קריאת היסטוריה כושלת לא קורעת את החיבור — consistent עם תבנית הברודקאסט הקיים. ✅
- **Nullable + TreatWarningsAsErrors:** build נקי — `history.Value` בטוח כשהדרך `IsSuccess`. ✅
- **Sanity:** שמות, שפות, כיווניות עברית תקינים. ✅

### קבצים
- ✏️ `src/RTM.Api/Api/TransactionHub.cs` — ctor DI + history handoff ב-OnConnectedAsync.
- 🆕 `tests/RTM.Tests/Api/TransactionHubTests.cs` — 2 בדיקות TDD (Red→Green).

### שאלה לארכיטקטורה / החלטות
- **Cancellation:** בחרתי `CancellationToken.None` ב-handoff (אין token של "הקליינט המתחבר" שנמסר ל-OnConnectedAsync בחיים). אם תרצו ביטול חיצוני — ניתן להעביר token של `HttpContext.RequestAborted` בסביבת WebSocket; נותר פתוח.

### git
- לא נגענו ב-git — השינויים (משימה 2.3) ב-working tree ממתינים לאישורך.

### ❗ STOP
- **עצירה לצורך אישורך:** כחלק מההידר-מטלה 2.3 הושלם וירוק (44/44). לא עוברים הלאה עד אישורך.
