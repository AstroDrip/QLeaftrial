-- Additive only: indexes for the paged admin lists (orders by status and date) and for joins and clean-up.
CREATE INDEX "Order_status_createdAt_idx" ON "public"."Order"("status", "createdAt");
CREATE INDEX "Order_createdAt_idx" ON "public"."Order"("createdAt");
CREATE INDEX "OrderItem_orderId_idx" ON "public"."OrderItem"("orderId");
CREATE INDEX "OrderItem_productId_idx" ON "public"."OrderItem"("productId");
CREATE INDEX "Session_expiresAt_idx" ON "public"."Session"("expiresAt");
