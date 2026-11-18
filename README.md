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
   - Development: `npm run dev`, then open http://localhost:3001
   - Production: `npm run build`, then `npm start` (port 3001, so it doesn't clash with PMV on 3000)

For later schema changes, run `npx prisma migrate deploy` on the server.

## Who can do what

| | Admin | Manager | Supervisor (any user with assigned employees) | Employee user |
|---|---|---|---|---|
| View records | all | all | own + supervised employees | own (linked employee) |
| Enter / import / scan records | anyone | anyone | supervised employees | self, only if "Can enter his own records" is ticked |
| Edit records | ✓ | ✓ | – | – |
| Delete records | ✓ | – | – | – |
| Analytics | ✓ | ✓ | – | – |
| Job cards, employees, users, form fields, settings, API keys | ✓ | – | – | – |
| Blocked by the daily/weekly hour limits | no | yes | yes | yes |

## Rules

- **Job card IDs** and **employee file numbers** are unique. They are saved in upper case with extra spaces removed. When an ID already exists, it is skipped and listed in the import report.
- A **job card can be recorded only once per employee**: after a record is saved, that card is closed for that employee. Other employees can still record it. Deleting the record (admin only) opens it again.
- Each record has an employee, a job card, a start date, an end date, hours (decimals allowed) and remarks, plus any custom fields.
  The employee's name, job title and supervisor(s) are filled in automatically.
- **Hour limits** are set in Settings, and you can leave them empty for no limit. A record's hours are spread evenly over its days. The daily and weekly totals include all of the employee's records. The week starts on the day chosen in Settings (Saturday by default). Admins are never blocked.
- **Imports** (Excel and API) save the valid rows and return a report of the skipped and invalid ones. The report can be downloaded later from Import History.

## Ways to enter records

1. **New Entry**: a form shaped like the paper sheet, with one employee and as many job card lines as needed.
2. **Import Records**: an Excel template (one row per employee + job card, with start and end dates). Download the template from the page.
3. **Scan Sheet**: print the PDF sheet (blank, or pre-filled for one employee from the Employees page). After it's filled in by hand, take a photo with the phone.
   - If a **Claude API key** is saved in Settings › Photo reading, Claude reads the handwriting. This needs internet on the server.
   - Otherwise the photo is read with **Tesseract**, which works offline but is much weaker on handwriting.
   - The user always reviews the rows next to the photo before saving. The photo stays linked to the saved records.

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
- `src/lib/ocr.ts`: photo reading (Claude / Tesseract)
- `src/lib/pdf-template.ts`: the printable sheet
- `src/lib/excel.ts`: Excel templates, parsing and exports
- Photos are stored in `UPLOAD_DIR/scans/<yyyy-mm>/`
