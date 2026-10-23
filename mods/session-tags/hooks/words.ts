import type { Shape } from '../types'

// One emoji: a pictograph or flag letter, its modifiers, and any joined parts.
const UNIT =
  '[\\p{Extended_Pictographic}\\u{1F1E6}-\\u{1F1FF}][\\uFE0F\\u{1F3FB}-\\u{1F3FF}]*(?:\\u200D\\p{Extended_Pictographic}\\uFE0F?)*'

// The run of emoji a title starts with, and the space after it: its tag.
export const LEADING_TAG = new RegExp(`^(?:${UNIT})+\\s*`, 'u')
export const EMOJI = new RegExp(UNIT, 'gu')

export const untagged = (title: string): string => title.replace(LEADING_TAG, '')
export const tagOf = (title: string): string => title.slice(0, title.length - untagged(title).length).trim()
export const isAllEmoji = (text: string): boolean => text !== '' && untagged(text) === ''

export type Choice = { name: string; emoji: string }

// Each color in each shape emoji draws it in. Emoji has no outlined colors,
// and its diamonds and triangles come in only one or two colors.
const PALETTE: Record<string, Record<Shape, string>> = {
  Red: { square: '🟥', circle: '🔴', heart: '❤️' },
  Orange: { square: '🟧', circle: '🟠', heart: '🧡' },
  Yellow: { square: '🟨', circle: '🟡', heart: '💛' },
  Green: { square: '🟩', circle: '🟢', heart: '💚' },
  Blue: { square: '🟦', circle: '🔵', heart: '💙' },
  Purple: { square: '🟪', circle: '🟣', heart: '💜' },
  Brown: { square: '🟫', circle: '🟤', heart: '🤎' },
  Black: { square: '⬛', circle: '⚫', heart: '🖤' },
  White: { square: '⬜', circle: '⚪', heart: '🤍' },
}

export const SHAPES: { shape: Shape; name: string }[] = [
  { shape: 'square', name: 'Squares' },
  { shape: 'circle', name: 'Circles' },
  { shape: 'heart', name: 'Hearts' },
]

const SHAPE_WORDS: Record<string, Shape> = {
  square: 'square', squares: 'square', box: 'square', boxes: 'square',
  circle: 'circle', circles: 'circle', dot: 'circle', dots: 'circle', ball: 'circle',
  heart: 'heart', hearts: 'heart',
}

export const shapeNamed = (word: string): Shape | undefined => SHAPE_WORDS[word.trim().toLowerCase()]

// The picker's color row, and the colors /tag knows by name, in one shape.
export const colorChoices = (shape: Shape): Choice[] =>
  Object.entries(PALETTE).map(([name, shapes]) => ({ name, emoji: shapes[shape] }))

// The same color in another shape; an emoji that is no palette color is kept.
export function inShape(emoji: string, shape: Shape): string {
  const shapes = Object.values(PALETTE).find(one => Object.values(one).includes(emoji))

  return shapes === undefined ? emoji : shapes[shape]
}

const isColor = (emoji: string): boolean => Object.values(PALETTE).some(one => Object.values(one).includes(emoji))

export const WORK_CHOICES: Choice[] = [
  { name: 'Video', emoji: '🎬' },
  { name: 'Design', emoji: '🎨' },
  { name: 'Music', emoji: '🎵' },
  { name: 'Plugin', emoji: '🔌' },
  { name: 'Code', emoji: '💻' },
  { name: 'Writing', emoji: '📝' },
  { name: 'Research', emoji: '📚' },
  { name: 'Data', emoji: '📊' },
  { name: 'Setup', emoji: '⚙️' },
  { name: 'Experiment', emoji: '🧪' },
]

export const FUN_CHOICES: Choice[] = [
  { name: 'Fire', emoji: '🔥' },
  { name: 'Star', emoji: '⭐' },
  { name: 'Rocket', emoji: '🚀' },
  { name: 'Space', emoji: '🪐' },
  { name: 'Idea', emoji: '💡' },
  { name: 'Done', emoji: '✅' },
  { name: 'In progress', emoji: '🚧' },
  { name: 'Urgent', emoji: '🚨' },
  { name: 'Party', emoji: '🎉' },
  { name: 'Heart', emoji: '❤️' },
  { name: 'Rainbow', emoji: '🌈' },
  { name: 'Pizza', emoji: '🍕' },
]

// Color words name a palette color, drawn in whichever shape is in use.
const COLOR_WORDS: Record<string, string> = {
  ...Object.fromEntries(Object.keys(PALETTE).map(name => [name.toLowerCase(), name])),
  violet: 'Purple',
  gray: 'Black',
  grey: 'Black',
}

// Words people are likely to type; anything else is asked of a small model.
const WORDS: Record<string, string> = {
  ...Object.fromEntries(
    [...WORK_CHOICES, ...FUN_CHOICES].map(choice => [choice.name.toLowerCase(), choice.emoji]),
  ),
  film: '🎬', movie: '🎬', clip: '🎬', edit: '🎬', animation: '🎬', motion: '🎬',
  art: '🎨', image: '🎨', images: '🎨', graphic: '🎨', graphics: '🎨', photo: '📷', camera: '📷',
  song: '🎵', audio: '🎵', sound: '🎵', guitar: '🎸', rock: '🎸', metal: '🎸', podcast: '🎙️', voice: '🎙️',
  plugins: '🔌', mod: '🔌', mods: '🔌', integration: '🔌',
  coding: '💻', app: '📱', phone: '📱', build: '🛠️', tool: '🛠️', tools: '🛠️', fix: '🔧',
  write: '📝', doc: '📝', docs: '📝', notes: '📝', book: '📖',
  learn: '📚', learning: '📚', study: '📚', course: '📚',
  chart: '📊', analysis: '📊', numbers: '📊',
  install: '⚙️', config: '⚙️', settings: '⚙️',
  test: '🧪', lab: '🧪',
  hot: '🔥', favorite: '⭐', launch: '🚀', ship: '🚀', planet: '🪐',
  finished: '✅', complete: '✅', wip: '🚧', progress: '🚧', important: '❗', waiting: '⏳', later: '⏳',
  blocked: '⛔', bug: '🐛', review: '👀', goal: '🎯', target: '🎯', todo: '📌', pin: '📌',
  love: '❤️', sun: '☀️', moon: '🌙', money: '💰', cash: '💰', gift: '🎁', game: '🎮', games: '🎮',
  travel: '✈️', trip: '✈️', home: '🏠', work: '💼', office: '💼', client: '🤝', ai: '🤖', robot: '🤖',
  magic: '✨', sparkle: '✨', brain: '🧠', fast: '⚡', lightning: '⚡', ghost: '👻', crown: '👑',
  gem: '💎', diamond: '💎', plant: '🌱', tree: '🌳', flower: '🌸', ocean: '🌊', wave: '🌊',
  mountain: '⛰️', mail: '📧', email: '📧', calendar: '📅', lock: '🔒', secret: '🔒', key: '🔑',
  trophy: '🏆', win: '🏆', medicine: '💊', pill: '💊', health: '💊', casino: '🎰', vegas: '🎰',
  coffee: '☕', cat: '🐱', dog: '🐶', pink: '🩷',
}

// A word or emoji the person typed, already an emoji, or a phrase to look up.
export type Piece = { emoji: string; word?: string } | { phrase: string }

const wordOf = (token: string): string => token.toLowerCase().replace(/[^\p{L}\p{N}-]/gu, '')

// Splits typed words into emoji in order; neighboring unknown words stay one
// phrase ("outer space"), so the lookup sees what the person meant. A color
// takes `shape`, or the shape word after it ("red circle", "blue heart").
export function readWords(text: string, shape: Shape): Piece[] {
  const pieces: Piece[] = []
  const tokens = text.split(/\s+/).filter(Boolean)
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i] ?? ''
    const word = wordOf(token)
    const color = COLOR_WORDS[word]
    const last = pieces.at(-1)
    if (isAllEmoji(token)) pieces.push({ emoji: token })
    else if (color !== undefined) {
      const named = shapeNamed(wordOf(tokens[i + 1] ?? ''))
      if (named !== undefined) i++
      pieces.push({ emoji: PALETTE[color]?.[named ?? shape] ?? '', word: named === undefined ? word : `${word} ${named}` })
    } else if (WORDS[word] !== undefined) pieces.push({ emoji: WORDS[word] ?? '', word })
    else if (word === '') continue
    else if (last !== undefined && 'phrase' in last) last.phrase = `${last.phrase} ${word}`
    else pieces.push({ phrase: word })
  }

  return pieces
}

// The most ideas a theme fills the picker's row with.
export const MOST_IDEAS = 12

// Reads the model's JSON list of ideas, keeping one emoji per idea and
// dropping repeats and anything in `avoid` (the ideas a refresh replaces).
export function parseIdeas(text: string, avoid: ReadonlySet<string>): Choice[] {
  const start = text.indexOf('[')
  const end = text.lastIndexOf(']')
  if (start < 0 || end <= start) return []
  let raw: unknown
  try {
    raw = JSON.parse(text.slice(start, end + 1))
  } catch {
    return []
  }
  if (!Array.isArray(raw)) return []
  const ideas: Choice[] = []
  const seen = new Set<string>()
  for (const item of raw) {
    if (item === null || typeof item !== 'object') continue
    const { name, emoji } = item as { name?: unknown; emoji?: unknown }
    if (typeof name !== 'string' || typeof emoji !== 'string') continue
    const one = emoji.trim().match(EMOJI)?.[0]
    const label = name.trim().slice(0, 24)
    const id = label.toLowerCase()
    if (one === undefined || label === '' || avoid.has(one) || seen.has(one) || seen.has(id)) continue
    seen.add(one)
    seen.add(id)
    ideas.push({ name: label, emoji: one })
  }

  return ideas.slice(0, MOST_IDEAS)
}

// Splits a tag into its first emoji, when it is a palette color in any shape,
// and the rest, so the picker can show what a session already has.
export function splitTag(tag: string): { color: string; icon: string } {
  const first = tag.match(EMOJI)?.[0] ?? ''

  return isColor(first) ? { color: first, icon: tag.slice(first.length) } : { color: '', icon: tag }
}
