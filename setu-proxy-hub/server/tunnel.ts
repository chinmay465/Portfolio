import net from 'node:net'
import type { ProxyAddress } from './sources.ts'

/**
 * Open a raw TCP tunnel to host:port *through* an HTTP proxy using CONNECT.
 * Resolves with the connected socket once the proxy answers 2xx. Any bytes the
 * proxy sent after its response headers are unshifted back onto the socket.
 */
export function openTunnel(proxy: ProxyAddress, host: string, port: number, timeoutMs = 10000): Promise<net.Socket> {
  return new Promise((resolve, reject) => {
    const socket = net.connect(proxy.port, proxy.host)
    let buf = Buffer.alloc(0)
    let settled = false

    const fail = (err: Error) => {
      if (settled) return
      settled = true
      socket.destroy()
      reject(err)
    }

    socket.setTimeout(timeoutMs, () => fail(new Error('proxy timeout')))
    socket.once('error', fail)
    socket.once('close', () => fail(new Error('proxy closed connection')))

    socket.once('connect', () => {
      const target = `${host.includes(':') ? `[${host}]` : host}:${port}`
      socket.write(`CONNECT ${target} HTTP/1.1\r\nHost: ${target}\r\nProxy-Connection: keep-alive\r\n\r\n`)
    })

    const onData = (chunk: Buffer) => {
      buf = Buffer.concat([buf, chunk])
      const end = buf.indexOf('\r\n\r\n')
      if (end === -1) {
        if (buf.length > 16384) fail(new Error('proxy sent oversized response'))
        return
      }
      socket.off('data', onData)
      const head = buf.subarray(0, end).toString('latin1')
      const status = Number(/^HTTP\/1\.[01] (\d{3})/.exec(head)?.[1])
      if (!(status >= 200 && status < 300)) {
        fail(new Error(`proxy refused CONNECT (${Number.isNaN(status) ? 'bad response' : status})`))
        return
      }
      settled = true
      socket.setTimeout(0)
      socket.removeAllListeners('error')
      socket.removeAllListeners('close')
      const rest = buf.subarray(end + 4)
      if (rest.length) socket.unshift(rest)
      resolve(socket)
    }
    socket.on('data', onData)
  })
}
