const log = (level: string, event: string, ctx?: Record<string, unknown>) =>
  console[level === 'ERROR' ? 'error' : level === 'WARN' ? 'warn' : 'log'](
    JSON.stringify({ level, event, timestamp: new Date().toISOString(), ...ctx }),
  )

export const logger = {
  info: (event: string, ctx?: Record<string, unknown>) => log('INFO', event, ctx),
  warn: (event: string, ctx?: Record<string, unknown>) => log('WARN', event, ctx),
  error: (event: string, ctx?: Record<string, unknown>) => log('ERROR', event, ctx),
  debug: (event: string, ctx?: Record<string, unknown>) => log('DEBUG', event, ctx),
}
