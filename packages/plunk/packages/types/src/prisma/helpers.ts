/**
 * Type-safe utilities for working with Prisma JSON fields
 *
 * Prisma's JSON types are intentionally loose to support the dynamic nature of JSON.
 * These helpers provide a safer interface while acknowledging the runtime limitations.
 */

import {Prisma} from '@plunk/db';

export function toPrismaJson<T>(value: T | null | undefined): Prisma.InputJsonValue {
	// Prisma.InputJsonValue accepts: string | number | boolean | null | JsonObject | JsonArray
	// We trust that T is JSON-serializable at runtime (including null)
	return value as unknown as Prisma.InputJsonValue;
}

export function fromPrismaJson<T>(value: Prisma.JsonValue): T {
	return value as unknown as T;
}

/**
 * Optional version of fromPrismaJson that handles null/undefined
 *
 * @template T - The expected type
 * @param value - The JSON value from Prisma (may be null/undefined)
 * @returns The value as type T or undefined
 */
export function fromPrismaJsonOptional<T>(value: Prisma.JsonValue | null | undefined): T | undefined {
	if (value === null || value === undefined) {
		return undefined;
	}
	return value as unknown as T;
}
