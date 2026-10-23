import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, Timer } from 'claude-code'

import type { CacheBandContext, CacheBandTtl } from '../types'

const lastResponseAt = atom({ plugin: 'cache-band', key: 'lastResponseAt' } as const, null)
const ttl = atom({ plugin: 'cache-band', key: 'ttl' } as const, '5m')
const isTtlMeasured = atom({ plugin: 'cache-band', key: 'isTtlMeasured' } as const, false)
const hitRate = atom({ plugin: 'cache-band', key: 'hitRate' } as const, null)
const context = atom({ plugin: 'cache-band', key: 'context' } as const, null)
const tick = atom({ plugin: 'cache-band', key: 'tick' } as const, 0)
const isBusy = atom({ plugin: 'cache-band', key: 'isBusy' } as const, false)
const isCollapsed = atom({ plugin: 'cache-band', key: 'isCollapsed' } as const, false)

const MINUTE = 60_000
const BOXES = 20
const FALLBACK_THRESHOLD = 83
// $.ui.log zeichnet im Terminal die ersten 2000 Zeichen einer Zeile.
const CHUNK = 1800
// $.fs.read lehnt Dateien über 4 MiB ab.
const MAX_READ = 3_500_000

const ttlMs = (value: CacheBandTtl) => (value === '1h' ? 60 : 5) * MINUTE

const fmt = (n: number) => n.toLocaleString('de-DE')

type Weather = '☀️' | '🌧️' | '⛈️'

function weatherOf(ctx: CacheBandContext): Weather {
  const ratio = ctx.percent / ctx.threshold
  if (ratio <= 0.5) return '☀️'
  if (ratio <= 0.8) return '🌧️'
  return '⛈️'
}

/** Liest die Cache-Laufzeit aus den letzten Antworten im Transcript. */
async function detectTtl($: EngineInterface, path: string): Promise<CacheBandTtl | null> {
  let text: string
  try {
    const { size } = await $.fs.stat(path)
    if (size <= MAX_READ) {
      text = await $.fs.read(path)
    } else {
      const tail = await $.process.run(['tail', '-c', '1048576', path])
      if (tail.exitCode !== 0) return null
      text = tail.stdout
    }
  } catch {
    return null
  }

  const lines = text.split('\n')
  for (let i = lines.length - 1, seen = 0; i >= 0 && seen < 400; i--, seen++) {
    const line = lines[i]
    if (line === undefined || !line.includes('cache_creation')) continue
    try {
      const row = JSON.parse(line)
      if (row.type !== 'assistant' || row.isSidechain) continue
      const created = row.message?.usage?.cache_creation
      if (!created) continue
      if (created.ephemeral_1h_input_tokens > 0) return '1h'
      if (created.ephemeral_5m_input_tokens > 0) return '5m'
    } catch {
      // eine abgeschnittene erste Zeile beim tail
    }
  }

  return null
}

async function learnTtl($: EngineInterface, path: string) {
  const found = await detectTtl($, path)
  if (!found) return
  await update($, ttl, () => found)
  await update($, isTtlMeasured, () => true)
  await $.store.set('ttl', found)
}

async function initialTtl($: EngineInterface): Promise<CacheBandTtl> {
  if (await $.env.get('FORCE_PROMPT_CACHING_5M')) return '5m'
  if (await $.env.get('ENABLE_PROMPT_CACHING_1H')) return '1h'
  const stored = await $.store.get('ttl')

  return stored === '1h' ? '1h' : '5m'
}

async function refreshContext($: EngineInterface) {
  try {
    const { context: usage } = await $.session.usage({ breakdown: 'summary' })
    const breakdown = usage.breakdown
    const window = usage.window
    const percent =
      usage.percent ??
      (breakdown ? Math.round((breakdown.totalTokens / window) * 100) : 0)
    const raw = breakdown?.autoCompactThreshold
    const isThresholdAssumed = raw === undefined || window <= 0
    const threshold = isThresholdAssumed
      ? FALLBACK_THRESHOLD
      : Math.round((raw / window) * 100)
    await update($, context, () => ({ percent, threshold, isThresholdAssumed }))
  } catch {
    // ohne Session (z. B. vor dem ersten Binden) bleibt die alte Anzeige
  }
}

/** Teilt einen Text an Absätzen, notfalls an Zeilen und Wörtern, in Stücke ≤ size. */
function splitText(text: string, size: number): string[] {
  const chunks: string[] = []
  let current = ''

  const push = (piece: string, joiner: string) => {
    if (current === '') current = piece
    else if (current.length + joiner.length + piece.length <= size) current += joiner + piece
    else {
      chunks.push(current)
      current = piece
    }
  }

  for (const paragraph of text.split(/\n\s*\n/)) {
    if (paragraph.length <= size) {
      push(paragraph, '\n\n')
      continue
    }
    for (const line of paragraph.split('\n')) {
      if (line.length <= size) {
        push(line, '\n')
        continue
      }
      let rest = line
      while (rest.length > size) {
        const cut = rest.lastIndexOf(' ', size)
        const at = cut > size / 2 ? cut : size
        push(rest.slice(0, at), '\n')
        rest = rest.slice(at).trimStart()
      }
      push(rest, '\n')
    }
  }
  if (current !== '') chunks.push(current)

  return chunks
}

let timers: Timer[] = []

function bump($: EngineInterface) {
  void update($, tick, n => n + 1)
}

// Jede Minute ab der letzten Antwort neu zeichnen, dazu genau an den
// Farbwechseln (letztes Viertel, letzte 10 %) und beim Ablauf.
function restartTicks($: EngineInterface, ms: number) {
  for (const timer of timers) timer.cancel()
  timers = [
    $.clock.every(MINUTE, () => bump($)),
    $.clock.after(ms * 0.75, () => bump($)),
    $.clock.after(ms * 0.9, () => bump($)),
    $.clock.after(ms, () => bump($)),
  ]
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    if (!(await read($, isTtlMeasured))) {
      const start = await initialTtl($)
      await update($, ttl, () => start)
    }
    restartTicks($, ttlMs(await read($, ttl)))
    void refreshContext($)

    return next(e)
  })

  on('classic.SessionStart', async ($, e, next) => {
    if (e.source === 'resume' || e.source === 'fork') await learnTtl($, e.transcript_path)

    return next(e)
  }).catch(($, e, next) => next(e))

  on('turn.start', async ($, e, next) => {
    if (e.agentId === undefined) await update($, isBusy, () => true)

    return next(e)
  })

  // Jede Antwort des Hauptthreads frischt den Cache auf: Zeitpunkt und Hit-Rate merken.
  on('turn.step', async function* ($, e, next) {
    const result = yield* next(e)
    if (e.agentId === undefined && result.usage) {
      const u = result.usage
      const total = u.input_tokens + u.cache_read_input_tokens + u.cache_creation_input_tokens
      const now = await $.clock.now()
      await update($, lastResponseAt, () => now)
      await update($, hitRate, () =>
        total > 0 ? Math.round((u.cache_read_input_tokens / total) * 100) : null,
      )
      restartTicks($, ttlMs(await read($, ttl)))
    }

    return result
  })

  on('turn.complete', async ($, e, next) => {
    if (e.agentId === undefined) {
      await update($, isBusy, () => false)
      void refreshContext($)
    }

    return next(e)
  })

  on('classic.Stop', async ($, e, next) => {
    if (e.agent_id === undefined) {
      await learnTtl($, e.transcript_path)
      restartTicks($, ttlMs(await read($, ttl)))
    }

    return next(e)
  }).catch(($, e, next) => next(e))

  // Nach /compact oder dem Button: Zusammenfassung als Log-Zeilen (das Modell liest sie nicht).
  on('session.compact', async ($, e, next) => {
    const result = await next(e)
    const isOurs = e.agentId === undefined && (e.trigger === 'manual' || e.trigger === 'plugin')
    if (!isOurs || !result.messages) return result

    await update($, lastResponseAt, () => null)
    await update($, hitRate, () => null)
    void refreshContext($)

    const before = result.tokensBefore !== undefined ? fmt(result.tokensBefore) : '?'
    const after = result.tokensAfter !== undefined ? fmt(result.tokensAfter) : '?'
    $.ui.log(`🗜️ Compact: ${before} → ${after} Tokens`)

    const summary = result.messages.find(m => m.role === 'user' && m.text.trim() !== '')
    if (summary) {
      const parts = splitText(summary.text.trim(), CHUNK)
      parts.forEach((part, i) => {
        const head = parts.length > 1 ? `Zusammenfassung (${i + 1}/${parts.length}):\n` : 'Zusammenfassung:\n'
        $.ui.log(head + part)
      })
    } else {
      $.ui.log('Keine Zusammenfassung im Ergebnis gefunden.')
    }

    return result
  }).catch(($, e, next) => next(e))

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) return next(e)

    const { Box, Button, Text } = $.ui.resolve(e)
    await read($, tick)
    const at = await read($, lastResponseAt)
    const ttlValue = await read($, ttl)
    const rate = await read($, hitRate)
    const ctx = await read($, context)
    const collapsed = await read($, isCollapsed)
    const surface = e.surface

    const total = ttlMs(ttlValue)
    const now = await $.clock.now()
    const remainingMs = at === null ? null : Math.max(0, total - (now - at))
    const minutes = remainingMs === null ? null : Math.round(remainingMs / MINUTE)
    const fraction = remainingMs === null ? 0 : remainingMs / total
    const isExpired = remainingMs !== null && (remainingMs <= 0 || minutes === 0)
    const color = fraction <= 0.1 ? 'error' : fraction <= 0.25 ? 'warning' : 'success'
    const filled = isExpired ? 0 : Math.ceil(fraction * BOXES)

    const cacheText =
      minutes === null ? 'Cache –' : isExpired ? 'abgelaufen' : `${minutes} min`
    const weather = ctx ? weatherOf(ctx) : '☀️'
    const isStorm = weather === '⛈️'
    const percentText = ctx ? `${ctx.percent} %` : '– %'

    const toggle = (
      <Button
        key="toggle"
        plain
        dimColor
        label={collapsed ? '▸' : '▾'}
        onPress={() => update($, isCollapsed, v => !v)}
      />
    )

    if (collapsed) {
      return (
        <Box flexDirection="row" gap={1}>
          <Text>{weather}</Text>
          <Text color={minutes === null ? undefined : color} dimColor={minutes === null}>
            {cacheText}
          </Text>
          <Text>{percentText}</Text>
          {toggle}
        </Box>
      )
    }

    const compact = async () => {
      const busy = await read($, isBusy)
      if (surface === 'desktop' || busy) {
        $.ui.toast('/compact eingereiht – startet, sobald Claude fertig ist')
        void $.command.run({ command: 'compact' }).catch(() =>
          $.ui.toast('/compact konnte nicht eingereiht werden'),
        )
        return
      }
      try {
        await $.session.compact()
      } catch {
        $.ui.toast('/compact eingereiht – startet, sobald Claude fertig ist')
        void $.command.run({ command: 'compact' }).catch(() =>
          $.ui.toast('/compact konnte nicht eingereiht werden'),
        )
      }
    }

    return (
      <Box flexDirection="row" gap={1}>
        <Text dimColor>Cache</Text>
        <Text color={minutes === null ? undefined : color} dimColor={minutes === null}>
          {cacheText}
        </Text>
        <Text color={color}>
          {'■'.repeat(filled)}
          <Text dimColor>{'□'.repeat(BOXES - filled)}</Text>
        </Text>
        <Text dimColor>│ Hit</Text>
        <Text>{rate === null ? '–' : `${rate} %`}</Text>
        <Text dimColor>│</Text>
        <Text>{weather}</Text>
        <Text>Kontext {percentText}</Text>
        <Text dimColor>
          / Compact bei {ctx ? ctx.threshold : FALLBACK_THRESHOLD} %
          {ctx?.isThresholdAssumed ? '*' : ''}
        </Text>
        <Button
          key="compact"
          label="Compact"
          variant={isStorm ? 'primary' : undefined}
          dimColor={!isStorm}
          onPress={compact}
        />
        {toggle}
      </Box>
    )
  })
}
