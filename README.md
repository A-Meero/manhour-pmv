# Man Hour System

Tracks employees' man-hours per job card for Ahmadiah Contracting & Trading Co.
It uses the same stack as PMV Workflow: Next.js 16.3, React 19.2, TypeScript, Prisma 7.9 with the PostgreSQL adapter, Tailwind 4 and bcryptjs.

## First-time setup (same machine as PMV, separate database)

1. Create an empty database on the PostgreSQL server, e.g. `manhour_system`.
2. Copy `.env.example` to `.env` and fill in `DATABASE_URL`, `AUTH_SECRET`, `ADMIN_EMAIL` and `ADMIN_PASSWORD`.
   If you open the app over plain `http://` (no HTTPS) in production, also set `INSECURE_COOKIES="true"`.
3. Install the packages and create the tables:
   ```
   npm install
   npx prisma migrate dev --name init
   npm run db:seed
   ```
   `db:seed` creates the first admin. Then remove `ADMIN_PASSWORD` from `.env`.
4. Run the app:
   - Development: `npm run dev`, then open http://localhost:3002
   - Production: `npm run build`, then `npm start` (port 3002, so it doesn't clash with PMV on 3000)

For later schema changes, run `npx prisma migrate deploy` on the server.

## Who can do what

| | Admin | Manager | Supervisor (any user with assigned employees) | Employee user |
|---|---|---|---|---|
| View records | all | all | own + supervised employees | own (linked employee) |
| Enter / import / scan records | anyone | anyone | supervised employees | self, only if "Can enter his own records" is ticked |
| Start / stop work by scanning a job card QR code | if linked to an employee | if linked to an employee | if linked to an employee | if linked to an employee |
| Review and correct QR work sessions | all | all | supervised employees | – |
| Close / reopen job cards | any card | any card | cards their employees worked on | – |
| Edit records | ✓ | ✓ | – | – |
| Delete records | ✓ | – | – | – |
| Analytics, labour and parts costs | ✓ | ✓ | – | – |
| Browse job cards, print QR labels | ✓ | ✓ | ✓ | store managers |
| Create / edit job cards, employees, users, form fields, settings, API keys | ✓ | – | – | – |
| Use a logging way switched off in Settings | ✓ | – | – | – |
| Blocked by the daily/weekly hour limits | no | yes | yes | yes |

**Store manager** is a tick box on any user (Users page). Store managers manage the inventory and issue spare parts to job cards. Admins can do this as well.

## Rules

- **Job card IDs** and **employee file numbers** are unique. They are saved in upper case with extra spaces removed. When an ID already exists, it is skipped and listed in the import report.
- A **job card can be recorded only once per employee**: after a record is saved, that card is closed for that employee. Other employees can still record it. Deleting the record (admin only) opens it again.
- Each record has an employee, a job card, a start date, an end date, hours (decimals allowed) and remarks, plus any custom fields.
  The employee's name, job title and supervisor(s) are filled in automatically.
- **Hour limits** are set in Settings, and you can leave them empty for no limit. A record's hours are spread evenly over its days. The daily and weekly totals include all of the employee's records. The week starts on the day chosen in Settings (Saturday by default). Admins are never blocked.
- **Imports** (Excel and API) save the valid rows and return a report of the skipped and invalid ones. The report can be downloaded later from Import History.
- **Closed job cards** take no new QR sessions, part issues or records (admins can still add records, or reopen the card). Closing a card stops anyone still working on it.

## Ways to enter records

Each way can be switched off in **Settings › General › Ways of logging man-hours**. A switched-off way disappears from the menu and is blocked for everyone except admins. Records already saved are not affected.

1. **New Entry**: a form shaped like the paper sheet, with one employee and as many job card lines as needed.
2. **Import Records**: an Excel template (one row per employee + job card, with start and end dates). Download the template from the page.
3. **Scan Sheet**: print the PDF sheet (blank, or pre-filled for one employee from the Employees page). After it's filled in by hand, take a photo with the phone.
   - The photo is read by the **AI providers** set up in Settings › Photo reading, in priority order (see below). This needs internet on the server, except for a local model.
   - If no provider is enabled, or all of them fail, the photo is read with **Tesseract**, which works offline but is much weaker on handwriting.
   - The user always reviews the rows next to the photo before saving. The photo stays linked to the saved records.
4. **Job card QR**: every job card has a QR code (Job Cards › QR icon, or **QR labels (open cards)** for a printable A4 sheet of labels).
   - A technician scans it with the phone's normal camera. The link opens the job card, and they sign in with their own login (linked to their employee record) and tap **Start work** / **Stop work**. They can do this as often as needed, over several days, until the card is closed.
   - One job at a time: starting on another card stops the one still running.
   - All of a technician's sessions on a card add up into their single man-hour record for it (source "QR scan"), so Records, Analytics, limits and exports include them. The hours and dates of such a record can't be typed over; correct the sessions instead.
   - If a technician's hours on a card were already entered another way (form, Excel, sheet), QR scanning on that card is blocked for them.
   - **Forgotten stop**: a session still running after the **maximum session length** (Settings › General, 12 h by default) is stopped automatically and flagged. Supervisors, managers and admins fix the times on **Work Sessions** or on the job card page, where they can also add a session someone forgot to scan.
   - QR time is measured clock time, so it is never blocked by the hour limits. A session that takes an employee over a limit is flagged for review instead.
   - The QR codes hold `<App address>/jc/<job card ID>`. Set **Settings › General › App address** to the address phones use on your network (e.g. `http://192.168.1.20:3002`) **before printing labels**. Otherwise the address you are using at that moment is printed, and `localhost` won't work from a phone.
   - Login sessions last 12 hours, so technicians sign in again once a day.

## Spare parts and inventory

- **Inventory** (store managers and admins): parts with part no., name, unit, unit cost (KWD), quantity on hand and an optional low-stock level. Add parts one by one or import them from Excel, and export the stock list.
- **Receive** adds stock and can update the unit cost to the latest purchase price. **Adjust** sets the counted quantity after a stock count and needs a reason. Every change is kept in the part's history.
- **Issuing parts**: the store manager scans the job card QR code (or opens the job card page), searches the parts and enters the quantities. Parts are issued at their current unit cost, and stock can't go below zero. A mistaken line can be returned to stock with a reason. Closed cards take no new issues.
- Parts at or below their low-stock level are highlighted, and the home page shows how many there are.

## Costs

- Each employee has an **hourly rate** (KWD, Employees page or the Excel import). Records keep the rate from the moment they were saved, so changing a rate later doesn't change past costs. Records from before rates existed use the current rate.
- **Labour cost** = hours × rate. **Parts cost** = quantity issued × unit cost at the time of issue, minus returns.
- The job card page shows both and the total. Analytics shows them per job card and for the period, and the records export has rate and labour cost columns. Costs are visible to admins and managers only.

### AI providers for photo reading
In **Settings › Photo reading**, admins can add these providers:

| Type | Default base URL | Example model |
|---|---|---|
| Claude (Anthropic) | `https://api.anthropic.com` | `claude-sonnet-5-5` |
| Google Gemini | `https://generativelanguage.googleapis.com` | `gemini-flash-latest` |
| Qwen (Alibaba Cloud, DashScope) | `https://dashscope-intl.aliyuncs.com/compatible-mode/v1` | `qwen-vl-max` |
| OpenAI-compatible (OpenAI, DeepSeek, local Ollama / LM Studio, …) | `https://api.openai.com/v1` | `gpt-4o-mini`, or a local vision model |

- Each provider has one API key, a model name (typed by the admin, and it must accept images), an optional base URL and a timeout.
- **Test** sends a tiny request to check the key, model and address.
- Providers are tried **top to bottom**. If one fails, times out or returns unreadable output, the next enabled one is tried, and Tesseract is the last fallback. The review screen shows which provider read the card, and a warning lists any that failed.
- The API keys are stored encrypted with `AUTH_SECRET`. If you change `AUTH_SECRET`, enter the keys again.
- An existing Claude key from an earlier version is moved into the list automatically.

### Tesseract fully offline (optional)
By default Tesseract downloads its English language file the first time it's used. To avoid that, download `eng.traineddata` from https://github.com/tesseract-ocr/tessdata_fast. Put it in a folder such as `C:\manhour\tessdata` and set `TESSDATA_DIR` to that folder in `.env`.

## API for the job card system

Create a key in **Settings › API access**, then:

```
POST /api/v1/job-cards
Authorization: Bearer <key>
Content-Type: application/json

["JC-1001", "JC-1002"]
```

```
POST /api/v1/employees
Authorization: Bearer <key>

{ "employees": [ { "fileNo": "1023", "name": "Ali Hassan", "jobTitle": "Electrician", "supervisorEmails": ["sup@ahmadiah.com"] } ] }
```

The response is `{ created, skipped, failed, issues: [{ row, value, reason, status }] }`.
The format can be adapted once the job card system's API is defined.

## Custom fields

In **Settings › Form fields**, admins can add fields to records, employees or job cards. The available types are text, number, date, a list to choose from, and yes/no.
These fields appear in the forms, tables, Excel templates and the records export.
The standard sheet fields are fixed and always present.

## Where things are

- `prisma/schema.prisma`: the database model
- `src/lib/records.ts`: record validation (duplicates, permissions, hour limits)
- `src/lib/masterdata.ts`: job card and employee imports
- `src/lib/ocr.ts`: photo reading (AI providers in priority order, then Tesseract)
- `src/lib/ai-providers.ts`, `src/lib/ai-vision.ts`: AI provider settings (encrypted keys) and the API calls for each provider type
- `src/lib/pdf-template.ts`: the printable sheet
- `src/lib/excel.ts`: Excel templates, parsing and exports
- Photos are stored in `UPLOAD_DIR/scans/<yyyy-mm>/`
