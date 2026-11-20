import { describe, expect, it } from 'vitest'
import { checkTarget, GuardError } from './guard.ts'
import { toReader } from './reader.ts'
import { parseBing, parseDdgLite, parseStartpage, parseDuckDuckGo, parseMojeek, parseYahoo, unwrapBing, unwrapYahoo } from './search.ts'
import { parseProxyList, sourcesFromEnv } from './sources.ts'

const strict = { allowHttp: false, allowPrivate: false }

describe('parseProxyList', () => {
  it('accepts ip:port and http://ip:port, drops junk, private and bad ports', () => {
    const text = [
      '45.128.184.25:80',
      'http://200.119.141.114:999',
      '# comment',
      '10.0.0.1:8080',
      '192.168.1.5:3128',
      '1.2.3.4:99999',
      'user:pass@5.6.7.8:80',
      '  8.8.4.4:3128  ',
      '',
    ].join('\n')
    expect(parseProxyList(text)).toEqual([
      { host: '45.128.184.25', port: 80 },
      { host: '200.119.141.114', port: 999 },
      { host: '8.8.4.4', port: 3128 },
    ])
  })

  it('reads SETU_SOURCES overrides and ignores non-https entries', () => {
    expect(sourcesFromEnv('a=https://x.test/a.txt,b=http://insecure/b.txt')).toEqual([{ name: 'a', url: 'https://x.test/a.txt' }])
    expect(sourcesFromEnv('').length).toBeGreaterThan(1)
  })
})

describe('checkTarget', () => {
  it('allows public https', () => {
    expect(checkTarget('https://example.com/a?b=1', strict).hostname).toBe('example.com')
  })
  it.each([
    'http://example.com',
    'ftp://example.com',
    'https://localhost/x',
    'https://127.0.0.1/',
    'https://10.1.2.3/',
    'https://[::1]/',
    'https://user:pw@example.com/',
    'https://printer.local/',
    'not a url',
  ])('blocks %s', (u) => {
    expect(() => checkTarget(u, strict)).toThrow(GuardError)
  })
  it('allows http when opted in', () => {
    expect(checkTarget('http://example.com', { allowHttp: true, allowPrivate: false }).protocol).toBe('http:')
  })
})

describe('search parsers', () => {
  it('parses DuckDuckGo HTML results and skips ads', () => {
    const html = `
      <div class="result results_links result--ad"><h2><a class="result__a" href="//duckduckgo.com/y.js?ad=1">Ad</a></h2></div>
      <div class="result results_links web-result">
        <h2 class="result__title"><a class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Ftesting-library.com%2Fdocs%2F&amp;rut=abc">Testing Library</a></h2>
        <a class="result__snippet" href="#">Simple and   complete testing utilities.</a>
      </div>`
    expect(parseDuckDuckGo(html)).toEqual([
      { title: 'Testing Library', url: 'https://testing-library.com/docs/', snippet: 'Simple and complete testing utilities.' },
    ])
  })

  it('parses Mojeek results', () => {
    const html = `<ul class="results-standard"><li><a class="ob" href="https://react.dev/">react.dev</a>
      <h2><a class="title" href="https://react.dev/">React</a></h2><p class="s">The library for web and native UIs</p></li>
      <li><h2><a href="/relative">skip</a></h2></li></ul>`
    expect(parseMojeek(html)).toEqual([{ title: 'React', url: 'https://react.dev/', snippet: 'The library for web and native UIs' }])
  })
})

describe('more engines', () => {
  const enc = (u: string) => 'a1' + Buffer.from(u).toString('base64url')

  it('parses Bing and unwraps its /ck/a redirect links', () => {
    const html = `<ol id="b_results">
      <li class="b_algo"><h2><a href="https://www.bing.com/ck/a?!&&p=abc&u=${enc('https://vitejs.dev/guide/')}&ntb=1">Getting Started | Vite</a></h2>
        <div class="b_caption"><p class="b_lineclamp2">Next generation   frontend tooling.</p></div></li>
      <li class="b_algo"><h2><a href="https://react.dev/learn">Quick Start</a></h2><div class="b_caption"><p>Learn React.</p></div></li>
      <li class="b_ad"><h2><a href="https://ads.test/">Ad</a></h2></li></ol>`
    expect(parseBing(html)).toEqual([
      { title: 'Getting Started | Vite', url: 'https://vitejs.dev/guide/', snippet: 'Next generation frontend tooling.' },
      { title: 'Quick Start', url: 'https://react.dev/learn', snippet: 'Learn React.' },
    ])
    expect(unwrapBing('https://www.bing.com/ck/a?u=garbage')).toBeNull()
  })

  it('parses Yahoo and unwraps RU= links', () => {
    const html = `<div id="web"><ol><li><div class="dd algo algo-sr">
      <div class="compTitle"><h3 class="title"><a href="https://r.search.yahoo.com/_ylt=x/RV=2/RE=1/RO=10/RU=https%3a%2f%2fwww.typescriptlang.org%2fdocs%2f/RK=2/RS=y-" aria-label="TypeScript Documentation">www.typescriptlang.org<span>TypeScript Documentation</span></a></h3></div>
      <div class="compText"><p>Find TypeScript starter projects.</p></div></div></li></ol></div>`
    expect(parseYahoo(html)).toEqual([
      { title: 'TypeScript Documentation', url: 'https://www.typescriptlang.org/docs/', snippet: 'Find TypeScript starter projects.' },
    ])
    expect(unwrapYahoo('https://search.yahoo.com/search?p=x')).toBeNull()
  })

  it('parses Google results from Startpage (current and older markup)', () => {
    const current = `<div class="result css-1"><a class="result-title result-link css-2" href="https://react.dev/">
      <h2 class="wgl-title css-3">React</h2></a><p class="description css-4">The library for web and   native UIs.</p></div>
      <div class="result"><a class="result-link" href="https://www.startpage.com/do/settings">Settings</a></div>`
    const older = `<div class="w-gl__result"><a class="w-gl__result-title" href="https://vitejs.dev/"><h3>Vite</h3></a>
      <p class="w-gl__description">Next generation frontend tooling.</p></div>`
    expect(parseStartpage(current)).toEqual([{ title: 'React', url: 'https://react.dev/', snippet: 'The library for web and native UIs.' }])
    expect(parseStartpage(older)).toEqual([{ title: 'Vite', url: 'https://vitejs.dev/', snippet: 'Next generation frontend tooling.' }])
  })

  it('parses DuckDuckGo Lite table rows', () => {
    const html = `<table>
      <tr><td>1.</td><td><a rel="nofollow" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fnodejs.org%2Fen%2Fdocs&amp;rut=x" class="result-link">Node.js Docs</a></td></tr>
      <tr><td></td><td class="result-snippet">Reference   documentation.</td></tr>
      <tr><td></td><td><span class="link-text">nodejs.org/en/docs</span></td></tr></table>`
    expect(parseDdgLite(html)).toEqual([{ title: 'Node.js Docs', url: 'https://nodejs.org/en/docs', snippet: 'Reference documentation.' }])
  })
})

describe('toReader', () => {
  it('extracts text and absolute links without scripts', () => {
    const page = toReader(
      `<html><head><title>Hello</title><script>alert(1)</script></head>
       <body><main><h1>Heading</h1><p>Some <b>bold</b> text.</p><ul><li>One</li></ul>
       <a href="/next">Next page</a><a href="javascript:alert(1)">bad</a></main></body></html>`,
      'https://site.test/a/',
    )
    expect(page.title).toBe('Hello')
    expect(page.blocks).toEqual([
      { kind: 'h', text: 'Heading' },
      { kind: 'p', text: 'Some bold text.' },
      { kind: 'li', text: 'One' },
    ])
    expect(page.links).toEqual([{ text: 'Next page', href: 'https://site.test/next' }])
  })
})
