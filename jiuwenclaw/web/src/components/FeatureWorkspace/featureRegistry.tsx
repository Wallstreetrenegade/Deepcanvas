import { lazy, type ComponentType } from 'react';
import { type FeatureKey } from '../../stores/featureStore';
import { AppBuilderWorkspace } from './AppBuilderWorkspace';
import { CrmWorkspace } from './CrmWorkspace';
import { EmailWorkspace } from './EmailWorkspace';
import { KanbanWorkspace } from './KanbanWorkspace';
import { LeadGenWorkspace } from './LeadGenWorkspace';
import { ProjectFlowWorkspace } from './ProjectFlowWorkspace';
import { SocialStationWorkspace } from './SocialStationWorkspace';
import { StorageWorkspace } from './StorageWorkspace';

const CreativeStudioWorkspace = lazy(async () => {
  const module = await import('./CreativeStudioWorkspace');
  return { default: module.CreativeStudioWorkspace };
});

const VideoMeetingWorkspace = lazy(async () => {
  const module = await import('./VideoMeetingWorkspace');
  return { default: module.VideoMeetingWorkspace };
});

export interface FeatureWorkspaceComponentProps {
  onExit: () => void;
}

export const FEATURE_WORKSPACE_COMPONENTS: Record<FeatureKey, ComponentType<FeatureWorkspaceComponentProps>> = {
  storage: StorageWorkspace,
  kanban: KanbanWorkspace,
  creativeStudio: CreativeStudioWorkspace,
  socialStation: SocialStationWorkspace,
  appBuilder: AppBuilderWorkspace,
  crm: CrmWorkspace,
  email: EmailWorkspace,
  leadGen: LeadGenWorkspace,
  videoMeeting: VideoMeetingWorkspace,
  projectFlow: ProjectFlowWorkspace,
};
