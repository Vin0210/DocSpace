import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import api, { friendlyError } from '../services/api';
import { useToast } from '../components/useToast';
import ConfirmModal from '../components/ConfirmModal';
import DashboardLists from './DashboardLists';

export function timeAgo(iso) {
  const d = new Date((iso || '').replace(' ', 'T') + 'Z');
  if (isNaN(d)) return '';
  const s = Math.floor((Date.now() - d.getTime()) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return Math.floor(s / 60) + 'm ago';
  if (s < 86400) return Math.floor(s / 3600) + 'h ago';
  return Math.floor(s / 86400) + 'd ago';
}

export default function DashboardPage() {
  const { user, logout } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const [mine, setMine] = useState([]);
  const [shared, setShared] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [uploading, setUploading] = useState(false);
  const [pendingDelete, setPendingDelete] = useState(null);
  const fileRef = useRef(null);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError('');
    try {
      const [a, b] = await Promise.all([
        api.get('/documents', { params: { userId: user.id } }),
        api.get('/shared-documents', { params: { userId: user.id } }),
      ]);
      setMine(a.data);
      setShared(b.data);
    } catch (e) {
      setError(friendlyError(e, 'Failed to load documents. Please try again.'));
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => { load(); }, [load]);

  const createDoc = async () => {
    try {
      const res = await api.post('/documents', { title: 'Untitled Document', content: '' });
      toast.success('Document created.');
      navigate('/docs/' + res.data.id);
    } catch (e) {
      setError(friendlyError(e, 'Could not create the document. Please try again.'));
    }
  };

  const onFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!/\.(txt|md|docx)$/i.test(file.name)) {
      setError('Unsupported file type. Please choose a .txt, .md, or .docx file.');
      return;
    }
    if (file.size === 0) { setError('That file is empty.'); return; }
    if (file.size > 1024 * 1024) { setError('File is too large. Maximum size is 1 MB.'); return; }
    setUploading(true);
    setError('');
    try {
      const form = new FormData();
      form.append('file', file);
      const res = await api.post('/upload', form);
      toast.success('Imported “' + (res.data.title || file.name) + '”.');
      navigate('/docs/' + res.data.id);
    } catch (err) {
      setError(friendlyError(err, 'Could not import that file. Please try again.'));
    } finally {
      setUploading(false);
    }
  };

  const deleteDoc = async (id) => {
    setPendingDelete(mine.find((d) => d.id === id) || { id });
  };

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    const id = pendingDelete.id;
    setPendingDelete(null);
    try {
      await api.delete('/documents/' + id, { params: { userId: user.id } });
      setMine((prev) => prev.filter((d) => d.id !== id));
      toast.success('Document deleted.');
    } catch (e) {
      setError(friendlyError(e, 'Could not delete the document. Please try again.'));
    }
  };

  return (
    <div className="app">
      <header className="topbar">
        <Link className="brand" to="/">
          <span className="brand-mark">D</span>
          <span className="brand-name">DocSpace</span>
        </Link>
        <div className="user-chip">
          <span className="avatar sm">{user?.name?.split(' ').map((w) => w[0]).join('').slice(0, 2)}</span>
          <span className="user-name">{user?.name}</span>
          <button className="btn ghost" onClick={logout}>Switch user</button>
        </div>
      </header>
      <main className="page">
        {error && <div className="alert error" role="alert">{error}</div>}
        <div className="page-head">
          <div>
            <h1>Documents</h1>
            <p className="muted">Create, edit, and share lightweight documents.</p>
          </div>
          <div className="actions">
            <input ref={fileRef} type="file" accept=".txt,.md,.docx" hidden onChange={onFile} />
            <button className="btn secondary" onClick={() => fileRef.current?.click()} disabled={uploading}>
              {uploading ? 'Importing…' : 'Import .txt / .md / .docx'}
            </button>
            <button className="btn primary" onClick={createDoc}>+ New Document</button>
          </div>
        </div>
        <DashboardLists loading={loading} mine={mine} shared={shared} createDoc={createDoc} navigate={navigate} deleteDoc={deleteDoc} />
      </main>
      {pendingDelete && (
        <ConfirmModal
          title={'Delete “' + (pendingDelete.title || 'Untitled Document') + '”?'}
          message="This cannot be undone. People it is shared with will lose access."
          confirmLabel="Delete"
          danger
          onConfirm={confirmDelete}
          onClose={() => setPendingDelete(null)}
        />
      )}
    </div>
  );
}
