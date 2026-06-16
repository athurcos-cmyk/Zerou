import { useCallback, useRef, useState } from 'react';
import { BottomSheet } from './BottomSheet';

interface ConfirmOptions {
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
}

interface ConfirmState extends ConfirmOptions {
  open: boolean;
}

const closed: ConfirmState = { open: false, title: '' };

/** Promise-based confirmation backed by a styled bottom sheet (replaces window.confirm). */
export function useConfirm() {
  const [state, setState] = useState<ConfirmState>(closed);
  const resolver = useRef<((value: boolean) => void) | null>(null);

  const confirm = useCallback((options: ConfirmOptions) => {
    setState({ ...options, open: true });
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve;
    });
  }, []);

  const settle = useCallback((value: boolean) => {
    resolver.current?.(value);
    resolver.current = null;
    setState(closed);
  }, []);

  const dialog = (
    <BottomSheet open={state.open} onClose={() => settle(false)} title={state.title} subtitle={state.message}>
      <div className="sheet-actions">
        <button
          className={`button ${state.danger ? 'button--danger' : 'button--primary'}`}
          type="button"
          onClick={() => settle(true)}
        >
          {state.confirmLabel ?? 'Confirmar'}
        </button>
        <button className="button button--ghost" type="button" onClick={() => settle(false)}>
          {state.cancelLabel ?? 'Cancelar'}
        </button>
      </div>
    </BottomSheet>
  );

  return { confirm, dialog };
}
