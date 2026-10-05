import { useEffect, useRef } from "react";
export function ConfirmDialog({
  message,
  action,
  onConfirm,
  onCancel,
}: {
  message: string;
  action: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      className="confirm-dialog"
      onCancel={onCancel}
      aria-labelledby="confirm-title"
    >
      <h2 id="confirm-title">편집 내용 확인</h2>
      <p>{message}</p>
      <div>
        <button className="button" autoFocus onClick={onCancel}>
          취소
        </button>
        <button className="button primary" onClick={onConfirm}>
          {action}
        </button>
      </div>
    </dialog>
  );
}
