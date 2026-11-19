-- CreateEnum
CREATE TYPE "JobCardStatus" AS ENUM ('OPEN', 'CLOSED');

-- CreateEnum
CREATE TYPE "StockMovementKind" AS ENUM ('RECEIVE', 'ADJUST', 'ISSUE', 'ISSUE_REVERSAL');

-- AlterEnum
ALTER TYPE "DataSource" ADD VALUE 'QR';

-- AlterEnum
ALTER TYPE "ImportKind" ADD VALUE 'PARTS';

-- AlterTable
ALTER TABLE "Employee" ADD COLUMN     "hourlyRate" DECIMAL(10,3) NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "JobCard" ADD COLUMN     "closedAt" TIMESTAMP(3),
ADD COLUMN     "closedById" TEXT,
ADD COLUMN     "status" "JobCardStatus" NOT NULL DEFAULT 'OPEN';

-- AlterTable
ALTER TABLE "ManHourRecord" ADD COLUMN     "hourlyRate" DECIMAL(10,3);

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "isStoreManager" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "WorkSession" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "jobCardId" TEXT NOT NULL,
    "userId" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "endedAt" TIMESTAMP(3),
    "autoStopped" BOOLEAN NOT NULL DEFAULT false,
    "needsReview" BOOLEAN NOT NULL DEFAULT false,
    "reviewNote" TEXT NOT NULL DEFAULT '',
    "editedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Part" (
    "id" TEXT NOT NULL,
    "partNo" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "unit" TEXT NOT NULL DEFAULT 'pcs',
    "unitCost" DECIMAL(10,3) NOT NULL DEFAULT 0,
    "qtyOnHand" DECIMAL(12,3) NOT NULL DEFAULT 0,
    "minQty" DECIMAL(12,3),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Part_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockMovement" (
    "id" TEXT NOT NULL,
    "partId" TEXT NOT NULL,
    "kind" "StockMovementKind" NOT NULL,
    "qty" DECIMAL(12,3) NOT NULL,
    "unitCost" DECIMAL(10,3) NOT NULL,
    "jobCardId" TEXT,
    "reversesId" TEXT,
    "note" TEXT NOT NULL DEFAULT '',
    "userId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StockMovement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WorkSession_jobCardId_idx" ON "WorkSession"("jobCardId");

-- CreateIndex
CREATE INDEX "WorkSession_employeeId_endedAt_idx" ON "WorkSession"("employeeId", "endedAt");

-- CreateIndex
CREATE INDEX "WorkSession_needsReview_idx" ON "WorkSession"("needsReview");

-- CreateIndex
CREATE UNIQUE INDEX "Part_partNo_key" ON "Part"("partNo");

-- CreateIndex
CREATE INDEX "Part_name_idx" ON "Part"("name");

-- CreateIndex
CREATE UNIQUE INDEX "StockMovement_reversesId_key" ON "StockMovement"("reversesId");

-- CreateIndex
CREATE INDEX "StockMovement_partId_createdAt_idx" ON "StockMovement"("partId", "createdAt");

-- CreateIndex
CREATE INDEX "StockMovement_jobCardId_idx" ON "StockMovement"("jobCardId");

-- CreateIndex
CREATE INDEX "JobCard_status_idx" ON "JobCard"("status");

-- AddForeignKey
ALTER TABLE "JobCard" ADD CONSTRAINT "JobCard_closedById_fkey" FOREIGN KEY ("closedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkSession" ADD CONSTRAINT "WorkSession_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkSession" ADD CONSTRAINT "WorkSession_jobCardId_fkey" FOREIGN KEY ("jobCardId") REFERENCES "JobCard"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkSession" ADD CONSTRAINT "WorkSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkSession" ADD CONSTRAINT "WorkSession_editedById_fkey" FOREIGN KEY ("editedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_partId_fkey" FOREIGN KEY ("partId") REFERENCES "Part"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_jobCardId_fkey" FOREIGN KEY ("jobCardId") REFERENCES "JobCard"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_reversesId_fkey" FOREIGN KEY ("reversesId") REFERENCES "StockMovement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
