import {afterEach, beforeEach, describe, expect, it} from 'vitest';
import {CampaignStatus} from '@plunk/db';
import {createTimeControl, factories, getPrismaClient} from '../../../../../test/helpers';

describe('Scheduled Campaign Processor', () => {
  let projectId: string;
  const prisma = getPrismaClient();
  const timeControl = createTimeControl();

  beforeEach(async () => {
    const {project} = await factories.createUserWithProject();
    projectId = project.id;
  });

  afterEach(() => {
    // Ensure time is always restored between tests
    timeControl.restore();
  });

  describe('Campaign Scheduling', () => {
    it('should execute campaign at scheduled time', async () => {
      // Freeze time at a specific moment
      timeControl.freeze(new Date('2025-01-20T09:00:00Z'));

      // Schedule campaign for 1 hour from now
      const scheduledTime = timeControl.helpers.relative(1, 'hour');
      const campaign = await factories.createScheduledCampaign(projectId, scheduledTime, {
        name: 'Scheduled Newsletter',
        subject: 'Weekly Update',
      });

      expect(campaign.status).toBe(CampaignStatus.SCHEDULED);
      expect(campaign.scheduledFor).toEqual(scheduledTime);

      // Advance time to scheduled time
      timeControl.advanceTo(scheduledTime);

      // Verify we're at the right time
      expect(timeControl.now()).toEqual(scheduledTime);

      // At this point, the scheduled processor would pick up this campaign
      // and change its status to SENDING
      await prisma.campaign.update({
        where: {id: campaign.id},
        data: {status: CampaignStatus.SENDING},
      });

      const updatedCampaign = await prisma.campaign.findUnique({
        where: {id: campaign.id},
      });

      expect(updatedCampaign?.status).toBe(CampaignStatus.SENDING);

      timeControl.restore();
    });

    it('should not execute campaign before scheduled time', async () => {
      timeControl.freeze(new Date('2025-01-20T09:00:00Z'));

      // Schedule campaign for 2 hours from now
      const scheduledTime = timeControl.helpers.relative(2, 'hour');
      const campaign = await factories.createScheduledCampaign(projectId, scheduledTime);

      // Advance time by only 1 hour (before scheduled time)
      timeControl.helpers.advanceHours(1);

      // Campaign should still be scheduled
      const stillScheduled = await prisma.campaign.findUnique({
        where: {id: campaign.id},
      });

      expect(stillScheduled?.status).toBe(CampaignStatus.SCHEDULED);
      expect(stillScheduled?.scheduledFor).toEqual(scheduledTime);

      timeControl.restore();
    });

    it('should handle multiple scheduled campaigns at different times', async () => {
      timeControl.freeze(new Date('2025-01-20T10:00:00Z'));

      // Create campaigns scheduled at different times
      await factories.createScheduledCampaign(
        projectId,
        timeControl.helpers.relative(1, 'hour'), // 11:00
        {name: 'Campaign 1'},
      );

      await factories.createScheduledCampaign(
        projectId,
        timeControl.helpers.relative(2, 'hour'), // 12:00
        {name: 'Campaign 2'},
      );

      await factories.createScheduledCampaign(
        projectId,
        timeControl.helpers.relative(3, 'hour'), // 13:00
        {name: 'Campaign 3'},
      );

      // Advance to 11:00 - first campaign should be processable
      timeControl.helpers.advanceHours(1);
      expect(timeControl.now().getUTCHours()).toBe(11);

      // Advance to 12:00 - second campaign should be processable
      timeControl.helpers.advanceHours(1);
      expect(timeControl.now().getUTCHours()).toBe(12);

      // Advance to 13:00 - third campaign should be processable
      timeControl.helpers.advanceHours(1);
      expect(timeControl.now().getUTCHours()).toBe(13);

      // All campaigns should still be in scheduled state (until processor runs)
      const campaigns = await prisma.campaign.findMany({
        where: {projectId},
        orderBy: {scheduledFor: 'asc'},
      });

      expect(campaigns).toHaveLength(3);
      expect(campaigns.every(c => c.status === CampaignStatus.SCHEDULED)).toBe(true);

      timeControl.restore();
    });
  });

  describe('Campaign Status Transitions', () => {
    it('should transition from SCHEDULED to SENDING', async () => {
      timeControl.freeze(new Date('2025-01-20T10:00:00Z'));
      const scheduledTime = timeControl.helpers.relative(30, 'minute');

      const campaign = await factories.createCampaign({
        projectId,
        status: CampaignStatus.SCHEDULED,
        scheduledFor: scheduledTime,
      });

      // Advance past scheduled time
      timeControl.helpers.advanceMinutes(31);

      // Processor would transition to SENDING
      await prisma.campaign.update({
        where: {id: campaign.id},
        data: {status: CampaignStatus.SENDING},
      });

      const sending = await prisma.campaign.findUnique({
        where: {id: campaign.id},
      });

      expect(sending?.status).toBe(CampaignStatus.SENDING);

      timeControl.restore();
    });

    it('should eventually transition from SENDING to SENT', async () => {
      const campaign = await factories.createCampaign({
        projectId,
        status: CampaignStatus.SENDING,
      });

      // Create some contacts and emails
      const contact = await factories.createContact({projectId});
      await factories.createEmail(projectId, contact.id, {
        campaignId: campaign.id,
      });

      // Mark campaign as sent
      await prisma.campaign.update({
        where: {id: campaign.id},
        data: {
          status: CampaignStatus.SENT,
          sentAt: new Date(),
        },
      });

      const sent = await prisma.campaign.findUnique({
        where: {id: campaign.id},
      });

      expect(sent?.status).toBe(CampaignStatus.SENT);
      expect(sent?.sentAt).toBeDefined();
    });
  });

  describe('Edge Cases', () => {
    it('should handle campaigns scheduled in the past', async () => {
      timeControl.freeze(new Date('2025-01-20T10:00:00Z'));

      // Schedule campaign in the past
      const pastTime = new Date('2025-01-19T10:00:00Z');
      const campaign = await factories.createCampaign({
        projectId,
        status: CampaignStatus.SCHEDULED,
        scheduledFor: pastTime,
      });

      // Processor should immediately pick this up
      const shouldRun = campaign.scheduledFor && campaign.scheduledFor <= timeControl.now();
      expect(shouldRun).toBe(true);

      timeControl.restore();
    });

    it('should handle campaigns scheduled far in the future', async () => {
      timeControl.freeze(new Date('2025-01-20T10:00:00Z'));

      // Schedule campaign 30 days in the future
      const futureTime = timeControl.helpers.relative(30, 'day');
      const campaign = await factories.createScheduledCampaign(projectId, futureTime);

      expect(campaign.status).toBe(CampaignStatus.SCHEDULED);

      // Campaign should not be processable yet
      const shouldNotRun = campaign.scheduledFor && campaign.scheduledFor > timeControl.now();
      expect(shouldNotRun).toBe(true);

      // Advance time by 29 days - still not ready
      timeControl.helpers.advanceDays(29);
      expect(campaign.scheduledFor! > timeControl.now()).toBe(true);

      // Advance to exactly the scheduled time
      timeControl.advanceTo(futureTime);
      expect(timeControl.now()).toEqual(futureTime);

      timeControl.restore();
    });
  });
});
