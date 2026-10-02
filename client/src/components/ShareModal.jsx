import { useState } from 'react';
import api, { friendlyError } from '../services/api';
import { useToast } from './useToast';
import ConfirmModal from './ConfirmModal';

export default function ShareModal({ doc, users, meId, onClose, onShared }) {
  const toast = useToast();
  const [selected, setSelected] = useState('');
  const [newRole, setNewRole] = useState('editor');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [pendingRemove, setPendingRemove] = useState(null);
  const candidates = users.filter((u) => u.id !== meId && u.id !== doc?.owner_id
    && !(doc?.shared_with || []).some((s) => s.id === u.id));
  const nobodyLeft = candidates.length === 0 && users.length > 0;

  const refresh = (list) => {
    onShared(list);
    setSelected('');
    setError('');
  };

  const share = async () => {
    if (!selected) { setError('Choose a person to share with.'); return; }
    setSaving(true);
    setError('');
    try {
      const res = await api.post('/documents/' + doc.id + '/share', { userId: Number(selected), role: newRole });
      refresh(res.data.shared_with || []);
      const person = users.find((u) => u.id === Number(selected));
      toast.success('Shared with ' + (person ? person.name : 'user') + ' as ' + newRole + '.');
    } catch (e) {
      setError(friendlyError(e, 'Could not share this document. Please try again.'));
    } finally {
      setSaving(false);
    }
  };

  const changeRole = async (userId, role) => {
    setError('');
    try {
      const res = await api.put('/documents/' + doc.id + '/share/' + userId, { role });
      onShared(res.data.shared_with || []);
      const person = (doc?.shared_with || []).find((s) => s.id === userId);
      toast.success((person ? person.name : 'User') + ' is now a ' + role + '.');
    } catch (e) {
      setError(friendlyError(e, 'Could not update that role. Please try again.'));
    }
  };

  const remove = async () => {
    if (!pendingRemove) return;
    const { id, name } = pendingRemove;
    setPendingRemove(null);
    setError('');
    try {
      const res = await api.delete('/documents/' + doc.id + '/share/' + id);
      onShared(res.data.shared_with || []);
      toast.success('Removed access for ' + name + '.');
    } catch (e) {
      setError(friendlyError(e, 'Could not remove that collaborator. Please try again.'));
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal wide" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={'Share ' + (doc?.title || '')}>
        <h2>Share “{doc?.title || 'Untitled Document'}”</h2>
        <p className="muted small"><strong>Editors</strong> can edit content. <strong>Viewers</strong> can read and comment. Only the owner can rename, delete, or manage sharing.</p>
        {error && <div className="alert error">{error}</div>}
        {users.length === 0 ? (
          <p className="error">Could not load users. Make sure the API server is running, then reopen this dialog.</p>
        ) : nobodyLeft ? (
          <p className="muted">Everyone else already has access to this document. Remove someone below to share it with somebody new.</p>
        ) : (
        <div className="share-row">
          <select value={selected} onChange={(e) => setSelected(e.target.value)} aria-label="User to share with">
            <option value="">Select user…</option>
            {candidates.map((u) => (
              <option key={u.id} value={u.id}>{u.name} ({u.email})</option>
            ))}
          </select>
          <select value={newRole} onChange={(e) => setNewRole(e.target.value)} aria-label="Role">
            <option value="editor">Editor</option>
            <option value="viewer">Viewer</option>
          </select>
          <button className="btn primary" onClick={share} disabled={saving || !selected}>
            {saving ? 'Sharing…' : 'Share'}
          </button>
        </div>
        )}
        <h3 className="section-title">Who has access</h3>
        <ul className="share-list">
          <li className="share-person">
            <span><strong>{doc?.owner?.name}</strong> <span className="muted small">{doc?.owner?.email}</span></span>
            <span className="badge">Owner</span>
          </li>
          {(doc?.shared_with || []).map((u) => (
            <li key={u.id} className="share-person">
              <span><strong>{u.name}</strong> <span className="muted small">{u.email}</span></span>
              <span className="share-controls">
                <select value={u.role || 'editor'} onChange={(e) => changeRole(u.id, e.target.value)} aria-label={'Role for ' + u.name}>
                  <option value="editor">Editor</option>
                  <option value="viewer">Viewer</option>
                </select>
                <button className="btn ghost danger" onClick={() => setPendingRemove({ id: u.id, name: u.name })}>Remove</button>
              </span>
            </li>
          ))}
        </ul>
        {(doc?.shared_with || []).length === 0 && <p className="muted">Only you have access.</p>}
        <div className="modal-actions">
          <button className="btn secondary" onClick={onClose}>Done</button>
        </div>
      </div>
      {pendingRemove && (
        <ConfirmModal
          title={'Remove ' + pendingRemove.name + '?'}
          message="They will immediately lose access to this document."
          confirmLabel="Remove access"
          danger
          onConfirm={remove}
          onClose={() => setPendingRemove(null)}
        />
      )}
    </div>
  );
}
