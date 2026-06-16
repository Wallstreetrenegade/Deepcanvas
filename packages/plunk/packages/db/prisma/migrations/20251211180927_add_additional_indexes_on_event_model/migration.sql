-- CreateIndex
CREATE INDEX "events_projectId_name_createdAt_idx" ON "events"("projectId", "name", "createdAt");

-- CreateIndex
CREATE INDEX "events_contactId_createdAt_idx" ON "events"("contactId", "createdAt");
