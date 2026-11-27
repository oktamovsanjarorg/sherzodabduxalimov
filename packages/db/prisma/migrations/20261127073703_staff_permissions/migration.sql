-- CreateEnum
CREATE TYPE "Permission" AS ENUM ('CONTENT', 'ESSAYS', 'EXTERNAL', 'STUDENTS', 'PARENTS', 'GROUPS', 'STATS', 'STUDENT_ACCESS', 'PAYMENTS', 'BILLING', 'ANNOUNCE', 'TRASH');

-- AlterTable
ALTER TABLE "StaffInvite" ADD COLUMN     "permissions" "Permission"[] DEFAULT ARRAY['CONTENT', 'ESSAYS', 'EXTERNAL', 'STUDENTS', 'PARENTS', 'GROUPS', 'STATS']::"Permission"[];

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "permissions" "Permission"[] DEFAULT ARRAY['CONTENT', 'ESSAYS', 'EXTERNAL', 'STUDENTS', 'PARENTS', 'GROUPS', 'STATS']::"Permission"[];
