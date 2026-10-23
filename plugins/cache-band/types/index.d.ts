export type CacheBandTtl = '5m' | '1h'

export type CacheBandContext = {
  /** Kontextfüllung in Prozent des Kontextfensters. */
  percent: number
  /** Auto-Compact-Schwelle in Prozent des Kontextfensters. */
  threshold: number
  /** True, wenn die Schwelle nicht gelesen werden konnte (83 % angenommen). */
  isThresholdAssumed: boolean
}

declare module 'claude-code' {
  interface PluginState {
    'cache-band': {
      lastResponseAt: number | null
      ttl: CacheBandTtl
      isTtlMeasured: boolean
      hitRate: number | null
      context: CacheBandContext | null
      tick: number
      isBusy: boolean
      isCollapsed: boolean
    }
  }
}
