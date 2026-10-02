import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import api, { friendlyError } from '../services/api';
import { downloadFile, htmlToMarkdown, safeFilename } from '../services/export';
import { useToast } from '../components/useToast';
import ConfirmModal from '../components/ConfirmModal';
import TipTapEditor from '../components/TipTapEditor';
import ShareModal from '../components/ShareModal';

function timeAgo(iso) {
  const d = new Date((iso || '').replace(' ', 'T') + 'Z');
  if (isNaN(d)) return '';
  const s = Math.floor((Date.now() - d.getTime()) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return Math.floor(s / 60) + 'm ago';
  if (s < 86400) return Math.floor(s / 3600) + 'h ago';
  return Math.floor(s / 86400) + 'd ago';
}

export default function EditorPage() {
  const { id } = useParams();
  const { user, users, logout } = useAuth();
  const toast = useToast();
  const [doc, setDoc] = useState(null);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saveState, setSaveState] = useState('saved');
  const [showShare, setShowShare] = useState(false);
  const [panel, setPanel] = useState(null); // null | 'comments' | 'history'
  const [comments, setComments] = useState([]);
  const [commentText, setCommentText] = useState('');
  const [quote, setQuote] = useState('');
  const [versions, setVersions] = useState([]);
  const [showExport, setShowExport] = useState(false);
  const [pendingCommentDelete, setPendingCommentDelete] = useState(null);
  const [pendingRestore, setPendingRestore] = useState(null);
  const timer = useRef(null);
  const stateRef = useRef({ title: '', content: '' });

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    api.get('/documents/' + id, { params: { userId: user.id } })
      .then((r) => {
        if (cancelled) return;
        setDoc(r.data);
        setTitle(r.data.title || '');
        setContent(r.data.content || '');
        stateRef.current = { title: r.data.title || '', content: r.data.content || '' };
        setSaveState('saved');
      })
      .catch((e) => {
        if (!cancelled) setError(friendlyError(e, 'Could not open this document.'));
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [id, user]);

  // Role of the current user on this document.
  const myRole = doc
    ? (doc.owner_id === user.id ? 'owner' : (doc.my_role || (doc.shared_with || []).find((s) => s.id === user.id)?.role || null))
    : null;
  const isOwner = myRole === 'owner';
  const canEdit = myRole === 'owner' || myRole === 'editor';
  const canRestore = canEdit;

  const persist = useCallback(async (nextTitle, nextContent) => {
    setSaveState('saving');
    try {
      // Editors may only change content: sending the echoed title would look
      // like a rename attempt, so it is omitted for non-owners.
      const body = isOwner ? { title: nextTitle, content: nextContent } : { content: nextContent };
      const res = await api.put('/documents/' + id, body);
      setDoc(res.data);
      stateRef.current = { title: nextTitle, content: nextContent };
      setSaveState('saved');
    } catch (e) {
      setSaveState('error');
      setError(friendlyError(e, 'Unable to save your changes. Please try again.'));
    }
  }, [id, isOwner]);

  const scheduleSave = useCallback((nextTitle, nextContent) => {
    if (nextTitle === stateRef.current.title && nextContent === stateRef.current.content) return;
    setSaveState('unsaved');
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => persist(nextTitle, nextContent), 900);
  }, [persist]);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const onTitle = (v) => { setTitle(v); scheduleSave(v, content); };
  const onContent = (html) => { setContent(html); scheduleSave(title, html); };
  const saveNow = () => {
    if (timer.current) clearTimeout(timer.current);
    persist(title, content);
  };

  const loadComments = useCallback(async () => {
    try {
      const r = await api.get('/documents/' + id + '/comments', { params: { userId: user.id } });
      setComments(r.data);
    } catch (e) {
      setError(friendlyError(e, 'Could not load comments.'));
    }
  }, [id, user]);

  const loadVersions = useCallback(async () => {
    try {
      const r = await api.get('/documents/' + id + '/versions', { params: { userId: user.id } });
      setVersions(r.data);
    } catch (e) {
      setError(friendlyError(e, 'Could not load version history.'));
    }
  }, [id, user]);

  const togglePanel = (name) => {
    const next = panel === name ? null : name;
    setPanel(next);
    if (next === 'comments') loadComments();
    if (next === 'history') loadVersions();
  };

  const addComment = async () => {
    const text = commentText.trim();
    if (!text) return;
    try {
      await api.post('/documents/' + id + '/comments', { content: text, quote });
      setCommentText('');
      setQuote('');
      loadComments();
      toast.success('Comment added.');
    } catch (e) {
      setError(friendlyError(e, 'Could not add your comment. Please try again.'));
    }
  };

  const toggleResolve = async (c) => {
    try {
      await api.patch('/comments/' + c.id, { resolved: !c.resolved });
      loadComments();
      toast.success(c.resolved ? 'Comment reopened.' : 'Comment resolved.');
    } catch (e) {
      setError(friendlyError(e, 'Could not update that comment.'));
    }
  };

  const deleteComment = async () => {
    if (!pendingCommentDelete) return;
    const c = pendingCommentDelete;
    setPendingCommentDelete(null);
    try {
      await api.delete('/comments/' + c.id, { params: { userId: user.id } });
      loadComments();
      toast.success('Comment deleted.');
    } catch (e) {
      setError(friendlyError(e, 'Could not delete that comment.'));
    }
  };

  const restoreVersion = async () => {
    if (!pendingRestore) return;
    const v = pendingRestore;
    setPendingRestore(null);
    try {
      const res = await api.post('/documents/' + id + '/versions/' + v.id + '/restore', {});
      setDoc(res.data);
      setTitle(res.data.title || '');
      setContent(res.data.content || '');
      stateRef.current = { title: res.data.title || '', content: res.data.content || '' };
      setSaveState('saved');
      loadVersions();
      toast.success('Version restored. Your previous content was kept as a version.');
    } catch (e) {
      setError(friendlyError(e, 'Could not restore that version.'));
    }
  };

  const exportMarkdown = () => {
    downloadFile(safeFilename(title, '.md'), htmlToMarkdown(content), 'text/markdown');
    setShowExport(false);
    toast.success('Exported Markdown.');
  };
  const exportHtml = () => {
    const page = '<!doctype html><html><head><meta charset="utf-8"><title>' + title.replace(/</g, '&lt;') + '</title></head><body><h1>' + title.replace(/</g, '&lt;') + '</h1>' + content + '</body></html>';
    downloadFile(safeFilename(title, '.html'), page, 'text/html');
    setShowExport(false);
    toast.success('Exported HTML.');
  };

  const openCount = comments.filter((c) => !c.resolved).length;

  return (
    <div className="app">
      <header className="topbar editor-bar">
        <Link className="btn ghost" to="/">← Documents</Link>
        <input
          className="title-input"
          value={title}
          onChange={(e) => onTitle(e.target.value)}
          placeholder="Untitled Document"
          aria-label="Document title"
          disabled={!isOwner && !!doc}
        />
        <span className={'save-state ' + saveState}>
          {saveState === 'saving' ? 'Saving…' : saveState === 'unsaved' ? 'Unsaved changes' : saveState === 'error' ? 'Save failed' : myRole === 'viewer' ? 'View only' : 'Saved'}
        </span>
        {canEdit && <button className="btn primary" onClick={saveNow}>Save</button>}
        {isOwner && <button className="btn secondary" onClick={() => setShowShare(true)}>Share</button>}
        <button className={'btn secondary' + (panel === 'comments' ? ' active-tab' : '')} onClick={() => togglePanel('comments')}>
          Comments{openCount > 0 ? ' (' + openCount + ')' : ''}
        </button>
        <button className={'btn secondary' + (panel === 'history' ? ' active-tab' : '')} onClick={() => togglePanel('history')}>History</button>
        <div className="menu-wrap">
          <button className="btn secondary" onClick={() => setShowExport((v) => !v)}>Export ▾</button>
          {showExport && (
            <div className="menu" onMouseLeave={() => setShowExport(false)}>
              <button onClick={exportMarkdown}>Download Markdown (.md)</button>
              <button onClick={exportHtml}>Download HTML (.html)</button>
              <button onClick={() => { setShowExport(false); window.print(); }}>Print / Save as PDF</button>
            </div>
          )}
        </div>
        <div className="user-chip">
          <span className="avatar sm">{user?.name?.split(' ').map((w) => w[0]).join('').slice(0, 2)}</span>
          <button className="btn ghost" onClick={logout} title={user?.name}>Switch</button>
        </div>
      </header>
      <main className="page editor-page with-panel">
        {error && <div className="alert error" role="alert">{error}</div>}
        {loading ? (
          <p className="muted">Opening document…</p>
        ) : !doc ? (
          <div className="empty">
            <strong>Document not found</strong>
            <p className="muted">It may have been deleted, or you may not have access.</p>
            <Link className="btn secondary" to="/">Back to Documents</Link>
          </div>
        ) : (
          <div className="editor-layout">
            <div className="editor-main">
              {!isOwner && (
                <div className="alert info">
                  Shared by {doc.owner?.name} · {myRole === 'viewer' ? 'You have view access — you can read and comment, but not edit.' : 'You have editor access — you can edit content; only the owner can rename or share.'}
                </div>
              )}
              <div className="print-doc">
                <h1 className="print-title">{title || 'Untitled Document'}</h1>
                <TipTapEditor key={doc.id} initialHtml={content} onChange={onContent} editable={canEdit} onSelection={setQuote} />
              </div>
            </div>
            {panel === 'comments' && (
              <aside className="side-panel" aria-label="Comments">
                <h3>Comments</h3>
                {quote && <p className="muted small">Quoting: “{quote.slice(0, 120)}”</p>}
                <div className="comment-box">
                  <textarea value={commentText} onChange={(e) => setCommentText(e.target.value)} placeholder="Add a comment…" rows={3} />
                  <button className="btn primary" onClick={addComment} disabled={!commentText.trim()}>Comment</button>
                </div>
                {comments.length === 0 ? (
                  <p className="muted">No comments yet.</p>
                ) : (
                  <ul className="comment-list">
                    {comments.map((c) => (
                      <li key={c.id} className={'comment' + (c.resolved ? ' resolved' : '')}>
                        <div className="comment-head">
                          <strong>{c.author?.name}</strong>
                          <span className="muted small">{timeAgo(c.created_at)}</span>
                          {c.resolved && <span className="badge">Resolved</span>}
                        </div>
                        {c.quote && <p className="comment-quote">“{c.quote}”</p>}
                        <p className="comment-body">{c.content}</p>
                        <div className="comment-actions">
                          {(c.author?.id === user.id || isOwner) && (
                            <button className="btn ghost" onClick={() => toggleResolve(c)}>{c.resolved ? 'Reopen' : 'Resolve'}</button>
                          )}
                          {(c.author?.id === user.id || isOwner) && (
                            <button className="btn ghost danger" onClick={() => setPendingCommentDelete(c)}>Delete</button>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </aside>
            )}
            {panel === 'history' && (
              <aside className="side-panel" aria-label="Version history">
                <h3>Version history</h3>
                <p className="muted small">Snapshots are saved automatically while editing. Restoring keeps your current content as a version too.</p>
                {versions.length === 0 ? (
                  <p className="muted">No versions yet — edit the document to create one.</p>
                ) : (
                  <ul className="version-list">
                    {versions.map((v) => (
                      <li key={v.id} className="version">
                        <div className="comment-head">
                          <strong>{v.title || 'Untitled'}</strong>
                        </div>
                        <p className="muted small">{timeAgo(v.created_at)}{v.author ? ' · ' + v.author.name : ''}</p>
                        {v.preview && <p className="version-preview">{v.preview}</p>}
                        {canRestore && <button className="btn ghost" onClick={() => setPendingRestore(v)}>Restore this version</button>}
                      </li>
                    ))}
                  </ul>
                )}
              </aside>
            )}
          </div>
        )}
      </main>
      {showShare && isOwner && (
        <ShareModal
          doc={doc}
          users={users}
          meId={user.id}
          onClose={() => setShowShare(false)}
          onShared={(list) => setDoc((d) => ({ ...d, shared_with: list }))}
        />
      )}
      {pendingCommentDelete && (
        <ConfirmModal
          title="Delete this comment?"
          message="This cannot be undone."
          confirmLabel="Delete"
          danger
          onConfirm={deleteComment}
          onClose={() => setPendingCommentDelete(null)}
        />
      )}
      {pendingRestore && (
        <ConfirmModal
          title="Restore this version?"
          message={'From ' + timeAgo(pendingRestore.created_at) + '. Your current content will be kept as a version too, so nothing is lost.'}
          confirmLabel="Restore version"
          onConfirm={restoreVersion}
          onClose={() => setPendingRestore(null)}
        />
      )}
    </div>
  );
}
