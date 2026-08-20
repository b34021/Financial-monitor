# ADR-002 — SignalR לשכבת הזמן-אמת (במקום WebSocket נאיבי)

- **מצב:** אומץ (Accepted)
- **תאריך:** 2026-08-20
- **בעל החלטה:** RTM — Backend (.NET 8) → Frontend (React + TS)

## החלטה (Decision)

פרסם/שדר עסקאות ללקוחות בשידור בזמן-אמת באמצעות **ASP.NET Core SignalR**
(פרוטוקול רשמי של מיקרוסופט), **ולא** מימוש WebSocket ידני/נאיבי.

## הקשר (Context)

ה-MVP דורש לוח מחוונים חי ("/monitor"): עסקה חדשה שנקלטת אצל שרת צריכה
להתעדכן אצל כל הלקוחות המחוברים במעט חביון. בחירה בין WebSocket ע"פ אינט מחשיב
(מימוש נאיבי של ניהול חיבורים, heartbeats/reconnect, חדר הודעות) לבין שימוש
בפתרון בוגר מובנה.

## ההחלטה (Decision)

- רכיב Hubs (SignalR) = נקודת הקלטת החיבורים מ-Client.
- השרת דוחף אירועי עסקאה ל-Hub (Broadcast) והלקוחות (React) מאזינים דרך
  `@microsoft/signalr`.
- ניהול חיבורים/התחברויות מחדש/heartbeat — מובנה ב-SignalR, ללא code נוסף.
- (אופציונלי בהמשך) Redis backplane לפיזה בין מופעים — על זה מציע ADR נפרד/המשך.)

## השלכות (Consequences)

**Pros:**
- פשטות: הוספת Hub + 2-3 שורות רישום שרת; React client קוד-מוכן.
- חוסן מובנה: reconnect אוטומטי, throughput טוב, תמיכה ב-HTTP/2.
- סקאלביליטי: היכולת להרחבה ל-2+ מופעים אפשרית (Redis backplane) בלי לשנות את
  לוגיקת הלקוח.

**Cons:**
- תלות בחבילת SignalR (ASP.NET Core + client) — משקל רצוי מוצדק לדרישה.
- WebSocket קצה ב-Cloud/Load-balancer דורש configuration; בכלליות SignalR מעביר
  על TCP/WebSocket כברירת מחדל.
- ניטור חיבורים פעילים ברור (SignalR) אך מצריך הבנה של מחזור החיים של החיבור
  בטרמינל הדרייבר/Diagnostics.
