/**
 * Shared validation utilities for email-related forms
 */

export interface EmailFormValidation {
  name?: string;
  subject?: string;
  body?: string;
  from?: string;
  segmentId?: string;
}

export class EmailFormValidator {
  /**
   * Validate email form fields (campaigns, templates)
   */
  static validate(fields: EmailFormValidation, options: {requireSegment?: boolean} = {}): string | null {
    if (fields.name !== undefined && !fields.name.trim()) {
      return 'Name is required';
    }

    if (fields.subject !== undefined && !fields.subject.trim()) {
      return 'Email subject is required';
    }

    if (fields.body !== undefined && !fields.body.trim()) {
      return 'Email body is required';
    }

    if (fields.from !== undefined && !fields.from.trim()) {
      return 'From address is required';
    }

    if (options.requireSegment && fields.segmentId !== undefined && !fields.segmentId) {
      return 'Please select a segment';
    }

    return null;
  }

  /**
   * Validate campaign-specific fields
   */
  static validateCampaign(fields: EmailFormValidation & {segmentId?: string}, audienceType: string): string | null {
    const baseError = this.validate(fields);
    if (baseError) return baseError;

    if (audienceType === 'SEGMENT' && !fields.segmentId) {
      return 'Please select a segment';
    }

    return null;
  }

  /**
   * Validate template-specific fields
   */
  static validateTemplate(fields: EmailFormValidation): string | null {
    return this.validate(fields);
  }
}
