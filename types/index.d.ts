export type Source = 'desktop' | 'code'

// Tokens par heure locale (24 cases) pour chaque source, par jour "AAAA-MM-JJ".
export type Days = Record<string, Record<Source, number[]>>

export type Usage = { days: Days; updatedAt: number }

export type View = 'all' | Source

declare module 'claude-code' {
  interface PluginState {
    'usage-graphique': {
      usage: Shaped<Usage | null>
      error: string | null
      view: View
    }
  }
}
