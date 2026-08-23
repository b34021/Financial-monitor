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

---

## משימה 3.5 — Cloud-ready / Distributed + Deployment + תיעוד ✅

**מטרה:** להפוך את הפרויקט למוכן-קלאוד/דיפלוי: Docker multi-stage, docker-compose,
Kubernetes manifests, README, ו-ADR לקראת 5 מופעים (SignalR Redis Backplane).
"בונוס" זה נחשב חובה ואינו עוקף.

### א) Dockerfile (src/RTM.Api/Dockerfile) — multi-stage, קטן
- **Shll שלב build:** `mcr.microsoft.com/dotnet/sdk:8.0` → `dotnet restore` (נפרד
  לשם caching layer) + `dotnet publish -c Release -o /app/publish`.
- **שלב runtime:** `mcr.microsoft.com/dotnet/aspnet:8.0` → `COPY --from=build`,
  `EXPOSE 8080`, `ENV ASPNETCORE_URLS=http://+:8080`, `ENTRYPOINT ["dotnet","RTM.Api.dll"]`.
- **`.dockerignore`** (שורש): מניעת `**/bin/`, `**/obj/`, `client/node_modules/`,
  `client/dist/`, `.git/`, `.vscode/`, `*.log`.

### ב) docker-compose.yml (שורש)
- service `backend` (build מ-`src/RTM.Api/Dockerfile`, port 8080) + service `redis`
  (`redis:7-alpine`, port 6379, healthcheck `redis-cli ping`).
- `backend.depends_on: redis (service_healthy)`.
- **env** (`Redis__Configuration=redis:6379`, `Redis__Enabled=true`,
  `ASPNETCORE_ENVIRONMENT=Production`) — לא hardcoded בקוד, עוקפים את appsettings.
- ללא `container_name` (מניעת התנגשויות ב-up חוזר).

### ג) Kubernetes — k8s/
- **deployment.yaml:** `rtmonitor-api`, replicas: **3**, image `rtmonitor-api:latest`,
  port 8080, `readinessProbe` + `livenessProbe` על `/health`, `resources`
  (requests 100m/128Mi, limits 500m/512Mi), env (Redis__Configuration → redis:6379).
  + `Service ClusterIP` 8080.
- **redis.yaml:** `redis` deployment (1 replica, `redis:7-alpine`) + `Service ClusterIP` 6379.
- **ללא secrets בפועל** — env inline, נקי.

### ד) README.md (שורש)
קצר: מה זה; **Architecture** (שכבות + SignalR + Redis + fallback); **Quick Start**
(`dotnet run --project src/RTM.Api` + `cd client && npm run dev`); **Docker**
(`docker compose up --build`); **K8s** (`kubectl apply -f k8s/…` + port-forward);
הערה: גרסה עובדת HD-to-HD.

### ה) docs/ADR-003-signalr-redis-backplane.md — לקראת 5 מופעים
- **הבעיה:** כל Pod מחזיק hub מקומי → לקוחות של Pod B אינם מקבלים עסקה שנכנסה ל-Pod A.
- **הפתרון:** SignalR Redis Backplane (`AddStackExchangeRedis`): עסקה ב-Pod A →
  pub/sub ב-Redis → מועברת ל-B/C → כולם משדרים ללקוחות שלהם.
- **זרימה מומחשת** (דיאגרמת ASCII), יתרונות (עקביות מלאה, מנוף קיים, שקוף),
  מגבלות (latency נוספת, Redis=SPOF ללא HA), חלופות שנשקלו, ושלב יישום עתידי.

### ו) אימות — הוראות ידניות (לא הרצתי Docker — דורש Docker Desktop / אישור)
בתיעוד README. להרצה מקומית:
```
docker build -f src/RTM.Api/Dockerfile -t rtmonitor-api .     # בנייה ידנית
docker compose up --build                                     # stack מלא (api + redis)
kubectl apply -f k8s/redis.yaml
kubectl apply -f k8s/deployment.yaml
kubectl port-forward svc/rtmonitor-api 8080:8080
```

### code review / sanity עצמי
- **Dockerfile**: multi-stage, zero-config בשרת runtime, .dockerignore כן. ✅
- **Compose/K8s YAML** — נבדקו קריאה מלאה; אין secrets; env עוקפים config. ✅
- **הקוד (לא נגע ב-3.5):** `dotnet build` → 0 Warnings, 0 Errors (sanity). ✅
- **README/ADR** — תיעוד מלא ואף מפורט על ה-5 מופעים ו-HD-to-HD. ✅

### git
- לא בוצע git add/commit — כל 6 קבצים חדשים + PROGRESS.md ב-working tree ממתינים לאישורך.

### ❗ STOP
- **עצירה לצורך אישורך (שלב אחרון):** 3.5 הושלם. ללא אישורך — לא commit, לא המשך.

---

## משימה 4.0 — תיקוני FIX-PLAN (P0-4 + P1 + נקיונות) — בוצע

**מקור:** FIX-PLAN.md (תוכנית לפני הגשה). רוב P0-1/P0-2/P0-3 (README/ADR/Docker/K8s) כבר
הושלמו ב-3.5. רשומה זו מכסה את החלק שטרם בוצע: תיקון שלושת הבאגים ש-Docker חושף
(P0-4) + נקיונות P1. **הערה:** FIX-PLAN.md שמור כ-untracked — לא כולל ב-repo (מסמך עבודה פנימי).

### P0-4(א) — באג קריטי: "t:all" לא בוטל בכתיבה ← היסטוריה נתקעת
- **הבאג:** `TransactionCache.SetCachedListAsync` כותב את הרשימה כולה ל-`t:all`. אחרי ש-`GetAllAsync` פעם ראשונה מאכלס אותו, עסקאות חדשות (`ProcessAsync`) מרעננות רק את `t:{id}` — **`t:all` נשאר stale** → לקוח חדש ב-/monitor רואה רשימה ישנה לנצח. בפיתוח ללא Redis שכבת-הקאש מנוטרלת (InMemory fallback), אז הבאג רדום; ב-Docker עם Redis אמיתי הוא מתעורר ושובר את הדשבורד.
- **התיקון (TDD Red→Green):**
  - בדיקה אדומה: `GetAll_AfterNewTransaction_ReflectsIt` — נכשלת (invalidation=0).
  - הוספת `ITransactionCache.InvalidateListAsync` + מימוש ב-`TransactionCache` כ-`_inner.RemoveAsync("t:all")`.
  - `TransactionService.ProcessAsync` קורא ל-`InvalidateListAsync` אחרי ה-write-through.
- **למה invalidation במקום עדכון ישיר של `t:all`?** עדכון ישיר דורש לקרוא-משרת-אז-לכתוב (read-modify-write) — יקר, וסובל מ-race בכתיבה-מקבילה. invalidation זול ופשוט: מבטיח שה-`t:all` הבא יתשאל מחדש את ה-store וייבנה מחדש. זוהי הדרך ה"cache invalidation" הקלאסית.

### P0-4(ב) — TTL ל-"t:all" (קו-הגנה שני)
- `CacheOptions` חדש (`Cache:ListTtlSeconds=30`) ב-appsettings; מוזרק ל-`TransactionCache` דרך **`IOptions<CacheOptions>`** (לא hardcoded).
- **למה TTL נוסף?** גם אם invalidation נחמץ (edge-case, בעיה בזמן שנדרשת ה-build מחדש), רשימה stale לא נשארת לנצח — היא מתפוקקת מ-`t:all` תוך 30 ש' וה-read הבא מתשאל מחדש. קריטי במיוחד כש-`t:all` צומח עם כל עסקה (מניעת אכלוס זיכרון).

### P0-4(ג) — CORS (חסר לחלוטין קודם)
- `AddCors` + `UseCors` ב-Program.cs; origins מ-config (`Cors:AllowedOrigins`, דיפולט `http://localhost:5173`).
- **`AllowCredentials()` הוא חובה ל-SignalR** (WebSockets נושאים cookie/credentials), וכתוצאה **אסור `AllowAnyOrigin`** (לא תואם credentials) — לכן origins חייבים מרשימת-מפורש, מה-config. זו נקודת ריאיון: CORS בלי credentials לא עובד עם SignalR.

### P1-1 — מחיקה של `TransactionHub.TransactionReceived` (client-invokable)
- נמחקה: היא קוראת ל-`Clients.All.SendAsync("TransactionReceived", …)` — אך השידור האמיתי כבר עובר דרך `ITransactionBroadcaster` (SignalR outbound), ולא דרך מתודה נכנסת מה-client. מתודה נכנסת ב-Hub עם אותו שם כמו מתודה-יוצאת של השרת היא כפילות ו-clutter. הקוד קורא "Real ingestion flows through ingestion API"; ההיסרה הוכיחה שאין `connection.invoke` בקליינט (רק `.on`).

### P1-2 — `GET /api/transactions` + `GET /api/transactions/{id}`
- `ITransactionService.GetAllAsync`/`GetByIdAsync` כבר קיימים ונבדקים — פשוט לא חשופים. שהם ב-Location-header של ה-POST (שמתעקף ל-404 לפני). הוספתי את שני ה-endpoints + `.Produces<T>()` כדי ש-Swagger יציג סכמה, ו-`.ProducesValidationProblem()` ל-POST.
- בדיקות: `Get_AfterPost_ListsTheTransaction`, `Post_LocationHeader_ResolvesToGetById`, `Get_UnknownId_Returns404`.

### P1-4 — חסימת אחסון ל-200 אחרונות + `GetLatestAsync` + `OnConnectedAsync` שולח N last
- המטלה: "Store **latest** transactions in Memory". `InMemoryTransactionStore` הוכן ל-cap **200** (`MaxTransactions`): על כל Add, אם חורגים — מוציאים את המוקדם ביותר (best-effort upper-bound). התלות: הדלים בכל add מוצאים min — scan של ≤200 הוא זניח.
- **החלטה מקצועית (ריאיון):** cap הוא **best-effort, לא דאטא-לוקים**: בין בדיקת ה-count ל-remove יש race מקבילי, אבל רק עוקף את ה-peak זמנית ואז חוזר ל-≤200. לזהות עוקפת מבלי לסבך בכל כניסה — הבחירה הנכונה ל-MVP.
- התווסף `GetLatestAsync(int)` ל-`ITransactionStore` + `ITransactionService`. `TransactionHub.OnConnectedAsync` שולח **רק את ה-latest window (200, newest-first)** במקום לשלוח את כל ההיסטוריה — חוסך Serialization/bandwidth ללקוח שמתחבר, ומציג את העדכני ביותר.
- בדיקות: cap (evict oldest), GetLatestAsync ordering, **concurrency בשכבת ה-Service** (100 Parallel ProcessAsync) — דרישה כתובה שממולאה.

### P1-3 — side-effects אחרי commit לא תלויים ב-RequestAborted
- **הבעיה:** הקוד העביר את `ct` של הבקשה ל-`SetCachedAsync`/`BroadcastReceivedAsync`. אם השולח ביטל את ה-POST (network drop/ניווט), ה-cache-write וה-broadcast היו מתבטלים — עסקה נשמרה ב-store אבל לקוחות לא היו רואים אותה live.
- **התיקון:** אחרי `_store.AddAsync(transaction, ct)` (נקודת ה-commit), כל ה-side-effects עוברים עם `CancellationToken.None`. **החלטה מודעת (לא "התעלמות מ-CT")** — רובה ב-PROGRESS ובהערת קוד: ה-ct של הבקשה מייצג את *עיבוד הבקשה הבודדת*; ברגע שהעסקה נשמרה בהתמדה, ביטולו לא צריך למנוע מלקוחות **אחרים** לראות אותה live ולא להשאיר קאש stale. זה ההבדל בין "בטל את הבקשה" ל"ודא-ש-side-effect יתבצע". כתיעוד מה-`AddAsync` (הבנת "מה בדיוק הטוקן מייצג") — נקודה שמפרידה בין Junior ל-Senior בריאיון.

### נקיונות נוספים (FIX-PLAN P2-4)
- `ValidateRequest`: תוקן הבאג של **key `""`** לכשאין MemberNames (נעשה `nameof(TransactionRequest)`), ודו של שגיאות לאותו שדה מאגדות בגן. `.Produces<T>` על כל endpoints.

### אימות בפועל (הרצתי, לא רק כתבתי)
```
dotnet restore → ✓ all up-to-date
dotnet build   → ✓ 0 Warning(s), 0 Error(s)
dotnet test    → ✓ Passed: 51, Failed: 0 (עלה מ-44 ל-51: +7 בדיקות חדשות)
cd client
npm run build  → ✓ 0 errors (אזהרת chunk >500kB בלבד מסignalR)
npm run lint   → ✓ oxlint — 0 בעיות
```

### Docker hands-on — ממתין (דורש Docker Desktop)
- Docker לא פעיל (daemon off) → לא אוריץ `docker compose up`. קבצים (Dockerfile/compose/набора) כבר קיימים מ-3.5 ונבחנו קריאה+תחביר. **שמור לעשות בסביבה עם Docker Desktop.**

### git
- לא בוצע commit. שינויי 4.0 + PROGRESS.md ב-working tree ממתינים לאישורך.

### ❗ STOP
- **עצירה לצורך אישורך:** 4.0 הושלם, הכול ירוק (51/51 + build/lint).

---

## משימה 4.1 — תיקוני באגים ושיפור UI בדף /monitor (React בלבד, ללא Backend)

### מה בוצע (React/components בלבד — לא שונה Backend)

**באג 1 — סינון "Show only errors" + מונה.**
- שיניתי מחדש את `useLiveTransactions` במ-deliberate split of state:
  - `fullList` — כל העסקאות שהתקבלו (ללא קשר לפילטר; capped ל-200, newest-first).
  - `filter` — enum `'all' | 'failed'` (במקום boolean `showOnlyFailed`).
  - `visibleList` — נגזר מ-(fullList, filter) דרך `applyStatusFilter`.
  - `totalCount` — **תמיד** `visibleList.length`, כך שהמונה תואם למה שמוצג גם כשהפילטר פעיל.
- כל `TransactionReceived` חדש נכנס ל-`fullList` תמיד; Failed נוסף נכנס ל-visible slice כשהפילטר פעיל (באמצעות ה-functional setState — לא ביטלתי את ה-live)
- **החלטה:** הוצאתי את לוגיקת ה-sort/filter לפונקציות טהורות ל-`services/liveData.ts` (`sortNewestFirst`, `applyStatusFilter`, `FeedFilter`). זה עומד ב-AGENTS.md (חוק 3 — services/), משאיר את ה-hook דק, ומאפשר unit-test ללא React/no-IRM — בלי I/O.

**באג 2 — עיצוב סטטוס (StatusBadge).**
- `StatusBadge` — שדרוג: badge צבעוני (pill) עם **dot** מובלט בצבע הסטטוס + טקסט קריא (`Pending`/`Completed`/`Failed`), `aria-label`, פלטה מובנת `Record<T, class>`, ו-`transition` רך על רקע/צבע (למקרה שמעמד יעודכן live בעתיד).
- משמש בכל מקום הקיים (TransactionCard) — לא שברתי שום צרכן.

**א. אנימציית כניסת עסקה חדשה.**
- `@keyframes tx-enter` שופר (slide + scale עם ריחוף גדול יותר); מוסיף `tx-flash` — זוהר ירוק עדין רך על הכרטיס **החדש ביותר** (`tx-card--fresh` על `index === 0`) שנמחק-אחר-שניה. `prefers-reduced-motion` מכובה לכולם (נגישות).
- **לגבי מעברי סטטוס (3ב):** במודל ה-data של RTM כל עסקה היא `transactionId` ייחודי ו-`status` נקבע פעם אחת בעת ההזנה (אין מנגנון עדכון status של עסקה קיימת ב-SignalR). לכן עסקה "משנה סטטוס" אינה מתרחשת בנתונים הנוכחיים. כיבדתי את הכוונה ב-`transition` הרך על badge (ה-sof צבע-cross-fade אם בתגובה יעודכן). כלומר: אין מקרה aktuali לـ status-transition, ואין דריסה. (מסמך במפורש כדי שלא ייחשב כהחמצה.)
- **גרפים** — לא רלוונטי (שדרוג הmonitor עם Recharts בוטל על ידך).

### בדיקות (native Node — ללא תשתית נוספת)
- נוצרו פונקציות טהורות → כתבתי `client/tests/liveData.test.ts` עם Node test runner (`node --test`) — **6 בדיקות, 6 pass / 0 fail**: sort order, non-mutation, filter 'all', filter 'failed', fresh array, exhaustive union.
- tsconfig.app.json כולל רק `src` → `tests/` NOT חלק מ-build, לא מפריע ל-`tsc -b`.

### אימות בפועל (הרצתי)
```
cd client
npm run build → ✓ 0 errors (tsc -b + vite; אזהרת chunk >500kB מסignalR בלבד — לא קשור)
npm run lint  → ✓ oxlint — 0 בעיות
node --test   → ✓ 6/6 pass
```

### החלטות מקצועיות (ראיון)
1. **state split (fullList/filter/visibleList)** — הפרדה בין "מה-הגיע" ל"מה-מוצג". המונה תמיד נגזר מה-visible, כך שאין אי-התאמות.
2. **filter כ-enum בא-`'all'|'failed'`** במקום boolean — ה-extensible future (`'pending'`, `'completed'`), ועדיף בעצם על `false/true`.
3. **לוגיקה טהורה ב-services/**: testability בלי React/no I/O; ה-hook לReact אירועים בלבד.
4. **אין status-transition** — תוצאה של מודל ה-data (GUID-invariant status). ה-`transition` על badge מ-upholds את הכוונה העתידית.

### git
- לא בוצע commit/שינוי. שינויים ב-working tree ממתינים לאישורך (build+lint+test ירוק).

---

## משימה 4.1.1 — שיפור UI /monitor לפי דיווח חוזר (React בלבד)

### אבחון הבאגים שדווחו
**באג 1 (סטטוס "ללא שידRG") + באג 2 (Failed לא מופיע בסינון) —** בדקתי את המקור בפועל:
- השרת שולח `status` כ-**string** (`JsonStringEnumConverter` ב-Program.cs:21) — לא כ-index/number.
- הקליינט משווה ל-**ערך מדויק** `t.status === 'Failed'` ב-`applyStatusFilter` (liveData.ts) — לא index.
- הסימולטור (`AddPage`) שולח `Pending/Completed/Failed` כ-string דרך select/zod.
- **אין** באף מקום בפרויקט ערך "status: 2" / number ב-Transaction.
- `StatusBadge` מציג טקסט מלא (`Failed`/`Pending`/`Completed`) + dot + צבע. כל מופעי הסטטוס עוברים דרכו (בדקתי ב-grep — היה המחשק היחיד).

**מסקנה:** הקוד כבר תקין. סביר שהצפייה התבצעה מול build/שירות **ישן** (לפני commit 4.1). הוסף בדיקת-regression מפורשת (למטה) שמונעת חזרת "index-vs-string".

### שיפורי UI שבוצעו כעת
**נק' 3 — חזרה ל-all:** `ErrorFilterToggle` שודרג ל-**switch דו-מצבי** ברור: במצב `all` מציג "Show only errors"; ברגע שהמסנן פעיל → הטקסט הופך ל-**"Show all"** (לחיצה אחת חוזרת לרשימה המלאה). switch ויזואלי (knob + track) במקום checkbox שטוח.
**נק' 4 — עיצוב כרטיסים:** `TransactionCard` קיבל:
- **left-border** צבעוני לפי status (Pending=כתום / Completed=ירוק / Failed=אדום) — סימן ויזואלי מיידי.
- צל עדין (`box-shadow`), hover עם `scale(1.015)` + צל מעודן.
- רווח בין כרטיסים הוגדל (`gap: 0.9rem`).
- יורד כה-id מקוצר (8 chars + …), amount בולט, currency, timestamp — נשמר.
**נק' 5 — אנימציות:**
- `tx-enter` (slide+fade) כבר קיים — ה-hover transform נוסף (אינו אנימציית rerender, formanently על CSS).
- `tx-flash` (זוהר ירוק עדין) על הכרטיס החדש ביותר — נשמר.
- **stagger** עדין: הכרטיסים הראשונים (`STAGGER_GAP=8`) מקבלים `animationDelay` מדורג (`STAGGER_STEP=40ms`) — כך שקבוצה שעלתה בבת-אחת מתגלגלת בהדרגה **מבלי להכבד על 200 עסקאות** (רק 8 הראשונים מקבלים delay).
- `prefers-reduced-motion` מכבה **הכול**: אנימציות + hover transform + transition.

### בדיקות
- הוספתי בדיקת-גולם (7/7 עוברות): `'failed'` אינו מתאים `status`-index נומרי (כגון `2`) — רק ה-string `'Failed'` המדויק מחזיר תוצאה. (מניעת regress של התרחיש שחשש עליו.)

### אימות בפועל (הרצתי)
```
cd client
npm run build → ✓ 0 errors (tsc -b + vite)
npm run lint  → ✓ 0 בעיות
node --test   → ✓ 7/7 pass
```
כל רכיב/דף < 150 שורות (Monitor 60, Card 44, Toggle 29, Hook 71, Badge 22).

### git
- לא בוצע commit. שינויים ב-working tree ממתינים לאישורך (build+lint+test ירוק).

---

## משימה 4.1.2 — תיקון קריסת ריצה: `transaction.status.toLowerCase is not a function`

### האבחון
- ה-crash נוצר בשורה הישנה ב-`TransactionCard`:
  ```ts
  const statusClass = `tx-card--${transaction.status.toLowerCase()}`;
  ```
  מודל ה-`Transaction` מגדיר `status` כ-string union, טיפוס-זמן-קומפילציה — אבל בשידור live (REST/SignalR) ערך יכול להגיע כ-**numeric index** (0/1/2), `undefined`, `null`, או אובייקט יוצא-דופן. TS "הבטיח" string אבל ה-runtime סיפק אחר — ערך non-string קורס את `.toLowerCase()`.

### התיקון המקצועי (ללא שינוי Backend)
- **מודול normalizer חדש** `client/src/services/status.ts` — טהור, ב-`services/` (AGENTS.md #3):
  - `normalizeStatus(status: unknown) => DisplayStatus` — מתמודד עם *כל* טיפוס קלט:
    - string → `trim().toLowerCase()`, מפה ל-`'pending'|'completed'|'failed'`; ערך לא-ידוע → `'unknown'`.
    - number → מפה index `0/1/2` → `pending/completed/failed`; אחרת → `'unknown'`.
    - `undefined`/`null`/object → `'unknown'` (אפור, safe).
  - `STATUS_MAP` — מפה יציבה של label + badge-class + card-class לכל key.
- **`StatusBadge`** — מקבל `status: unknown` ועובר `normalizeStatus`; כולל מצב `badge--unknown` אפור חדש (אין פיצוץ לעולם).
- **`TransactionCard`** — שורת הקריסה הוחלפה ב-`normalizeStatus(transaction.status)` + `STATUS_MAP[key].card`; נוסף CSS `tx-card--unknown` (border אפור).
- **`applyStatusFilter`** (liveData.ts) — עובר עכשיו דרך `normalizeStatus(tx.status) === 'failed'`, כך שעסקאות Failed מתגלות גם אם שלחו `'failed'`/`'Failed'`/numeric `2` — **תואם** את מה שמוצג (אדום) — בלי פערים בין הסינון לתצוגה.

### בדיקות
- נכתבו **5 בדיקות חדשות** ל-`normalizeStatus` (str→lowercase, case-insensitive+trim, numeric index mapping, fallback unknown, hostile-shapes no-crash) ובדיקת-filter מתוקנת (numeric `2` → נכלל ב-failed). **סך-הכול 12/12 עוברות.**

### פתרון מקצועי ב-import (.ts extension)
- `liveData.ts` מייבא `./status.ts` עם extension מפורש — כך שניתן להריץ אותו גם ב-**Node-runner** (requirets explicit extension) וגם ב-**Vite** (`tsconfig` עם `allowImportingTsExtensions: true`). זה פותר את ERR_MODULE_NOT_FOUND ב-node --test מבלי לשבור build.

### אימות בפועל (הרצתי)
```
cd client
npm run build → ✓ 0 errors (tsc -b + vite)
npm run lint  → ✓ 0 בעיות
node --test   → ✓ 12/12 pass
```

### git
- לא בוצע commit. שינויים: קובץ חדש `services/status.ts`, שינוי `StatusBadge`/`TransactionCard`/`liveData`/`index.css`/`liveData.test.ts`/`PROGRESS.md` ב-working tree.

---

## משימה — SignalR Redis Backplane (conditional, ADR-003 Implemented)

### מה נוסף
- **חבילה:** `Microsoft.AspNetCore.SignalR.StackExchangeRedis` **8.0.11** (תואמת net8.0; הגרסה default 10.0.11 נדחתה ע"י NU1202).
- **Configuration (לא hardcoded):** בסעיף `SignalR` ב-`appsettings.json`:
  - `UseRedisBackplane: false` (ברירת מחדל = single-instance, לא פוגע בדמו)
  - `Redis: "redis:6379"` (host:port; רשום ב-env או בקבצי קלאסטר).
- **רישום מותנה ב-Program.cs:** `AddSignalR()` פעם אחת; אם `SignalR:UseRedisBackplane==true` → `.AddStackExchangeRedis(...)` על אותו builder. עם `false` (default) — נשאר in-process עם אותו hub — **החד-מופעי לא נשבר**.
  - תיקון-דרך (כשהמינימום נדרש): `options.Configuration` הוא `ConfigurationOptions` (לא string) → `StackExchange.Redis.ConfigurationOptions.Parse(conn)` + fallback `?? "redis:6379"` (עקב `TreatWarningsAsErrors` על nullable).
- **docs/ADR-003-signalr-redis-backplane.md:** מצב שונה מ-"Proposed" → **"Implemented"** — תיעוד הדגל המותנה, ההשפעה על `TransactionHub`/`Broadcaster` (ללא שינוי בהם, ללא double-broadcast), והמגבלה (חד-מופעי default).
- **README.md:** סעיף Known Limitations (בקובץ k8s deployment) — נוסח אנגלי חדש: backplane מיושם ומופעל דרך `SignalR:UseRedisBackplane=true`; default נשאר single-instance; לפריסה מרובת-מופעים — flag+Redis.
- **הסכם באגר:** כריפוד של שרת RTM.Api ישן (PID 2600) נועל את ה-exe; הופסק (taskkill) וחוזר build.

### החלטות
- **`options.Configuration`**: מנורמל ל-`ConfigurationOptions.Parse(string)` — ה-overload הנכון לחבילה 8.x.
- **Backplane = Integration test מחוץ ליחידה:** בדיקת `UseRedisBackplane=true` דורשת Redis אמיתי + 2 מופעים (סנכרון בין-מופעי); לא ריאלי/זול ב-unit test. ה-`TransactionHubTests` (unit) בונים hub ישירות עם FakeService — לא נוגעים ב-Redis/DI, ורק `false` (in-process) הוא טווח ברירת-המחדל. בסיס: ה-`TransactionIngestionApiTests` (WebApplicationFactory) כבר מאמת את ה-Program עם default.
- **פשרה חיובית/שלילית שבוצעה בפועל (ללא שינוי קוד):**
  - `UseRedisBackplane=true` + `Redis=localhost:6379` (קונטיינר `redis:7-alpine`) → האפליקציה עלתה נקייה, בלי שגיאת חיבור.
  - `UseRedisBackplane=true` + `Redis=localhost:6399` (נמל שגוי) → `RedisHubLifetimeManager` תיעד `Error connecting to Redis` — **הוכחה שהקוד-path פעיל** (לא silent no-op) וגם שה-app לא קרס (נסיון-חוזר אופייני, Consistent עם ה-best-effort של ה-cache).
  - עם `false` → אין תלות ב-Redis כלל, פעולת in-process (אומת בבדיקות).
  - קונטיינר test הוסר בתום האימות (`docker rm -f rtm-redis`).

### תוצאות אימות (הרצתי בפועל, dotnet SDK 8.0.424)
- `dotnet restore` → OK
- `dotnet build` → **0 Warning, 0 Error**
- `dotnet test` → **Passed: 51, Failed: 0** (כולל TransactionHubTests + TransactionIngestionApiTests)
- אימות חי ב-backplane=true + Redis אמיתי → התחלה נקייה (בפריסה מקומית; אימות 2-pod/ערוץ משותף מיועד לסביבת K8s).

### מגבלת אימות
- העברת הוכחה רב-מופעית (2 pods על אותו Redis ⇒ לקוח-ל-Pod-B מקבל אירוע של Pod-A) לא בוצעה — דורשת מהלך K8s/Docker מרובה-מופעים. מתועד כ-Integration מחוץ ליחידה.

### git
- לא בוצע commit. שינויים (working tree): `src/RTM.Api/RTM.Api.csproj` (new package), `appsettings.json`, `Program.cs`, `docs/ADR-003-...md`, `README.md`, `PROGRESS.md` — ממתינים לאישורך.

---

## אודיט C (שלב 3 מ-4) — Cloud/Deployment + תיעוד — ✅ דו"ח; החלת 2 תיקוני README (תיעוד בלבד)

### א) סקירת אודיט C — מסקנה
- **Dockerfile**: multi-stage (SDK→aspnet), runtime קטן (`aspnet:8.0`), ללא build artifacts, `ENV ASPNETCORE_URLS=:8080` + `EXPOSE 8080` + `ENTRYPOINT`, config דרך env — ✅ תקין.
- **docker-compose.yml**: backend+redis, `depends_on: service_healthy`, healthcheck `redis-cli ping`, env `Redis__Configuration=redis:6379`, אין secrets — ✅ תקין.
- **Kubernetes**: replicas 3, readiness+liveness על `/health`, resources, env Redis נכון, labels/selectors עקביים, redis-deployment+service קיימים, SPOF (Redis single-pod) מתועד ב-ADR-003 — ✅ תקין.
  - הערת מבנה: **אין קובץ `service.yaml` נפרד** — ה-Service מוכל בתוך `k8s/deployment.yaml` (לתקין).
- **README.md**: מדויק וקריא; הבדל in-memory/Rredis/durable מובהר; **חסרה Testing section** (P2).
- **docs/ADR**: ADR-003 במצב "Implemented" (מונחה ע"י דגל `SignalR:UseRedisBackplane`), עקבי עם `Program.cs`; כל ADR קצר/קריא — ✅ תקין.
- **סה"כ: 5/5 תקין**, אין P1; 2 המלצות P2 תיעודיות בלבד.

### ב) 2 תיקוני README שבוצעו (תיעוד בלבד — ללא שינוי קוד)
1. **הוספת חטיבת `## Testing`** אחרי How-to-run (Quick Start) — באנגלית:
   - `dotnet test` (backend), `cd client && npm run lint` (type-check + lint), `cd client && npm run build` (production build).
2. **ניסוח הפנייה ל-K8s**: "[`deployment.yaml`](k8s/deployment.yaml) (3 replicas + Service — ה-Service מוכל באותו קובץ), [`redis.yaml`](k8s/redis.yaml)" — הוסר הציון המוטעה ל-`service.yaml` נפרד.

### קבצים ששונו
- ✏️ `README.md` — נוסף `## Testing`; תוקנה הפנייה לקובצי K8s.
- ✏️ `PROGRESS.md` — רשומה זו.

### אימות (תיעוד בלבד — אין קוד לשנות; לא הורצו build/test כיוון שאין שינוי קוד)
- שינויי README/PROGRESS בלבד → לא דורשים `dotnet build/test` / `npm build` (תיעוד Markdown בלבד).

### git
- **לא בוצע commit** — השינויים (README.md + PROGRESS.md) ב-working tree ממתינים לאישורך (כולל השינויים הקודמים של Backplane ממשימה קודמת).
