// One button in the picker: a short name and its emoji.
export type Idea = { name: string; emoji: string }

// The shape every color is drawn in, a preference kept across sessions.
export type Shape = 'square' | 'circle' | 'heart'

// What the picker pane shows: the choices so far, the session's bare title,
// and the theme its ideas row was filled for ('' is the built-in fun row).
export type Picker = {
  color: string
  icon: string
  title: string
  note: string
  theme: string
  ideas: Idea[]
  shape: Shape
}

declare module 'claude-code' {
  interface PluginState {
    'session-tags': { picker: Picker }
  }
}
