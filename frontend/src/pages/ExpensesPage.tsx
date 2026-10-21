import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router';
import { api, ApiError, downloadFile } from '../api/client';
import type { Category, Expense, ExpenseList, PaymentMethod } from '../api/types';
import { DownloadIcon, EditIcon, PaperclipIcon, PlusIcon, SearchIcon, TrashIcon, UploadIcon } from '../components/Icons';
import { CategoryChip, EmptyState, ErrorNotice, Modal, Notice, PageHeader, Pagination, Spinner } from '../components/ui';
import { formatDate, formatMoney, PAYMENT_LABELS, todayIso } from '../lib/format';

const MAX_FILE_BYTES = 5 * 1024 * 1024;
const ACCEPTED_TYPES = ['application/pdf', 'image/png', 'image/jpeg', 'image/webp'];

interface Filters {
  q: string;
  categoryId: string;
  from: string;
  to: string;
  sort: string;
  page: number;
}

const emptyFilters: Filters = { q: '', categoryId: '', from: '', to: '', sort: 'date_desc', page: 1 };

function ExpenseForm({ expense, categories, onClose, onSaved }: { expense: Expense | null; categories: Category[]; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({
    amount: expense?.amount ?? '',
    date: expense?.date ?? todayIso(),
    categoryId: expense?.category.id ?? categories[0]?.id ?? '',
    description: expense?.description ?? '',
    merchant: expense?.merchant ?? '',
    paymentMethod: (expense?.paymentMethod ?? 'CARD') as PaymentMethod,
  });
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  const update = (field: keyof typeof form) => (event: { target: { value: string } }) => setForm((current) => ({ ...current, [field]: event.target.value }));

  const chooseFile = (selected: File | undefined) => {
    setFileError(null);
    if (!selected) return setFile(null);
    // Validación previa en el cliente solo por usabilidad: el servidor valida el contenido real.
    if (!ACCEPTED_TYPES.includes(selected.type)) return setFileError('Formato no permitido. Usa PDF, PNG, JPEG o WebP.');
    if (selected.size > MAX_FILE_BYTES) return setFileError('El fichero supera el máximo de 5 MB.');
    setFile(selected);
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const payload = { ...form, amount: form.amount.replace(',', '.'), merchant: form.merchant.trim() || null };
      const saved = expense ? await api.patch<Expense>(`/expenses/${expense.id}`, payload) : await api.post<Expense>('/expenses', payload);
      if (file) {
        const data = new FormData();
        data.append('receipt', file);
        await api.upload(`/expenses/${saved.id}/receipt`, data);
      }
      onSaved();
    } catch (caught) {
      setError(caught);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title={expense ? 'Editar gasto' : 'Nuevo gasto'} onClose={onClose}>
      <form onSubmit={submit} className="form-grid">
        <ErrorNotice error={error} />
        <label className="field">
          <span>Importe</span>
          <input inputMode="decimal" required maxLength={20} pattern="\d{1,10}([.,]\d{1,2})?" placeholder="0,00" value={form.amount} onChange={update('amount')} />
        </label>
        <label className="field">
          <span>Fecha</span>
          <input type="date" required min="2000-01-01" max={todayIso()} value={form.date} onChange={update('date')} />
        </label>
        <label className="field span-2">
          <span>Descripción</span>
          <input required maxLength={200} value={form.description} onChange={update('description')} />
        </label>
        <label className="field">
          <span>Categoría</span>
          <select required value={form.categoryId} onChange={update('categoryId')}>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Método de pago</span>
          <select value={form.paymentMethod} onChange={update('paymentMethod')}>
            {Object.entries(PAYMENT_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="field span-2">
          <span>Comercio (opcional)</span>
          <input maxLength={100} value={form.merchant} onChange={update('merchant')} />
        </label>
        <div className="field span-2">
          <span>Justificante (PDF, PNG, JPEG o WebP · máx. 5 MB)</span>
          {expense?.receipt && !file && (
            <p className="hint">
              <PaperclipIcon size={14} /> Adjunto actual: {expense.receipt.originalName}. Selecciona otro fichero para reemplazarlo.
            </p>
          )}
          <label className="file-drop">
            <UploadIcon />
            <span>{file ? file.name : 'Seleccionar fichero'}</span>
            <input type="file" accept=".pdf,.png,.jpg,.jpeg,.webp" onChange={(event) => chooseFile(event.target.files?.[0])} />
          </label>
          {fileError && <small className="field-error">{fileError}</small>}
        </div>
        <div className="form-actions span-2">
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Cancelar
          </button>
          <button type="submit" className="btn btn-primary" disabled={busy || Boolean(fileError)}>
            {busy ? 'Guardando…' : 'Guardar'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

export function ExpensesPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [filters, setFilters] = useState<Filters>(emptyFilters);
  const [search, setSearch] = useState('');
  const [data, setData] = useState<ExpenseList | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [editing, setEditing] = useState<Expense | null | 'new'>(searchParams.get('nuevo') ? 'new' : null);
  const [error, setError] = useState<unknown>(null);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setError(null);
      setData(await api.get<ExpenseList>('/expenses', { ...filters, pageSize: 15 }));
    } catch (caught) {
      setError(caught);
    }
  }, [filters]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    api.get<Category[]>('/categories').then(setCategories).catch(setError);
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => setFilters((current) => (current.q === search ? current : { ...current, q: search, page: 1 })), 350);
    return () => clearTimeout(timer);
  }, [search]);

  const setFilter = (field: keyof Filters) => (event: { target: { value: string } }) => setFilters((current) => ({ ...current, [field]: event.target.value, page: 1 }));

  const closeForm = () => {
    setEditing(null);
    if (searchParams.has('nuevo')) setSearchParams({}, { replace: true });
  };

  const remove = async (expense: Expense) => {
    if (!window.confirm(`¿Eliminar el gasto "${expense.description}"?`)) return;
    try {
      await api.delete(`/expenses/${expense.id}`);
      setMessage('Gasto eliminado.');
      await load();
    } catch (caught) {
      setError(caught);
    }
  };

  const exportCsv = async () => {
    try {
      await downloadFile('/reports/export.csv', 'gastos.csv', { from: filters.from, to: filters.to });
    } catch (caught) {
      setError(caught);
    }
  };

  const downloadReceipt = async (expense: Expense) => {
    try {
      await downloadFile(`/expenses/${expense.id}/receipt`, expense.receipt?.originalName ?? 'justificante');
    } catch (caught) {
      setError(caught instanceof ApiError ? caught : new Error('No se pudo descargar el justificante.'));
    }
  };

  return (
    <>
      <PageHeader
        title="Gastos"
        subtitle="Consulta, filtra y gestiona tus gastos y justificantes."
        actions={
          <>
            <button type="button" className="btn btn-secondary" onClick={exportCsv}>
              <DownloadIcon /> Exportar CSV
            </button>
            <button type="button" className="btn btn-primary" onClick={() => setEditing('new')} disabled={categories.length === 0}>
              <PlusIcon /> Nuevo gasto
            </button>
          </>
        }
      />
      {message && (
        <Notice kind="success" onClose={() => setMessage(null)}>
          {message}
        </Notice>
      )}
      <ErrorNotice error={error} onClose={() => setError(null)} />

      <section className="card filters">
        <label className="search-field">
          <SearchIcon />
          <input placeholder="Buscar por descripción o comercio" maxLength={100} value={search} onChange={(event) => setSearch(event.target.value)} aria-label="Buscar" />
        </label>
        <select value={filters.categoryId} onChange={setFilter('categoryId')} aria-label="Categoría">
          <option value="">Todas las categorías</option>
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </select>
        <input type="date" value={filters.from} onChange={setFilter('from')} aria-label="Desde" />
        <input type="date" value={filters.to} onChange={setFilter('to')} aria-label="Hasta" />
        <select value={filters.sort} onChange={setFilter('sort')} aria-label="Ordenar">
          <option value="date_desc">Más recientes</option>
          <option value="date_asc">Más antiguos</option>
          <option value="amount_desc">Mayor importe</option>
          <option value="amount_asc">Menor importe</option>
        </select>
      </section>

      <section className="card table-card">
        {!data ? (
          <Spinner />
        ) : data.items.length === 0 ? (
          <EmptyState title="No hay gastos que coincidan">Prueba a cambiar los filtros o registra un nuevo gasto.</EmptyState>
        ) : (
          <>
            <div className="table-summary">
              <span className="muted">Total filtrado</span>
              <strong>{formatMoney(data.totalAmount, data.currency)}</strong>
            </div>
            <div className="table-wrapper">
              <table>
                <thead>
                  <tr>
                    <th>Fecha</th>
                    <th>Descripción</th>
                    <th>Categoría</th>
                    <th>Pago</th>
                    <th className="num">Importe</th>
                    <th aria-label="Acciones" />
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((expense) => (
                    <tr key={expense.id}>
                      <td className="nowrap">{formatDate(expense.date)}</td>
                      <td>
                        <strong>{expense.description}</strong>
                        {expense.merchant && <span className="cell-sub">{expense.merchant}</span>}
                      </td>
                      <td>
                        <CategoryChip name={expense.category.name} color={expense.category.color} />
                      </td>
                      <td>{PAYMENT_LABELS[expense.paymentMethod]}</td>
                      <td className="num nowrap">
                        <strong>{formatMoney(expense.amount, expense.currency)}</strong>
                      </td>
                      <td className="row-actions">
                        {expense.receipt && (
                          <button type="button" className="icon-button" title={`Descargar ${expense.receipt.originalName}`} aria-label="Descargar justificante" onClick={() => downloadReceipt(expense)}>
                            <PaperclipIcon />
                          </button>
                        )}
                        <button type="button" className="icon-button" title="Editar" aria-label="Editar gasto" onClick={() => setEditing(expense)}>
                          <EditIcon />
                        </button>
                        <button type="button" className="icon-button danger" title="Eliminar" aria-label="Eliminar gasto" onClick={() => remove(expense)}>
                          <TrashIcon />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onChange={(page) => setFilters((current) => ({ ...current, page }))} />
          </>
        )}
      </section>

      {editing && categories.length > 0 && (
        <ExpenseForm
          expense={editing === 'new' ? null : editing}
          categories={categories}
          onClose={closeForm}
          onSaved={() => {
            setMessage(editing === 'new' ? 'Gasto registrado correctamente.' : 'Gasto actualizado.');
            closeForm();
            void load();
          }}
        />
      )}
    </>
  );
}
