import { Link, Navigate, Route, Routes, useNavigate } from 'react-router-dom';
import { repo } from './lib/api';
import { useAuth } from './lib/auth';
import Home from './pages/Home';
import Login from './pages/Login';
import NewTournament from './pages/NewTournament';
import TournamentPage from './pages/TournamentPage';

export default function App() {
  const { user, isOrganizer, signOut } = useAuth();
  const navigate = useNavigate();

  return (
    <>
      <header className="topbar">
        <div className="container">
          <Link to="/" className="brand">
            <img src="./favicon.svg" alt="" />
            <span>
              Lions <b>TT</b>
            </span>
          </Link>
          <div className="spacer" />
          {repo.mode === 'supabase' &&
            (user ? (
              <>
                <span className="user-chip">{user.email}</span>
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={async () => {
                    await signOut();
                    navigate('/');
                  }}
                >
                  Salir
                </button>
              </>
            ) : (
              <Link to="/login" className="btn btn-sm">
                Ingresar
              </Link>
            ))}
          {isOrganizer && (
            <Link to="/nuevo" className="btn btn-primary btn-sm">
              + Nuevo torneo
            </Link>
          )}
        </div>
      </header>
      <main>
        <div className="container">
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/login" element={<Login />} />
            <Route path="/nuevo" element={<NewTournament />} />
            <Route path="/t/:id" element={<TournamentPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </div>
      </main>
    </>
  );
}
