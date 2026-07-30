import { useCallback, useEffect, useMemo, useState } from 'react';
import { webRequest } from '../../services/webClient';
import './style.css';

const FEATURE_LABELS: Record<string, string> = {
  app_builder: 'Build Studio', creative_studio: 'Creative Studio', crm: 'CRM', email: 'Email',
  kanban: 'Kanban', lead_gen: 'Lead Gen', project_flow: 'Project Flow', social_larry: 'Larry',
  social_posts: 'Social Posts', social_station: 'Social Station', storage: 'Storage', video_meeting: 'Video Meeting',
};

interface TeamMember { id: string; email: string; displayName: string; role: string }
interface Team { id: string; name: string; features: string[]; members: TeamMember[]; isOwner: boolean }
interface Invite { id: string; teamId: string; teamName: string; inviterName: string; inviterEmail: string; features: string[] }
interface TeamState { teams: Team[]; invites: Invite[]; shareableFeatures: string[] }
interface TeamMessage { id: number; body: string; createdAt: number; senderUserId: string; senderName: string }

interface TeamUpProps { currentUserId: string; disabled?: boolean }

export function TeamUp({ currentUserId, disabled = false }: TeamUpProps) {
  const [panel, setPanel] = useState<'team' | 'chat' | null>(null);
  const [state, setState] = useState<TeamState>({ teams: [], invites: [], shareableFeatures: [] });
  const [email, setEmail] = useState('');
  const [selectedFeatures, setSelectedFeatures] = useState<string[]>(['crm']);
  const [activeTeamId, setActiveTeamId] = useState('');
  const [messages, setMessages] = useState<TeamMessage[]>([]);
  const [messageDraft, setMessageDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');

  const refreshState = useCallback(async () => {
    try {
      const next = await webRequest<TeamState>('team_up.state', {}, { timeoutMs: 12000 });
      setState(next);
      setActiveTeamId((current) => current && next.teams.some((team) => team.id === current) ? current : next.teams[0]?.id || '');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Could not load Team Up.');
    }
  }, []);

  const activeTeam = useMemo(() => state.teams.find((team) => team.id === activeTeamId) ?? null, [activeTeamId, state.teams]);

  const refreshMessages = useCallback(async () => {
    if (!activeTeamId) return;
    try {
      const response = await webRequest<{ messages: TeamMessage[] }>('team_up.messages', { teamId: activeTeamId }, { timeoutMs: 12000 });
      setMessages(response.messages);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Could not load messages.');
    }
  }, [activeTeamId]);

  useEffect(() => {
    if (disabled) return;
    void refreshState();
    const timer = window.setInterval(() => void refreshState(), 15000);
    return () => window.clearInterval(timer);
  }, [disabled, refreshState]);

  useEffect(() => {
    if (panel !== 'chat' || !activeTeamId) return;
    void refreshMessages();
    const timer = window.setInterval(() => void refreshMessages(), 4000);
    return () => window.clearInterval(timer);
  }, [activeTeamId, panel, refreshMessages]);

  const toggleFeature = (feature: string) => {
    setSelectedFeatures((current) => current.includes(feature) ? current.filter((item) => item !== feature) : [...current, feature]);
  };

  const sendInvite = async () => {
    setBusy(true); setNotice('');
    try {
      await webRequest('team_up.invite', { email, features: selectedFeatures }, { timeoutMs: 15000 });
      setEmail('');
      setNotice('Invitation sent. Selected feature data is ready to share when they accept.');
      await refreshState();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Could not send invitation.');
    } finally { setBusy(false); }
  };

  const respond = async (inviteId: string, accept: boolean) => {
    setBusy(true); setNotice('');
    try {
      await webRequest('team_up.respond', { inviteId, accept }, { timeoutMs: 15000 });
      if (accept) {
        window.location.reload();
        return;
      }
      await refreshState();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Could not answer invitation.');
    } finally { setBusy(false); }
  };

  const sendMessage = async () => {
    const body = messageDraft.trim();
    if (!activeTeamId || !body) return;
    setBusy(true);
    try {
      await webRequest('team_up.send', { teamId: activeTeamId, body }, { timeoutMs: 12000 });
      setMessageDraft('');
      await refreshMessages();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Could not send message.');
    } finally { setBusy(false); }
  };

  return (
    <div className="team-up">
      <button type="button" className={`team-up__header-button ${panel === 'team' ? 'is-active' : ''}`} disabled={disabled} onClick={() => setPanel(panel === 'team' ? null : 'team')}>
        Team Up {state.invites.length > 0 ? <span className="team-up__count">{state.invites.length}</span> : null}
      </button>
      <button type="button" className={`team-up__header-button ${panel === 'chat' ? 'is-active' : ''}`} disabled={disabled || state.teams.length === 0} onClick={() => setPanel(panel === 'chat' ? null : 'chat')}>
        Chat
      </button>

      {panel ? <button type="button" className="team-up__backdrop" aria-label="Close Team Up" onClick={() => setPanel(null)} /> : null}

      {panel === 'team' ? (
        <aside className="team-up__popover" aria-label="Team Up">
          <header><div><span className="team-up__eyebrow">Shared workspace</span><h3>Team Up</h3></div><button type="button" onClick={() => setPanel(null)}>×</button></header>
          {state.invites.length > 0 ? <section className="team-up__section"><h4>Invitations</h4>{state.invites.map((invite) => (
            <article className="team-up__invite" key={invite.id}>
              <strong>{invite.inviterName}</strong><span>{invite.inviterEmail}</span>
              <p>{invite.features.map((feature) => FEATURE_LABELS[feature] || feature).join(', ')}</p>
              <div><button disabled={busy} onClick={() => void respond(invite.id, true)}>Accept</button><button disabled={busy} onClick={() => void respond(invite.id, false)}>Decline</button></div>
            </article>
          ))}</section> : null}
          <section className="team-up__section">
            <h4>Invite a teammate</h4>
            <label><span>Their Deep Canvas email</span><input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="partner@company.com" /></label>
            <div className="team-up__features">{state.shareableFeatures.map((feature) => (
              <label key={feature}><input type="checkbox" checked={selectedFeatures.includes(feature)} onChange={() => toggleFeature(feature)} /><span>{FEATURE_LABELS[feature] || feature}</span></label>
            ))}</div>
            <button className="team-up__primary" disabled={busy || !email.trim() || selectedFeatures.length === 0} onClick={() => void sendInvite()}>Send invitation</button>
          </section>
          {state.teams.length > 0 ? <section className="team-up__section"><h4>Your teams</h4>{state.teams.map((team) => (
            <article className="team-up__team" key={team.id}><strong>{team.name}</strong><span>{team.members.map((member) => member.displayName).join(' · ')}</span><p>{team.features.map((feature) => FEATURE_LABELS[feature] || feature).join(', ')}</p></article>
          ))}</section> : null}
          {notice ? <p className="team-up__notice">{notice}</p> : null}
        </aside>
      ) : null}

      {panel === 'chat' ? (
        <aside className="team-up__popover team-up__popover--chat" aria-label="Teammate chat">
          <header><div><span className="team-up__eyebrow">Team messages</span><h3>Chat</h3></div><button type="button" onClick={() => setPanel(null)}>×</button></header>
          {state.teams.length > 1 ? <select value={activeTeamId} onChange={(event) => setActiveTeamId(event.target.value)}>{state.teams.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}</select> : null}
          {activeTeam ? <div className="team-up__chat-meta">{activeTeam.name} · {activeTeam.features.map((feature) => FEATURE_LABELS[feature] || feature).join(', ')}</div> : null}
          <div className="team-up__messages">{messages.map((message) => (
            <article key={message.id} className={message.senderUserId === currentUserId ? 'is-mine' : ''}><strong>{message.senderUserId === currentUserId ? 'You' : message.senderName}</strong><p>{message.body}</p><time>{new Date(message.createdAt * 1000).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</time></article>
          ))}{messages.length === 0 ? <p className="team-up__empty">No messages yet. Start the conversation.</p> : null}</div>
          <div className="team-up__composer"><textarea value={messageDraft} onChange={(event) => setMessageDraft(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void sendMessage(); } }} placeholder="Message your team…" /><button disabled={busy || !messageDraft.trim()} onClick={() => void sendMessage()}>Send</button></div>
          {notice ? <p className="team-up__notice">{notice}</p> : null}
        </aside>
      ) : null}
    </div>
  );
}
