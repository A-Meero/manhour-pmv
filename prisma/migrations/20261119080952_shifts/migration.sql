-- AlterTable
ALTER TABLE "Employee" ADD COLUMN     "shiftId" TEXT;

-- AlterTable
ALTER TABLE "WorkSession" ADD COLUMN     "shiftAlertAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "Shift" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "days" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Shift_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Shift_name_key" ON "Shift"("name");

-- CreateIndex
CREATE INDEX "Employee_shiftId_idx" ON "Employee"("shiftId");

-- AddForeignKey
ALTER TABLE "Employee" ADD CONSTRAINT "Employee_shiftId_fkey" FOREIGN KEY ("shiftId") REFERENCES "Shift"("id") ON DELETE SET NULL ON UPDATE CASCADE;
