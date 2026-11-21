-- AlterEnum
ALTER TYPE "ImportKind" ADD VALUE 'ASSETS';

-- AlterTable
ALTER TABLE "JobCard" ADD COLUMN     "addedById" TEXT,
ADD COLUMN     "assetId" TEXT,
ADD COLUMN     "createdByName" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "currentReading" DECIMAL(12,1),
ADD COLUMN     "dateIn" DATE,
ADD COLUMN     "dateOut" DATE,
ADD COLUMN     "jobType" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "operatorName" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "photoPath" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "previousReading" DECIMAL(12,1),
ADD COLUMN     "project" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "receivedBy" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "repairAt" TEXT NOT NULL DEFAULT '';

-- CreateTable
CREATE TABLE "PermissionGroup" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "permissions" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PermissionGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserGroup" (
    "userId" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserGroup_pkey" PRIMARY KEY ("userId","groupId")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL DEFAULT '',
    "link" TEXT NOT NULL DEFAULT '',
    "dedupeKey" TEXT,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Asset" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "category" TEXT NOT NULL DEFAULT '',
    "location" TEXT NOT NULL DEFAULT '',
    "make" TEXT NOT NULL DEFAULT '',
    "model" TEXT NOT NULL DEFAULT '',
    "serialNo" TEXT NOT NULL DEFAULT '',
    "chassisNo" TEXT NOT NULL DEFAULT '',
    "plateNo" TEXT NOT NULL DEFAULT '',
    "yearOfMake" INTEGER,
    "purchaseDate" DATE,
    "purchaseValue" DECIMAL(12,3),
    "depreciationRate" DECIMAL(5,2),
    "notes" TEXT NOT NULL DEFAULT '',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "customFields" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Asset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobCardTask" (
    "id" TEXT NOT NULL,
    "jobCardId" TEXT NOT NULL,
    "line" INTEGER NOT NULL,
    "description" TEXT NOT NULL,
    "fromDate" DATE,

    CONSTRAINT "JobCardTask_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PermissionGroup_name_key" ON "PermissionGroup"("name");

-- CreateIndex
CREATE INDEX "UserGroup_groupId_idx" ON "UserGroup"("groupId");

-- CreateIndex
CREATE INDEX "Notification_userId_readAt_createdAt_idx" ON "Notification"("userId", "readAt", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Notification_userId_dedupeKey_key" ON "Notification"("userId", "dedupeKey");

-- CreateIndex
CREATE UNIQUE INDEX "Asset_code_key" ON "Asset"("code");

-- CreateIndex
CREATE INDEX "Asset_plateNo_idx" ON "Asset"("plateNo");

-- CreateIndex
CREATE INDEX "Asset_chassisNo_idx" ON "Asset"("chassisNo");

-- CreateIndex
CREATE INDEX "Asset_category_idx" ON "Asset"("category");

-- CreateIndex
CREATE INDEX "JobCardTask_jobCardId_idx" ON "JobCardTask"("jobCardId");

-- CreateIndex
CREATE INDEX "JobCard_assetId_status_idx" ON "JobCard"("assetId", "status");

-- AddForeignKey
ALTER TABLE "UserGroup" ADD CONSTRAINT "UserGroup_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserGroup" ADD CONSTRAINT "UserGroup_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "PermissionGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobCardTask" ADD CONSTRAINT "JobCardTask_jobCardId_fkey" FOREIGN KEY ("jobCardId") REFERENCES "JobCard"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobCard" ADD CONSTRAINT "JobCard_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobCard" ADD CONSTRAINT "JobCard_addedById_fkey" FOREIGN KEY ("addedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- ---------------------------------------------------------------------------
-- Roles and flags -> isAdmin + permission groups (keeps what everyone could do)
-- ---------------------------------------------------------------------------
ALTER TABLE "User" ADD COLUMN "isAdmin" BOOLEAN NOT NULL DEFAULT false;
UPDATE "User" SET "isAdmin" = true WHERE "role" = 'ADMIN';

INSERT INTO "PermissionGroup" ("id", "name", "description", "permissions", "updatedAt") VALUES
  ('grp_manager', 'Manager', 'Sees and enters all records, analytics and costs; closes job cards; reviews all sessions',
   ARRAY['records.viewAll','records.enterAll','records.edit','analytics.view','costs.view','jobcards.view','jobcards.close','sessions.reviewAll','assets.view'], CURRENT_TIMESTAMP),
  ('grp_store', 'Store Manager', 'Issues spare parts and manages the inventory',
   ARRAY['inventory.manage','jobcards.view'], CURRENT_TIMESTAMP),
  ('grp_technician', 'Technician', 'Starts and stops work on job cards by QR scan',
   ARRAY['time.scan'], CURRENT_TIMESTAMP),
  ('grp_own_records', 'Own records entry', 'Enters their own man hours',
   ARRAY['records.own'], CURRENT_TIMESTAMP);

INSERT INTO "UserGroup" ("userId", "groupId") SELECT "id", 'grp_manager' FROM "User" WHERE "role" = 'MANAGER';
INSERT INTO "UserGroup" ("userId", "groupId") SELECT "id", 'grp_store' FROM "User" WHERE "isStoreManager" AND "role" <> 'ADMIN';
INSERT INTO "UserGroup" ("userId", "groupId") SELECT "id", 'grp_technician' FROM "User" WHERE "employeeId" IS NOT NULL AND "role" <> 'ADMIN';
INSERT INTO "UserGroup" ("userId", "groupId") SELECT "id", 'grp_own_records' FROM "User" WHERE "canEnterOwnRecords" AND "role" = 'EMPLOYEE';

ALTER TABLE "User" DROP COLUMN "canEnterOwnRecords", DROP COLUMN "isStoreManager", DROP COLUMN "role";
DROP TYPE "UserRole";

-- ---------------------------------------------------------------------------
-- After-shift: stopped-at-shift-end sessions become answered limit stops (no prompt for old ones)
-- ---------------------------------------------------------------------------
ALTER TABLE "WorkSession" ADD COLUMN "afterShiftAnswer" TEXT,
ADD COLUMN "limitStoppedAt" TIMESTAMP(3),
ADD COLUMN "shiftEndAt" TIMESTAMP(3),
ADD COLUMN "shiftReminderAt" TIMESTAMP(3);
UPDATE "WorkSession" SET "shiftReminderAt" = "shiftAlertAt", "limitStoppedAt" = "shiftAlertAt", "shiftEndAt" = "endedAt", "afterShiftAnswer" = 'KEEP'
WHERE "shiftAlertAt" IS NOT NULL;
ALTER TABLE "WorkSession" DROP COLUMN "shiftAlertAt";
