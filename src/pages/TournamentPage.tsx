import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import Bracket from '../components/Bracket';
import GroupCard from '../components/GroupCard';
import MatchModal from '../components/MatchModal';
import PlayersPanel from '../components/PlayersPanel';
import RankingTable from '../components/RankingTable';
import { STATUS_LABEL, StatusPill, bestOf, formatDate } from '../components/ui';
import { repo } from '../lib/api';
import { useAuth } from '../lib/auth';
import {
  MIN_PLAYERS,
  champion,
  generateKnockout,
  generateRound1,
  generateRound2,
  groupStandings,
  groupsOf,
  isBye,
  koRounds,
  nextSlot,
  rankingAfterGroups,
  roundName,
  stageComplete,
  stageMatches,
} from '../lib/tournament';
import type { Match, MatchResult, Stage, Status, TournamentData } from '../lib/types';
import { Loading } from './Home';

type Tab = 'players' | 'r1' | 'r2' | 'ranking' | 'ko';

const STEPS: Status[] = ['setup', 'round1', 'round2', 'knockout', 'finished'];

const defaultTab = (s: Status): Tab =>
  s === 'setup' ? 'players' : s === 'round1' ? 'r1' : s === 'round2' ? 'r2' : 'ko';

const CLEARED: MatchResult = { sets: [], p1_sets: null, p2_sets: null, winner_id: null, walkover: false };

export default function TournamentPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [data, setData] = useState<TournamentData | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Match | null>(null);
  const [modalError, setModalError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const reload = useCallback(async () => {
    try {
      const d = await repo.getTournament(id!);
      setData(d);
      setTab((t) => t ?? defaultTab(d.tournament.status));
    } catch (e) {
      setLoadError((e as Error).message);
    }
  }, [id]);

  useEffect(() => {
    reload();
    return repo.subscribe(id!, reload);
  }, [id, reload]);

  const derived = useMemo(() => {
    if (!data) return null;
    const names = new Map(data.players.map((p) => [p.id, p.name]));
    const r1Groups = groupsOf(data, 1);
    const r2Groups = groupsOf(data, 2);
    const tags = new Map<string, string>();
    for (const g of r1Groups) {
      groupStandings(g.player_ids, data.matches.filter((m) => m.group_id === g.id)).forEach((r, i) =>
        tags.set(r.playerId, `${i + 1}${g.label}`),
      );
    }
    const ranking = rankingAfterGroups(data);
    const ko = stageMatches(data, 'ko');
    const seeds = new Map(
      ko.length ? ranking.slice(0, data.tournament.qualifiers).map((r, i) => [r.playerId, i + 1] as const) : [],
    );
    return { names, r1Groups, r2Groups, tags, ranking, ko, seeds, champ: champion(data) };
  }, [data]);

  if (loadError) return <div className="banner warn">No se pudo cargar el torneo: {loadError}</div>;
  if (!data || !derived || !tab) return <Loading />;

  const t = data.tournament;
  const { names, r1Groups, r2Groups, tags, ranking, ko, seeds, champ } = derived;
  const canEdit = !!user && user.id === t.owner_id;
  const stepIdx = STEPS.indexOf(t.status);

  const editableStage = (s: Stage) =>
    canEdit &&
    ((s === 'r1' && t.status === 'round1') ||
      (s === 'r2' && t.status === 'round2') ||
      (s === 'ko' && (t.status === 'knockout' || t.status === 'finished')));

  const progress = (stage: Stage) => {
    const ms = stageMatches(data, stage).filter((m) => !isBye(m));
    return { done: ms.filter((m) => m.winner_id).length, total: ms.length };
  };
  const resultsIn = (stage: Stage) => progress(stage).done;

  const run = async (fn: () => Promise<void>, nextTab?: Tab) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      await reload();
      if (nextTab) setTab(nextTab);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const confirmLoss = (stage: Stage, what: string) => {
    const n = resultsIn(stage);
    return n === 0 || window.confirm(`${what} borrará ${n} resultado(s) ya cargado(s). ¿Continuar?`);
  };

  // ---------------- Acciones de fase ----------------

  const drawRound1 = () =>
    run(async () => {
      const { groups, matches } = generateRound1(data);
      await repo.deleteStage(t.id, 'r1');
      await repo.insertStage(groups, matches);
      if (t.status !== 'round1') await repo.updateTournament(t.id, { status: 'round1' });
    }, 'r1');

  const undoRound1 = () =>
    confirmLoss('r1', 'Volver a inscripción') &&
    run(async () => {
      await repo.deleteStage(t.id, 'r1');
      await repo.updateTournament(t.id, { status: 'setup' });
    }, 'players');

  const makeRound2 = () =>
    run(async () => {
      const { groups, matches } = generateRound2(data);
      await repo.insertStage(groups, matches);
      await repo.updateTournament(t.id, { status: 'round2' });
    }, 'r2');

  const undoRound2 = () =>
    confirmLoss('r2', 'Deshacer la Ronda 2') &&
    run(async () => {
      await repo.deleteStage(t.id, 'r2');
      await repo.updateTournament(t.id, { status: 'round1' });
    }, 'r1');

  const makeKnockout = () =>
    run(async () => {
      await repo.insertStage([], generateKnockout(data));
      await repo.updateTournament(t.id, { status: 'knockout' });
    }, 'ko');

  const undoKnockout = () =>
    confirmLoss('ko', 'Deshacer las llaves') &&
    run(async () => {
      await repo.deleteStage(t.id, 'ko');
      await repo.updateTournament(t.id, { status: 'round2' });
    }, 'ranking');

  // ---------------- Resultados ----------------

  const applyResult = async (m: Match, result: MatchResult) => {
    setBusy(true);
    setModalError(null);
    try {
      const updates: (Partial<Match> & { id: string })[] = [{ id: m.id, ...result }];
      let statusAfter: Status | null = null;
      if (m.stage === 'ko') {
        const n = nextSlot(m);
        const next = data.matches.find((x) => x.stage === 'ko' && x.ko_round === n.ko_round && x.slot === n.slot);
        if (next) {
          if (next[n.side] !== result.winner_id) {
            if (next.winner_id) {
              throw new Error('El partido siguiente ya tiene resultado. Bórralo primero para cambiar este ganador.');
            }
            updates.push({ id: next.id, [n.side]: result.winner_id });
          }
        } else {
          statusAfter = result.winner_id ? 'finished' : 'knockout';
        }
      }
      await repo.updateMatches(updates);
      if (statusAfter && statusAfter !== t.status) await repo.updateTournament(t.id, { status: statusAfter });
      await reload();
      setEditing(null);
    } catch (e) {
      setModalError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const openMatch = (m: Match) => {
    setModalError(null);
    setEditing(m);
  };

  const matchTitle = (m: Match) => {
    if (m.stage === 'ko') return roundName(m.ko_round!, koRounds(data.matches));
    const g = data.groups.find((x) => x.id === m.group_id);
    return `${m.stage === 'r1' ? 'Ronda 1' : 'Ronda 2'} · Grupo ${g?.label ?? ''}`;
  };

  // ---------------- Barra de acciones ----------------

  const renderActionBar = () => {
    const stage: Stage | null =
      t.status === 'round1' ? 'r1' : t.status === 'round2' ? 'r2' : t.status === 'knockout' ? 'ko' : null;
    const p = stage ? progress(stage) : null;
    return (
      <div className="action-bar">
        <div className="progress">
          {t.status === 'setup' && (
            <span>
              <b>{data.players.length}</b> jugadores inscritos
              {data.players.length < MIN_PLAYERS && <span className="muted"> · mínimo {MIN_PLAYERS}</span>}
            </span>
          )}
          {p && (
            <>
              <span>
                <b>{STATUS_LABEL[t.status]}</b> · {p.done}/{p.total} partidos jugados
              </span>
              <div className="bar">
                <i style={{ width: `${p.total ? (100 * p.done) / p.total : 0}%` }} />
              </div>
            </>
          )}
          {t.status === 'finished' && <span><b>Torneo finalizado</b></span>}
        </div>
        {canEdit && (
          <div className="buttons">
            {t.status === 'setup' && (
              <button className="btn btn-primary" disabled={busy || data.players.length < MIN_PLAYERS} onClick={drawRound1}>
                🎲 Sortear grupos Ronda 1
              </button>
            )}
            {t.status === 'round1' && (
              <>
                <button className="btn btn-ghost" disabled={busy} onClick={undoRound1}>
                  Volver a inscripción
                </button>
                <button
                  className="btn"
                  disabled={busy}
                  onClick={() => confirmLoss('r1', 'Re-sortear') && drawRound1()}
                >
                  Re-sortear
                </button>
                <button className="btn btn-primary" disabled={busy || !stageComplete(data, 'r1')} onClick={makeRound2}>
                  Generar Ronda 2 →
                </button>
              </>
            )}
            {t.status === 'round2' && (
              <>
                <button className="btn btn-ghost" disabled={busy} onClick={undoRound2}>
                  Deshacer Ronda 2
                </button>
                <button className="btn btn-primary" disabled={busy || !stageComplete(data, 'r2')} onClick={makeKnockout}>
                  Generar llaves (Top {Math.min(t.qualifiers, data.players.length)}) →
                </button>
              </>
            )}
            {(t.status === 'knockout' || t.status === 'finished') && (
              <button className="btn btn-ghost" disabled={busy} onClick={undoKnockout}>
                Deshacer llaves
              </button>
            )}
          </div>
        )}
      </div>
    );
  }

  const tabs: { key: Tab; label: string; count?: number }[] = [
    { key: 'players', label: 'Jugadores', count: data.players.length },
    { key: 'r1', label: 'Ronda 1', count: r1Groups.length || undefined },
    { key: 'r2', label: 'Ronda 2', count: r2Groups.length || undefined },
    { key: 'ranking', label: 'Ranking' },
    { key: 'ko', label: 'Llaves' },
  ];

  return (
    <>
      <div className="t-head">
        <div>
          <h1>{t.name}</h1>
          <div className="meta">
            <StatusPill status={t.status} />
            {t.event_date && <span>{formatDate(t.event_date)}</span>}
            <span>· Grupos de {t.group_size}</span>
            <span>· Top {t.qualifiers} a llaves</span>
            <span>
              · Bo{bestOf(t.sets_to_win_group)} grupos / Bo{bestOf(t.sets_to_win_ko)} llaves
            </span>
          </div>
        </div>
        <div className="actions">
          {repo.mode === 'supabase' && (
            <button
              className="btn btn-sm"
              onClick={async () => {
                await navigator.clipboard?.writeText(window.location.href);
                setCopied(true);
                setTimeout(() => setCopied(false), 1800);
              }}
            >
              {copied ? '✓ Link copiado' : '🔗 Compartir'}
            </button>
          )}
          {canEdit && (
            <button
              className="btn btn-danger btn-sm"
              disabled={busy}
              onClick={() =>
                window.confirm(`¿Eliminar el torneo "${t.name}"? No se puede deshacer.`) &&
                run(async () => {
                  await repo.deleteTournament(t.id);
                  navigate('/');
                })
              }
            >
              Eliminar
            </button>
          )}
        </div>
      </div>

      <div className="stepper">
        {STEPS.map((s, i) => (
          <div key={s} className={`s${i < stepIdx ? ' done' : ''}${i === stepIdx ? ' current' : ''}`}>
            {i + 1}. {STATUS_LABEL[s]}
          </div>
        ))}
      </div>

      {champ && (
        <div className="champion">
          <span className="trophy">🏆</span>
          <div>
            <small>Campeón</small>
            <h2>{names.get(champ)}</h2>
          </div>
        </div>
      )}

      {renderActionBar()}
      {error && <div className="banner warn" style={{ marginBottom: 16 }}>{error}</div>}

      <nav className="tabs">
        {tabs.map((x) => (
          <button key={x.key} className={tab === x.key ? 'tab active' : 'tab'} onClick={() => setTab(x.key)}>
            {x.label}
            {x.count !== undefined && <span className="count">{x.count}</span>}
          </button>
        ))}
      </nav>

      {tab === 'players' && <PlayersPanel data={data} canEdit={canEdit} onChanged={reload} />}

      {tab === 'r1' &&
        (r1Groups.length ? (
          <div className="groups-grid">
            {r1Groups.map((g) => (
              <GroupCard
                key={g.id}
                group={g}
                matches={data.matches.filter((m) => m.group_id === g.id).sort((a, b) => a.order_no - b.order_no)}
                names={names}
                editable={editableStage('r1')}
                onMatch={openMatch}
              />
            ))}
          </div>
        ) : (
          <Empty text="Los grupos de la Ronda 1 se generan por sorteo al cerrar la inscripción." />
        ))}

      {tab === 'r2' &&
        (r2Groups.length ? (
          <>
            <div className="banner" style={{ marginBottom: 16 }}>
              <span>
                Grupos cruzados según la posición en Ronda 1:{' '}
                {r2Groups.map((g) => (
                  <span key={g.id} style={{ display: 'inline-block', marginRight: 12 }}>
                    <b>{g.label}</b>: {g.player_ids.map((p) => tags.get(p)).join(' · ')}
                  </span>
                ))}
              </span>
            </div>
            <div className="groups-grid">
              {r2Groups.map((g) => (
                <GroupCard
                  key={g.id}
                  group={g}
                  matches={data.matches.filter((m) => m.group_id === g.id).sort((a, b) => a.order_no - b.order_no)}
                  names={names}
                  tags={tags}
                  editable={editableStage('r2')}
                  onMatch={openMatch}
                />
              ))}
            </div>
          </>
        ) : (
          <Empty
            text={
              t.status === 'round1' && stageComplete(data, 'r1')
                ? 'La Ronda 1 terminó. Genera la Ronda 2 desde la barra de arriba.'
                : 'La Ronda 2 se arma al terminar la Ronda 1: A+ = 1A · 2B · 3C, B+ = 1B · 2C · 3A, C+ = 1C · 2A · 3B…'
            }
          />
        ))}

      {tab === 'ranking' &&
        (r1Groups.length ? (
          <>
            <p className="muted small" style={{ marginTop: 0 }}>
              Suma de Ronda 1 + Ronda 2{!stageComplete(data, 'r2') && ' (parcial)'}. Victoria 2 pts, derrota 1, W.O. 0.
              Desempate: victorias, diferencia de sets, diferencia de tantos. Clasifican los {t.qualifiers} mejores.
            </p>
            <RankingTable rows={ranking} names={names} qualifiers={t.qualifiers} />
          </>
        ) : (
          <Empty text="El ranking aparece cuando comienza la Ronda 1." />
        ))}

      {tab === 'ko' &&
        (ko.length ? (
          <Bracket matches={ko} names={names} seeds={seeds} editable={editableStage('ko')} onMatch={openMatch} />
        ) : (
          <Empty text={`Las llaves se generan con los ${t.qualifiers} mejores del ranking al terminar la Ronda 2.`} />
        ))}

      {editing && (
        <MatchModal
          match={editing}
          names={names}
          title={matchTitle(editing)}
          setsToWin={editing.stage === 'ko' ? t.sets_to_win_ko : t.sets_to_win_group}
          busy={busy}
          error={modalError}
          onSave={(r) => applyResult(editing, r)}
          onClear={() => applyResult(editing, CLEARED)}
          onClose={() => setEditing(null)}
        />
      )}
    </>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <div className="card empty">
      <p style={{ margin: 0 }}>{text}</p>
    </div>
  );
}
