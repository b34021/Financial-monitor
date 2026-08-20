# CLAUDE.md — חוקי עבודה בפרויקט RTM (Real-Time Financial Monitor)

מסמך זה נועד לכל סשן של Claude. קרא לפני כל עבודה בפרויקט.

## מהו הפרויקט
MVP של "Real-Time Financial Monitor": API קולט עסקאות, מעבד אותן ומשדר אותן
בזמן-אמת ללוח מחוונים (dashboard) חי. Backend = .NET 8, Frontend = React + TypeScript.

## טופולוגיה / מבנה
```
src/RTM.Api/          → Backend (.NET 8 webapi) — layers: Api → Services → Store
tests/RTM.Tests/      → xUnit (unit + integration) — TDD
client/               → React + TS (Vite) — routes /add (simulator) + /monitor (live)
docs/ADR.md           → החלטות ארכיטקטוניות
PROGRESS.md           → יומן התקדמות (לא למחוק היסטוריה — להוסיף למטה)
```

## מודל Transaction (ייחוד — 5 שדות בלבד, לפי ה-JSON במטלה)
`transactionId (guid-string)`, `amount (decimal)`, `currency (ISO 3)`,
`status (enum: Pending|Completed|Failed)`, `timestamp (DateTimeOffset, UTC ISO-8601)`.
אין `merchantId`, אין שדות נוספים. כל קוד וכל בדיקה חייבים להישען על זה.

## חוקים עסקיים חובה
- **Layered Architecture:** Api → Services → Store (אין תלות שבורה חוצת שכבות).
- **Dependency Injection (DI)** — אסור `new` של שירות. הכל מוזרק דרך builder.
- **Result pattern** — שגיאות צפויות מוחזרות ככ-Result (רגל), לא Exceptions.
- **CancellationToken** בכל פעולת I/O / Web / קיום.
- **Nullability מופעל** + `TreatWarningsAsErrors=true` (שני הפרויקטים).
- **Logging מובנה (ILogger)** בהטמעה אינגסטיה + שידור.
- **Configuration** מ-`appsettings.json` (לא hardcoded) — במיוחד Redis.
- **SOLID** — לכל מחלקה מטרה יחידה.
- **Thread-Safety** חובה למודעה המקבילות (בדיקות concurrency).
- **TDD אמיתי:** Red → Green → Refactor על כל פיצ'ר.

## וידוא וקרטריון קבלה לכל משימה
- אחרי כל משימה: `dotnet build` + `dotnet test` [חייב ירוק].
- רק אחרי ירוק → `git add .` + `git commit` עם הודעה ברורה בעברית (משמעותית).
- `.gitignore` מחייב: bin/, obj/, node_modules/, .vs/ — אסור שייכנסו ל-repo.
- **STOP-AND-REPORT:** אחרי כל משימה לעצור, להסביר בעברית מה נעשה, ולתת למשתמש לבדוק לפני שעוברים הלאה.

## בונוס (חובה — נתפס ב-Part 4)
- Dockerfile multi-stage קטן ל-production + docker-compose (app + redis) + Kubernetes (deployment.yaml, service.yaml).
- README.md קצר + docs/ADR.md עם הפתרון המוצע לסנכרון בין 5 מופעים (PowerDuplication/Redis pub-sub).
- כל זה חלק מהמסירה — אין לוותר עליו.

## סטאק / גרסאות
- .NET SDK 8.0.424 (LTS), net8.0
- React + TypeScript (Vite + react-router-dom)
- Redis (StackExchange.Redis) ← fallback InMemory כשאין קונטיינר
- SignalR (ASP.NET Core WebSockets)
