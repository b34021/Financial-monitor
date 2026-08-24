import { useState, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { Transaction } from '../types/transaction';

interface ToastItem {
  id: string;
  transaction: Transaction;
  exited: boolean;
}

const TOAST_DURATION_MS = 3_500;

const VARIANTS = {
  initial: { opacity: 0, y: -32, scale: 0.92 },
  animate: { opacity: 1, y: 0, scale: 1, transition: { type: 'spring' as const, stiffness: 300, damping: 24 } },
  exit: { opacity: 0, y: -24, scale: 0.95, transition: { duration: 0.2 } },
};

/**
 * TransactionToast — a container rendered as a fixed overlay above the page
 * content. When a new transaction is pushed via `addToast`, it animates in
 * (spring scale+fade+slide), displays the transaction details, and auto-dismisses.
 *
 * Multiple toasts stack upward from the top-center of the viewport.
 */
export function useTransactionToast() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const counterRef = useRef(0);

  const addToast = useCallback((transaction: Transaction) => {
    const id = String(++counterRef.current);
    const item: ToastItem = { id, transaction, exited: false };
    setToasts((prev) => [...prev, item]);

    setTimeout(() => {
      setToasts((prev) => prev.map((t) => (t.id === id ? { ...t, exited: true } : t)));
      // Remove from DOM after exit animation completes.
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, 250);
    }, TOAST_DURATION_MS);
  }, []);

  /** Renders the toast container — call once in the page component tree. */
  const ToastContainer = useCallback(
    () => (
      <div className="toast-container" aria-live="polite" aria-relevant="additions">
        <AnimatePresence>
          {toasts.map((t) => (
            <motion.div
              key={t.id}
              className="toast"
              variants={VARIANTS}
              initial="initial"
              animate={t.exited ? 'exit' : 'animate'}
              exit="exit"
            >
              <span className="toast__icon">✓</span>
              <div className="toast__body">
                <span className="toast__title">Transaction received</span>
                <span className="toast__detail">
                  {t.transaction.amount.toLocaleString()} {t.transaction.currency} ·{' '}
                  {t.transaction.transactionId.slice(0, 7)}…
                </span>
                <span className="toast__meta">
                  {t.transaction.status} ·{' '}
                  {new Date(t.transaction.timestamp).toLocaleTimeString()}
                </span>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    ),
    [toasts],
  );

  return { addToast, ToastContainer };
}
