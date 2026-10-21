import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { api } from '../api/client';
import type { Summary } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { PlusIcon, ShieldIcon } from '../components/Icons';
import { CategoryChip, EmptyState, ErrorNotice, PageHeader, Spinner } from '../components/ui';
import { formatDate, formatMoney, formatMonth, minorToMajor } from '../lib/format';

function MonthlyChart({ data, currency }: { data: Summary['monthly']; currency: Summary['currency'] }) {
  const max = Math.max(1, ...data.map((item) => item.totalMinor));
  const width = 640;
  const height = 220;
  const chartHeight = 170;
  const barWidth = width / data.length;
  return (
    <svg className="bar-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Gasto total de los últimos 12 meses">
      {[0.25, 0.5, 0.75, 1].map((ratio) => (
        <line key={ratio} x1="0" x2={width} y1={chartHeight - chartHeight * ratio + 10} y2={chartHeight - chartHeight * ratio + 10} className="grid-line" />
      ))}
      {data.map((item, index) => {
        const barHeight = (item.totalMinor / max) * chartHeight;
        const isLast = index === data.length - 1;
        return (
          <g key={item.month}>
            <title>{`${formatMonth(item.month, 'long')}: ${formatMoney(minorToMajor(item.totalMinor, currency), currency)}`}</title>
            <rect
              x={index * barWidth + barWidth * 0.18}
              y={chartHeight - barHeight + 10}
              width={barWidth * 0.64}
              height={Math.max(barHeight, 1)}
              rx="5"
              className={isLast ? 'bar bar-current' : 'bar'}
            />
            <text x={index * barWidth + barWidth / 2} y={height - 14} textAnchor="middle" className="axis-label">
              {formatMonth(item.month)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

export function DashboardPage() {
  const { user } = useAuth();
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [summary, setSummary] = useState<Summary | null>(null);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    let active = true;
    setError(null);
    api
      .get<Summary>('/reports/summary', { month })
      .then((data) => active && setSummary(data))
      .catch((caught) => active && setError(caught));
    return () => {
      active = false;
    };
  }, [month]);

  if (error) return <ErrorNotice error={error} />;
  if (!summary) return <Spinner />;

  const currency = summary.currency;
  const previous = minorToMajor(summary.previousMonthTotalMinor, currency);
  const current = minorToMajor(summary.monthTotalMinor, currency);
  const variation = previous > 0 ? ((current - previous) / previous) * 100 : null;
  const topCategory = summary.byCategory[0];
  const maxCategory = Math.max(1, ...summary.byCategory.map((item) => item.totalMinor));

  return (
    <>
      <PageHeader
        title={`Hola, ${user?.name.split(' ')[0] ?? ''}`}
        subtitle={`Resumen de ${formatMonth(summary.month, 'long')}`}
        actions={
          <>
            <input type="month" className="input-compact" value={month} max={new Date().toISOString().slice(0, 7)} onChange={(event) => event.target.value && setMonth(event.target.value)} aria-label="Mes del resumen" />
            <Link to="/gastos?nuevo=1" className="btn btn-primary">
              <PlusIcon /> Nuevo gasto
            </Link>
          </>
        }
      />

      {!user?.mfaEnabled && (
        <div className="callout">
          <ShieldIcon />
          <div>
            <strong>Protege tu cuenta con un segundo factor.</strong>
            <span> Activa la verificación en dos pasos (TOTP) para que tu contraseña no sea suficiente para entrar.</span>
          </div>
          <Link to="/seguridad" className="btn btn-sm btn-secondary">
            Activar
          </Link>
        </div>
      )}

      <section className="kpi-grid">
        <article className="card kpi">
          <span className="kpi-label">Total del mes</span>
          <strong className="kpi-value">{formatMoney(summary.monthTotal, currency)}</strong>
          <span className="kpi-foot">{summary.monthCount} gastos registrados</span>
        </article>
        <article className="card kpi">
          <span className="kpi-label">Respecto al mes anterior</span>
          <strong className={`kpi-value ${variation !== null && variation > 0 ? 'text-danger' : 'text-success'}`}>
            {variation === null ? '—' : `${variation > 0 ? '+' : ''}${variation.toFixed(1)} %`}
          </strong>
          <span className="kpi-foot">Mes anterior: {formatMoney(previous, currency)}</span>
        </article>
        <article className="card kpi">
          <span className="kpi-label">Categoría principal</span>
          <strong className="kpi-value kpi-value-sm">{topCategory ? topCategory.name : '—'}</strong>
          <span className="kpi-foot">{topCategory ? formatMoney(topCategory.total, currency) : 'Sin gastos este mes'}</span>
        </article>
        <article className="card kpi">
          <span className="kpi-label">Media por gasto</span>
          <strong className="kpi-value">{summary.monthCount ? formatMoney(current / summary.monthCount, currency) : '—'}</strong>
          <span className="kpi-foot">Moneda: {currency}</span>
        </article>
      </section>

      <section className="dashboard-grid">
        <article className="card">
          <header className="card-header">
            <h2>Evolución de los últimos 12 meses</h2>
          </header>
          <MonthlyChart data={summary.monthly} currency={currency} />
        </article>

        <article className="card">
          <header className="card-header">
            <h2>Gasto por categoría</h2>
          </header>
          {summary.byCategory.length === 0 ? (
            <EmptyState title="Sin gastos en este mes" />
          ) : (
            <ul className="category-bars">
              {summary.byCategory.map((item) => (
                <li key={item.categoryId}>
                  <div className="category-bars-label">
                    <CategoryChip name={item.name} color={item.color} />
                    <strong>{formatMoney(item.total, currency)}</strong>
                  </div>
                  <div className="progress">
                    <span style={{ width: `${(item.totalMinor / maxCategory) * 100}%`, backgroundColor: item.color }} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </article>
      </section>

      <article className="card">
        <header className="card-header">
          <h2>Últimos movimientos</h2>
          <Link to="/gastos" className="link">
            Ver todos
          </Link>
        </header>
        {summary.recent.length === 0 ? (
          <EmptyState title="Todavía no hay gastos">Registra tu primer gasto para ver aquí tu actividad.</EmptyState>
        ) : (
          <ul className="recent-list">
            {summary.recent.map((item) => (
              <li key={item.id}>
                <div>
                  <strong>{item.description}</strong>
                  <span className="muted">{formatDate(item.date)}</span>
                </div>
                <CategoryChip name={item.category.name} color={item.category.color} />
                <strong className="amount">{formatMoney(item.amount, currency)}</strong>
              </li>
            ))}
          </ul>
        )}
      </article>
    </>
  );
}
