# ADR-003 — SignalR message distribution across replicas (Redis Backplane) for Node × N

- **מצב:** מיושם (Implemented) — מופעל באמצעות דגל מותנה `SignalR:UseRedisBackplane`.
- **תאריך:** 2026-08-21 (עודכן 2026-08-23)
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

## מימוש — דגל מותנה (Conditional)

החבילה הותקנה ו-`Program.cs` נרשם מותנית:

```csharp
// Program.cs — SignalR registration (conditional backplane):
builder.Services.AddSignalR();
if (builder.Configuration.GetValue<bool>("SignalR:UseRedisBackplane"))
{
    builder.Services.AddSignalR()
        .AddStackExchangeRedis(options =>
        {
            options.Configuration = builder.Configuration["SignalR:Redis"];
        });
}
```

- **`SignalR:UseRedisBackplane`** (default `false`): הפעלת ה-Backplane. מוגדר ב-
  `appsettings.json` ובר-החלפה מ-`env` בלי לשנות קוד — נדרש לפריסה מרובת-מופעים
  (`replicas > 1`).
- **`SignalR:Redis`** (default `redis:6379`): ה-host:port של ה-Redis אליו מתחברים כל
  הפודים (בקלאסטר: סרוויס ה-Redis הפנימי; ב-K8s manifests כבר קיים `Redis__Configuration`).
- עם `false` (ברירת המחדל, דמו/חד-מופעי) — נשאר **in-process** בדיוק כמו קודם,
  ללא תלות בפריסה: החד-מופעי אינו נשבר ואינו דורש Redis.
- ה-`TransactionHub` + `SignalRTransactionBroadcaster` אינם השתנו — ברגע שה-Backplane
  מופעל, `Clients.All.SendAsync` פורס את האירוע אוטומטית לכל הפודים המחוברים לערוץ
  המשותף. בלי double-broadcast (שיר יחיד ל-`SendAsync`).

> **מגבלה (חד-מופעי, default):** בפריסה של מופע אחד אין נתק בין-מופעי מלכתחילה —
> כל הלקוחות מתחברים לאותו hub. רק כשמריצים `replicas > 1` חייבים להפעיל
> `UseRedisBackplane=true` (ולספק כתובת Redis). אימות חי של שני pods/ערוץ משותף
> מיועד להרצה מרובת-מופעים (Docker/K8s); ברירת המחדל נשארת חד-מופעית.
