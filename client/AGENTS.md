# AGENTS.md — חוקי הכתיבה של קליינט RTM (`client/`)

קובץ זה הוא מקור הכללים (RULES) לקוד ה-React + TypeScript בפרויקט.
נקרא בעבודה בתוך `client/`. כל העבודה בקליינט מחויבת אליו.

## עקרונות על
- **סטנדרט כתיבה גבוה**, בסגנון מהנדס פרונט בכיר.
- כל כלל למטה הוא **חובה** — לא הצעה. יוצא-דרך רק אם יש סיבה מנומקת מפורשת.
- שפה ברורה, שמות מתארים, קוד קריא. UI באנגלית בלבד (תוכן/ממשק).
- Solid + React idiom: קומפוננטה אחת = מטרה אחת.

## 1. גודל קומפוננטה ≤ 150 שורות
קומפוננטה/דף לא חורגים מ-150 שורות. כשמתקרבים לחוטב — מפרקים לרכיבי משנה
(children) לפי נושא. (הדפים הנוכחיים קטנים מ-150; לשמור על זה לאורך זמן.)

## 2. חלוקה לפי נושא (הרכבה/עריכה ← קומפוננטה אחת; תצוגה ← אחרת)
- פעולות קרובות (הוספה ועריכה של אותה ישות) חיים באותה קומפוננטה/מודול.
- **טבלת/רשימת תצוגה וטופס הוספה** הם **שתי קומפוננטות נפרדות** (לא למזגן:
  `TransactionList` ≠ `TransactionForm`).
- פיצול לפי תפקיד, לא לפי שורה.

## 3. קריאות שרת — בתיקיית `services/`
כל קריאת רשת (REST/API) חיה תחת `src/services/` (למשל `api.ts`). אין
קריאות fetch/axios פזורות עמוק בתוך דף/קומפוננטה — הדפים קוראים ל-Service או
ל-Hook המבוסס עליו.

## 4. תגיות/רכיבים חוזרים → קומפוננטה משותפת קטנה
מבנה JSX או תגית שחוזרת על עצמה מוצאים לקומפוננטה קטנה וייעודית (לדוגמה
`StatusBadge`, `TransactionCard` הקיימים). לא לשכפל JSX.

## 5. שמות משתנים — ברורים, תקינים, מתארים
- camelCase למשתנים/פונקציות, PascalCase לקומפוננטות/טיפוסים.
- שמות מתארים את התפקיד — אסור `x`, `data`, `temp`, `val`, `any`, `thing`.
- Prop־ים מפורשים, לא סתורים (`transaction` לא `t`; `onSaved` לא `cb`).

## 6. כל קריאות השרת — axios + @tanstack/react-query
- HTTP תקין: **axios** (instance אחד עם `baseURL` מ-`VITE_API_BASE_URL`).
- ניהול נתונים: **@tanstack/react-query** — `useQuery` לקריאה, `useMutation`
  לכתיבה. לא fetch ישיר, לא try/catch ידני בקומפוננטה.
- ⚠️ **חריג מוצהר**: `SignalR` (`services/signalR.ts`) הוא ערוץ live ולא
  בקשה-תגובה REST — אינו חייב axios/tanstack; נשאר ב-`@microsoft/signalr`.

## 7. ניתוב — React Router v7: `createBrowserRouter` + `RouterProvider`
- כל הניתוב מוגדר **במקום אחד** (בדרך כלל `src/router.tsx` או ב-`main.tsx`).
- משתמשים ב-**`createBrowserRouter` + `<RouterProvider router={...} />`**.
- אסור `<BrowserRouter>`/`<Routes>` הישנים.
- יש **`<Outlet/>` מרכזי** בתוך קומפוננטת ה-shell (`App`), והדפים אכלים בו.

## 8. TypeScript — אסור `any`
- אסור `any` על שום משתנה/פונקציה/פרופא/החזרה. `noImplicitAny` + `strict`
  מופעלים, ו-`typescript/no-explicit-any` הוא `error`.
- אם טיפוס חסר — להגדיר אותו במפורש (union/enum/interface), לא לזרוק `as any`.
- הבחנה: `step="any"` בתגית `<input>` הוא **ערך HTML חוקי**, לא הפרה.

## 9. מודלים — כולם בתיקיית `types/`
כל טיפוסי האובייקטים/המודלים (תגובת API, DTO, enums) בקובץ אחד או יותר תחת
`src/types/`. דף/קומפוננטה לא מגדירים מודלים עסקיים מקומית (אלא בטיפוסים
ה-כלליים). בדומה לבאקנד — המודל מחליט: `Transaction`, `IngestTransactionRequest`.

## 10. טפסים — react-hook-form + zod
- כל טופס משתמש ב-**`react-hook-form`** (`useForm` + `register`/`handleSubmit`).
- ולידציה טיפוסית: **`zod`** schema + `zodResolver`. לא `required`/תגיות-כפל.
- ה-`Input`/`Select` מקבלים `...register('field')`, וה-`errors` מה-RHF מוצגים
  per-field.

---
## הנחות / חריגים מתועדים
- `SignalR` — חריג לכלל 6 (ערוץ live).
- `step="any"` — תגית HTML תקינה ב-`<input type="number">`, אינו `any` של TS.
- UI/טקסטים — **אנגלית בלבד** (אין עברית בממשק המשתמש).
