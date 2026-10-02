import { timeAgo } from './DashboardPage';

export default function DashboardLists({ loading, mine, shared, createDoc, navigate, deleteDoc }) {
  if (loading) return <p className="muted">Loading documents…</p>;
  return (
    <>
      <section>
        <h2 className="section-title">My Documents</h2>
        {mine.length === 0 ? (
          <div className="empty">
            <strong>No documents yet</strong>
            <p className="muted">Create your first document or import a .txt, .md, or .docx file to get started.</p>
            <button className="btn primary" onClick={createDoc}>+ New Document</button>
          </div>
        ) : (
          <ul className="doc-list">
            {mine.map((d) => (
              <li key={d.id} className="doc-row">
                <button className="doc-main" onClick={() => navigate('/docs/' + d.id)}>
                  <span className="doc-title">{d.title || 'Untitled Document'}</span>
                  <span className="muted small">Updated {timeAgo(d.updated_at)}</span>
                </button>
                <span className="badge">Owner</span>
                <button className="btn ghost danger" onClick={() => deleteDoc(d.id)}>Delete</button>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section>
        <h2 className="section-title">Shared With Me</h2>
        {shared.length === 0 ? (
          <div className="empty subtle"><p className="muted">Nothing shared with you yet.</p></div>
        ) : (
          <ul className="doc-list">
            {shared.map((d) => (
              <li key={d.id} className="doc-row">
                <button className="doc-main" onClick={() => navigate('/docs/' + d.id)}>
                  <span className="doc-title">{d.title || 'Untitled Document'}</span>
                  <span className="muted small">Shared by {d.shared_by?.name || d.owner?.name} · Updated {timeAgo(d.updated_at)}</span>
                </button>
                <span className="badge shared">{d.my_role === 'viewer' ? 'Viewer' : 'Editor'}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
