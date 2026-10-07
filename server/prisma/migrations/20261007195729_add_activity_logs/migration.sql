-- CreateEnum
CREATE TYPE "ActivityAction" AS ENUM ('ORDER_CREATED', 'ORDER_RESUBMITTED', 'COMPONENT_COUNT_UPDATED', 'BATCH_APPROVED', 'BATCH_REJECTED', 'SEWING_STARTED');

-- CreateTable
CREATE TABLE "activity_logs" (
    "id" TEXT NOT NULL,
    "actor_id" TEXT NOT NULL,
    "actor_role" "UserRole" NOT NULL,
    "action" "ActivityAction" NOT NULL,
    "order_id" TEXT NOT NULL,
    "metadata" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "activity_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "activity_logs_actor_id_created_at_id_idx" ON "activity_logs"("actor_id", "created_at", "id");

-- CreateIndex
CREATE INDEX "activity_logs_order_id_created_at_id_idx" ON "activity_logs"("order_id", "created_at", "id");

-- AddForeignKey
ALTER TABLE "activity_logs" ADD CONSTRAINT "activity_logs_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "activity_logs" ADD CONSTRAINT "activity_logs_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "cutting_orders"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
