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
