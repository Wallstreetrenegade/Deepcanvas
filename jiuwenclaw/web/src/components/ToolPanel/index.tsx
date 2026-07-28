import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSessionStore } from '../../stores';
import { TodoList } from '../TodoList';
import { TeamArea } from '../TeamArea';
import { TeamTaskEvents } from '../TeamTaskEvents';
import { useAssistantName } from '../../hooks/useAssistantName';
import { webRequest } from '../../services/webClient';
import './ToolPanel.css';

type ToolTabKey = 'tasks' | 'skills' | 'teams';

type SkillItem = {
  name: string;
  description?: string;
  source?: string;
};

type InstalledPluginItem = {
  plugin_name: string;
  skills: string[];
};

function SkillsSummaryPanel() {
  const { t } = useTranslation();
  const [skills, setSkills] = useState<SkillItem[]>([]);
  const [plugins, setPlugins] = useState<InstalledPluginItem[]>([]);
  const [loading, setLoading] = useState(true);

  const loadSkills = useCallback(async () => {
    setLoading(true);
    try {
      const data = await webRequest<{
        skills?: SkillItem[];
        plugins?: InstalledPluginItem[];
      }>('skills.list', { with_installed: true }, { timeoutMs: 30000 });
      setSkills(data.skills || []);
      setPlugins(data.plugins || []);
    } catch {
      setSkills([]);
      setPlugins([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadSkills();
  }, [loadSkills]);

  const readySkills = useMemo(() => {
    const installedNames = new Set<string>();
    plugins.forEach((plugin) => {
      (plugin.skills || []).forEach((skill) => installedNames.add(skill));
      if (plugin.plugin_name) installedNames.add(plugin.plugin_name);
    });

    return skills
      .filter((skill) => {
        if (!skill.name) return false;
        return installedNames.has(skill.name) || skill.source === 'local' || skill.source === 'project';
      })
      .sort((a, b) => a.name.localeCompare(b.name))
      .slice(0, 12);
  }, [plugins, skills]);

  return (
    <div className="toolpanel-skills">
      <div className="toolpanel-section-header">
        <span>{t('toolPanel.skills.title')}</span>
        <button type="button" onClick={() => void loadSkills()} className="toolpanel-mini-action">
          {t('common.refresh')}
        </button>
      </div>

      {loading ? (
        <div className="toolpanel-empty">{t('toolPanel.skills.loading')}</div>
      ) : readySkills.length === 0 ? (
        <div className="toolpanel-empty">{t('toolPanel.skills.empty')}</div>
      ) : (
        <div className="toolpanel-skill-list">
          {readySkills.map((skill) => (
            <div key={skill.name} className="toolpanel-skill-item">
              <div className="toolpanel-skill-item__name">{skill.name}</div>
              {skill.description ? (
                <div className="toolpanel-skill-item__description">{skill.description}</div>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function ToolPanel() {
  const { t } = useTranslation();
  const {
    mode,
    teamTaskEvents,
    teamMembers,
  } = useSessionStore();
  const [activeTab, setActiveTab] = useState<ToolTabKey>('tasks');
  const assistantName = useAssistantName('Deep Canvas');

  useEffect(() => {
    if (mode === 'team') {
      setActiveTab('teams');
    }
  }, [mode]);

  const renderFooter = () => (
    <div className="toolpanel-footer shrink-0 pt-4 text-text-muted text-center">
      <div className="px-2.5">
        <span>{assistantName}</span>
      </div>
    </div>
  );

  const renderTasksPanel = () => (
    <>
      <div className="flex-1 overflow-y-auto mb-4">
        <div className="bg-card rounded-lg border border-border overflow-hidden h-full">
          <TodoList />
        </div>
      </div>
      {renderFooter()}
    </>
  );

  const renderTeamsPanel = () => (
    <>
      <div className="flex-1 overflow-y-auto mb-4">
        <div className="bg-card rounded-lg border border-border overflow-hidden h-full">
          <TeamTaskEvents events={teamTaskEvents} />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="bg-card rounded-lg border border-border overflow-hidden h-full">
          <TeamArea members={teamMembers} />
        </div>
      </div>
    </>
  );

  const renderTeamsEmpty = () => (
    <div className="toolpanel-placeholder">
      <div className="toolpanel-placeholder__title">{t('toolPanel.teams.emptyTitle')}</div>
      <p className="toolpanel-placeholder__body">{t('toolPanel.teams.emptyBody')}</p>
    </div>
  );

  return (
    <div
      data-testid="tool-panel"
      className="toolpanel-shell bg-panel border-l border-border h-full overflow-hidden py-4 px-3 shrink-0"
    >
      <div className="h-full bg-panel flex flex-col overflow-hidden">
        <div className="toolpanel-tabs">
          <button
            type="button"
            className={`toolpanel-tab ${activeTab === 'tasks' ? 'is-active' : ''}`}
            onClick={() => setActiveTab('tasks')}
          >
            {t('toolPanel.tabs.tasks')}
          </button>
          <button
            type="button"
            className={`toolpanel-tab ${activeTab === 'skills' ? 'is-active' : ''}`}
            onClick={() => setActiveTab('skills')}
          >
            {t('toolPanel.tabs.skills')}
          </button>
          <button
            type="button"
            className={`toolpanel-tab ${activeTab === 'teams' ? 'is-active' : ''}`}
            onClick={() => setActiveTab('teams')}
          >
            {t('toolPanel.tabs.teams')}
          </button>
        </div>

        {activeTab === 'tasks' ? (
          renderTasksPanel()
        ) : activeTab === 'skills' ? (
          <SkillsSummaryPanel />
        ) : mode === 'team' || teamMembers.length > 0 || teamTaskEvents.length > 0 ? (
          renderTeamsPanel()
        ) : (
          renderTeamsEmpty()
        )}
      </div>
    </div>
  );
}
