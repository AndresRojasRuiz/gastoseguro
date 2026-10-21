import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { api } from '../api/client';
import type { Category } from '../api/types';
import { EditIcon, PlusIcon, TrashIcon } from '../components/Icons';
import { CategoryChip, EmptyState, ErrorNotice, Notice, PageHeader, Spinner } from '../components/ui';

const PALETTE = ['#16a34a', '#2563eb', '#9333ea', '#dc2626', '#f59e0b', '#0891b2', '#db2777', '#64748b', '#0f766e', '#7c3aed'];

export function CategoriesPage() {
  const [categories, setCategories] = useState<Category[] | null>(null);
  const [name, setName] = useState('');
  const [color, setColor] = useState(PALETTE[0]!);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [error, setError] = useState<unknown>(null);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setCategories(await api.get<Category[]>('/categories'));
    } catch (caught) {
      setError(caught);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const run = async (action: () => Promise<unknown>, success: string) => {
    setError(null);
    try {
      await action();
      setMessage(success);
      await load();
    } catch (caught) {
      setError(caught);
    }
  };

  const create = (event: FormEvent) => {
    event.preventDefault();
    void run(async () => {
      await api.post('/categories', { name, color });
      setName('');
    }, 'Categoría creada.');
  };

  const saveName = (category: Category) =>
    run(async () => {
      await api.patch(`/categories/${category.id}`, { name: editName });
      setEditingId(null);
    }, 'Categoría actualizada.');

  return (
    <>
      <PageHeader title="Categorías" subtitle="Organiza tus gastos con categorías propias." />
      {message && (
        <Notice kind="success" onClose={() => setMessage(null)}>
          {message}
        </Notice>
      )}
      <ErrorNotice error={error} onClose={() => setError(null)} />

      <section className="two-columns">
        <form className="card" onSubmit={create}>
          <header className="card-header">
            <h2>Nueva categoría</h2>
          </header>
          <label className="field">
            <span>Nombre</span>
            <input required maxLength={40} value={name} onChange={(event) => setName(event.target.value)} />
          </label>
          <div className="field">
            <span>Color</span>
            <div className="swatches" role="radiogroup" aria-label="Color">
              {PALETTE.map((option) => (
                <button
                  key={option}
                  type="button"
                  role="radio"
                  aria-checked={color === option}
                  aria-label={option}
                  className={`swatch${color === option ? ' selected' : ''}`}
                  style={{ backgroundColor: option }}
                  onClick={() => setColor(option)}
                />
              ))}
            </div>
          </div>
          <button type="submit" className="btn btn-primary">
            <PlusIcon /> Crear categoría
          </button>
        </form>

        <section className="card">
          <header className="card-header">
            <h2>Tus categorías</h2>
          </header>
          {!categories ? (
            <Spinner />
          ) : categories.length === 0 ? (
            <EmptyState title="Aún no tienes categorías" />
          ) : (
            <ul className="list">
              {categories.map((category) => (
                <li key={category.id} className="list-row">
                  {editingId === category.id ? (
                    <form
                      className="inline-form"
                      onSubmit={(event) => {
                        event.preventDefault();
                        void saveName(category);
                      }}
                    >
                      <input autoFocus required maxLength={40} value={editName} onChange={(event) => setEditName(event.target.value)} aria-label="Nuevo nombre" />
                      <button type="submit" className="btn btn-sm btn-primary">
                        Guardar
                      </button>
                      <button type="button" className="btn btn-sm btn-ghost" onClick={() => setEditingId(null)}>
                        Cancelar
                      </button>
                    </form>
                  ) : (
                    <>
                      <CategoryChip name={category.name} color={category.color} />
                      <span className="muted">{category.expenseCount ?? 0} gastos</span>
                      <div className="row-actions">
                        <button
                          type="button"
                          className="icon-button"
                          aria-label={`Renombrar ${category.name}`}
                          onClick={() => {
                            setEditingId(category.id);
                            setEditName(category.name);
                          }}
                        >
                          <EditIcon />
                        </button>
                        <button
                          type="button"
                          className="icon-button danger"
                          aria-label={`Eliminar ${category.name}`}
                          disabled={(category.expenseCount ?? 0) > 0}
                          title={(category.expenseCount ?? 0) > 0 ? 'Tiene gastos asociados' : 'Eliminar'}
                          onClick={() => window.confirm(`¿Eliminar la categoría "${category.name}"?`) && void run(() => api.delete(`/categories/${category.id}`), 'Categoría eliminada.')}
                        >
                          <TrashIcon />
                        </button>
                      </div>
                    </>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      </section>
    </>
  );
}
