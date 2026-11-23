-- CreateEnum
CREATE TYPE "PartRequestLineStatus" AS ENUM ('OPEN', 'MR_RAISED', 'DONE');

-- AlterTable
ALTER TABLE "JobCard" ADD COLUMN     "documentRequired" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "PartRequest" ALTER COLUMN "text" SET DEFAULT '';

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "mutedPushKinds" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- CreateTable
CREATE TABLE "JobCardAssignment" (
    "id" TEXT NOT NULL,
    "jobCardId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "assignedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JobCardAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PartRequestLine" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "line" INTEGER NOT NULL,
    "description" TEXT NOT NULL,
    "qty" DECIMAL(12,3),
    "status" "PartRequestLineStatus" NOT NULL DEFAULT 'OPEN',
    "mrNumber" TEXT NOT NULL DEFAULT '',
    "mrRaisedAt" TIMESTAMP(3),
    "doneById" TEXT,
    "doneAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PartRequestLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PushSubscription" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "p256dh" TEXT NOT NULL,
    "auth" TEXT NOT NULL,
    "userAgent" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" TIMESTAMP(3),

    CONSTRAINT "PushSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "JobCardAssignment_employeeId_idx" ON "JobCardAssignment"("employeeId");

-- CreateIndex
CREATE UNIQUE INDEX "JobCardAssignment_jobCardId_employeeId_key" ON "JobCardAssignment"("jobCardId", "employeeId");

-- CreateIndex
CREATE INDEX "PartRequestLine_requestId_idx" ON "PartRequestLine"("requestId");

-- CreateIndex
CREATE UNIQUE INDEX "PushSubscription_endpoint_key" ON "PushSubscription"("endpoint");

-- CreateIndex
CREATE INDEX "PushSubscription_userId_idx" ON "PushSubscription"("userId");

-- AddForeignKey
ALTER TABLE "JobCardAssignment" ADD CONSTRAINT "JobCardAssignment_jobCardId_fkey" FOREIGN KEY ("jobCardId") REFERENCES "JobCard"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobCardAssignment" ADD CONSTRAINT "JobCardAssignment_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobCardAssignment" ADD CONSTRAINT "JobCardAssignment_assignedById_fkey" FOREIGN KEY ("assignedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartRequestLine" ADD CONSTRAINT "PartRequestLine_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "PartRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartRequestLine" ADD CONSTRAINT "PartRequestLine_doneById_fkey" FOREIGN KEY ("doneById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PushSubscription" ADD CONSTRAINT "PushSubscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Data: each existing part request becomes one line with its text and state
INSERT INTO "PartRequestLine" ("id", "requestId", "line", "description", "status", "mrNumber", "mrRaisedAt", "doneById", "doneAt", "createdAt", "updatedAt")
SELECT 'prl_' || r."id", r."id", 1, r."text",
       (CASE r."status" WHEN 'FULFILLED' THEN 'DONE' WHEN 'MR_RAISED' THEN 'MR_RAISED' ELSE 'OPEN' END)::"PartRequestLineStatus",
       r."mrNumber", r."mrRaisedAt", r."fulfilledById", r."fulfilledAt", r."createdAt", CURRENT_TIMESTAMP
FROM "PartRequest" r
WHERE NOT EXISTS (SELECT 1 FROM "PartRequestLine" l WHERE l."requestId" = r."id");
UPDATE "PartRequest" SET "text" = '' WHERE "id" IN (SELECT "requestId" FROM "PartRequestLine" WHERE "id" LIKE 'prl_%');
