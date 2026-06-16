import type {Project} from '@plunk/db';
import useSWR from 'swr';

/**
 * Fetch all projects for the current user
 */
export function useProjects() {
  return useSWR<Project[]>('/users/@me/projects', {shouldRetryOnError: false});
}
