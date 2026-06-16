import {describe, it, expect, beforeEach} from 'vitest';
import {WorkflowStepType, WorkflowExecutionStatus} from '@plunk/db';
import {factories, getPrismaClient} from '../helpers';

/**
 * Performance Tests: Workflow Execution at Scale
 *
 * These tests verify that workflow operations perform efficiently
 * even with large numbers of executions and complex workflows.
 *
 * Performance Targets (from CLAUDE.md):
 * - Read operations: < 200ms
 * - Write operations: < 500ms
 * - Background jobs for bulk operations
 */
describe('Performance: Workflow Execution at Scale', () => {
  let projectId: string;
  const prisma = getPrismaClient();

  beforeEach(async () => {
    const {project} = await factories.createUserWithProject();
    projectId = project.id;
  });

  // ========================================
  // WORKFLOW EXECUTION RETRIEVAL
  // ========================================
  describe('Workflow Execution Queries', () => {
    it('should retrieve workflow executions under 200ms for 1000+ executions', async () => {
      const workflow = await factories.createWorkflow({projectId});
      const contacts = await factories.createContacts(projectId, 1000);

      // Create 1000 executions
      await Promise.all(contacts.map(contact => factories.createWorkflowExecution(workflow.id, contact.id)));

      const startTime = Date.now();

      const executions = await prisma.workflowExecution.findMany({
        where: {workflowId: workflow.id},
        take: 20, // Paginated query
        include: {
          contact: {
            select: {email: true},
          },
        },
      });

      const duration = Date.now() - startTime;

      expect(executions).toHaveLength(20);
      expect(duration).toBeLessThan(200); // < 200ms target
    });

    it('should filter running executions efficiently', async () => {
      const workflow = await factories.createWorkflow({projectId});
      const contacts = await factories.createContacts(projectId, 500);

      // Create mix of statuses
      await Promise.all(
        contacts.slice(0, 250).map(contact =>
          factories.createWorkflowExecution(workflow.id, contact.id, {
            status: WorkflowExecutionStatus.RUNNING,
          }),
        ),
      );

      await Promise.all(
        contacts.slice(250).map(contact =>
          factories.createWorkflowExecution(workflow.id, contact.id, {
            status: WorkflowExecutionStatus.COMPLETED,
          }),
        ),
      );

      const startTime = Date.now();

      const running = await prisma.workflowExecution.findMany({
        where: {
          workflowId: workflow.id,
          status: WorkflowExecutionStatus.RUNNING,
        },
        take: 20,
      });

      const duration = Date.now() - startTime;

      expect(running).toHaveLength(20);
      expect(running.every(e => e.status === WorkflowExecutionStatus.RUNNING)).toBe(true);
      expect(duration).toBeLessThan(200);
    });

    it('should count executions efficiently without loading all into memory', async () => {
      const workflow = await factories.createWorkflow({projectId});
      const contacts = await factories.createContacts(projectId, 2000);

      await Promise.all(contacts.map(contact => factories.createWorkflowExecution(workflow.id, contact.id)));

      const startTime = Date.now();

      const count = await prisma.workflowExecution.count({
        where: {workflowId: workflow.id},
      });

      const duration = Date.now() - startTime;

      expect(count).toBe(2000);
      expect(duration).toBeLessThan(200);
    });
  });

  // ========================================
  // COMPLEX WORKFLOW QUERIES
  // ========================================
  describe('Complex Workflow Structures', () => {
    it('should handle workflows with many steps efficiently', async () => {
      const workflow = await factories.createWorkflow({projectId});

      // Create workflow with 20 steps
      const steps = await Promise.all(
        Array.from({length: 20}, (_, i) =>
          factories.createWorkflowStep({
            workflowId: workflow.id,
            name: `Step ${i + 1}`,
            type: i % 2 === 0 ? WorkflowStepType.SEND_EMAIL : WorkflowStepType.DELAY,
          }),
        ),
      );

      // Create transitions (linear chain)
      for (let i = 0; i < steps.length - 1; i++) {
        await prisma.workflowTransition.create({
          data: {
            fromStepId: steps[i].id,
            toStepId: steps[i + 1].id,
          },
        });
      }

      const startTime = Date.now();

      const retrieved = await prisma.workflow.findUnique({
        where: {id: workflow.id},
        include: {
          steps: {
            include: {
              outgoingTransitions: true,
              incomingTransitions: true,
            },
          },
        },
      });

      const duration = Date.now() - startTime;

      expect(retrieved?.steps.length).toBeGreaterThanOrEqual(20); // At least 20 steps
      expect(duration).toBeLessThan(200);
    });

    it('should handle branching workflows (CONDITION steps) efficiently', async () => {
      const workflow = await factories.createWorkflow({projectId});

      // Create condition step
      const conditionStep = await factories.createWorkflowStep({
        workflowId: workflow.id,
        type: WorkflowStepType.CONDITION,
      });

      // Create branches (yes/no paths with multiple steps each)
      const yesSteps = await Promise.all(
        Array.from({length: 5}, () =>
          factories.createWorkflowStep({
            workflowId: workflow.id,
            type: WorkflowStepType.SEND_EMAIL,
          }),
        ),
      );

      const noSteps = await Promise.all(
        Array.from({length: 5}, () =>
          factories.createWorkflowStep({
            workflowId: workflow.id,
            type: WorkflowStepType.DELAY,
          }),
        ),
      );

      // Create transitions
      await prisma.workflowTransition.create({
        data: {
          fromStepId: conditionStep.id,
          toStepId: yesSteps[0].id,
          condition: {branch: 'yes'},
        },
      });

      await prisma.workflowTransition.create({
        data: {
          fromStepId: conditionStep.id,
          toStepId: noSteps[0].id,
          condition: {branch: 'no'},
        },
      });

      const startTime = Date.now();

      const retrieved = await prisma.workflow.findUnique({
        where: {id: workflow.id},
        include: {
          steps: {
            include: {
              outgoingTransitions: {
                include: {
                  toStep: true,
                },
              },
            },
          },
        },
      });

      const duration = Date.now() - startTime;

      expect(retrieved?.steps.length).toBeGreaterThan(10);
      expect(duration).toBeLessThan(200);
    });
  });

  // ========================================
  // RE-ENTRY CHECKS
  // ========================================
  describe('Re-Entry Check Performance', () => {
    it('should check for existing executions efficiently (allowReentry=false)', async () => {
      const workflow = await factories.createWorkflow({
        projectId,
        allowReentry: false,
      });

      const contacts = await factories.createContacts(projectId, 100);

      // Create executions for all contacts
      await Promise.all(contacts.map(contact => factories.createWorkflowExecution(workflow.id, contact.id)));

      // Measure time to check for existing execution
      const testContact = contacts[50];

      const startTime = Date.now();

      const existingExecution = await prisma.workflowExecution.findFirst({
        where: {
          workflowId: workflow.id,
          contactId: testContact.id,
        },
      });

      const duration = Date.now() - startTime;

      expect(existingExecution).toBeDefined();
      expect(duration).toBeLessThan(50); // Should be very fast with proper index
    });

    it('should check for running executions efficiently (allowReentry=true)', async () => {
      const workflow = await factories.createWorkflow({
        projectId,
        allowReentry: true,
      });

      const contacts = await factories.createContacts(projectId, 200);

      // Create mix of running and completed executions
      await Promise.all(
        contacts.slice(0, 100).map(contact =>
          factories.createWorkflowExecution(workflow.id, contact.id, {
            status: WorkflowExecutionStatus.RUNNING,
          }),
        ),
      );

      await Promise.all(
        contacts.slice(100).map(contact =>
          factories.createWorkflowExecution(workflow.id, contact.id, {
            status: WorkflowExecutionStatus.COMPLETED,
          }),
        ),
      );

      const testContact = contacts[50];

      const startTime = Date.now();

      const runningExecution = await prisma.workflowExecution.findFirst({
        where: {
          workflowId: workflow.id,
          contactId: testContact.id,
          status: WorkflowExecutionStatus.RUNNING,
        },
      });

      const duration = Date.now() - startTime;

      expect(runningExecution).toBeDefined();
      expect(duration).toBeLessThan(50);
    });
  });

  // ========================================
  // BULK OPERATIONS
  // ========================================
  describe('Bulk Workflow Operations', () => {
    it('should create multiple executions efficiently', async () => {
      const workflow = await factories.createWorkflow({projectId});
      const contacts = await factories.createContacts(projectId, 500);

      const startTime = Date.now();

      // Get the trigger step (created automatically by factory)
      const triggerStep = await prisma.workflowStep.findFirst({
        where: {workflowId: workflow.id, type: WorkflowStepType.TRIGGER},
      });

      // Batch create executions
      const executions = await prisma.workflowExecution.createMany({
        data: contacts.map(contact => ({
          workflowId: workflow.id,
          contactId: contact.id,
          status: WorkflowExecutionStatus.RUNNING,
          currentStepId: triggerStep!.id,
        })),
      });

      const duration = Date.now() - startTime;

      expect(executions.count).toBe(500);
      expect(duration).toBeLessThan(500); // < 500ms for bulk write
    });

    it('should cancel multiple executions efficiently', async () => {
      const workflow = await factories.createWorkflow({projectId});
      const contacts = await factories.createContacts(projectId, 300);

      await Promise.all(
        contacts.map(contact =>
          factories.createWorkflowExecution(workflow.id, contact.id, {
            status: WorkflowExecutionStatus.RUNNING,
          }),
        ),
      );

      const startTime = Date.now();

      // Bulk cancel all running executions
      const result = await prisma.workflowExecution.updateMany({
        where: {
          workflowId: workflow.id,
          status: WorkflowExecutionStatus.RUNNING,
        },
        data: {
          status: WorkflowExecutionStatus.CANCELLED,
          completedAt: new Date(),
        },
      });

      const duration = Date.now() - startTime;

      expect(result.count).toBe(300);
      expect(duration).toBeLessThan(500);
    });
  });

  // ========================================
  // STEP EXECUTION PERFORMANCE
  // ========================================
  describe('Step Execution Tracking', () => {
    it('should create step executions efficiently', async () => {
      const workflow = await factories.createWorkflow({projectId});
      const contact = await factories.createContact({projectId});
      const execution = await factories.createWorkflowExecution(workflow.id, contact.id);

      const steps = await Promise.all(
        Array.from({length: 10}, () =>
          factories.createWorkflowStep({
            workflowId: workflow.id,
          }),
        ),
      );

      const startTime = Date.now();

      // Create step executions for all steps
      await prisma.workflowStepExecution.createMany({
        data: steps.map(step => ({
          executionId: execution.id,
          stepId: step.id,
          status: 'COMPLETED',
          output: null,
        })),
      });

      const duration = Date.now() - startTime;

      expect(duration).toBeLessThan(200);
    });

    it('should retrieve execution history with steps efficiently', async () => {
      const workflow = await factories.createWorkflow({projectId});
      const contact = await factories.createContact({projectId});
      const execution = await factories.createWorkflowExecution(workflow.id, contact.id);

      // Create 20 step executions
      const steps = await Promise.all(
        Array.from({length: 20}, () =>
          factories.createWorkflowStep({
            workflowId: workflow.id,
          }),
        ),
      );

      await Promise.all(
        steps.map(step =>
          prisma.workflowStepExecution.create({
            data: {
              executionId: execution.id,
              stepId: step.id,
              status: 'COMPLETED',
              output: null,
            },
          }),
        ),
      );

      const startTime = Date.now();

      const retrieved = await prisma.workflowExecution.findUnique({
        where: {id: execution.id},
        include: {
          stepExecutions: {
            include: {
              step: true,
            },
            orderBy: {
              createdAt: 'asc',
            },
          },
        },
      });

      const duration = Date.now() - startTime;

      expect(retrieved?.stepExecutions).toHaveLength(20);
      expect(duration).toBeLessThan(200);
    });
  });

  // ========================================
  // MEMORY EFFICIENCY
  // ========================================
  describe('Memory Efficiency', () => {
    it('should not load all executions when counting', async () => {
      const workflow = await factories.createWorkflow({projectId});
      const contacts = await factories.createContacts(projectId, 5000);

      // Create 5000 executions
      await prisma.workflowExecution.createMany({
        data: contacts.map(contact => ({
          workflowId: workflow.id,
          contactId: contact.id,
          status: WorkflowExecutionStatus.COMPLETED,
        })),
      });

      const startTime = Date.now();

      // Count without loading
      const count = await prisma.workflowExecution.count({
        where: {workflowId: workflow.id},
      });

      const duration = Date.now() - startTime;

      expect(count).toBe(5000);
      expect(duration).toBeLessThan(200);
    });

    it('should paginate large result sets without OOM', async () => {
      const workflow = await factories.createWorkflow({projectId});
      const contacts = await factories.createContacts(projectId, 1000);

      await prisma.workflowExecution.createMany({
        data: contacts.map(contact => ({
          workflowId: workflow.id,
          contactId: contact.id,
          status: WorkflowExecutionStatus.COMPLETED,
        })),
      });

      // Paginate through all results
      let cursor: string | undefined;
      let totalFetched = 0;
      const pageSize = 100;

      const startTime = Date.now();

      while (true) {
        const page = await prisma.workflowExecution.findMany({
          where: {workflowId: workflow.id},
          take: pageSize + 1,
          ...(cursor ? {skip: 1, cursor: {id: cursor}} : {}),
          orderBy: {createdAt: 'asc'},
        });

        if (page.length === 0) break;

        const hasMore = page.length > pageSize;
        const items = hasMore ? page.slice(0, -1) : page;

        totalFetched += items.length;

        if (!hasMore) break;

        cursor = page[page.length - 1].id;
      }

      const duration = Date.now() - startTime;

      expect(totalFetched).toBeGreaterThanOrEqual(1000); // At least 1000, may include other test data
      expect(duration).toBeLessThan(2000); // Should complete in reasonable time
    });
  });
});
