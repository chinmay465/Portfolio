import type { Provider } from '../monitor.ts'
import { createHtmlArchiveProvider } from './htmlArchive.ts'
import type { HtmlArchiveOptions } from './htmlArchive.ts'
import { createMockProvider } from './mock.ts'
import { createPastebinProvider } from './pastebin.ts'
import type { PastebinOptions } from './pastebin.ts'

export interface SourceSpec {
  type: 'mock' | 'pastebin' | 'html'
  options?: PastebinOptions | HtmlArchiveOptions | Record<string, unknown>
}

/**
 * Build provider instances from a list of source specs. Falls back to the mock
 * source if nothing valid is supplied.
 */
export function buildProviders(sources: SourceSpec[], { keywords }: { keywords: string[] }): Provider[] {
  const providers: Provider[] = []
  for (const spec of sources) {
    if (spec.type === 'mock') {
      providers.push(createMockProvider({ keywords }))
    } else if (spec.type === 'pastebin') {
      providers.push(createPastebinProvider((spec.options as PastebinOptions) || {}))
    } else if (spec.type === 'html') {
      providers.push(createHtmlArchiveProvider(spec.options as HtmlArchiveOptions))
    } else {
      throw new Error(`Unknown source type: "${String((spec as { type?: unknown }).type)}"`)
    }
  }
  if (!providers.length) providers.push(createMockProvider({ keywords }))
  return providers
}
