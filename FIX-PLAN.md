# FIX-PLAN.md — תוכנית תיקונים לפני הגשה (RTM · מבחן כניסה)

> **מסמך זה נועד לשני קוראים:**
> - **הסטודנטית** — להבין *מה* לתקן, *באיזה סדר*, ובעיקר *למה* דווקא בסדר הזה.
> - **Claude שרץ בפרויקט** — לבצע. לכל סעיף יש: קבצים מדויקים, השינוי עצמו, וקריטריון קבלה.
>
> **כללי העבודה של [CLAUDE.md](CLAUDE.md) בתוקף במלואם:** TDD (Red→Green), `dotnet restore`+`build`+`test`
> ירוקים לפני שמסמנים משימה כהושלמה, אין `git add/commit/push` בלי אישור מפורש, ו-STOP-AND-REPORT
> אחרי כל סעיף. **לבצע סעיף-סעיף, לא הכל במכה.**
>
> **הערה ל-Claude:** אל תקבל את הממצאים כאן כאמת מוחלטת. לפני כל תיקון — פתח את הקובץ,
> ודא שהתיאור עדיין תואם את הקוד, ורק אז שנה. אם ממצא לא מתאים למציאות — דווח ואל תתקן בכוח.

---

## 1. איך נקבע סדר העדיפויות

כל פריט נשקל לפי שלוש שאלות. אם התשובה לאחת מהן היא "כן" — הוא עולה לראש הרשימה:

1. **האם זה שובר את ההדגמה?** בוחן שמריץ את המערכת ורואה משהו לא עובד — זה הנזק הגדול ביותר.
   הרבה יותר גרוע מקוד לא-מושלם.
2. **האם המטלה ביקשה את זה בכתב מפורש?** דרישה כתובה שחסרה = ניקוד שיורד אוטומטית, בלי שיקול דעת.
3. **האם בוחן יראה את זה ב-5 הדקות הראשונות?** README, מבנה תיקיות, וה-endpoint הראשי — אלה
   הדברים שנפתחים ראשונים.

**מה שלא עונה על אף אחת מהשלוש — לא נכנס לתוכנית הזו**, גם אם הוא "נכון" מבחינה הנדסית.
יש רשימה מפורשת של *מה לא לעשות* בסוף המסמך, והיא חשובה לא פחות מהשאר.

### תמונת מצב כללית

הבסיס **טוב**. הארכיטקטורה בשכבות אמיתית, ה-DI מלא, ה-Result pattern מיושם, יש 44 בדיקות
שרצות, ה-Thread-Safety אמיתי (`ConcurrentDictionary` + בדיקת 50 כותבים מקבילים), והפרונט
עומד בכל ארבע דרישות המשנה שלו כולל האנימציה של הבונוס. זה לא פרויקט שצריך להציל — זה
פרויקט שצריך לסגור לו את הקצוות.

**הפער העיקרי הוא לא בקוד שנכתב, אלא בקוד שלא נכתב:** כל סעיף 4 במטלה (Cloud-Native) —
Dockerfile, K8s, ותיאור פתרון הסנכרון בין 5 מופעים — חסר לגמרי. זה סעיף שלם מתוך חמישה.

---

## 2. המלכודת שקושרת את P0 יחד — לקרוא לפני שמתחילים

זה הדבר החשוב ביותר במסמך, ולכן הוא לפני הרשימה.

המטלה מבקשת `docker-compose` עם Redis. **ברגע ש-Redis באמת רץ, שני באגים רדומים מתעוררים
ושוברים את הדשבורד** — באגים שהיום לא מורגשים בכלל, כי בלי Redis כל שכבת הקאש מנוטרלת
(`InMemoryCacheProvider.IsConnected => false`, ולכן כל קריאה וכתיבה לקאש פשוט מדולגת).

התרחיש המדויק:

1. `docker compose up` — Redis עולה, `IsConnected` הופך ל-`true`, שכבת הקאש מתעוררת לחיים בפעם הראשונה.
2. לקוח נכנס ל-`/monitor` → `GetAllAsync` → הקאש ריק → קורא מה-Store → **כותב את הרשימה ל-`t:all`**.
3. נשלחת עסקה חדשה → `ProcessAsync` מעדכן רק את המפתח הבודד `t:{id}` — **`t:all` לא מבוטל אף פעם**.
4. לקוח חדש נכנס ל-`/monitor` → `GetAllAsync` מוצא את `t:all` → מחזיר את הרשימה **הישנה, לנצח**.
5. במקביל, כל כתיבה ל-Redis בכלל נכשלת בשקט בגלל `expiry ?? TimeSpan.Zero` (ראה P0-4).

**המסקנה המעשית:** אסור להוסיף docker-compose עם Redis בלי לתקן קודם את P0-4. אחרת התוצאה
של העבודה על הבונוס תהיה הדגמה שבורה — כלומר, המצב יהיה *גרוע יותר* ממה שהוא היום.

**סדר הביצוע הנכון: P0-4 ← ואז P0-3.**

---

## 3. P0 — חובה. בלי זה יורד ניקוד ודאי

### P0-1 · `README.md` בשורש הפרויקט

**למה ראשון:** זה הקובץ הראשון שנפתח, ואין כרגע אף אחד. בוחן שלא מצליח להריץ את הפרויקט
תוך שתי דקות מפסיק לנסות. בנוסף, המטלה מבקשת אותו מפורשות ("README.md קצר"). זה גם המקום
היחיד שבו אפשר להסביר החלטות עיצוב — אחרת הן נראות כמו מחדלים.

**קובץ:** `README.md` (חדש, בשורש).

**תוכן נדרש (קצר — עמוד אחד, לא יותר):**

```markdown
# RTM — Real-Time Financial Monitor
תיאור בשתי שורות + הסטאק.

## הרצה מהירה
### עם Docker (מומלץ)
docker compose up  → API על http://localhost:8080, Redis על 6379
### מקומית
Terminal 1: dotnet run --project src/RTM.Api      → http://localhost:5248 (+ Swagger)
Terminal 2: cd client && npm install && npm run dev → http://localhost:5173

## מבנה
src/RTM.Api/   Api → Services → Domain   (כיוון התלות)
tests/         44 בדיקות xUnit
client/        React + TS (/add, /monitor)

## חוזה ה-API
POST /api/transactions  → 201 / 400   (דוגמת JSON מלאה)
GET  /api/transactions  → 200
WS   /hubs/transactions → InitialTransactions, TransactionReceived

## החלטות מרכזיות
טבלה של 4–5 שורות + קישור ל-docs/ADR-00X.

## מה ממומש ומה מוצע
טבלה מפורשת: ✅ ממומש / 📐 מתועד כהצעה (ראה ADR-003).

## בדיקות
dotnet test → 44 passed
```

**קריטריון קבלה:** מישהו שלא ראה את הפרויקט מריץ אותו מה-README בלבד, בלי לשאול שאלות.

---

### P0-2 · ADR לסנכרון בין 5 מופעים + ניקוי המונח "PowerDuplication"

**למה:** המטלה מנסחת את זה כדרישה כתובה ומפורשת — *"Architect: Describe (in your README/ADR)
how you would solve this synchronization problem"*. המימוש מוגדר אופציונלי, **אבל התיאור לא**.
כרגע אין שום מסמך כזה, וזה הבונוס היחיד שהוא בעצם שאלת חשיבה ארכיטקטונית — בדיוק מה
שנבדק במבחן כניסה לתפקיד mid.

**בעיה נוספת, חשובה:** הקוד מפנה למסמך שלא קיים ומשתמש במונח שלא קיים:

| קובץ | שורה | הבעיה |
|---|---|---|
| [src/RTM.Api/Api/TransactionHub.cs](src/RTM.Api/Api/TransactionHub.cs#L33) | 33–34 | `"multi-instance PowerDuplication design (see docs/ADR.md)"` — המונח לא קיים בעולם, והקובץ לא קיים |
| [CLAUDE.md](CLAUDE.md#L95) | 95 | `docs/ADR.md ... (PowerDuplication / Redis pub-sub)` |
| [CLAUDE.md](CLAUDE.md#L14) | 14 | `docs/ADR.md → החלטות ארכיטקטוניות` — הקובץ לא קיים (יש רק ADR-001/002) |
| [PROGRESS.md](PROGRESS.md#L343) | 343 | אותו מונח |

בוחן שיחפש "PowerDuplication" לא ימצא כלום. זה קורא כמו מונח שהומצא, וזה מזיק יותר מאשר
לא לכתוב כלום. **המונח המקצועי הנכון הוא Redis Backplane / Pub-Sub.**

**ביצוע:**

1. **צור `docs/ADR-003-multi-instance-scaling.md`** בפורמט של ADR-001/002 (Context / Decision /
   Consequences), בעברית. תוכן:
   - **הקשר:** 5 pods מאחורי Load Balancer. `InMemoryTransactionStore` הוא per-pod, ו-`IHubContext`
     משדר רק ללקוחות של אותו pod. לקוח על pod A לא יראה עסקה שנקלטה ב-pod B — **שתי בעיות
     נפרדות: פיזור השידור, ושיתוף ההיסטוריה.**
   - **חלופות שנשקלו:**
     | חלופה | פותר שידור | פותר היסטוריה | הערכה |
     |---|---|---|---|
     | Sticky sessions בלבד | ❌ | ❌ | פותר רק את יציבות החיבור, לא את הנתונים |
     | SignalR Redis Backplane | ✅ | ❌ | Redis pub/sub מפיץ כל שידור לכל המופעים |
     | Redis כ-Store משותף | ❌ | ✅ | ההיסטוריה נקראת ממקור אחד |
     | Kafka / RabbitMQ | ✅ | ✅ | Over-engineering ל-MVP; מוצדק בסקייל אמיתי |
   - **ההחלטה:** Redis ממלא **שני תפקידים** — backplane ל-pub/sub של השידורים, ומאגר משותף
     להיסטוריה. ה-Store בזיכרון יורד לתפקיד של אופטימיזציה מקומית בלבד.
   - **תוצאות/מחיר:** Redis הופך לתלות קשיחה לנכונות (לא רק לביצועים); אין הבטחת סדר גלובלי
     בין מופעים — ולכן הקליינט ממיין לפי `timestamp` (וזה כבר קורה); at-least-once → הקליינט
     צריך להיות עמיד לכפילות (`key={transactionId}` כבר מטפל בזה).
   - **סטטוס:** לציין **במפורש** מה ממומש ומה לא. אם רק חלק מומש — לכתוב את זה. ADR שמתאר
     מציאות שלא קיימת הוא הדבר היחיד שגרוע ממחסור ב-ADR.

2. **החלף את המונח בכל 4 המקומות** ל-"Redis backplane". ב-`PROGRESS.md` — **לא למחוק היסטוריה**
   (כלל מפורש ב-CLAUDE.md); להוסיף שורת תיקון בסוף הקובץ. בשאר הקבצים — עריכה רגילה.
   כל ההפניות ל-`docs/ADR.md` יופנו ל-`docs/ADR-003-multi-instance-scaling.md`.

3. **מומלץ מאוד — מימוש בפועל (3 שורות, הופך "מתואר" ל"ממומש"):**

   ```bash
   dotnet add src/RTM.Api package Microsoft.AspNetCore.SignalR.StackExchangeRedis
   ```
   ב-[Program.cs](src/RTM.Api/Program.cs#L23), במקום `builder.Services.AddSignalR();`:
   ```csharp
   var signalR = builder.Services.AddSignalR();
   if (builder.Configuration.GetValue<bool?>("Redis:Enabled") ?? true)
   {
       signalR.AddStackExchangeRedis(
           builder.Configuration["Redis:Configuration"] ?? "localhost:6379",
           options => options.Configuration.AbortOnConnectFail = false);
   }
   ```
   `AbortOnConnectFail = false` הכרחי — בלעדיו האפליקציה תיפול בהרמה אם Redis עדיין לא מוכן.

   ההחזר על ההשקעה כאן חריג: המטלה כותבת *"Implement (Optional but **recommended**)"*, וזה
   3 שורות. זה מעביר את הפרויקט מ"הבנתי את הבעיה" ל"פתרתי את הבעיה".

**קריטריון קבלה:** `dotnet build` + `dotnet test` ירוקים; חיפוש "PowerDuplication" ב-repo מחזיר
0 תוצאות (למעט שורת התיקון ב-PROGRESS); `docs/ADR-003-*.md` קיים ומקושר מה-README.

---

### P0-3 · Dockerfile + docker-compose + מניפסטים ל-K8s

**למה:** ארבעה קבצים שהמטלה מונה **בשמם המפורש**. בלעדיהם סעיף 4.2 בבונוס הוא אפס.
זו העבודה עם היחס הכי טוב בין מאמץ לניקוד בכל המסמך הזה.

**⚠️ תנאי מקדים: לבצע רק אחרי P0-4.** ראה סעיף 2.

**קבצים חדשים:** `Dockerfile`, `.dockerignore`, `docker-compose.yml`, `k8s/deployment.yaml`, `k8s/service.yaml`.

**`Dockerfile` — multi-stage (המטלה מדגישה "small image"):**

```dockerfile
# ---- build ----
FROM mcr.microsoft.com/dotnet/sdk:8.0 AS build
WORKDIR /src
COPY ["src/RTM.Api/RTM.Api.csproj", "src/RTM.Api/"]
RUN dotnet restore "src/RTM.Api/RTM.Api.csproj"      # שכבה נפרדת = cache ל-restore
COPY . .
RUN dotnet publish "src/RTM.Api/RTM.Api.csproj" -c Release -o /app/publish /p:UseAppHost=false

# ---- runtime ----
FROM mcr.microsoft.com/dotnet/aspnet:8.0-alpine AS final
RUN apk add --no-cache icu-libs                      # נדרש כי InvariantGlobalization=false
ENV ASPNETCORE_URLS=http://+:8080 \
    DOTNET_SYSTEM_GLOBALIZATION_INVARIANT=false
WORKDIR /app
COPY --from=build /app/publish .
USER $APP_UID                                        # לא-root (מוגדר בתמונת הבסיס של .NET 8)
EXPOSE 8080
ENTRYPOINT ["dotnet", "RTM.Api.dll"]
```

> **שימו לב ל-`icu-libs`:** [RTM.Api.csproj](src/RTM.Api/RTM.Api.csproj#L8) מגדיר
> `InvariantGlobalization=false`, ותמונת alpine מגיעה בלי ICU — בלי השורה הזו הקונטיינר
> **קורס בהרמה**. חלופה לתמונה קטנה יותר: לשנות ל-`InvariantGlobalization=true` (שום דבר
> בקוד לא באמת תלוי בתרבות) ולהוריד את שתי השורות. שתי הדרכים לגיטימיות — רק צריך לבחור אחת
> **ולבדוק שהקונטיינר באמת עולה**.

**`.dockerignore`** — לפחות: `bin/`, `obj/`, `client/node_modules/`, `client/dist/`, `.git/`, `.vs/`, `**/*.user`.

**`docker-compose.yml`** — api + redis:
- `redis: image: redis:7-alpine` עם `healthcheck` (`redis-cli ping`).
- ה-api עם `depends_on: redis: condition: service_healthy`.
- העברת קונפיגורציה **דרך משתני סביבה, לא hardcoded**: `Redis__Configuration=redis:6379`
  (שני קווים תחתונים = היררכיה ב-.NET config). זה מדגים שהקונפיגורציה באמת חיצונית —
  אחת מדרישות ה-Cloud-Ready.

**`k8s/deployment.yaml`** — `replicas: 3`, `resources` (requests+limits), ושתי probes נפרדות
מול `/health`: `livenessProbe` ו-`readinessProbe`. קונפיג דרך `env`/`ConfigMap`.

**`k8s/service.yaml`** — `type: ClusterIP`, port 80 → targetPort 8080, **ו-`sessionAffinity: ClientIP`**.

> **ה-`sessionAffinity` הוא פרט קטן ששווה הרבה.** SignalR נופל חזרה ל-Server-Sent-Events או
> ל-Long-Polling כשאין WebSocket, ובמצב הזה הוא **מחייב** sticky sessions כדי שכל בקשות
> אותו חיבור יגיעו לאותו pod. מי שיודע את זה מראה שהוא חשב על SignalR בפרודקשן ולא רק
> בלוקאלהוסט. שווה גם שורה בהערה ב-YAML וגם משפט ב-ADR-003.

**קריטריון קבלה — חובה להריץ בפועל, לא רק ליצור קבצים:**
```
docker build -t rtm-api .        → נבנה בהצלחה
docker compose up                → ה-API עונה על http://localhost:8080/health
POST חי לקונטיינר                → 201
docker images rtm-api            → לתעד את הגודל ב-README (זו דרישת "small image")
kubectl apply --dry-run=client -f k8s/   → ה-YAML תקין תחבירית (לא נדרש קלאסטר אמיתי)
```

---

### P0-4 · תיקון שלושת הבאגים ש-Docker חושף

**למה P0:** בלי אלה, סעיף P0-3 הופך הדגמה עובדת להדגמה שבורה. ראה סעיף 2.

#### (א) `t:all` לא מבוטל בכתיבה — ההיסטוריה נתקעת

**קובץ:** [src/RTM.Api/Services/TransactionService.cs](src/RTM.Api/Services/TransactionService.cs#L67-L69)

**התיקון הפשוט ביותר** — להוסיף ביטול של מטמון הרשימה אחרי כתיבה מוצלחת:

```csharp
await _cache.SetCachedAsync(transaction, ct).ConfigureAwait(false);
await _cache.InvalidateListAsync(ct).ConfigureAwait(false);   // ← חדש
```

זה דורש להוסיף `InvalidateListAsync` ל-[ITransactionCache](src/RTM.Api/Domain/ITransactionCache.cs)
ולממש אותו ב-[TransactionCache](src/RTM.Api/Services/TransactionCache.cs) כ-`_inner.RemoveAsync(ListKey, ct)`.
`ICacheProvider.RemoveAsync` **כבר קיים** ואינו בשימוש בשום מקום — כלומר התשתית כבר שם.

בנוסף, כרשת ביטחון: להעביר TTL קצר (למשל 30 שניות) ב-`SetCachedListAsync`.

**TDD — הבדיקה נכתבת קודם, ב-[TransactionCacheIntegrationTests](tests/RTM.Tests/Services/TransactionCacheIntegrationTests.cs):**
```
GetAll_AfterNewTransaction_ReflectsIt
  1. Process(A)  2. GetAll → 1 פריט  3. Process(B)  4. GetAll → חייב להחזיר 2
```
הבדיקה הזו **חייבת להיכשל לפני התיקון** (תחזיר 1). זה ה-Red. אם היא עוברת מיד — משהו
בהבנת הבאג שגוי, לעצור ולדווח.

#### (ב) כל כתיבה ל-Redis נכשלת בשקט

**קובץ:** [src/RTM.Api/Caching/RedisCacheProvider.cs:33](src/RTM.Api/Caching/RedisCacheProvider.cs#L33)

```csharp
// לפני — TimeSpan.Zero הוא לא "בלי תפוגה", הוא "תפוגה אפס":
await _redis.GetDatabase().StringSetAsync(key, value, expiry ?? TimeSpan.Zero).WaitAsync(ct);
// אחרי — null הוא "בלי תפוגה", וזה מה ש-StackExchange.Redis מצפה לו:
await _redis.GetDatabase().StringSetAsync(key, value, expiry).WaitAsync(ct);
```

גם ההערה מעל השורה טוענת דבר לא נכון ("null => no expiry (TimeSpan.Zero)") — לתקן אותה.
ה-`catch` הכללי מתחת בולע את השגיאה כ-Warning, ולכן הבאג בלתי-נראה לחלוטין.

**איך לאמת (זו הדרך היחידה — אין בדיקה שמכסה את הרכיב הזה):** להרים Redis
(`docker run -p 6379:6379 redis:7-alpine`), להריץ את ה-API, לשלוח POST, ואז `redis-cli KEYS "t:*"`.
**לפני התיקון תהיה רשימה ריקה, אחריו יופיעו מפתחות.**

#### (ג) אין CORS

**קובץ:** [src/RTM.Api/Program.cs](src/RTM.Api/Program.cs)

היום הכל עובד רק בזכות ה-proxy של [vite.config.ts](client/vite.config.ts#L12-L23). ברגע
שהקליינט מוגש מ-origin אחר — כלומר בדיוק בתרחיש Docker/K8s — הדפדפן יחסום גם את ה-POST
וגם את ה-SignalR.

```csharp
// Services:
builder.Services.AddCors(o => o.AddDefaultPolicy(p => p
    .WithOrigins(builder.Configuration.GetSection("Cors:AllowedOrigins").Get<string[]>()
                 ?? new[] { "http://localhost:5173" })
    .AllowAnyHeader()
    .AllowAnyMethod()
    .AllowCredentials()));   // ← חובה ל-SignalR

// Pipeline, לפני MapHub:
app.UseCors();
```

שתי נקודות שבוחן שם לב אליהן: **`AllowCredentials()` הכרחי ל-SignalR**, ו-`AllowAnyOrigin()`
**אסור** יחד איתו (הדפדפן דוחה את הצירוף) — ולכן ה-origins מגיעים מהקונפיגורציה, מה שגם
עומד בכלל "Configuration מ-appsettings, לא hardcoded".

**בנוסף — `UseHttpsRedirection` בקונטיינר:** [Program.cs:60](src/RTM.Api/Program.cs#L60) מפעיל
אותו תמיד. בקונטיינר שמאזין רק ל-HTTP זה מייצר אזהרה בכל בקשה ועלול להפריע ל-handshake של
WebSocket. להעביר אותו לתוך `if (app.Environment.IsDevelopment())` או להתנות בקונפיגורציה.

**קריטריון קבלה ל-P0-4:** `dotnet test` ירוק כולל הבדיקה החדשה; אימות ידני מול Redis אמיתי
כמתואר ב-(ב); הקליינט עובד מול API שרץ בקונטיינר בלי proxy.

---

## 4. P1 — קוד. מה שבוחן יראה בקריאה הראשונה

### P1-1 · מחיקת `TransactionHub.TransactionReceived` ⏱️ דקה אחת

**קובץ:** [src/RTM.Api/Api/TransactionHub.cs:73-76](src/RTM.Api/Api/TransactionHub.cs#L73-L76)

```csharp
public async Task TransactionReceived(Transaction transaction)
{
    await Clients.All.SendAsync("TransactionReceived", transaction).ConfigureAwait(false);
}
```

מתודה ציבורית ב-Hub היא **נקודת כניסה שכל לקוח WebSocket יכול לקרוא לה**. המשמעות: כל אחד
שפותח קונסולה בדפדפן יכול להזריק "עסקאות" מזויפות לכל הדשבורדים — בלי ולידציה, בלי שמירה
ב-Store, ובלי לעבור דרך אף שכבה.

**למה זה חשוב מעבר לאבטחה:** הסטודנטית בנתה ארכיטקטורת שכבות מוקפדת ותיעדה אותה היטב —
וזו המתודה היחידה בכל הפרויקט שעוקפת אותה. בוחן שישאל "מי יכול לקרוא למתודה הזו?" יקבל
תשובה שסותרת את כל מה שהיא מציגה כחוזק. וזו מערכת **פיננסית**.

ההערה בקוד עצמה מודה שזה מיותר ("Real ingestion flows through the ingestion API... this exists
for completeness"). שם המתודה שהשרת *משדר* לא מחייב מתודה נכנסת באותו שם.

**ביצוע:** למחוק את המתודה. לוודא ש-`dotnet test` נשאר ירוק (אף בדיקה לא נוגעת בה) ושהקליינט
לא קורא לה (`connection.invoke` לא מופיע ב-[signalR.ts](client/src/services/signalR.ts) — רק `.on`).

---

### P1-2 · `GET /api/transactions` ⏱️ 20 דקות

**קובץ:** [src/RTM.Api/Api/TransactionEndpoints.cs](src/RTM.Api/Api/TransactionEndpoints.cs#L61)

השורה `Results.Created($"/api/transactions/{tx.TransactionId}", tx)` מחזירה כותרת `Location`
שמצביעה על כתובת שמחזירה **404** — אין GET בכלל. בוחן שילחץ על הקישור מ-Swagger או ינסה
`curl` כדי לוודא שהעסקה נשמרה — ייתקל בקיר.

בנוסף: `ITransactionService.GetAllAsync` ו-`GetByIdAsync` **כבר ממומשים, כבר נבדקים בבדיקות,
ופשוט לא חשופים**. זו עבודה שכבר נעשתה ולא נקטפה.

```csharp
app.MapGet("/api/transactions", async (ITransactionService service, CancellationToken ct) =>
{
    var result = await service.GetAllAsync(ct);
    return Results.Ok(result.Value);
}).WithName("GetTransactions").WithOpenApi();

app.MapGet("/api/transactions/{id}", async (string id, ITransactionService service, CancellationToken ct) =>
{
    var result = await service.GetByIdAsync(id, ct);
    return result.Value is null ? Results.NotFound() : Results.Ok(result.Value);
}).WithName("GetTransactionById").WithOpenApi();
```

**TDD:** בדיקה ב-[TransactionIngestionApiTests](tests/RTM.Tests/Api/TransactionIngestionApiTests.cs) —
POST ואז GET לאותה כתובת מה-`Location` → 200 עם אותו `transactionId`.

---

### P1-3 · השידור לא צריך למות עם בקשת ה-POST ⏱️ 10 דקות

**קובץ:** [src/RTM.Api/Services/TransactionService.cs:69-73](src/RTM.Api/Services/TransactionService.cs#L69-L73)

ה-`ct` שמגיע לכאן הוא `HttpContext.RequestAborted` של **הלקוח ששלח את העסקה**. אבל הוא מועבר
גם לכתיבה לקאש וגם לשידור. התוצאה: אם הלקוח שהזין את העסקה סגר את החלון — **השידור לכל
שאר הדשבורדים מבוטל**. מחזור החיים של בקשה אחת מחסל תופעת לוואי שנועדה לכולם.

וגרוע יותר: [TransactionCache.SetCachedAsync](src/RTM.Api/Services/TransactionCache.cs#L65) פותח
ב-`ct.ThrowIfCancellationRequested()`. אם הביטול קורה בדיוק בין השמירה ל-Store לבין הקאש —
נזרק חריג **אחרי** שהעסקה כבר נשמרה, השידור לא קורה בכלל, והלקוח מקבל 500. כלומר: עסקה
שקיימת ב-Store ואף דשבורד לא יראה. זה גם סותר ישירות את מה ש-`ITransactionCache`
מתעד על עצמו — *"implementations must never throw"*.

```csharp
await _store.AddAsync(transaction, ct);          // ← זה כן תלוי בבקשה. נשאר.

// מכאן והלאה: תופעות לוואי שכבר לא שייכות לבקשה הבודדת.
await _cache.SetCachedAsync(transaction, CancellationToken.None).ConfigureAwait(false);
await _cache.InvalidateListAsync(CancellationToken.None).ConfigureAwait(false);
await _broadcaster.BroadcastReceivedAsync(transaction, CancellationToken.None).ConfigureAwait(false);
```

**חשוב לתעד את זה** — ב-ADR או בהערה בקוד. זו לא "התעלמות מ-CancellationToken" אלא ההיפך:
הבנה מדויקת של **מה בדיוק** הטוקן מייצג, ומתי הוא רלוונטי ומתי לא. זו נקודה שמפרידה בין
mid ל-junior, ושווה משפט בראיון.

---

### P1-4 · חסם על כמות העסקאות ⏱️ 20 דקות

**קבצים:** [InMemoryTransactionStore.cs](src/RTM.Api/Services/InMemoryTransactionStore.cs),
[TransactionHub.cs:49-51](src/RTM.Api/Api/TransactionHub.cs#L49-L51)

המטלה כותבת *"Store the **latest** transactions in Memory"*. כרגע ה-Store גדל בלי גבול ואין בו
פינוי, ו-`OnConnectedAsync` שולח את **כולו** לכל לקוח שמתחבר. הקליינט חוסם ב-200 — אבל רק
אחרי שהכל כבר עבר ברשת ועבר deserialize.

**הפתרון הפשוט ביותר שעונה על הדרישה** (וזה עקרון מנחה ב-CLAUDE.md — "הפתרון הפשוט ביותר
שעומד בדרישות"): להגביל את **ההיסטוריה שנשלחת בחיבור** ל-200 האחרונות, ממוינות לפי `timestamp`.
זה שינוי בשורה אחת ב-Hub (או, נקי יותר, `GetLatestAsync(int limit)` ב-Service).

חסימת ה-Store עצמו היא שיפור נחמד אבל לא הכרחי למבחן — אם יש זמן, `ConcurrentDictionary` +
`ConcurrentQueue` של מפתחות לפינוי FIFO. אם אין זמן: **להסתפק בחסימת ההיסטוריה, ולהזכיר
את המגבלה במפורש ב-README** תחת "מגבלות ידועות". להכיר במגבלה זה סימן לבגרות; להתעלם ממנה
זה נראה כמו החמצה.

---

## 5. P2 — אם יש זמן. מה שמעלה מ"עובר" ל"טוב"

| # | מה | למה זה שווה | זמן |
|---|---|---|---|
| P2-1 | **בדיקת End-to-End אמיתית ל-SignalR** — `HubConnectionBuilder` מול `TestServer`: להתחבר, לשלוח POST, ולוודא שההודעה `TransactionReceived` באמת הגיעה ללקוח. | זו **הבדיקה המרשימה ביותר שאפשר להוסיף**. היום `Hub_Negotiate_ReturnsConnection` מוכיח רק שה-route ממופה — לא שהפיצ'ר המרכזי של המערכת עובד. הבדיקה הזו גם הייתה תופסת את באג `t:all` לבד. | ~45 דק' |
| P2-2 | **בידוד הבדיקות מ-Redis** — `WithWebHostBuilder` + `Redis:Enabled=false` ב-`WebApplicationFactory`. | היום בדיקות האינטגרציה מנסות להתחבר ל-Redis אמיתי (2 שניות timeout בכל ריצה), ואם במקרה רץ Redis על המכונה — הן ידברו איתו ויירשו `t:all` מריצה קודמת. זה כשל שלא ניתן לשחזור, בדיוק הסוג שהורג אמון בסוויטת בדיקות. | ~20 דק' |
| P2-3 | **בדיקת concurrency בשכבת ה-Service** — 100 `ProcessAsync` במקביל, ולוודא ש-100 נשמרו ו-100 שודרו. | המטלה דורשת **מפורשות** *"Cover transaction processing, concurrency handling, and storage logic"*. יש היום כיסוי concurrency ל-Store בלבד — לא ל-processing. זו דרישה כתובה שממולאת חלקית. | ~20 דק' |
| P2-4 | **`.Produces<Transaction>(201).ProducesValidationProblem()`** על ה-endpoints. | בלי זה Swagger מציג endpoint בלי סכימת תגובה. זה הדף הראשון שבוחן פותח כשהוא מריץ. שורה אחת לכל endpoint. | 5 דק' |
| P2-5 | **Endpoint filter לוולידציה** במקום [ValidateRequest](src/RTM.Api/Api/TransactionEndpoints.cs#L68-L83) הידני. | הקוד הידני דורס שתי שגיאות על אותו שדה ומשתמש במפתח `""` כשאין `MemberNames`. פילטר אחד מרכזי פותר את זה, ומראה שהיא מכירה את הכלים של Minimal API ולא רק "כותבת ידנית מה שהמסגרת נותנת". | ~30 דק' |
| P2-6 | **`TypedResults` במקום `Results`** בשני ה-endpoints. | מחזיר טיפוס קונקרטי ⇒ ניתן ל-unit-test בלי HTTP, ומזין את OpenAPI אוטומטית. זו המוסכמה המודרנית של Minimal API. | 5 דק' |

---

## 6. מה **לא** לעשות — חשוב לא פחות

יש בסקירה המקורית עוד כ-15 ממצאים נכונים מבחינה הנדסית. **הם לא שייכים למבחן הזה**, ועיסוק
בהם יגזול את הזמן מ-P0. אלה דברים שמתקנים במערכת שחיה שנה, לא ב-MVP של מבחן כניסה:

| מה | למה לדלג |
|---|---|
| פיצול ל-3 פרויקטים (`Domain`/`Application`/`Infrastructure`) | כיוון התלות כבר נשמר בפועל ומתועד. הפיצול הוא ריפקטור רוחבי מסוכן ימים לפני הגשה, בתמורה לניקוד שולי. |
| `Result<T>` עם קודי שגיאה / `Result` לא-גנרי | ה-Result הנוכחי עומד בדרישת "Result pattern" במלואה. |
| Idempotency / 409 על `transactionId` כפול | "latest wins" הוא **מתועד כהחלטה** ונבדק בבדיקה ייעודית. החלטה מתועדת עדיפה על שינוי חפוז. שווה משפט בראיון, לא שינוי קוד. |
| ולידציית ISO-4217 אמיתית למטבע | המטלה מבקשת `"USD"` — בדיקת אורך 3 מספיקה בהחלט ל-MVP. |
| `React.memo` / batching ב-`requestAnimationFrame` | דרישת הביצועים היא "100 עסקאות בלי הקפאה". עם cap של 200 פריטים זה עובד בנוחות. **הדרישה מתקיימת.** |
| בדיקות פרונט (Vitest) | המטלה מבקשת unit tests לעיבוד/concurrency/אחסון — כלומר לבקאנד. |
| נורמליזציית UTC / פורמט `Z` בפלט | ניואנס אמיתי אבל בלתי-נראה. אם נשאלת — לדעת להסביר. |
| Auth / Rate limiting | לא נדרש ב-MVP. **מספיק להזכיר ב-README כמגבלה מוכרת** — וזה דווקא נקודת זכות. |

---

## 7. סדר ביצוע מומלץ

```
יום 1  P0-4  תיקון שלושת הבאגים        ← חייב להיות לפני Docker
       P0-1  README
יום 2  P0-2  ADR-003 + ניקוי המונח + 3 שורות ה-backplane
       P0-3  Docker + compose + K8s     ← להריץ בפועל, לא רק ליצור קבצים
יום 3  P1-1..P1-4  (סה"כ ~שעה)
       P2    לפי הזמן שנשאר — P2-1 ו-P2-2 ראשונים
```

אחרי כל סעיף: `dotnet restore` + `build` + `test`, רשומה ב-`PROGRESS.md`, ו-STOP לאישור —
בדיוק לפי [CLAUDE.md](CLAUDE.md).

---

## 8. שלוש שאלות שכמעט בטוח יישאלו — ומה לענות

**"למה Minimal API ולא Controllers?"**
> "המערכת חושפת endpoint אחד ו-hub, אז Minimal API נותן את הקוד הכי מעט טקסי, והוא גם עקבי
> עם `MapHub` ו-`MapGet` שממילא בסגנון הזה. המחיר הוא ויתור על הוולידציה האוטומטית של
> `[ApiController]`, ולכן מימשתי אותה במפורש דרך endpoint filter. אם ה-API היה גדל לכמה
> משאבים עם policies ופילטרים — הייתי עוברת לקונטרולרים."

**"מה קורה עם 5 pods?"**
> "שתי בעיות נפרדות, לא אחת: פיזור השידור, ושיתוף ההיסטוריה. Redis פותר את שתיהן בשני
> תפקידים — backplane ל-pub/sub, ומאגר משותף להיסטוריה. תיארתי את זה ב-ADR-003 עם החלופות
> שנשקלו, ומימשתי את ה-backplane." → **ולפתוח את הקובץ.**

**"למה `CancellationToken.None` בשידור?"**
> "ה-token של הבקשה מייצג את הלקוח ששלח את העסקה. השידור נועד לכל שאר הלקוחות, אז הוא לא
> אמור למות רק כי המזין ניתק. העסקה כבר נשמרה ב-Store — היא לא הולכת לאיבוד בשום מקרה."

---

## 9. צ'קליסט לפני הגשה

**חובה**
- [ ] `README.md` בשורש — מישהו זר מריץ מהמסמך בלבד
- [ ] `docs/ADR-003-multi-instance-scaling.md` קיים ומקושר מה-README
- [ ] 0 מופעים של "PowerDuplication"; אין הפניות ל-`docs/ADR.md` שלא קיים
- [ ] `Dockerfile` + `.dockerignore` + `docker-compose.yml` + `k8s/*.yaml` — **הורצו בפועל**
- [ ] `t:all` מבוטל בכתיבה + בדיקה חדשה ירוקה
- [ ] `expiry` מועבר כמו שהוא ל-Redis — אומת מול `redis-cli KEYS "t:*"`
- [ ] CORS מוגדר עם `AllowCredentials`, origins מהקונפיגורציה
- [ ] `TransactionHub.TransactionReceived` נמחקה
- [ ] `GET /api/transactions` + `GET /api/transactions/{id}` קיימים
- [ ] שידור וקאש לא תלויים ב-`RequestAborted`
- [ ] ההיסטוריה בחיבור חסומה ב-N האחרונות

**סופי**
- [ ] `dotnet restore` + `build` + `test` — ירוק, 0 warnings
- [ ] `cd client && npm run build && npm run lint` — ירוק
- [ ] `docker compose up` → `/add` שולח, `/monitor` מקבל חי, הפילטר עובד, רענון מחזיר היסטוריה
- [ ] `bin/`, `obj/`, `node_modules/` לא ב-repo
- [ ] `PROGRESS.md` מעודכן בכל סעיף שבוצע
