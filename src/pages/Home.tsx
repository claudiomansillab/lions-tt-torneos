import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { repo } from '../lib/api';
import { useAuth } from '../lib/auth';
import type { Tournament } from '../lib/types';
import { StatusPill, formatDate } from '../components/ui';

export default function Home() {
  const { user } = useAuth();
  const [items, setItems] = useState<Tournament[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    repo.listTournaments().then(setItems, (e: Error) => setError(e.message));
  }, []);

  const mine = items?.filter((t) => t.owner_id === user?.id) ?? [];
  const others = items?.filter((t) => t.owner_id !== user?.id) ?? [];

  return (
    <>
      <section className="hero">
        <div>
          <h1>
            Torneos de <span className="grad">tenis de mesa</span>
          </h1>
          <p>
            Sorteo de grupos, segunda ronda cruzada, ranking general y llaves de eliminación directa. Comparte el link
            del torneo y los jugadores ven los resultados en vivo.
          </p>
        </div>
        {user ? (
          <Link to="/nuevo" className="btn btn-primary">
            + Crear torneo
          </Link>
        ) : (
          <Link to="/login" className="btn btn-primary">
            Ingresar para organizar
          </Link>
        )}
      </section>

      {repo.mode === 'local' && (
        <div className="banner" style={{ marginBottom: 20 }}>
          <span>
            <b>Modo local:</b> los datos se guardan sólo en este navegador. Configura <code>VITE_SUPABASE_URL</code> y{' '}
            <code>VITE_SUPABASE_ANON_KEY</code> para guardar en Supabase y compartir torneos.
          </span>
        </div>
      )}

      {error && <div className="banner warn">{error}</div>}
      {!items && !error && <Loading />}

      {items && items.length === 0 && (
        <div className="card empty">
          <h3>Aún no hay torneos</h3>
          <p>Crea el primero para comenzar.</p>
        </div>
      )}

      {mine.length > 0 && <TournamentList title={repo.mode === 'local' ? 'Torneos' : 'Mis torneos'} items={mine} />}
      {others.length > 0 && <TournamentList title="Torneos publicados" items={others} />}

      <div className="format-steps">
        <div className="step">
          <b><span className="n">01</span>Ronda 1</b>
          <span className="muted small">Grupos por sorteo, todos contra todos.</span>
        </div>
        <div className="step">
          <b><span className="n">02</span>Ronda 2</b>
          <span className="muted small">Grupos cruzados: A+ = 1A · 2B · 3C, B+ = 1B · 2C · 3A…</span>
        </div>
        <div className="step">
          <b><span className="n">03</span>Ranking</b>
          <span className="muted small">Suma de ambas rondas. Clasifican los mejores K.</span>
        </div>
        <div className="step">
          <b><span className="n">04</span>Llaves</b>
          <span className="muted small">Eliminación directa sembrada hasta el campeón.</span>
        </div>
      </div>
    </>
  );
}

function TournamentList({ title, items }: { title: string; items: Tournament[] }) {
  return (
    <section style={{ marginBottom: 28 }}>
      <h2 style={{ marginBottom: 14 }}>{title}</h2>
      <div className="t-grid">
        {items.map((t) => (
          <Link key={t.id} to={`/t/${t.id}`} className="t-card">
            <h3>{t.name}</h3>
            <div className="meta">
              <StatusPill status={t.status} />
              {t.event_date && <span>{formatDate(t.event_date)}</span>}
              <span>· Top {t.qualifiers} a llaves</span>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}

export function Loading() {
  return (
    <div className="loading">
      <div className="spinner" />
      Cargando…
    </div>
  );
}
