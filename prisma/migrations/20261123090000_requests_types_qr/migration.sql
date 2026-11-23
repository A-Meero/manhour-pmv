-- CreateEnum
CREATE TYPE "RepairType" AS ENUM ('WORKSHOP', 'ONSITE');

-- CreateEnum
CREATE TYPE "PartRequestStatus" AS ENUM ('OPEN', 'MR_RAISED', 'FULFILLED');

-- AlterTable
ALTER TABLE "JobCard" ADD COLUMN     "receivedById" TEXT,
ADD COLUMN     "repairType" "RepairType";

-- CreateTable
CREATE TABLE "PartRequest" (
    "id" TEXT NOT NULL,
    "jobCardId" TEXT NOT NULL,
    "requestedById" TEXT,
    "text" TEXT NOT NULL,
    "status" "PartRequestStatus" NOT NULL DEFAULT 'OPEN',
    "mrNumber" TEXT NOT NULL DEFAULT '',
    "storeNote" TEXT NOT NULL DEFAULT '',
    "mrRaisedAt" TIMESTAMP(3),
    "fulfilledById" TEXT,
    "fulfilledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PartRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PartRequest_status_idx" ON "PartRequest"("status");

-- CreateIndex
CREATE INDEX "PartRequest_jobCardId_idx" ON "PartRequest"("jobCardId");

-- CreateIndex
CREATE INDEX "JobCard_receivedById_idx" ON "JobCard"("receivedById");

-- AddForeignKey
ALTER TABLE "JobCard" ADD CONSTRAINT "JobCard_receivedById_fkey" FOREIGN KEY ("receivedById") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartRequest" ADD CONSTRAINT "PartRequest_jobCardId_fkey" FOREIGN KEY ("jobCardId") REFERENCES "JobCard"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartRequest" ADD CONSTRAINT "PartRequest_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartRequest" ADD CONSTRAINT "PartRequest_fulfilledById_fkey" FOREIGN KEY ("fulfilledById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Data: job card type from the printed "Repair at" (same default words as Settings › Workshop words)
UPDATE "JobCard" SET "repairType" = 'WORKSHOP' WHERE "repairAt" ~* '(GARAGE|WORKSHOP)';
UPDATE "JobCard" SET "repairType" = 'ONSITE' WHERE "repairType" IS NULL AND btrim("repairAt") <> '';

-- Data: link "Received by" to the employee with exactly that name (case and spaces ignored)
UPDATE "JobCard" j SET "receivedById" = e.id
FROM "Employee" e
WHERE j."receivedById" IS NULL
  AND btrim(j."receivedBy") <> ''
  AND upper(regexp_replace(btrim(e.name), '\s+', ' ', 'g')) = upper(regexp_replace(btrim(j."receivedBy"), '\s+', ' ', 'g'))
  AND (SELECT count(*) FROM "Employee" e2
       WHERE upper(regexp_replace(btrim(e2.name), '\s+', ' ', 'g')) = upper(regexp_replace(btrim(j."receivedBy"), '\s+', ' ', 'g'))) = 1;

-- Permissions: groups that could add job cards keep doing everything they did (typing, both types)
UPDATE "PermissionGroup"
SET permissions = array_cat(permissions, ARRAY['jobcards.addTyped', 'jobcards.workshop', 'jobcards.onsite']::text[])
WHERE 'jobcards.add' = ANY(permissions);
