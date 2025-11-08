import { ReactNode, useEffect } from 'react';

interface ModalProps {
  title?: string;
  isOpen: boolean;
  onClose: () => void;
  width?: string;
  children: ReactNode;
}

export function Modal({ title, isOpen, onClose, width = '720px', children }: ModalProps) {
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <div className="modal-panel" style={{ maxWidth: width }}>
        <div className="modal-header">
          {title ? <h2>{title}</h2> : null}
          <button type="button" className="modal-close" onClick={onClose} aria-label="Close dialog">
            ×
          </button>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}

