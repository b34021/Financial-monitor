# ADR-003 — סנכרון SignalR בין מופעים (Redis Backplane) לקראת Node × N

- **מצב:** מוצע (Proposed) — מיושם כשיהיו 2+ מופעים.
- **תאריך:** 2026-08-21
- **בעל החלטה:** RTM — Backend (.NET 8, Asp.NET Core) → Frontend (React + TS)

## הקשר (Problem): הנתק בין Pods

הStack הנוכחי מריץ **SignalR hub אחד בתוך כל מופע אפליקציה** (in-process). בזמן
פיתוח/דמו זה מספיק — כל הלקוחות מתחברים לאותו מופע. אבל ברגע שמריצים את ה-API ב
**5 מופעים (K8s replicas) על Load Balancer**, נוצר נתק:

- עסקה נכנסת ומעובדת ב-**Pod A**.
- רק Pod A ודוחפים `TransactionReceived` ללקוחות שחוברו **אליו**.
- לקוחות שחוברו ל-**Pod B/C אינם מקבלים את העסקה** — "עין" חסרה בלוח החי.

כל עוד ה-histories האינדיבידואליים (In-Memory store) שונים בין מופעים, גם
ה-miss בין ה-Pods עלול לגרום לחוסר עקביות בתצוגה.

## החלטה (Decision): Redis Backplane ל-SignalR

להוסיף את **`Microsoft.AspNetCore.SignalR.StackExchangeRedis`** ולהגדיר:
```csharp
builder.Services.AddSignalR()
    .AddStackExchangeRedis(configuration["Redis:Configuration"],
        options => options.Configuration.ChannelPrefix = "rtm:");
```
- כל פוד מתחבר לאותו Redis (כבר קיים שהתחברנו אליו ל-cache).
- כל ConectionID/pub-sub על ערוץ משותף — SignalR משדר בין הפודים.

## איך זה פותר את הבעיה (זרימה)

```
Client-X (→Pod A)   Client-Y (→Pod B)
   │                          ▲
   └── POD A  ── TransactionReceived (local clients: X)  ◄──  /
            \                                                /
             →  Redis Pub/Sub (channel "rtm:")  ─────────────────────►  POD B → Client-Y
                 (hub propagates event to every backplane member)
```

1. עסקה מפורסמת ל-Pod A → `SignalRTransactionBroadcaster` משדרת ללקוחות המקומיים
   של A **וגם** מפרסמת אירוע ל-Redis (backplane).
2. Redis מעביר את ההודעה לכל שאר הפודים המחוברים (B, C, …).
3. כל פוד לוקח את ההודעה ומשדר אותה ללקוחות שחוברו **אליו** → אין לקוח ש"איחר".

## יתרונות (Benefits)

- **עקביות מלאה בין מופעים:** כל לקוח מקבל כל עסקה, בלי שום proxy של "מי הבעלים".
- **מנוף קיים:** אותו Redis ששימש ל-cache; אין מנוע/תשתית חדשה.
- **שקוף ל-SignalR:** אותו `.Invoke`/`SendToAll` — הבדל רק בהרשמה בחזית.
- **היסטוריה cache-backed** נשארית — `InitialTransactions` מגיעה מהקאש המשותף.

## מגבלות (Limitations / Trade-offs)

- **תיגברת latency:** כל הודעה עוברת דרך Redis (round-trip נוסף) — נהיר למקרה
  של push.
- **Redis = נקודת כשל** (SPOF) אם אין Replication/Sentinel: נופל Redis → כל
  backplane נופל. פתרון: Redis HA (Sentinel / Redis Enterprise / Managed).
- **Scale-out != Scale-up:** Backplane פותר רוחב לקוחות, אבל כל פוד עדיין מחזיק
  את ה-In-Memory store זמנית — עסקאות לא נמשכות across-restart (ללא durable store).
- **עלות/תפעול:** pub/sub רץ תמיד; בעומס־גאות גבוה ייתכן צורך בפריסה של ערוצים.

## חלופות שנשקלו

1. **Full-broadcast בכל מופע**: כל Pod משדר לעצמו את כל ההודעות ללא תיאום —
   שגוי ובלתי־קריא לתחזוקה.
2. **Proxy-centering (כיוון לקוח אחד ל-Pod יחיד)**: פותר את הבעיה אך שובר
   איזון־עומס ואת זמינות הפודים.
3. **החלטה:** Redis Pub/Sub (Backplane) — הסטנדרט המומלץ ע"י מיקרוסופט, מנוף
   קיים, ופשוט להוספה כשעולים ל-2+ מופעים.

## שלב היישום העתידי (כשנעבור ל-2+ מופעים)

```bash
# תלות חדשה (חובה) — מכניסה את ה-Backplane:
dotnet add src/RTM.Api package Microsoft.AspNetCore.SignalR.StackExchangeRedis
```
```csharp
// ב-Program.cs — שינוי יחיד ב-SignalR registration:
builder.Services.AddSignalR()
    .AddStackExchangeRedis(builder.Configuration["Redis:Configuration"]);
```
```yaml
# קובצי ה-K8s הקיימים אינם משתנים — Redis כבר מנוהל בתוך-קלאסטר.
```
עם יישום זה נוסיף בדיקת אינטגרציה עם `WebApplicationFactory` המוכיחה שאירוע
שנכנס ל-Pod A מגיע ללקוחות של Pod B דרך ה-Backplane.
כל חתימה של `AddressCache` כפולה תיבדק ב-Tests интеграции `WebApplicationFactory`.
