-- CreateEnum
CREATE TYPE "AuthMethod" AS ENUM ('PASSWORD', 'GOOGLE_OAUTH', 'GITHUB_OAUTH');

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('OWNER', 'ADMIN', 'MEMBER');

-- CreateEnum
CREATE TYPE "TemplateType" AS ENUM ('TRANSACTIONAL', 'MARKETING');

-- CreateEnum
CREATE TYPE "TrackingMode" AS ENUM ('ENABLED', 'DISABLED', 'MARKETING_ONLY');

-- CreateEnum
CREATE TYPE "CampaignStatus" AS ENUM ('DRAFT', 'SCHEDULED', 'SENDING', 'SENT', 'CANCELLED');

-- CreateEnum
CREATE TYPE "CampaignAudienceType" AS ENUM ('ALL', 'FILTERED', 'SEGMENT');

-- CreateEnum
CREATE TYPE "WorkflowTriggerType" AS ENUM ('EVENT', 'MANUAL', 'SCHEDULE');

-- CreateEnum
CREATE TYPE "WorkflowStepType" AS ENUM ('TRIGGER', 'SEND_EMAIL', 'DELAY', 'WAIT_FOR_EVENT', 'CONDITION', 'EXIT', 'WEBHOOK', 'UPDATE_CONTACT');

-- CreateEnum
CREATE TYPE "WorkflowExecutionStatus" AS ENUM ('RUNNING', 'WAITING', 'COMPLETED', 'EXITED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "StepExecutionStatus" AS ENUM ('PENDING', 'SCHEDULED', 'WAITING', 'RUNNING', 'COMPLETED', 'SKIPPED', 'FAILED');

-- CreateEnum
CREATE TYPE "EmailSourceType" AS ENUM ('TRANSACTIONAL', 'CAMPAIGN', 'WORKFLOW');

-- CreateEnum
CREATE TYPE "EmailStatus" AS ENUM ('PENDING', 'SENDING', 'SENT', 'DELIVERED', 'OPENED', 'CLICKED', 'BOUNCED', 'COMPLAINED', 'FAILED');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT,
    "type" "AuthMethod" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "projects" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "public" TEXT NOT NULL,
    "secret" TEXT NOT NULL,
    "disabled" BOOLEAN NOT NULL DEFAULT false,
    "customer" TEXT,
    "subscription" TEXT,
    "billingLimitWorkflows" INTEGER,
    "billingLimitCampaigns" INTEGER,
    "billingLimitTransactional" INTEGER,
    "tracking" "TrackingMode" NOT NULL DEFAULT 'ENABLED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "projects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "memberships" (
    "userId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'MEMBER',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "memberships_pkey" PRIMARY KEY ("userId","projectId")
);

-- CreateTable
CREATE TABLE "domains" (
    "id" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "dkimTokens" JSONB,
    "projectId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "domains_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contacts" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "data" JSONB,
    "subscribed" BOOLEAN NOT NULL DEFAULT true,
    "projectId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "contacts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "templates" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "from" TEXT NOT NULL,
    "fromName" TEXT,
    "replyTo" TEXT,
    "type" "TemplateType" NOT NULL DEFAULT 'MARKETING',
    "projectId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "segments" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "condition" JSONB NOT NULL,
    "trackMembership" BOOLEAN NOT NULL DEFAULT false,
    "memberCount" INTEGER NOT NULL DEFAULT 0,
    "projectId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "segments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "segment_memberships" (
    "contactId" TEXT NOT NULL,
    "segmentId" TEXT NOT NULL,
    "enteredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "exitedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "segment_memberships_pkey" PRIMARY KEY ("contactId","segmentId")
);

-- CreateTable
CREATE TABLE "campaigns" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "status" "CampaignStatus" NOT NULL DEFAULT 'DRAFT',
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "from" TEXT NOT NULL,
    "fromName" TEXT,
    "replyTo" TEXT,
    "audienceType" "CampaignAudienceType" NOT NULL DEFAULT 'ALL',
    "audienceCondition" JSONB,
    "segmentId" TEXT,
    "scheduledFor" TIMESTAMP(3),
    "totalRecipients" INTEGER NOT NULL DEFAULT 0,
    "sentCount" INTEGER NOT NULL DEFAULT 0,
    "deliveredCount" INTEGER NOT NULL DEFAULT 0,
    "openedCount" INTEGER NOT NULL DEFAULT 0,
    "clickedCount" INTEGER NOT NULL DEFAULT 0,
    "bouncedCount" INTEGER NOT NULL DEFAULT 0,
    "projectId" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "campaigns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workflows" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "triggerType" "WorkflowTriggerType" NOT NULL,
    "triggerConfig" JSONB,
    "allowReentry" BOOLEAN NOT NULL DEFAULT false,
    "projectId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "workflows_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workflow_steps" (
    "id" TEXT NOT NULL,
    "type" "WorkflowStepType" NOT NULL,
    "name" TEXT NOT NULL,
    "position" JSONB NOT NULL,
    "config" JSONB NOT NULL,
    "workflowId" TEXT NOT NULL,
    "templateId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "workflow_steps_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workflow_transitions" (
    "id" TEXT NOT NULL,
    "fromStepId" TEXT NOT NULL,
    "toStepId" TEXT NOT NULL,
    "condition" JSONB,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "workflow_transitions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workflow_executions" (
    "id" TEXT NOT NULL,
    "workflowId" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "status" "WorkflowExecutionStatus" NOT NULL DEFAULT 'RUNNING',
    "currentStepId" TEXT,
    "exitReason" TEXT,
    "context" JSONB,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "workflow_executions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workflow_step_executions" (
    "id" TEXT NOT NULL,
    "executionId" TEXT NOT NULL,
    "stepId" TEXT NOT NULL,
    "status" "StepExecutionStatus" NOT NULL DEFAULT 'PENDING',
    "scheduledFor" TIMESTAMP(3),
    "executeAfter" TIMESTAMP(3),
    "output" JSONB,
    "error" TEXT,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "workflow_step_executions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "emails" (
    "id" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "toName" TEXT,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "from" TEXT NOT NULL,
    "fromName" TEXT,
    "replyTo" TEXT,
    "headers" JSONB,
    "attachments" JSONB,
    "messageId" TEXT,
    "sourceType" "EmailSourceType" NOT NULL,
    "templateId" TEXT,
    "campaignId" TEXT,
    "workflowExecutionId" TEXT,
    "workflowStepExecutionId" TEXT,
    "status" "EmailStatus" NOT NULL DEFAULT 'PENDING',
    "sentAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "openedAt" TIMESTAMP(3),
    "clickedAt" TIMESTAMP(3),
    "bouncedAt" TIMESTAMP(3),
    "complainedAt" TIMESTAMP(3),
    "opens" INTEGER NOT NULL DEFAULT 0,
    "clicks" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "projectId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "emails_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "events" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "data" JSONB,
    "projectId" TEXT NOT NULL,
    "contactId" TEXT,
    "emailId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "api_requests" (
    "id" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "statusCode" INTEGER NOT NULL,
    "duration" INTEGER NOT NULL,
    "projectId" TEXT,
    "userId" TEXT,
    "authType" TEXT,
    "ip" TEXT,
    "userAgent" TEXT,
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "requestSize" INTEGER,
    "responseSize" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "api_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "projects_public_key" ON "projects"("public");

-- CreateIndex
CREATE UNIQUE INDEX "projects_secret_key" ON "projects"("secret");

-- CreateIndex
CREATE UNIQUE INDEX "projects_customer_key" ON "projects"("customer");

-- CreateIndex
CREATE UNIQUE INDEX "projects_subscription_key" ON "projects"("subscription");

-- CreateIndex
CREATE INDEX "domains_projectId_idx" ON "domains"("projectId");

-- CreateIndex
CREATE INDEX "domains_projectId_verified_idx" ON "domains"("projectId", "verified");

-- CreateIndex
CREATE UNIQUE INDEX "domains_projectId_domain_key" ON "domains"("projectId", "domain");

-- CreateIndex
CREATE INDEX "contacts_projectId_idx" ON "contacts"("projectId");

-- CreateIndex
CREATE INDEX "contacts_projectId_subscribed_idx" ON "contacts"("projectId", "subscribed");

-- CreateIndex
CREATE INDEX "contacts_data_idx" ON "contacts" USING GIN ("data" jsonb_ops);

-- CreateIndex
CREATE UNIQUE INDEX "contacts_projectId_email_key" ON "contacts"("projectId", "email");

-- CreateIndex
CREATE INDEX "templates_projectId_idx" ON "templates"("projectId");

-- CreateIndex
CREATE INDEX "templates_projectId_type_idx" ON "templates"("projectId", "type");

-- CreateIndex
CREATE INDEX "segments_projectId_idx" ON "segments"("projectId");

-- CreateIndex
CREATE INDEX "segments_condition_idx" ON "segments" USING GIN ("condition" jsonb_ops);

-- CreateIndex
CREATE INDEX "segment_memberships_segmentId_exitedAt_idx" ON "segment_memberships"("segmentId", "exitedAt");

-- CreateIndex
CREATE INDEX "segment_memberships_contactId_exitedAt_idx" ON "segment_memberships"("contactId", "exitedAt");

-- CreateIndex
CREATE INDEX "segment_memberships_enteredAt_idx" ON "segment_memberships"("enteredAt");

-- CreateIndex
CREATE INDEX "campaigns_projectId_status_idx" ON "campaigns"("projectId", "status");

-- CreateIndex
CREATE INDEX "campaigns_scheduledFor_idx" ON "campaigns"("scheduledFor");

-- CreateIndex
CREATE INDEX "campaigns_segmentId_idx" ON "campaigns"("segmentId");

-- CreateIndex
CREATE INDEX "campaigns_audienceCondition_idx" ON "campaigns" USING GIN ("audienceCondition" jsonb_ops);

-- CreateIndex
CREATE INDEX "workflows_projectId_idx" ON "workflows"("projectId");

-- CreateIndex
CREATE INDEX "workflows_projectId_enabled_idx" ON "workflows"("projectId", "enabled");

-- CreateIndex
CREATE INDEX "workflow_steps_workflowId_idx" ON "workflow_steps"("workflowId");

-- CreateIndex
CREATE INDEX "workflow_steps_templateId_idx" ON "workflow_steps"("templateId");

-- CreateIndex
CREATE INDEX "workflow_transitions_fromStepId_idx" ON "workflow_transitions"("fromStepId");

-- CreateIndex
CREATE INDEX "workflow_transitions_toStepId_idx" ON "workflow_transitions"("toStepId");

-- CreateIndex
CREATE INDEX "workflow_executions_workflowId_contactId_idx" ON "workflow_executions"("workflowId", "contactId");

-- CreateIndex
CREATE INDEX "workflow_executions_workflowId_status_idx" ON "workflow_executions"("workflowId", "status");

-- CreateIndex
CREATE INDEX "workflow_executions_contactId_status_idx" ON "workflow_executions"("contactId", "status");

-- CreateIndex
CREATE INDEX "workflow_executions_status_currentStepId_idx" ON "workflow_executions"("status", "currentStepId");

-- CreateIndex
CREATE INDEX "workflow_step_executions_executionId_status_idx" ON "workflow_step_executions"("executionId", "status");

-- CreateIndex
CREATE INDEX "workflow_step_executions_stepId_idx" ON "workflow_step_executions"("stepId");

-- CreateIndex
CREATE INDEX "workflow_step_executions_status_scheduledFor_idx" ON "workflow_step_executions"("status", "scheduledFor");

-- CreateIndex
CREATE INDEX "workflow_step_executions_scheduledFor_idx" ON "workflow_step_executions"("scheduledFor");

-- CreateIndex
CREATE UNIQUE INDEX "emails_messageId_key" ON "emails"("messageId");

-- CreateIndex
CREATE INDEX "emails_projectId_contactId_idx" ON "emails"("projectId", "contactId");

-- CreateIndex
CREATE INDEX "emails_contactId_idx" ON "emails"("contactId");

-- CreateIndex
CREATE INDEX "emails_campaignId_idx" ON "emails"("campaignId");

-- CreateIndex
CREATE INDEX "emails_workflowExecutionId_idx" ON "emails"("workflowExecutionId");

-- CreateIndex
CREATE INDEX "emails_workflowStepExecutionId_idx" ON "emails"("workflowStepExecutionId");

-- CreateIndex
CREATE INDEX "emails_status_idx" ON "emails"("status");

-- CreateIndex
CREATE INDEX "emails_createdAt_idx" ON "emails"("createdAt");

-- CreateIndex
CREATE INDEX "emails_projectId_sourceType_createdAt_idx" ON "emails"("projectId", "sourceType", "createdAt");

-- CreateIndex
CREATE INDEX "emails_contactId_openedAt_idx" ON "emails"("contactId", "openedAt");

-- CreateIndex
CREATE INDEX "emails_contactId_clickedAt_idx" ON "emails"("contactId", "clickedAt");

-- CreateIndex
CREATE INDEX "emails_contactId_bouncedAt_idx" ON "emails"("contactId", "bouncedAt");

-- CreateIndex
CREATE INDEX "emails_contactId_complainedAt_idx" ON "emails"("contactId", "complainedAt");

-- CreateIndex
CREATE INDEX "events_projectId_name_idx" ON "events"("projectId", "name");

-- CreateIndex
CREATE INDEX "events_contactId_idx" ON "events"("contactId");

-- CreateIndex
CREATE INDEX "events_emailId_idx" ON "events"("emailId");

-- CreateIndex
CREATE INDEX "events_createdAt_idx" ON "events"("createdAt");

-- CreateIndex
CREATE INDEX "events_projectId_contactId_name_createdAt_idx" ON "events"("projectId", "contactId", "name", "createdAt");

-- CreateIndex
CREATE INDEX "events_contactId_name_createdAt_idx" ON "events"("contactId", "name", "createdAt");

-- CreateIndex
CREATE INDEX "events_data_idx" ON "events" USING GIN ("data" jsonb_ops);

-- CreateIndex
CREATE INDEX "api_requests_projectId_createdAt_idx" ON "api_requests"("projectId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "api_requests_userId_createdAt_idx" ON "api_requests"("userId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "api_requests_statusCode_createdAt_idx" ON "api_requests"("statusCode", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "api_requests_path_createdAt_idx" ON "api_requests"("path", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "api_requests_createdAt_idx" ON "api_requests"("createdAt" DESC);

-- CreateIndex
CREATE INDEX "api_requests_projectId_statusCode_createdAt_idx" ON "api_requests"("projectId", "statusCode", "createdAt" DESC);

-- AddForeignKey
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "domains" ADD CONSTRAINT "domains_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "templates" ADD CONSTRAINT "templates_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "segments" ADD CONSTRAINT "segments_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "segment_memberships" ADD CONSTRAINT "segment_memberships_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "contacts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "segment_memberships" ADD CONSTRAINT "segment_memberships_segmentId_fkey" FOREIGN KEY ("segmentId") REFERENCES "segments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_segmentId_fkey" FOREIGN KEY ("segmentId") REFERENCES "segments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workflows" ADD CONSTRAINT "workflows_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workflow_steps" ADD CONSTRAINT "workflow_steps_workflowId_fkey" FOREIGN KEY ("workflowId") REFERENCES "workflows"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workflow_steps" ADD CONSTRAINT "workflow_steps_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workflow_transitions" ADD CONSTRAINT "workflow_transitions_fromStepId_fkey" FOREIGN KEY ("fromStepId") REFERENCES "workflow_steps"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workflow_transitions" ADD CONSTRAINT "workflow_transitions_toStepId_fkey" FOREIGN KEY ("toStepId") REFERENCES "workflow_steps"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workflow_executions" ADD CONSTRAINT "workflow_executions_workflowId_fkey" FOREIGN KEY ("workflowId") REFERENCES "workflows"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workflow_executions" ADD CONSTRAINT "workflow_executions_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "contacts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workflow_executions" ADD CONSTRAINT "workflow_executions_currentStepId_fkey" FOREIGN KEY ("currentStepId") REFERENCES "workflow_steps"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workflow_step_executions" ADD CONSTRAINT "workflow_step_executions_executionId_fkey" FOREIGN KEY ("executionId") REFERENCES "workflow_executions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workflow_step_executions" ADD CONSTRAINT "workflow_step_executions_stepId_fkey" FOREIGN KEY ("stepId") REFERENCES "workflow_steps"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "emails" ADD CONSTRAINT "emails_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "contacts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "emails" ADD CONSTRAINT "emails_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "emails" ADD CONSTRAINT "emails_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "emails" ADD CONSTRAINT "emails_workflowExecutionId_fkey" FOREIGN KEY ("workflowExecutionId") REFERENCES "workflow_executions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "emails" ADD CONSTRAINT "emails_workflowStepExecutionId_fkey" FOREIGN KEY ("workflowStepExecutionId") REFERENCES "workflow_step_executions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "emails" ADD CONSTRAINT "emails_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "events" ADD CONSTRAINT "events_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "events" ADD CONSTRAINT "events_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "contacts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "events" ADD CONSTRAINT "events_emailId_fkey" FOREIGN KEY ("emailId") REFERENCES "emails"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "api_requests" ADD CONSTRAINT "api_requests_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;
