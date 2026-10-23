import { atom, read, update } from 'claude-code'
import type { EngineInterface, McpToolResult, Register } from 'claude-code'

import type { Idea, Picker, Shape } from '../types'
import {
  EMOJI,
  FUN_CHOICES,
  MOST_IDEAS,
  SHAPES,
  WORK_CHOICES,
  colorChoices,
  inShape,
  shapeNamed,
  parseIdeas,
  readWords,
  splitTag,
  tagOf,
  untagged,
} from './words'

// The desktop app's own session tools: renaming through them changes the
// title its sidebar and header draw.
const APP = 'ccd_session_mgmt'

const PICKER = 'tag-picker'
const EMPTY_PICKER: Picker = {
  color: '',
  icon: '',
  title: '',
  note: '',
  theme: '',
  ideas: FUN_CHOICES,
  shape: 'square',
}
const picker = atom({ plugin: 'session-tags', key: 'picker' } as const, EMPTY_PICKER)

// The picker's state survives a reload, so one written by an older version
// may lack fields this one draws; the defaults fill them in.
const readPicker = async ($: EngineInterface): Promise<Picker> => ({ ...EMPTY_PICKER, ...(await read($, picker)) })

// Project colors, handed out in this order the first time a folder is seen.
const COLORS = ['🟦', '🟪', '🟩', '🟧', '🟥', '🟨', '🟫']

// The kinds of work the classifier picks from, and the emoji each one gets.
const WORK: Record<string, string> = {
  'video or motion graphics': '🎬',
  'design or images': '🎨',
  'music or audio': '🎵',
  'plugins, mods or integrations': '🔌',
  'coding or app building': '💻',
  'writing or documents': '📝',
  'research or learning': '📚',
  'data or analysis': '📊',
  'setup or installation': '⚙️',
  'experiment or something else': '🧪',
}
const OTHER_WORK = '🧪'

// The most emoji a tag holds, so a long sentence can't crowd out the title.
const MOST_EMOJI = 4

const HELP = [
  'Tags are small pictures (emoji) at the start of a session\'s name in the sidebar, like 🟦🎬. They help you spot sessions at a glance.',
  '',
  'Type words, and they turn into emoji:',
  '  /tag red fire → 🟥🔥',
  '  /tag yellow space → 🟨🪐',
  '  /tag blue video → 🟦🎬',
  '  /tag green done → 🟩✅',
  '',
  'Or press buttons instead of typing:',
  '  /tag pick → opens a picker beside the chat',
  '  /tag pick ocean → opens it with ocean ideas',
  'In the picker, type any theme (like 80s arcade or Halloween) and press Return for a row of matching emoji. Press "More ideas like these" for different ones.',
  '',
  'Choose the shape of your colors:',
  '  /tag shape circles → 🔴🟠🟡🟢🔵🟣',
  '  /tag shape hearts → ❤️🧡💛💚💙💜',
  '  /tag shape squares → 🟥🟧🟨🟩🟦🟪 (the default)',
  '  /tag red circle → 🔴, for just this once',
  '',
  'Give a whole project one color:',
  '  /tag project red → every session in this folder gets 🟥 from now on',
  '',
  'Let Claude choose:',
  '  /tag → suggests a tag for this session',
  '  /tag reset → removes the tag, and Claude picks again after the next reply',
  '  /tag clear → removes the tag and stops tagging this session',
  '',
  'Turn automatic tags off or on:',
  '  /tag auto off → sessions are no longer tagged on their own (/tag still works)',
  '  /tag auto on → turns automatic tags back on',
  '',
  'Remove every tag at once:',
  '  /tag remove all → shows what will change and asks you to confirm',
  '',
  'Colors you can type: red, orange, yellow, green, blue, purple, brown, black, white.',
  'Other words work too, like pizza, rocket, music or cat. If a word isn\'t on the built-in list, Claude finds a matching emoji.',
  '',
  'Already know emoji? Type them directly: /tag 🟪🎨',
  'To type one on a Mac, press Control + Command + Space, search for a name like "purple square", and press Return.',
].join('\n')
const HINT = 'Type /tag help for more ways to tag.'
const NO_APP = 'Session tags need the Claude desktop app, and this session is not running in it.'

// 'tagged' and 'kept' (it already had emoji) end auto-tagging, as does 'off'.
type Status = 'tagged' | 'kept' | 'off'

type Rename = { isRenamed: boolean; message: string }

// Typed words read as emoji: the tag, what each word became, what found none.
type Reading = { tag: string; said: string[]; missed: string[] }

const basename = (path: string): string => path.split('/').filter(Boolean).at(-1) ?? path
const textOf = (result: McpToolResult): string =>
  result.content.map(block => block.text ?? '').join('\n')
const failed = (renamed: Rename): string =>
  `The app didn't rename the session. ${renamed.message}`.trim()

async function readRecord($: EngineInterface, key: string): Promise<Record<string, string>> {
  const value = await $.store.get(key)

  return value !== null && typeof value === 'object' ? (value as Record<string, string>) : {}
}

async function setStatus($: EngineInterface, status: Status): Promise<void> {
  const id = await $.session.id()
  await $.store.set('sessions', { ...(await readRecord($, 'sessions')), [id]: status })
}

// Rejects where the app's tools are not connected (a terminal session).
async function appTitle($: EngineInterface): Promise<string | undefined> {
  const result = await $.mcp.call(APP, 'get_session', { session_id: 'self' })
  if (result.isError) return undefined
  try {
    const { title } = JSON.parse(textOf(result)) as { title?: unknown }

    return typeof title === 'string' ? title : undefined
  } catch {
    return undefined
  }
}

async function rename($: EngineInterface, title: string): Promise<Rename> {
  const result = await $.mcp.call(APP, 'set_session_title', { session_id: 'self', title })

  return { isRenamed: !result.isError, message: textOf(result) }
}

async function projectColor($: EngineInterface, root: string): Promise<string> {
  const colors = await readRecord($, 'colors')
  const known = colors[root]
  if (known !== undefined) return known
  const used = new Set(Object.values(colors))
  const color =
    COLORS.find(one => !used.has(one)) ?? COLORS[Object.keys(colors).length % COLORS.length] ?? '🟦'
  await $.store.set('colors', { ...colors, [root]: color })

  return color
}

async function workEmoji($: EngineInterface, title: string, root: string): Promise<string> {
  const messages = await $.session.messages()
  const first = messages.find(message => message.role === 'user')?.text ?? ''
  const text = [
    `Project folder: ${basename(root)}`,
    `Session title: ${title}`,
    `First request: ${first.slice(0, 1500)}`,
  ].join('\n')
  const label = await $.model.classify(text, Object.keys(WORK)).catch(() => undefined)

  return (label === undefined ? undefined : WORK[label]) ?? OTHER_WORK
}

// Squares unless the person chose circles or hearts, in the picker or /tag shape.
async function readShape($: EngineInterface): Promise<Shape> {
  const shape = await $.store.get('shape')

  return shape === 'circle' || shape === 'heart' ? shape : 'square'
}

// A project's color is kept as first given and drawn in the shape now in use.
async function recommend($: EngineInterface, title: string): Promise<{ color: string; work: string }> {
  const root = await $.session.root()
  const [color, work, shape] = await Promise.all([projectColor($, root), workEmoji($, title, root), readShape($)])

  return { color: inShape(color, shape), work }
}

// A word the built-in list doesn't know, asked of a small model.
async function emojiFor($: EngineInterface, phrase: string): Promise<string | undefined> {
  const reply = await $.model
    .complete({
      model: 'haiku',
      maxTokens: 20,
      system: 'You answer with exactly one emoji and nothing else.',
      prompt: `Which single emoji best stands for "${phrase}"?`,
    })
    .catch(() => undefined)
  if (reply === undefined || !reply.isAnswered) return undefined

  return reply.text.match(EMOJI)?.[0]
}

async function readTyped($: EngineInterface, text: string): Promise<Reading> {
  const reading: Reading = { tag: '', said: [], missed: [] }
  for (const piece of readWords(text, await readShape($))) {
    if ('emoji' in piece) {
      reading.tag += piece.emoji
      if (piece.word !== undefined) reading.said.push(`${piece.word} → ${piece.emoji}`)
      continue
    }
    const found = await emojiFor($, piece.phrase)
    if (found === undefined) reading.missed.push(piece.phrase)
    else {
      reading.tag += found
      reading.said.push(`${piece.phrase} → ${found}`)
    }
  }
  reading.tag = (reading.tag.match(EMOJI) ?? []).slice(0, MOST_EMOJI).join('')

  return reading
}

// On unless the person typed /tag auto off; kept across sessions.
const isAutoOn = async ($: EngineInterface): Promise<boolean> => (await $.store.get('auto')) !== false

// Module variables start over on a reload, which tries the app again.
let isAppMissing = false
let isTagging = false

// Once per session, after a turn: a title with no emoji gets the recommended
// tag; one that already starts with emoji is left as the person made it.
async function autoTag($: EngineInterface): Promise<void> {
  if (isAppMissing || isTagging || !(await isAutoOn($))) return
  const id = await $.session.id()
  if ((await readRecord($, 'sessions'))[id] !== undefined) return
  isTagging = true
  try {
    const title = await appTitle($)
    if (title === undefined || title.trim() === '') return
    if (tagOf(title) !== '') return await setStatus($, 'kept')
    const { color, work } = await recommend($, title)
    // Recorded before renaming, so a rename the person declines is not asked again.
    await setStatus($, 'tagged')
    const { isRenamed } = await rename($, `${color}${work} ${title}`)
    if (isRenamed) $.ui.toast(`Tagged this session ${color}${work}. To stop automatic tags, type /tag auto off`)
  } catch {
    isAppMissing = true
  } finally {
    isTagging = false
  }
}

// A theme's ideas, asked of a small model; a refresh avoids the ones on show.
async function themeIdeas($: EngineInterface, theme: string, avoid: Idea[]): Promise<Idea[]> {
  const topic = theme === '' ? 'fun, playful things' : theme
  const skip = avoid.length > 0 ? ` Don't use any of these: ${avoid.map(idea => idea.emoji).join(' ')}.` : ''
  const reply = await $.model
    .complete({
      model: 'haiku',
      maxTokens: 600,
      system: 'You suggest emoji. You answer with a JSON array and nothing else.',
      prompt:
        `Suggest ${MOST_IDEAS} different emoji for the theme "${topic}", each with a short, fun name of one or two words.${skip}` +
        ' Answer like [{"name":"Big wave","emoji":"🌊"}].',
    })
    .catch(() => undefined)
  if (reply === undefined || !reply.isAnswered) return []

  return parseIdeas(reply.text, new Set(avoid.map(idea => idea.emoji)))
}

// Fills the ideas row for a theme, or puts the built-in fun row back for an
// empty one; the last theme is kept for the next time the picker opens.
async function showIdeas($: EngineInterface, typed: string, isRefresh: boolean): Promise<void> {
  const theme = typed.trim().slice(0, 60)
  const shown = await readPicker($)
  if (theme === '' && !isRefresh) {
    await update($, picker, state => ({ ...state, theme: '', ideas: FUN_CHOICES, note: '' }))
    await $.store.delete('theme')

    return
  }
  await update($, picker, state => ({ ...state, note: `Finding ideas for ${theme || 'fun'}…` }))
  const ideas = await themeIdeas($, theme, isRefresh ? shown.ideas : [])
  if (ideas.length === 0) {
    await update($, picker, state => ({
      ...state,
      note: `No ideas came back for ${theme || 'fun'}. Try again or type another theme.`,
    }))

    return
  }
  await update($, picker, state => ({ ...state, theme, ideas, note: '' }))
  await $.store.set('theme', { theme, ideas })
}

async function storedTheme($: EngineInterface): Promise<{ theme: string; ideas: Idea[] }> {
  const kept = (await $.store.get('theme')) as { theme?: unknown; ideas?: unknown } | undefined
  const isKept = typeof kept?.theme === 'string' && Array.isArray(kept.ideas) && kept.ideas.length > 0

  return isKept ? { theme: kept.theme as string, ideas: kept.ideas as Idea[] } : { theme: '', ideas: FUN_CHOICES }
}

async function openPicker($: EngineInterface, title: string, theme: string): Promise<string> {
  const { color, icon } = splitTag(tagOf(title))
  const [kept, shape] = await Promise.all([storedTheme($), readShape($)])
  await update($, picker, () => ({ color, icon, title: untagged(title), note: '', shape, ...kept }))
  const opened = await $.ui.open({ id: PICKER, title: 'Tag picker', focus: true })
  if (!opened.isPlaced) return "The picker can't show here. Try typing words instead, like /tag blue video."
  if (theme !== '') await showIdeas($, theme, false)

  return theme === ''
    ? 'The tag picker is open beside the chat. Choose a color and a picture, then press Apply.'
    : `The tag picker is open with ideas for ${theme}. Choose a color and a picture, then press Apply.`
}

async function applyPick($: EngineInterface): Promise<void> {
  const { color, icon, title } = await readPicker($)
  const tag = `${color}${icon}`
  if (tag === '') {
    await update($, picker, state => ({ ...state, note: 'Choose a color or a picture first.' }))

    return
  }
  await setStatus($, 'tagged')
  const renamed = await rename($, `${tag} ${title}`)
  const note = renamed.isRenamed ? `Done. This session is now ${tag} ${title}.` : failed(renamed)
  await update($, picker, state => ({ ...state, note }))
}

async function suggestPick($: EngineInterface): Promise<void> {
  const { title } = await readPicker($)
  const { color, work } = await recommend($, title)
  await update($, picker, state => ({ ...state, color, icon: work, note: 'Suggested. Press Apply to use it.' }))
}

async function removePick($: EngineInterface): Promise<void> {
  const { title } = await readPicker($)
  await setStatus($, 'off')
  const renamed = await rename($, title)
  const note = renamed.isRenamed ? 'Tag removed.' : failed(renamed)
  await update($, picker, state => ({ ...state, color: '', icon: '', note }))
}

// A shape changes the color row and redraws the color chosen so far in it.
async function setShape($: EngineInterface, shape: Shape): Promise<void> {
  await $.store.set('shape', shape)
  await update($, picker, state => ({
    ...state,
    shape,
    color: state.color === '' ? '' : inShape(state.color, shape),
    note: '',
  }))
}

async function setAuto($: EngineInterface, choice: string): Promise<string> {
  if (choice === 'off') {
    await $.store.set('auto', false)

    return 'Automatic tags are off. Sessions keep the tags they have, and /tag still works whenever you want one.\nTo turn them back on, type /tag auto on.'
  }
  if (choice === 'on') {
    await $.store.set('auto', true)

    return 'Automatic tags are on. A session with no tag gets one after its next reply.'
  }

  return `Automatic tags are ${(await isAutoOn($)) ? 'on' : 'off'}. Type /tag auto off or /tag auto on to change it.`
}

type Listed = { id: string; title: string }

// Every active session's id and title, this one included (list_sessions leaves it out).
async function allSessions($: EngineInterface): Promise<Listed[]> {
  const [listed, self] = await Promise.all([
    $.mcp.call(APP, 'list_sessions', { limit: 1000 }),
    $.mcp.call(APP, 'get_session', { session_id: 'self' }),
  ])
  const read = (result: McpToolResult): unknown => {
    try {
      return result.isError ? undefined : JSON.parse(textOf(result))
    } catch {
      return undefined
    }
  }
  const rows = [...(Array.isArray(read(listed)) ? (read(listed) as unknown[]) : []), read(self)]

  return rows.flatMap(row => {
    const { sessionId, title } = (row ?? {}) as { sessionId?: unknown; title?: unknown }

    return typeof sessionId === 'string' && typeof title === 'string' ? [{ id: sessionId, title }] : []
  })
}

// Removes the leading emoji from every active session, after a confirming
// second run, and starts the mod over: automatic tags off, records forgotten.
async function removeAll($: EngineInterface, isConfirmed: boolean): Promise<string> {
  const tagged = (await allSessions($)).filter(
    session => tagOf(session.title) !== '' && untagged(session.title).trim() !== '',
  )
  if (tagged.length === 0) return 'No session has a tag right now.'
  const count = `${tagged.length} session${tagged.length === 1 ? '' : 's'}`
  if (!isConfirmed) {
    return [
      `This removes the emoji from the start of ${count}, including any you added yourself:`,
      ...tagged.slice(0, 3).map(session => `  ${session.title} → ${untagged(session.title)}`),
      ...(tagged.length > 3 ? [`  …and ${tagged.length - 3} more`] : []),
      'It also turns automatic tags off and forgets the project colors.',
      '',
      'To go ahead, type /tag remove all yes',
    ].join('\n')
  }
  const missed: string[] = []
  for (const session of tagged) {
    const result = await $.mcp.call(APP, 'set_session_title', {
      session_id: session.id,
      title: untagged(session.title),
    })
    if (result.isError) missed.push(untagged(session.title))
  }
  await $.store.set('auto', false)
  await $.store.delete('sessions')
  await $.store.delete('colors')
  const removed = tagged.length - missed.length

  return [
    `Removed the tags from ${removed} session${removed === 1 ? '' : 's'}. Automatic tags are off.`,
    ...(missed.length > 0 ? [`The app didn't rename: ${missed.join(', ')}`] : []),
    'To start fresh later, type /tag auto on.',
  ].join('\n')
}

async function runTag($: EngineInterface, args: string): Promise<string> {
  const [first = '', ...rest] = args.split(/\s+/).filter(Boolean)
  const command = first.toLowerCase()
  const next = (rest[0] ?? '').toLowerCase()
  if (command === 'help' || command === '?') return HELP
  if (command === 'auto') return setAuto($, next)
  if ((command === 'remove' || command === 'clear') && next === 'all') {
    return removeAll($, (rest[1] ?? '').toLowerCase() === 'yes').catch(() => NO_APP)
  }
  const title = await appTitle($).catch(() => undefined)
  if (title === undefined) return NO_APP
  const bare = untagged(title)

  if (command === 'pick' || command === 'picker' || command === 'choose') {
    return openPicker($, title, rest.join(' '))
  }

  if (command === 'clear') {
    await setStatus($, 'off')
    const renamed = await rename($, bare)

    return renamed.isRenamed ? 'Tag removed. This session stays untagged unless you run /tag again.' : failed(renamed)
  }

  if (command === 'reset') {
    // Forgetting the session's status lets autoTag treat it as never tagged.
    const id = await $.session.id()
    const sessions = await readRecord($, 'sessions')
    delete sessions[id]
    await $.store.set('sessions', sessions)
    const renamed = await rename($, bare)

    return renamed.isRenamed ? 'Tag removed. A new one is picked after the next reply.' : failed(renamed)
  }

  if (command === 'shape' || command === 'shapes') {
    const shape = shapeNamed(rest.join(' '))
    if (shape === undefined) return `Choose squares, circles or hearts, like /tag shape circles.\n\n${HINT}`
    await $.store.set('shape', shape)
    const sample = colorChoices(shape).map(choice => choice.emoji).join('')
    const name = SHAPES.find(one => one.shape === shape)?.name.toLowerCase() ?? shape
    const { color, icon } = splitTag(tagOf(title))
    if (color === '') return `Colors are ${name} now: ${sample}`
    const tag = `${inShape(color, shape)}${icon}`
    const renamed = await rename($, `${tag} ${bare}`)

    return renamed.isRenamed ? `Colors are ${name} now: ${sample}\nThis session is tagged ${tag}.` : failed(renamed)
  }

  if (command === 'project') {
    const words = rest.join(' ')
    const color = words === '' ? undefined : (await readTyped($, words)).tag.match(EMOJI)?.[0]
    if (color === undefined) return `Name a color, like /tag project red.\n\n${HINT}`
    const root = await $.session.root()
    const colors = await readRecord($, 'colors')
    const before = colors[root]
    await $.store.set('colors', { ...colors, [root]: color })
    // The picture after a color, in whatever shape it was drawn, is kept.
    const current = splitTag(tagOf(title))
    const work = current.color !== '' && current.icon !== '' ? current.icon : await workEmoji($, bare, root)
    await setStatus($, 'tagged')
    const renamed = await rename($, `${color}${work} ${bare}`)

    return renamed.isRenamed
      ? `Sessions in ${basename(root)} now get ${color}. This one is tagged ${color}${work}.`
      : failed(renamed)
  }

  const reading: Reading =
    args === ''
      ? { tag: Object.values(await recommend($, bare)).join(''), said: [], missed: [] }
      : await readTyped($, args)
  if (reading.tag === '') {
    return `I couldn't find emoji for "${args}". Try other words, or /tag pick to choose with buttons.\n\n${HINT}`
  }
  await setStatus($, 'tagged')
  const renamed = await rename($, `${reading.tag} ${bare}`)
  if (!renamed.isRenamed) return failed(renamed)

  return [
    `Tagged this session ${reading.tag}.`,
    ...(reading.said.length > 0 ? [reading.said.join(', ')] : []),
    ...(reading.missed.length > 0 ? [`No emoji found for: ${reading.missed.join(', ')}`] : []),
    '',
    HINT,
  ].join('\n')
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'tag',
      description: 'Color-tag this session in the sidebar (try /tag help)',
      argumentHint: 'help | pick | <words or emoji> | project <color> | auto off | remove all',
    })

    return next(e)
  })

  on('command.run', { command: 'tag' }, async ($, e) => ({ text: await runTag($, e.args.trim()) }))

  on('turn.complete', async ($, e, next) => {
    const done = await next(e)
    // Not awaited: a rename the app asks the person to approve must not hold the turn.
    if (e.agentId === undefined && !e.isAborted) void autoTag($)

    return done
  })

  // Spacing is in cells, a row down being a line: sections stand two lines apart
  // and wrapped buttons one, closer on the terminal, where every line counts.
  on('ui.render', { component: 'Pane', requestId: PICKER }, async ($, e) => {
    const elements = $.ui.resolve(e)
    const { Box, Button, Text } = elements
    // The mobile app draws no text field: there a theme comes from /tag pick <theme>.
    const Input = 'Input' in elements ? elements.Input : undefined
    const state = await readPicker($)
    const isTerminal = e.surface === 'terminal'
    const space = (terminal: number, graphical: number): number => (isTerminal ? terminal : graphical)
    const tag = `${state.color}${state.icon}`
    const preview = tag === '' ? state.title : `${tag} ${state.title}`
    const choose = (field: 'color' | 'icon', emoji: string) => () =>
      void update($, picker, current => ({ ...current, [field]: current[field] === emoji ? '' : emoji, note: '' }))
    // A pane takes no text sizes or weights on any surface: bold and dim carry the hierarchy.
    const heading = (text: string) => <Text bold>{text}</Text>
    const caption = (text: string) => <Text dimColor>{text}</Text>
    // Three looks, read top to bottom: choices are plain buttons (a check marks the
    // chosen one), side actions are `plain`, and Apply alone is primary, at the end.
    // `row` names each button's key, as the work and ideas rows may share a name.
    const buttons = (field: 'color' | 'icon', row: string, list: Idea[]) => (
      <Box flexDirection="row" flexWrap="wrap" columnGap={1} rowGap={space(0, 1)}>
        {list.map(choice => (
          <Button
            key={`${row}-${choice.name}`}
            label={`${state[field] === choice.emoji ? '✓ ' : ''}${choice.emoji} ${choice.name}`}
            onPress={choose(field, choice.emoji)}
          />
        ))}
      </Box>
    )

    return (
      <Box flexDirection="column" gap={space(1, 2)} padding={space(0, 1)}>
        <Box flexDirection="column" gap={space(0, 1)} padding={1} borderStyle="round" borderDimColor>
          {caption('Preview')}
          <Text bold>{preview}</Text>
          <Box flexDirection="row" flexWrap="wrap" columnGap={2} rowGap={space(0, 1)}>
            <Button key="suggest" label="Suggest one" plain onPress={() => void suggestPick($)} />
            <Button key="remove" label="Remove tag" plain onPress={() => void removePick($)} />
          </Box>
        </Box>

        <Box flexDirection="column" gap={space(0, 1)}>
          {heading('1. Choose a color')}
          <Box flexDirection="row" flexWrap="wrap" alignItems="center" columnGap={1} rowGap={space(0, 1)}>
            {caption('Shape:')}
            {SHAPES.map(one => (
              <Button
                key={`shape-${one.shape}`}
                label={`${state.shape === one.shape ? '✓ ' : ''}${inShape('🟦', one.shape)} ${one.name}`}
                onPress={() => void setShape($, one.shape)}
              />
            ))}
          </Box>
          {buttons('color', 'color', colorChoices(state.shape))}
        </Box>

        <Box flexDirection="column" gap={space(0, 1)}>
          {heading('2. Choose a picture')}
          {buttons('icon', 'work', WORK_CHOICES)}
        </Box>

        <Box flexDirection="column" gap={space(0, 1)}>
          {heading(state.theme === '' ? '3. Ideas: just for fun' : `3. Ideas: ${state.theme}`)}
          {caption('These are pictures too, in place of one from step 2.')}
          {buttons('icon', 'idea', state.ideas)}
          {Input === undefined ? (
            caption('For other ideas, type /tag pick and a theme, like /tag pick ocean.')
          ) : (
            <Box flexDirection="column" gap={space(0, 1)}>
              {caption('Want different ideas? Type a theme and press Return.')}
              <Input
                key="theme"
                placeholder="ocean, 80s arcade, Halloween..."
                value={state.theme}
                submitLabel="show ideas"
                onSubmit={(text: string) => void showIdeas($, text, false)}
              />
            </Box>
          )}
          <Button key="new-ideas" label="↻ More ideas like these" plain onPress={() => void showIdeas($, state.theme, true)} />
        </Box>

        <Box flexDirection="column" gap={space(0, 1)}>
          <Button key="apply" label={tag === '' ? 'Apply' : `Apply ${tag}`} variant="primary" onPress={() => void applyPick($)} />
          {state.note !== '' && <Text dimColor>{state.note}</Text>}
        </Box>
      </Box>
    )
  })
}
