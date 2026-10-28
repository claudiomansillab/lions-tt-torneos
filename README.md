# Lions TT · Torneos de tenis de mesa

App web para organizar torneos de tenis de mesa con este formato:

1. **Ronda 1**: grupos por sorteo, todos contra todos.
2. **Ronda 2**: grupos cruzados según la posición en Ronda 1:
   ```
   A+ : 1A, 2B, 3C
   B+ : 1B, 2C, 3A
   C+ : 1C, 2A, 3B
   ```
   Generalizado a **N jugadores / G grupos**: el grupo *i+* recibe al (p+1)° del grupo *(i+p) mod G*.
   Con 4 grupos queda `A+: 1A 2B 3C`, `B+: 1B 2C 3D`, `C+: 1C 2D 3A`, `D+: 1D 2A 3B`.
   Nadie repite rival mientras haya al menos tantos grupos como jugadores por grupo (la app avisa si no).
3. **Ranking general** (Ronda 1 + Ronda 2): victoria 2 pts, derrota 1, W.O. 0. Desempate: victorias,
   diferencia de sets, diferencia de tantos.
4. **Llaves**: los mejores *K* (6 por defecto, configurable) pasan a eliminación directa sembrada
   (1 vs 8, 4 vs 5, 2 vs 7, 3 vs 6). Si *K* no es potencia de 2, los mejores sembrados reciben BYE.

Además: resultados por sets (validando 11 puntos y diferencia de 2) o sólo resultado, W.O., tablas por grupo
con desempate entre empatados, resultados en vivo (Supabase Realtime) y link público para los jugadores.

## Stack

- React + TypeScript + Vite (sitio estático, gratis en GitHub Pages)
- Supabase (Postgres + Auth + Realtime) para los datos
- Sin Supabase configurado funciona en **modo local** (guarda en el navegador), ideal para probar

## Correr localmente

```bash
npm install
cp .env.example .env   # opcional: completa con tu proyecto Supabase
npm run dev
npm test               # tests de la lógica del torneo
```

## Configurar Supabase (gratis)

1. Crea un proyecto en [supabase.com](https://supabase.com).
2. **SQL Editor → New query**: pega y ejecuta [`supabase/schema.sql`](supabase/schema.sql).
   Crea las tablas, índices, políticas RLS (lectura pública, escritura sólo del organizador dueño) y Realtime.
3. **Project Settings → API**: copia la *Project URL* y la *anon / publishable key* en `.env`:
   ```
   VITE_SUPABASE_URL=https://xxxx.supabase.co
   VITE_SUPABASE_ANON_KEY=...
   ```
   La anon key es pública por diseño; la seguridad la dan las políticas RLS.
4. **Authentication → URL Configuration**: agrega la URL donde publiques la app
   (ej. `https://TU-USUARIO.github.io/TU-REPO/`) en *Site URL* y *Redirect URLs*, para que funcione
   el correo de confirmación de cuenta. Si no quieres confirmación por correo, desactívala en
   *Authentication → Providers → Email*.

## Publicar en GitHub Pages

1. Sube el proyecto a un repositorio de GitHub (rama `main`).
2. **Settings → Secrets and variables → Actions → New repository secret**:
   `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY`.
3. **Settings → Pages → Source: GitHub Actions**.
4. Cada push a `main` corre los tests, compila y publica (`.github/workflows/deploy.yml`).

También sirve en Netlify, Vercel o Cloudflare Pages: comando `npm run build`, carpeta `dist`,
con las mismas dos variables de entorno.

## Uso

1. Ingresa (organizador) → **Nuevo torneo**: nombre, jugadores (uno por línea), tamaño de grupo,
   clasificados y formato de sets.
2. **Sortear grupos Ronda 1** → carga resultados tocando cada partido.
3. Al completar la Ronda 1 → **Generar Ronda 2** (grupos cruzados automáticamente).
4. Al completar la Ronda 2 → **Generar llaves** con el Top K del ranking.
5. Comparte el link (**🔗 Compartir**): cualquiera puede ver el torneo en vivo sin cuenta.

Cada fase se puede deshacer (avisa si hay resultados que se perderían).

## Estructura

```
src/lib/tournament.ts   lógica pura: sorteo, fixture, tablas, rotación Ronda 2, ranking, llaves
src/lib/api.ts          capa de datos (Supabase o localStorage)
src/lib/auth.tsx        sesión del organizador
src/pages/              Inicio, Login, Nuevo torneo, Torneo
src/components/         Grupos, Llaves, Ranking, Jugadores, modal de resultado
supabase/schema.sql     esquema + RLS + realtime
```
