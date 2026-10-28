import type { Status } from '../lib/types';

export const STATUS_LABEL: Record<Status, string> = {
  setup: 'Inscripción',
  round1: 'Ronda 1',
  round2: 'Ronda 2',
  knockout: 'Llaves',
  finished: 'Finalizado',
};

export function StatusPill({ status }: { status: Status }) {
  const cls = status === 'finished' ? 'pill done' : status === 'setup' ? 'pill' : 'pill live';
  return <span className={cls}>{STATUS_LABEL[status]}</span>;
}

export function formatDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('es', { day: 'numeric', month: 'short', year: 'numeric' });
}

export const bestOf = (setsToWin: number) => setsToWin * 2 - 1;

/** Normaliza la lista de jugadores pegada (una línea por jugador, sin duplicados vacíos). */
export function parseNames(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((s) => s.replace(/^\s*\d+[.)-]\s*/, '').trim())
    .filter(Boolean)
    .map((s) => s.slice(0, 80));
}
