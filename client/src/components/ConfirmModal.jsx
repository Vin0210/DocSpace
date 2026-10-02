export default function ConfirmModal({
  title,
  message,
  confirmLabel = 'Confirm',
  danger = false,
  onConfirm,
  onClose,
}) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal small"
        onClick={(e) => e.stopPropagation()}
        role="alertdialog"
        aria-label={title}
      >
        <h2>{title}</h2>
        <p className="muted">{message}</p>
        <div className="modal-actions split">
          <button className="btn secondary" onClick={onClose}>
            Cancel
          </button>
          <button className={'btn ' + (danger ? 'danger-btn' : 'primary')} onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
