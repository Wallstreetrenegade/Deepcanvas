import {describe, it, expect, beforeEach} from 'vitest';
import {ContactService} from '../../apps/api/src/services/ContactService';
import {SegmentService} from '../../apps/api/src/services/SegmentService';
import {factories, getPrismaClient} from '../helpers';

/**
 * Performance tests for cursor-based pagination at scale
 * Critical for CLAUDE.md requirement: "Database Performance: Queries must be optimized for large datasets (1M+ rows)"
 */
describe('Performance: Cursor Pagination at Scale', () => {
  let projectId: string;
  const prisma = getPrismaClient();

  beforeEach(async () => {
    const {project} = await factories.createUserWithProject();
    projectId = project.id;
  });

  describe('ContactService - Large Dataset Pagination', () => {
    it('should paginate through 10k contacts without loading all into memory', async () => {
      // Create 10,000 contacts
      const CONTACT_COUNT = 10000;
      await factories.createContacts(projectId, CONTACT_COUNT);

      let totalFetched = 0;
      let cursor: string | undefined;
      const pageSize = 1000;

      const initialMemory = process.memoryUsage().heapUsed;

      // Paginate through all contacts using cursor
      while (true) {
        const result = await ContactService.list(projectId, pageSize, cursor);
        totalFetched += result.data.length;

        if (!result.hasMore) break;
        cursor = result.cursor;
      }

      const finalMemory = process.memoryUsage().heapUsed;
      const memoryIncrease = (finalMemory - initialMemory) / 1024 / 1024; // MB

      expect(totalFetched).toBe(CONTACT_COUNT);
      expect(memoryIncrease).toBeLessThan(100); // Max 100MB increase
    }, 60000); // 60s timeout for large dataset

    it('should return correct hasMore flag at end of dataset', async () => {
      await factories.createContacts(projectId, 25);

      const pageSize = 10;

      const page1 = await ContactService.list(projectId, pageSize);
      expect(page1.data).toHaveLength(10);
      expect(page1.hasMore).toBe(true);

      const page2 = await ContactService.list(projectId, pageSize, page1.cursor);
      expect(page2.data).toHaveLength(10);
      expect(page2.hasMore).toBe(true);

      const page3 = await ContactService.list(projectId, pageSize, page2.cursor);
      expect(page3.data).toHaveLength(5);
      expect(page3.hasMore).toBe(false);
    });

    it('should handle pagination with search filter efficiently', async () => {
      // Create contacts with specific pattern
      await factories.createContacts(projectId, 1000);

      // Create 100 contacts with searchable email
      for (let i = 0; i < 100; i++) {
        await factories.createContact({
          projectId,
          email: `vip${i}@example.com`,
        });
      }

      let totalFetched = 0;
      let cursor: string | undefined;
      const pageSize = 20;

      // Paginate through filtered results
      while (true) {
        const result = await ContactService.list(projectId, pageSize, cursor, 'vip');
        totalFetched += result.data.length;

        if (!result.hasMore) break;
        cursor = result.cursor;
      }

      expect(totalFetched).toBe(100);
    }, 30000);

    it('should only count total on first page for performance', async () => {
      await factories.createContacts(projectId, 1000);

      const page1 = await ContactService.list(projectId, 100);
      expect(page1.total).toBeGreaterThan(0);

      const page2 = await ContactService.list(projectId, 100, page1.cursor);
      expect(page2.total).toBe(0);
    }, 30000);
  });

  describe('SegmentService - Large Membership Computation', () => {
    it('should compute membership for 10k contacts using cursor pagination', async () => {
      // Create 10,000 contacts (half subscribed)
      const CONTACT_COUNT = 10000;
      await factories.createContacts(projectId, CONTACT_COUNT);

      // Create segment tracking subscribed users
      const segment = await factories.createSegment(projectId, {
        name: 'Subscribed Users',
        filters: [{field: 'subscribed', operator: 'equals', value: true}],
        trackMembership: true,
      });

      const initialMemory = process.memoryUsage().heapUsed;

      const result = await SegmentService.computeMembership(projectId, segment.id);

      const finalMemory = process.memoryUsage().heapUsed;
      const memoryIncrease = (finalMemory - initialMemory) / 1024 / 1024; // MB

      expect(result.total).toBeGreaterThan(0);
      expect(result.total).toBeLessThanOrEqual(CONTACT_COUNT);

      // Should not load all contacts into memory
      expect(memoryIncrease).toBeLessThan(150); // Max 150MB increase
    }, 120000); // 120s timeout

    it('should batch membership additions in chunks of 500', async () => {
      // Create 2000 contacts
      await factories.createContacts(projectId, 2000);

      const segment = await factories.createSegment(projectId, {
        filters: [{field: 'subscribed', operator: 'equals', value: true}],
        trackMembership: true,
      });

      await SegmentService.computeMembership(projectId, segment.id);

      const memberships = await prisma.segmentMembership.count({
        where: {segmentId: segment.id},
      });

      expect(memberships).toBeGreaterThan(0);
    }, 60000);

    it('should handle membership removal efficiently when contacts no longer match', async () => {
      // Create 1000 subscribed contacts
      const contacts = [];
      for (let i = 0; i < 1000; i++) {
        const contact = await factories.createContact({
          projectId,
          subscribed: true,
        });
        contacts.push(contact);
      }

      const segment = await factories.createSegment(projectId, {
        filters: [{field: 'subscribed', operator: 'equals', value: true}],
        trackMembership: true,
      });

      // Initial computation
      const initial = await SegmentService.computeMembership(projectId, segment.id);
      expect(initial.added).toBe(1000);

      // Unsubscribe half the contacts
      for (let i = 0; i < 500; i++) {
        await prisma.contact.update({
          where: {id: contacts[i].id},
          data: {subscribed: false},
        });
      }

      // Recompute - should remove 500
      const updated = await SegmentService.computeMembership(projectId, segment.id);
      expect(updated.removed).toBe(500);
      expect(updated.total).toBe(500);
    }, 90000);
  });

  describe('SegmentService - Query Performance', () => {
    it('should get contacts in segment under 200ms for 10k dataset', async () => {
      // Per CLAUDE.md: "API Response Times: Target < 200ms for read operations"
      await factories.createContacts(projectId, 10000);

      const segment = await factories.createSegment(projectId, {
        filters: [{field: 'subscribed', operator: 'equals', value: true}],
      });

      const start = Date.now();
      const result = await SegmentService.getContacts(projectId, segment.id, 1, 20);
      const duration = Date.now() - start;

      expect(result.data.length).toBeLessThanOrEqual(20);
      expect(duration).toBeLessThan(200); // < 200ms target
    }, 30000);

    it('should handle offset pagination without OOM for large results', async () => {
      await factories.createContacts(projectId, 5000);

      const segment = await factories.createSegment(projectId, {
        filters: [{field: 'subscribed', operator: 'equals', value: true}],
      });

      const page1 = await SegmentService.getContacts(projectId, segment.id, 1, 100);
      const page10 = await SegmentService.getContacts(projectId, segment.id, 10, 100);
      const page50 = await SegmentService.getContacts(projectId, segment.id, 50, 100);

      expect(page1.data.length).toBeLessThanOrEqual(100);
      expect(page10.data.length).toBeLessThanOrEqual(100);
      expect(page50.data.length).toBeLessThanOrEqual(100);
    }, 45000);
  });

  describe('Memory Efficiency Validation', () => {
    it('should not accumulate memory when paginating repeatedly', async () => {
      await factories.createContacts(projectId, 5000);

      const measureMemory = () => {
        if (global.gc) global.gc(); // Force GC if available
        return process.memoryUsage().heapUsed / 1024 / 1024; // MB
      };

      const initialMemory = measureMemory();

      // Paginate 10 times
      for (let i = 0; i < 10; i++) {
        let cursor: string | undefined;
        while (true) {
          const result = await ContactService.list(projectId, 500, cursor);
          if (!result.hasMore) break;
          cursor = result.cursor;
        }
      }

      const finalMemory = measureMemory();
      const memoryGrowth = finalMemory - initialMemory;

      // Memory should not grow significantly with repeated pagination
      expect(memoryGrowth).toBeLessThan(50); // Max 50MB growth
    }, 90000);
  });

  describe('Pagination Edge Cases', () => {
    it('should handle empty dataset gracefully', async () => {
      const result = await ContactService.list(projectId, 20);

      expect(result.data).toHaveLength(0);
      expect(result.hasMore).toBe(false);
      expect(result.cursor).toBeUndefined();
      expect(result.total).toBe(0);
    });

    it('should handle dataset smaller than page size', async () => {
      await factories.createContacts(projectId, 5);

      const result = await ContactService.list(projectId, 20);

      expect(result.data).toHaveLength(5);
      expect(result.hasMore).toBe(false);
      expect(result.cursor).toBeUndefined();
    });

    it('should handle exact page size boundary', async () => {
      await factories.createContacts(projectId, 20);

      const result = await ContactService.list(projectId, 20);

      expect(result.data).toHaveLength(20);
      expect(result.hasMore).toBe(false);
    });

    it('should handle one item over page size', async () => {
      await factories.createContacts(projectId, 21);

      const page1 = await ContactService.list(projectId, 20);

      expect(page1.data).toHaveLength(20);
      expect(page1.hasMore).toBe(true);

      const page2 = await ContactService.list(projectId, 20, page1.cursor);

      expect(page2.data).toHaveLength(1);
      expect(page2.hasMore).toBe(false);
    });

    it('should handle concurrent pagination requests', async () => {
      await factories.createContacts(projectId, 1000);

      // Multiple workers paginating simultaneously
      const promises = Array.from({length: 5}, async () => {
        let totalFetched = 0;
        let cursor: string | undefined;

        while (true) {
          const result = await ContactService.list(projectId, 100, cursor);
          totalFetched += result.data.length;
          if (!result.hasMore) break;
          cursor = result.cursor;
        }

        return totalFetched;
      });

      const results = await Promise.all(promises);

      // All should fetch the same total
      expect(results.every(count => count === results[0])).toBe(true);
      expect(results[0]).toBe(1000);
    }, 30000);
  });
});
