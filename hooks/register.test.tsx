import { expect, mock, test } from 'claude-code/testing'

const NOW = new Date(2026, 9, 30, 11, 30).getTime()
const zeros = () => Array.from({ length: 24 }, () => 0)
const at = (hour: number, n: number) => zeros().map((_, h) => (h === hour ? n : 0))

const DAYS = {
  '2026-10-30': { desktop: at(9, 200_000), code: at(10, 50_000) },
  '2026-10-29': { desktop: at(8, 100_000), code: zeros() },
  '2026-10-23': { desktop: at(20, 1_000_000), code: zeros() },
}

const PANE = {
  plugin: 'usage-graphique',
  component: 'Pane',
  requestId: 'usage-graphique',
  props: {
    title: 'Utilisation quotidienne',
    isFocused: false,
    bodyColumns: 80,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 30 },
    view: {},
  },
} as const

test('le panneau compare aujourd’hui à hier et à il y a 7 jours', async ($, on) => {
  mock.clock(on, { now: NOW })
  on('command.register', () => ({ value: { command: 'usage-graphique' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('process.run', () => ({
    value: {
      exitCode: 0,
      stdout: JSON.stringify({ days: DAYS }),
      stderr: '',
      isStdoutTruncated: false,
      isStderrTruncated: false,
    },
  }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))

  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })

  for (const surface of ['desktop', 'terminal'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface })
    const summary = await ui.find({ type: 'Text', text: /Aujourd'hui à 11 h/ })
    expect(summary?.text).toBe(
      "Aujourd'hui à 11 h : 250 k tokens · hier à la même heure : 100 k (+150 %) · il y a 7 jours : 0",
    )
    if (surface === 'desktop') {
      expect(await ui.find({ type: 'Svg' })).toBeTruthy()
    }

    await ui.press({ key: 'code' })
    expect((await ui.find({ type: 'Text', text: /Aujourd'hui à 11 h/ }))?.text).toBe(
      "Aujourd'hui à 11 h : 50 k tokens · hier à la même heure : 0 · il y a 7 jours : 0",
    )
    await ui.press({ key: 'all' })
    await ui.unmount()
  }
})
