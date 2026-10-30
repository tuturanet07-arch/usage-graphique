import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Days, Usage, View } from '../types'

const PANE = 'usage-graphique'
const TITLE = 'Utilisation quotidienne'
const REFRESH_MS = 5 * 60_000
const MIN_GAP_MS = 60_000

// Changer l'étiquette quand la forme de `Usage` change: l'ancienne valeur est ignorée.
const usage = atom({ plugin: 'usage-graphique', key: 'usage' } as const, null, {
  shape: 'usage-1',
})
const error = atom({ plugin: 'usage-graphique', key: 'error' } as const, null)
const view = atom({ plugin: 'usage-graphique', key: 'view' } as const, 'all')

const VIEWS: { id: View; label: string }[] = [
  { id: 'all', label: 'Tout' },
  { id: 'desktop', label: 'Claude Desktop' },
  { id: 'code', label: 'Claude Code' },
]

type Series = { label: string; values: number[]; light: string; dark: string; dash: string }

const pad = (n: number) => String(n).padStart(2, '0')

const dayKey = (now: number, daysBack: number) => {
  const d = new Date(now)
  d.setDate(d.getDate() - daysBack)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

const formatTokens = (n: number) =>
  n >= 1_000_000
    ? `${(n / 1_000_000).toFixed(1).replace('.', ',')} M`
    : n >= 1_000
      ? `${Math.round(n / 1_000)} k`
      : String(Math.round(n))

const hourly = (days: Days, key: string, which: View) => {
  const day = days[key]
  return Array.from({ length: 24 }, (_, h) =>
    !day ? 0 : which === 'all' ? day.desktop[h] + day.code[h] : day[which][h],
  )
}

// Cumul heure par heure: le point h est le total à la fin de l'heure h.
const cumulative = (values: number[]) => {
  let sum = 0
  return values.map(v => (sum += v))
}

const change = (now: number, then: number) =>
  then === 0 ? '' : ` (${now >= then ? '+' : ''}${Math.round(((now - then) / then) * 100)} %)`

const niceMax = (n: number) => {
  if (n <= 0) return 1000
  const step = 10 ** Math.floor(Math.log10(n))
  return [1, 2, 2.5, 5, 10].map(m => m * step).find(v => v >= n) ?? n
}

function chart(series: Series[], hourNow: number) {
  const W = 640, H = 300, L = 56, R = 16, T = 16, B = 32
  const max = niceMax(Math.max(...series.flatMap(s => s.values)))
  const x = (h: number) => L + ((h + 1) / 24) * (W - L - R)
  const y = (v: number) => T + (1 - v / max) * (H - T - B)

  const grid = [0, 0.25, 0.5, 0.75, 1]
    .map(f => {
      const v = max * f
      return `<line class="grid" x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}"/>` +
        `<text class="axis" x="${L - 8}" y="${y(v) + 4}" text-anchor="end">${formatTokens(v)}</text>`
    })
    .join('')
  const hours = [0, 6, 12, 18, 24]
    .map(h => `<text class="axis" x="${L + (h / 24) * (W - L - R)}" y="${H - 10}" text-anchor="middle">${h} h</text>`)
    .join('')

  const lines = series
    .map((s, i) => {
      // Chaque courbe part de 0 à minuit.
      const points = `${L},${y(0)} ` + s.values.map((v, h) => `${x(h).toFixed(1)},${y(v).toFixed(1)}`).join(' ')
      const hits = s.values
        .map((v, h) =>
          `<circle class="hit" cx="${x(h)}" cy="${y(v)}" r="7"><title>${s.label}, fin de ${h} h : ${formatTokens(v)} tokens</title></circle>`,
        )
        .join('')
      const last = s.values.length - 1
      return `<polyline class="s${i}" points="${points}" stroke-dasharray="${s.dash}"/>` +
        `<circle class="d${i}" cx="${x(last)}" cy="${y(s.values[last])}" r="4"/>` + hits
    })
    .join('')

  const style = series
    .map((s, i) => `.s${i}{stroke:${s.light}}.d${i}{fill:${s.light}}`)
    .join('')
  const darkStyle = series
    .map((s, i) => `.s${i}{stroke:${s.dark}}.d${i}{fill:${s.dark}}`)
    .join('')

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">` +
    `<style>polyline{fill:none;stroke-width:2;stroke-linejoin:round;stroke-linecap:round}` +
    `.grid{stroke:#e4e3df;stroke-width:1}.axis{fill:#52514e;font:11px system-ui,sans-serif}` +
    `.now{stroke:#8a8984;stroke-width:1;stroke-dasharray:2 3}.hit{fill:transparent}${style}` +
    `@media (prefers-color-scheme: dark){.grid{stroke:#33332f}.axis{fill:#c3c2b7}${darkStyle}}</style>` +
    grid + hours +
    `<line class="now" x1="${x(hourNow)}" x2="${x(hourNow)}" y1="${T}" y2="${H - B}"/>` +
    lines + `</svg>`
}

const sparkline = (values: number[], max: number) =>
  values.map(v => '▁▂▃▄▅▆▇█'[Math.min(7, Math.floor((v / (max || 1)) * 7.999))]).join('')

let isRefreshing = false
let lastRefresh = 0

async function refresh($: EngineInterface) {
  if (isRefreshing) return
  isRefreshing = true
  lastRefresh = await $.clock.now()
  try {
    const ran = await $.process.run(
      ['python3', '-I', `${$.plugin.root}/hooks/aggregate.py`, '8'],
      { timeoutMs: 120_000 },
    )
    if (ran.exitCode !== 0) {
      await update($, error, () => `Le script d'agrégation a échoué : ${ran.stderr.slice(-300)}`)
      return
    }
    const parsed = JSON.parse(ran.stdout) as { days: Days }
    const result: Usage = { days: parsed.days, updatedAt: await $.clock.now() }
    await update($, usage, () => result)
    await update($, error, () => null)
  } catch (err) {
    await update($, error, () => `Lecture impossible : ${String(err).slice(0, 300)}`)
  } finally {
    isRefreshing = false
  }
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const started = await next(e)
    await $.command.register({
      name: 'usage-graphique',
      description: "Ouvre le graphique de l'utilisation quotidienne",
    })
    void $.ui.open({ id: PANE, title: TITLE })
    void refresh($)
    $.clock.every(REFRESH_MS, () => refresh($))
    return started
  })

  on('command.run', { command: 'usage-graphique' }, async $ => {
    await $.ui.open({ id: PANE, title: TITLE })
    void refresh($)
    return { text: 'Graphique ouvert.' }
  })

  // Après un tour, les nouveaux tokens sont dans le transcript: on relit, au plus une fois par minute.
  on('turn.complete', async ($, e, next) => {
    const done = await next(e)
    if ((await $.clock.now()) - lastRefresh > MIN_GAP_MS) void refresh($)
    return done
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Button } = $.ui.resolve(e)
    const data = await read($, usage)
    const failed = await read($, error)
    const which = await read($, view)

    if (!data) {
      return (
        <Box flexDirection="column">
          <Text dimColor>{failed ?? 'Lecture des transcripts…'}</Text>
        </Box>
      )
    }

    const now = data.updatedAt
    const hourNow = new Date(now).getHours()
    const today = cumulative(hourly(data.days, dayKey(now, 0), which)).slice(0, hourNow + 1)
    const yesterday = cumulative(hourly(data.days, dayKey(now, 1), which))
    const lastWeek = cumulative(hourly(data.days, dayKey(now, 7), which))
    const series: Series[] = [
      { label: "Aujourd'hui", values: today, light: '#2a78d6', dark: '#3987e5', dash: 'none' },
      { label: 'Hier', values: yesterday, light: '#eb6834', dark: '#d95926', dash: '6 4' },
      { label: 'Il y a 7 jours', values: lastWeek, light: '#1baf7a', dark: '#199e70', dash: '2 4' },
    ]
    const nowTotal = today[hourNow]
    const summary =
      `Aujourd'hui à ${hourNow} h : ${formatTokens(nowTotal)} tokens · ` +
      `hier à la même heure : ${formatTokens(yesterday[hourNow])}${change(nowTotal, yesterday[hourNow])} · ` +
      `il y a 7 jours : ${formatTokens(lastWeek[hourNow])}${change(nowTotal, lastWeek[hourNow])}`
    const legend = `── Aujourd'hui   ╌╌ Hier   ┈┈ Il y a 7 jours (cumul des tokens, heure par heure)`
    const updated = new Date(now)
    const footer = `Mis à jour à ${pad(updated.getHours())}:${pad(updated.getMinutes())} · tokens = entrée + écriture de cache + sortie`

    const buttons = (
      <Box flexDirection="row" gap={1}>
        {VIEWS.map(v => (
          <Button
            key={v.id}
            label={v.label}
            variant={v.id === which ? 'primary' : 'secondary'}
            onPress={() => update($, view, () => v.id)}
          />
        ))}
        <Button key="refresh" label="Actualiser" dimColor onPress={() => refresh($)} />
      </Box>
    )

    if (e.surface === 'terminal') {
      const max = Math.max(...series.flatMap(s => s.values), 1)
      return (
        <Box flexDirection="column">
          {buttons}
          <Text>{summary}</Text>
          {series.map(s => (
            <Text>
              {s.label.padEnd(15)} {sparkline(s.values, max)} {formatTokens(s.values[s.values.length - 1])}
            </Text>
          ))}
          <Text dimColor>{footer}</Text>
        </Box>
      )
    }

    const { Svg } = $.ui.resolve(e)
    return (
      <Box flexDirection="column" gap={1}>
        {buttons}
        <Text>{summary}</Text>
        <Text dimColor>{legend}</Text>
        <Svg
          source={chart(series, hourNow)}
          alt={summary}
          isInteractive
        />
        {failed && <Text color="red">{failed}</Text>}
        <Text dimColor>{footer}</Text>
      </Box>
    )
  })
}
