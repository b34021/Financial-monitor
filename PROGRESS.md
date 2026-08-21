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

---

## משימה: חוקי כתיבה ל-`client/` + הפיכתם לאכיפיים (AGENTS.md + רפקטור)

### מה נעשה
1. **`client/AGENTS.md`** (חדש) — קובץ כללים (RULES) ייעודי לקליינט, 10 כללים:
   1) קומפוננטה ≤150 שורות; 2) חלוקה לפי נושא (edit/add בקומפוננטה אחת, תצוגה×הוספה בשתיים);
   3) קריאות שרת בתיקיית `services/`; 4) תגיות חוזרות → קומפוננטה משותפת; 5) שמות ברורים;
   6) כל קריאות שרת → axios + @tanstack/react-query (SignalR = חריג מוצהר); 7) React Router v7
   `createBrowserRouter`+`RouterProvider` עם `Outlet`; 8) אסור `any` (עם חריג `step="any"` HTML);
   9) מודלים בתיקיית `types/`; 10) טפסים → react-hook-form + zod.
   - הערות/יחידות: UI באנגלית בלבד; SignalR חריג לכלל 6.
2. **`CLAUDE.md`** — נוספה הפניה קצרה ל-`client/AGENTS.md` (במקום לשפוך תוכן).
3. **תלויות חדשות** ב-`client`: `axios`, `@tanstack/react-query`, `react-hook-form`, `zod`, `@hookform/resolvers`.
4. **רפקטור `services/api.ts`** — fetch → axios (instance + baseURL), חילוץ הודעת שגיאה אנושית מ-400, שמירה על `SIGNALR_HUB_URL`.
5. **`client/src/hooks/useIngestTransaction.ts`** (חדש) — tanstack-query `useMutation` עוטף את הקריאה + invalidation.
6. **`pages/AddPage.tsx`** — עבר ל-`react-hook-form` + `zodResolver` (schema עם amount-refine), + ה-hook החדש (isPending/error/result מ-React Query במקום try/catch ידני). UI באנגלית.
7. **`main.tsx`** — מעבר מ-`<BrowserRouter><Routes>` ל-**`createBrowserRouter`+`RouterProvider`** + `QueryClientProvider`.
8. **אכיפת no-`any`**: `tsconfig.app.json` ← `strict`+`noImplicitAny`; `.oxlintrc.json` ← `typescript/no-explicit-any: error`.
9. **`index.html`** ← `lang="en" dir="ltr"`; **`App.tsx`/`MonitorPage.tsx`/`index.css`** ← ממשק באנגלית בלבד (ללא עברית).

### וידוא עצמי (Claude) — build/lint הורצו בפועל, ירוק
```
cd client
npm install → added 33 packages, audited 82, 0 vulnerabilities
npm run build → ✓ built in ~1.5s (tsc -b && vite) — 0 errors
npm run lint  → oxlint — 0 errors (כולל typescript/no-explicit-any)
```
> הערת build: אזהרה על chunk >500 kB (React+Router+React Query+axios bundled) — לא בלוק ביצוע.

### code review עצמי
- **קריאות שרת**: רק דרך `services/api.ts` (axios) + ה-hook; אין fetch/Axios פזורים בעמודים. ✅
- **SignalR** (ערוץ live) נשאר ב-`signalR.ts` כ-`@microsoft/signalr` — חריג מתועד לכלל 6. ✅
- **אין `any` בקוד** (ה-schema עם `z.string().refine` נמנע מ-`z.coerce` שעורר `any` ב-RHF). ✅
- **UI אנגלית בלבד** — 0 תווים עבריים ב-tsx/ts/html (נבדק ע"י ripgrep). ✅
- **RHF+zod**: schema טיפוסי (z.infer), שגיאות per-field מוצגות. `step="any"` = ערך HTML חוקי, לא הפרה. ✅
- **ראאוטר**: `createBrowserRouter`+`RouterProvider` במבנה יחיד; `App.tsx` מספק `Outlet`. ✅

### קבצים
- 🆕 `client/AGENTS.md` — 10 כללי הכתיבה.
- 🆕 `client/src/hooks/useIngestTransaction.ts` — mutation hook.
- ✏️ `client/src/services/api.ts` — fetch → axios.
- ✏️ `client/src/pages/AddPage.tsx` — RHF+zod + hook (UI אנגלית).
- ✏️ `client/src/main.tsx` — createBrowserRouter + QueryClientProvider.
- ✏️ `client/src/App.tsx`, `client/src/pages/MonitorPage.tsx`, `client/src/index.css`, `client/index.html` — ממשק אנגלית.
- ✏️ `client/tsconfig.app.json` (strict+noImplicitAny), `client/.oxlintrc.json` (no-explicit-any).
- ✏️ `client/package.json`/`package-lock.json` — 5 תלויות חדשות.
- ✏️ `CLAUDE.md` — הפניה ל-`client/AGENTS.md`.

### git
- לא בוצע git add/commit/push — השינויים ב-working tree ממתינים לאישורך.

### ❗ STOP
- **עצירה לצורך אישורך:** המשימה הושלמה וירוק (build+lint). נתבקש לבדוק, ואם מאשרים — להחליט על git.

---

## משימה 3.2 — סימולטור עסקאות (/add) — השלמת עמידה בדרישות ✅

**מטרה:** ודא שדף ה-/add (הסימולטור) עומד בכל דרישות 3.2: מודל TS תואם 5 שדות,
Layers (client→API בלבד), strict TS, Cancellation/abort, סטטוס UX מינימלי OK/Error.
חלק הארי כבר נבנה ב-3.1 (axios+useMutation+RHF+zod); הפער שהושלם עכשיו: **Cancellation**.

### פער שאותר והשלמתו
- **react-query v5 אינה מוסרת `AbortSignal` ל-mutationFn** (בניגוד ל-queryFn) — ה-signature
  של mutationFn context הוא `{client, meta, mutationKey}`, ללא `signal`. אומת ע"י בדיקת
  ה-d.ts של `@tanstack/query-core` המותקן (v5.101.4).
- **פתרון:** ה-hook `useIngestTransaction` מחזיק `AbortController` ב-`useRef`:
  - re-submit מבטל את ה-request הקודם (`abortRef.current?.abort()` בפתיחת mutationFn).
  - `useEffect` cleanup על unmount של העמוד מבטל request תלוי-אוויר.
  - ה-signal מועבר אל `ingestTransaction(payload, signal)` → axios `{ signal }`.
- **`api.ts`:** `ingestTransaction` קיבל `signal` אופציונלי; axios cancel → נזרק
  `DOMException('Aborted','AbortError')` כדי שהקורא יזהה ביטול כ-Deferred-error, לא כ-failure.
- **`AddPage.tsx`:** `isAborted` (name === 'AbortError') מסונן — ביטול אינו מרנדר הודעת error.

### קבצים
- ✏️ `client/src/services/api.ts` — `ingestTransaction(payload, signal?)` + axios cancel → AbortError.
- ✏️ `client/src/hooks/useIngestTransaction.ts` — AbortController (useRef) + cleanup on unmount; תיעוד מדויק.
- ✏️ `client/src/pages/AddPage.tsx` — סינון AbortError מה-UI.

### וידוא עצמי (Claude) — build/lint הורצו בפועל, ירוק
```
npm run build → ✓ tsc -b && vite build — 0 errors (אזהרת chunk>500kB בלבד, אינה בלוק)
npm run lint  → ✓ oxlint — 0 בעיות (כולל typescript/no-explicit-any)
```

### code review עצמי
- **Layers:** AddPage → hook → services/api.ts. אין fetch/Axios ישירים בעמוד. ✅
- **strict TS / no-any:** build+lint ירוק. המודל (`types/transaction.ts`) = 5 שדות זהים לשרת. ✅
- **Cancellation:** double-submit + unmount בטוחים (AbortController ב-useRef). ✅
- **UX:** notice OK (persisted echo) / Error (מסר backend מ-400); ביטול שקט. ✅

### git
- לא בוצע git add/commit — השינויים (משימה 3.2) ב-working tree ממתינים לאישורך.

### ❗ STOP
- **עצירה לצורך אישורך:** 3.2 הושלם וירוק (build+lint). לא עוברים הלאה עד אישורך (git/המשך).

---

## משימה 3.3 — המוניטור החי (/monitor) — השלמה ✅

**מטרה:** דף /monitor שמתחבר ל-SignalR hub (`/hubs/transactions`), מקבל היסטוריה
(`InitialTransactions`) ועסקאות חדשות (`TransactionReceived`) בזמן-אמת, עם:
סטטוסים צבעוניים, toggle "Show only errors", ביצועים (cap/limit), ואנימציה קלה
(Enhanced UI = חובה).

### החלטת ביצועים — **cap/limit (200) נבחר** על פני virtualization
- מטרת הפרויקט: עד כ-100 עסקאות בלי הקפאה; cap פשוט ובטוח — `MAX_TRANSACTIONS=200`.
- **Smart update:** `setTransactions((prev) => …)` — functional update רק מוסיף ראש חדש,
  לא מעצב מחדש את שאר הרשימה; האלמנטים הקיימים נשארים intact (React לא מרנדר אותם מחדש).
- מיון לפי `timestamp` (desc) בכל עדכון — שומר שהסדר תקין גם אם אירועים מגיעים לא-בסדר.
- Virtualization הושאר כתובה להגדלת עומס עתידית — לא נדרש לנו כעת (כלל: הפתרון הפשוט ביותר).

### ארכיטקטורת הקוד — הפרדת לוגיקה מהעמוד
- **`hooks/useLiveTransactions.ts`** (🆕) — בעל הרשימה (useState), החיבור (SignalR + `useRef`
  + cleanup על unmount), מיון, cap 200, ואת ה-filter state. מחזיר `{transactions, totalCount,
  connectionState, showOnlyFailed, toggleFailedOnly}`. העמוד לא מחזיק שום רשת.
- **`components/ErrorFilterToggle.tsx`** (🆕) — checkbox "Show only errors".
- **`pages/MonitorPage.tsx`** (✏️) — 49 שורות (≤150): קורא ל-hook ולרכיבים בלבד;
  ללא fetch, ללא try/catch, ללא `any`. Pill חיבור (connecting/connected/failed).
- **`services/signalR.ts`** (קיים, מושאר) — `TransactionHubClient` עם `withAutomaticReconnect()`
  (reconnect אוטומטי), `conn.on('InitialTransactions'/'TransactionReceived')`, `start()`/`dispose()`.
  **SignalR = החריג המוצהר** לכלל axios/react-query (AGENTS).
- **`components/StatusBadge.tsx`** (קיים, מנוצל ע"י TransactionCard) — Pending(warn)/Completed(ok)/Failed(bad).
- **`index.css`** (✏️) — אנימציה `@keyframes tx-enter` על `.tx-card` (fade+slide+scale, 0.28s),
  רצה רק ב-mount של צומת חדש (רק עסקה חדשה מתעוררת); סגנון `.filter`.

### קבצים
- 🆕 `client/src/hooks/useLiveTransactions.ts`
- 🆕 `client/src/components/ErrorFilterToggle.tsx`
- ✏️ `client/src/pages/MonitorPage.tsx` (49 שורות)
- ✏️ `client/src/index.css` (אנימציה tx-enter + filter)
- (קיים, ללא שינוי) `client/src/services/signalR.ts`, `client/src/components/StatusBadge.tsx`,
  `client/src/components/TransactionCard.tsx`

### וידוא עצמי (Claude) — build/lint הורצו בפועל, ירוק
```
npm run build → ✓ tsc -b && vite build — 0 errors (אזהרת chunk>500kB בלבד, אינה בלוק)
npm run lint  → ✓ oxlint — 0 בעיות (כולל typescript/no-explicit-any)
```

### code review עצמי
- **Layers:** MonitorPage → hook → services/signalR.ts; אין רשת ישירה בעמוד. ✅
- **strict TS / no-any:** build+lint ירוק. ✅
- **SignalR cleanup:** dispose על unmount (disposed guard) + reconnect אוטומטי. ✅
- **Filter:** "Show only errors" מסנן רק `Failed`, עם counter ("received (errors only)"). ✅
- **אנימציה:** ייחודית לחדש, כברירת מחדל למסך, קלה (0.28s). ✅
- **English UI** (כלל AGENTS). ✅

### git
- לא בוצע git add/commit — השינויים (משימה 3.3) ב-working tree ממתינים לאישורך.

### ❗ STOP
- **עצירה לצורך אישורך:** 3.3 הושלם וירוק (build+lint). לא עוברים הלאה עד אישורך (git/המשך).

---

## משימה 3.4 — בדיקות סופיות ואימות מלא (End-to-End) ✅

**מטרה:** לוודא ש-backend (1.0–2.3) + frontend (3.1–3.3) עומדים בנטל הסופי, ושהחיבור
HD-to-HD מתועד כהוראות אקטיביות למשתמש. אוטומציה לכמה שיותר, הוראות ידניות מפורטות.

### א) אימות Backend — הורצה בפועל, ירוק
```
dotnet restore → ✓ All projects up-to-date
dotnet build   → ✓ Build succeeded. 0 Warning(s), 0 Error(s)
dotnet test    → ✓ Passed: 44, Failed: 0, Skipped: 0, Total: 44 (RTM.Tests, 4s)
```
- **0 warnings** ← TreatWarningsAsErrors פעיל, ואין אזהרות כלל.

### ב) אימות Frontend — הורצה בפועל, ירוק
```
cd client
npm run build → ✓ tsc -b && vite build — 0 errors
                (אזהרת chunk>500kB בלבד מ-SignalR bundle, אינה בלוק)
npm run lint  → ✓ oxlint — 0 בעיות (כולל typescript/no-explicit-any)
```
- **Test script:** אין. לא קיים `test` ב-package.json ואין קבצי `*.test.*`/`*.spec.*`
  (אין vitest/jest מותקן). לפי 3.4 — לא נוסף בעצמי; ממתין להחלטתך אם להקים מערך בדיקות UI.

### ג) בדיקת אינטגרציה HD-to-HD — הוראות אקטיביות למשתמש (לא הורצה ע"י Claude)
**פורטים:** Backend http-profile `http://localhost:5248`; Vite dev `http://localhost:5173`
(proxy: `/api`+`/hubs` עוברים אל `:5248`). **Cache-backed history** עובד דרך
`InitialTransactions` על connect.

**להרצה מפורטת (Terminals נפרדים):**
1. **Terminal 1 — backend:** `dotnet run --project src/RTM.Api` (התחל מ-root project; ישתמש
   בprofile http → `http://localhost:5248`, יפתח swagger).
2. **Terminal 2 — client:** `cd client && npm run dev` (→ `http://localhost:5173`).

**תרחיש הבדיקה:**
- פתח `http://localhost:5173/add` — מלא Amount/Currency/Status, שלח 3–4 עסקאות מעורבות
  (כולל לפחות אחת עם status = Failed).
- פתח כרטיסייה חדשה `http://localhost:5173/monitor`:
  - ראה את העסקאות מופיעות **חיות** (כולל צבעי הבאדג' Pending/Completed/Failed ואנימציית הכניסה).
  - הדלק toggle **"Show only errors"** → רק ה-Failed נשארו.
- **וריאנט היסטוריה:** סגור את /monitor ופתח שוב — העסקאות שמורות מגיעות מייד
  (InitialTransactions מהקאש), גם בלי לשלוח חדשות.

**תוצאות HD-to-HD:** השלם את הצעדים הללו (הוראות אקטיביות לעיל), ואז עדכן את
רשומה זו או FYI למשתמש. עד אז — מצב זה מתועד כ"**ממתין אישור המשתמש לבצע**"
(בדיקה HD-to-HD דורשת סביבה אנושית בלבד: פתיחת דפדפן + התבוננות ב-UI חי).

### ד) סקירת שרידות (sanity) ✅
- **PROGRESS.md** — מעודכן ברשומה זו (ורשומות 3.1–3.3 קודם).
- **CLAUDE.md** — מעודכן, כולל חוקי cloud-ready/Docker/K8s/README/ADR (ל-3.5 הפתוח).
- **.gitignore** — מכסה: `bin/`, `obj/`, `node_modules/`, `dist/` (וגם `.vs/`, `.vite/`). ✅

### git
- לא בוצע git add/commit — השינויים (רשומת 3.4 ב-PROGRESS.md) ב-working tree ממתינים לאישורך.

### ❗ STOP
- **עצירה לצורך אישורך:** 3.4 אומת ירוק (build/test/lint). לא עוברים ל-3.5 (Cloud) בלי אישורך.
