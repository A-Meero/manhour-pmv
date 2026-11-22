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

### Docker

The app runs with `docker compose` (`docker-compose.yml`, settings in `.env.docker`). To update to a new version:

```
docker compose up -d --build
```

On start the container applies new database migrations (`prisma migrate deploy`) and then starts the app, together with the background checks for shift ends and stale QR sessions. Email needs the variables from the **Email** section in `.env.docker`. Set `DISABLE_SCHEDULER="true"` only if another copy of the app already runs the checks.

## Who can do what

- **Admin** (tick box on the user) can do everything, including Settings, API keys, form fields and the **Permissions** page.
- Everyone else gets what their **permission groups** allow (**Permissions** page: create groups, tick permissions, add members; or pick groups on the Users page). A user in several groups gets all of their permissions.
- Every user sees **their own records** (linked employee). **Supervisors** (users assigned to employees on the Employees page) also see, enter, review and close cards for **their team**, without any permission.

| Area | Permission | What it allows |
|---|---|---|
| Job cards | View job cards | Browse job cards, open a card, print QR labels |
| | Add job cards | Add Job Card page (photo / typed) and the Excel import |
| | Edit job card details | Correct the printed details, link another asset, deactivate / delete unused cards |
| | Close & reopen job cards | Any card (supervisors without it: cards their team worked on) |
| Time | Technician | Start / stop work by scanning job card QR codes (login linked to an employee) |
| | Enter own man hours | New Entry / Scan Sheet / Import for themselves |
| Records | View all employees' records | Instead of own + team |
| | Enter records for anyone | Instead of own (if allowed) + team |
| | Edit records · Delete records | On the records they can see |
| | View analytics · View costs & rates | Analytics; hourly rates, labour, parts and asset values |
| Sessions | Review all work sessions | Instead of their team only |
| Store | Store manager | Issue spare parts, manage the inventory |
| Assets | View assets & history · Manage assets | Assets pages; add / edit / import assets |
| Administration | Manage employees & shifts · Manage users | Employees page and shifts; Users page (can't create or change admins) |

The upgrade turned the old user types into groups automatically: **Manager**, **Store Manager**, **Technician** (every user linked to an employee) and **Own records entry**. Hour limits block everyone except admins. A logging way switched off in Settings stays available to admins only.

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
   - Or from inside the portal: **Scan Job Card** in the menu. **Take a photo of the QR** works over plain http, and the photo is read in the browser and never uploaded. When the portal is opened over HTTPS, a **live camera** button appears too. The job card number can also be typed. The same page is used by store managers and supervisors.
   - One job at a time: starting on another card stops the one still running.
   - All of a technician's sessions on a card add up into their single man-hour record for it (source "QR scan"), so Records, Analytics, limits and exports include them. The hours and dates of such a record can't be typed over; correct the sessions instead.
   - If a technician's hours on a card were already entered another way (form, Excel, sheet), QR scanning on that card is blocked for them.
   - **Forgotten stop**: a session still running after the **maximum session length** (Settings › General, 12 h by default) is stopped automatically and flagged. Supervisors, managers and admins fix the times on **Work Sessions** or on the job card page, where they can also add a session someone forgot to scan.
   - QR time is measured clock time, so it is never blocked by the hour limits. A session that takes an employee over a limit is flagged for review instead.
   - The QR codes hold `<App address>/jc/<job card ID>`. Set **Settings › General › App address** to the address phones use on your network (e.g. `http://192.168.1.20:3002`) **before printing labels**. Otherwise the address you are using at that moment is printed, and `localhost` won't work from a phone.
   - Login sessions last 12 hours, so technicians sign in again once a day.

## Shifts and after-shift alerts

- **Settings › Shifts**: define named shifts with start time, end time and working days (the day the shift starts). An end time earlier than the start means an overnight shift, e.g. 19:00–07:00.
- **Employees**: give each employee a shift (form, or the **Shift** column of the Excel import, matched by shift name).
- Every minute the server checks QR sessions that are still running. If a session started during the employee's shift (or up to 2 h early) and the shift ended more than the **grace period** ago (Settings › General, 15 min by default):
  1. the technician gets an **in-app reminder** (bell), and the **timer keeps running**;
  2. it is stopped when the technician's **daily or weekly hour limit** (Settings › General) is reached, whichever comes first, at the exact moment it was reached, but never before the shift end. With no limits set, the **maximum session length** applies instead.
  3. At that stop the session is flagged for review, the technician is notified in the app, and the supervisor(s) get an **email** (admins, when the employee has no supervisor; one email per supervisor per check).
- When the technician opens the job card (from the notification or by scanning it) they answer:
  - still running: **Continue working** or **I finished at <shift end>** (the end time becomes the shift end);
  - stopped at the limit: **I finished at <shift end>** (end time corrected, review cleared) or **I worked until <time>** (kept, stays flagged for the supervisor).
- Sessions started outside the shift (overtime, days off) get no reminder; the maximum session length still applies to them.
- Supervisors confirm or correct the times on **Work Sessions**.
- Turn the reminders off with **Settings › General › After-shift reminders**. If email isn't set up, reminders and stops still happen, and the skipped email is written to the audit log.

## Notifications

The bell at the top shows unread in-app notifications (refreshed every minute). Clicking one opens what it is about; **See all** lists the last 200.

- **Shift reminder** and **work stopped at the hour limit**: to the technician.
- **Session to review**: to the employee's supervisors (admins if none), once per flagged session.
- **Low stock**: to store managers and admins when a part drops to or below its low-stock level (once each time it crosses the level).

## Job cards and assets

- **Add Job Card** (permission "Add job cards"): photograph the printed job card from the workshop system (a PDF of it also works). The AI providers from Settings › Photo reading read the **printed** header only and ignore handwriting: Rep.Order Number (= the job card number), Code (= asset code), description, plate, chassis, YoM, HM/KM readings, date in, job type, repair at, project, work done lines, operator, received by, created by. Everything is shown next to the photo to check before saving. **Type it in** is the same form without a photo. The photo stays linked to the card ("Original card").
- Checks before saving (repeated on the server):
  - the **job card number must be new**;
  - the **asset** is found by code, then plate no., then chassis no. If none matches, **Create asset from this card** adds it (the rest of its details are completed on the Assets page), or another asset can be chosen;
  - an asset can have **only one open job card**. Only an admin can add a second one ("Add anyway"), and reopening a closed card follows the same rule.
- The Excel import of job cards (Job Cards page) has the same columns; the asset must exist, and rows for an asset that already has an open card are rejected (except in an admin's import).
- **Assets** (permissions "View assets" / "Manage assets"): code, description, category, location / department, make, model, serial, chassis, plate, year, purchase date, purchase value and **depreciation rate** (straight line, % of the purchase value per year). Add them one by one, import them from Excel (a code that already exists updates that asset from the filled-in cells; blank cells keep their value), export the list.
- The **asset page** shows its details, the **book value today**, the **total maintenance cost** (labour + parts of all its job cards), the cost **per month and per year**, and the **job card history** with dates, job type, HM/KM and cost of each card. Values and costs need "View costs & rates".

## Email

Email is configured on the server, not in the portal, so the password or secret never sits in the database. Add the variables to `.env` (or `.env.docker`); see `.env.example`.

**Microsoft 365 / Outlook (recommended): Microsoft Graph.** Microsoft is retiring password sign-in for SMTP on Exchange Online, so the app sends through Graph with an app registration:

1. In the **Entra admin center** › App registrations › **New registration** (single tenant, no redirect URI).
2. **API permissions** › Add › Microsoft Graph › **Application permissions** › `Mail.Send` › **Grant admin consent**.
3. **Certificates & secrets** › New client secret. Copy the value, because it's only shown once and it expires (renew it before the date shown).
4. Pick the sender mailbox, e.g. a shared mailbox `noreply@yourcompany.com`. Recommended: limit the app to that mailbox with an Exchange **application access policy** (or RBAC for Applications), because `Mail.Send` otherwise allows sending as any mailbox.
5. Set `MAIL_PROVIDER="graph"`, `MAIL_FROM`, `GRAPH_TENANT_ID`, `GRAPH_CLIENT_ID` and `GRAPH_CLIENT_SECRET`, then restart the app.
6. **Settings › General › Send me a test email** sends to your own login email.

Other mail servers: `MAIL_PROVIDER="smtp"` with `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASSWORD`. Supervisors receive alerts at their **login email**, so it has to be a real mailbox.

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
