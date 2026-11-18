-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'MANAGER', 'EMPLOYEE');

-- CreateEnum
CREATE TYPE "DataSource" AS ENUM ('MANUAL', 'EXCEL', 'API', 'PHOTO');

-- CreateEnum
CREATE TYPE "FieldEntity" AS ENUM ('JOB_CARD', 'EMPLOYEE', 'RECORD');

-- CreateEnum
CREATE TYPE "FieldType" AS ENUM ('TEXT', 'NUMBER', 'DATE', 'SELECT', 'CHECKBOX');

-- CreateEnum
CREATE TYPE "ImportKind" AS ENUM ('JOB_CARDS', 'EMPLOYEES', 'RECORDS');

-- CreateEnum
CREATE TYPE "ScanStatus" AS ENUM ('PENDING_REVIEW', 'SAVED', 'DISCARDED');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "UserRole" NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "employeeId" TEXT,
    "canEnterOwnRecords" BOOLEAN NOT NULL DEFAULT false,
    "sessionVersion" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Employee" (
    "id" TEXT NOT NULL,
    "fileNo" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "jobTitle" TEXT NOT NULL DEFAULT '',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "customFields" JSONB NOT NULL DEFAULT '{}',
    "source" "DataSource" NOT NULL DEFAULT 'MANUAL',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Employee_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmployeeSupervisor" (
    "employeeId" TEXT NOT NULL,
    "supervisorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmployeeSupervisor_pkey" PRIMARY KEY ("employeeId","supervisorId")
);

-- CreateTable
CREATE TABLE "JobCard" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "customFields" JSONB NOT NULL DEFAULT '{}',
    "source" "DataSource" NOT NULL DEFAULT 'MANUAL',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JobCard_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ManHourRecord" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "jobCardId" TEXT NOT NULL,
    "startDate" DATE NOT NULL,
    "endDate" DATE NOT NULL,
    "hours" DECIMAL(10,2) NOT NULL,
    "remarks" TEXT NOT NULL DEFAULT '',
    "customFields" JSONB NOT NULL DEFAULT '{}',
    "employeeName" TEXT NOT NULL DEFAULT '',
    "jobTitle" TEXT NOT NULL DEFAULT '',
    "supervisorName" TEXT NOT NULL DEFAULT '',
    "preparedByName" TEXT NOT NULL DEFAULT '',
    "preparedByDate" DATE,
    "approvedByName" TEXT NOT NULL DEFAULT '',
    "approvedByDate" DATE,
    "source" "DataSource" NOT NULL DEFAULT 'MANUAL',
    "scanId" TEXT,
    "importBatchId" TEXT,
    "createdById" TEXT,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ManHourRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FieldDefinition" (
    "id" TEXT NOT NULL,
    "entity" "FieldEntity" NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "type" "FieldType" NOT NULL DEFAULT 'TEXT',
    "required" BOOLEAN NOT NULL DEFAULT false,
    "options" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FieldDefinition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Setting" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Setting_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "ScanSheet" (
    "id" TEXT NOT NULL,
    "filePath" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "ocrEngine" TEXT NOT NULL DEFAULT '',
    "ocrError" TEXT NOT NULL DEFAULT '',
    "rawText" TEXT NOT NULL DEFAULT '',
    "extracted" JSONB NOT NULL DEFAULT '{}',
    "status" "ScanStatus" NOT NULL DEFAULT 'PENDING_REVIEW',
    "uploadedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScanSheet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImportBatch" (
    "id" TEXT NOT NULL,
    "kind" "ImportKind" NOT NULL,
    "source" "DataSource" NOT NULL,
    "fileName" TEXT NOT NULL DEFAULT '',
    "totalRows" INTEGER NOT NULL DEFAULT 0,
    "created" INTEGER NOT NULL DEFAULT 0,
    "skipped" INTEGER NOT NULL DEFAULT 0,
    "failed" INTEGER NOT NULL DEFAULT 0,
    "issues" JSONB NOT NULL DEFAULT '[]',
    "createdById" TEXT,
    "apiKeyId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ImportBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApiKey" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "prefix" TEXT NOT NULL,
    "keyHash" TEXT NOT NULL,
    "scopes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "active" BOOLEAN NOT NULL DEFAULT true,
    "lastUsedAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ApiKey_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "action" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entityId" TEXT NOT NULL DEFAULT '',
    "details" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_employeeId_key" ON "User"("employeeId");

-- CreateIndex
CREATE UNIQUE INDEX "Employee_fileNo_key" ON "Employee"("fileNo");

-- CreateIndex
CREATE INDEX "Employee_name_idx" ON "Employee"("name");

-- CreateIndex
CREATE INDEX "EmployeeSupervisor_supervisorId_idx" ON "EmployeeSupervisor"("supervisorId");

-- CreateIndex
CREATE UNIQUE INDEX "JobCard_code_key" ON "JobCard"("code");

-- CreateIndex
CREATE INDEX "ManHourRecord_startDate_idx" ON "ManHourRecord"("startDate");

-- CreateIndex
CREATE INDEX "ManHourRecord_endDate_idx" ON "ManHourRecord"("endDate");

-- CreateIndex
CREATE INDEX "ManHourRecord_jobCardId_idx" ON "ManHourRecord"("jobCardId");

-- CreateIndex
CREATE UNIQUE INDEX "ManHourRecord_employeeId_jobCardId_key" ON "ManHourRecord"("employeeId", "jobCardId");

-- CreateIndex
CREATE UNIQUE INDEX "FieldDefinition_entity_key_key" ON "FieldDefinition"("entity", "key");

-- CreateIndex
CREATE INDEX "ImportBatch_createdAt_idx" ON "ImportBatch"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ApiKey_keyHash_key" ON "ApiKey"("keyHash");

-- CreateIndex
CREATE INDEX "AuditLog_entity_entityId_idx" ON "AuditLog"("entity", "entityId");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeSupervisor" ADD CONSTRAINT "EmployeeSupervisor_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeSupervisor" ADD CONSTRAINT "EmployeeSupervisor_supervisorId_fkey" FOREIGN KEY ("supervisorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManHourRecord" ADD CONSTRAINT "ManHourRecord_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManHourRecord" ADD CONSTRAINT "ManHourRecord_jobCardId_fkey" FOREIGN KEY ("jobCardId") REFERENCES "JobCard"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManHourRecord" ADD CONSTRAINT "ManHourRecord_scanId_fkey" FOREIGN KEY ("scanId") REFERENCES "ScanSheet"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManHourRecord" ADD CONSTRAINT "ManHourRecord_importBatchId_fkey" FOREIGN KEY ("importBatchId") REFERENCES "ImportBatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManHourRecord" ADD CONSTRAINT "ManHourRecord_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManHourRecord" ADD CONSTRAINT "ManHourRecord_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScanSheet" ADD CONSTRAINT "ScanSheet_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportBatch" ADD CONSTRAINT "ImportBatch_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportBatch" ADD CONSTRAINT "ImportBatch_apiKeyId_fkey" FOREIGN KEY ("apiKeyId") REFERENCES "ApiKey"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApiKey" ADD CONSTRAINT "ApiKey_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
