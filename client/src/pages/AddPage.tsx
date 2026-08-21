import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useIngestTransaction } from '../hooks/useIngestTransaction';
import type { TransactionStatus } from '../types/transaction';

/** Client-side defaults for the simulator form. */
const SIM_AMOUNT = 100.5;
const SIM_CURRENCY = 'USD';
const SIM_STATUS: TransactionStatus = 'Pending';

/**
 * zod schema for the simulator form. Amount is kept as a string (HTML number
 * inputs produce strings) and refined to a positive number at submit time;
 * currency is an ISO-3 uppercase code, status one of the three enum values.
 */
const addTransactionSchema = z.object({
  amount: z.string().refine((value) => {
    const n = Number(value);
    return Number.isFinite(n) && n > 0;
  }, 'Amount must be a positive number.'),
  currency: z
    .string()
    .trim()
    .length(3, 'Currency must be exactly 3 characters.')
    .toUpperCase(),
  status: z.enum(['Pending', 'Completed', 'Failed']),
});

/** Form values shape — matches the schema output (no coercion split needed). */
type AddTransactionFormValues = z.infer<typeof addTransactionSchema>;

/**
 * /add — transaction simulator. Lets the user compose a transaction and POST it
 * to the ingestion API via react-hook-form + zod + tanstack-query mutation.
 * Success shows the persisted echo; failures surface the backend's message.
 */
export function AddPage() {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<AddTransactionFormValues>({
    resolver: zodResolver(addTransactionSchema),
    defaultValues: {
      amount: String(SIM_AMOUNT),
      currency: SIM_CURRENCY,
      status: SIM_STATUS,
    },
  });

  const { mutate, data: result, error, isPending } = useIngestTransaction();

  const onSubmit = (values: AddTransactionFormValues) => {
    mutate({
      transactionId: crypto.randomUUID(),
      amount: Number(values.amount),
      currency: values.currency,
      status: values.status,
      timestamp: new Date().toISOString(),
    });
  };

  return (
    <section className="page">
      <h2>Transaction Simulator</h2>
      <p className="page__hint">
        Send a transaction to the ingestion API — it will appear on the live
        dashboard at /monitor.
      </p>

      <form className="form" onSubmit={handleSubmit(onSubmit)}>
        <label className="form__field">
          <span>Amount</span>
          <input
            type="number"
            step="any"
            min="0"
            {...register('amount')}
          />
          {errors.amount && <span className="form__error">{errors.amount.message}</span>}
        </label>

        <label className="form__field">
          <span>Currency (ISO 4217)</span>
          <input type="text" maxLength={3} {...register('currency')} />
          {errors.currency && <span className="form__error">{errors.currency.message}</span>}
        </label>

        <label className="form__field">
          <span>Status</span>
          <select {...register('status')}>
            <option value="Pending">Pending</option>
            <option value="Completed">Completed</option>
            <option value="Failed">Failed</option>
          </select>
          {errors.status && <span className="form__error">{errors.status.message}</span>}
        </label>

        <button className="btn" type="submit" disabled={isPending}>
          {isPending ? 'Sending…' : 'Send transaction'}
        </button>
      </form>

      {result && (
        <div className="notice notice--ok" data-testid="add-result">
          <strong>Sent:</strong> {result.amount.toLocaleString()} {result.currency} ·{' '}
          {result.transactionId.slice(0, 8)}…
        </div>
      )}

      {error && (
        <div className="notice notice--error" data-testid="add-error">
          {error instanceof Error ? error.message : 'Unable to send the transaction.'}
        </div>
      )}
    </section>
  );
}
