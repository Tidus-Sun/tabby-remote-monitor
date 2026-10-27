import { Buffer } from 'buffer'
import type { Observable } from 'rxjs'
import { Subscription } from 'rxjs'
import type { EventEmitter } from 'events'
import { LocalizedError } from './i18n'

export interface RusshChannel {
    data$: Observable<Uint8Array>
    extendedData$?: Observable<[number, Uint8Array]>
    eof$: Observable<void>
    closed$: Observable<void>
    requestExec(command: string): Promise<void>
    eof?(): Promise<void>
    close(): Promise<void>
}
export interface RusshClient {
    openSessionChannel(): Promise<unknown>
    activateChannel(channel: unknown): Promise<RusshChannel>
}
export interface SSH2Channel extends EventEmitter {
    stderr?: EventEmitter
    close(): void
    end?(): unknown
}
export interface SSH2Client {
    exec(command: string, callback: (error: Error | undefined, channel: SSH2Channel) => void): void
}
export type ExecClient = RusshClient | SSH2Client
export interface ExecResult { stdout: string; stderr: string }
export interface ExecOptions { completionMarker?: string }
export class IncompleteOutputError extends LocalizedError {
    constructor (bytes: number) { super('error.incompleteBytes', { bytes }) }
}

function closeChannel (channel: { close(): unknown }): void {
    try { void Promise.resolve(channel.close()).catch(() => {}) } catch { /* Connection may already be closed. */ }
}

/** A dedicated, non-PTY exec channel on the authenticated connection; never writes to its shell. */
export function execute (client: ExecClient, command: string, timeoutMs: number, signal: AbortSignal, options: ExecOptions = {}): Promise<ExecResult> {
    return new Promise((resolve, reject) => {
        let settled = false
        let channel: { close(): unknown } | undefined
        const subscriptions = new Subscription()
        const stdout: Buffer[] = []
        const stderr: Buffer[] = []
        let bytes = 0
        let frameTail = ''
        let frameComplete = false
        let ending = false
        let acknowledged = false
        let drainTimer: ReturnType<typeof setTimeout> | undefined
        let endInput: (() => unknown) | undefined
        const finish = (error?: Error): void => {
            if (settled) return
            settled = true
            clearTimeout(timer)
            clearTimeout(drainTimer)
            signal.removeEventListener('abort', abort)
            subscriptions.unsubscribe()
            if (channel) closeChannel(channel)
            if (error) reject(error)
            else resolve({ stdout: Buffer.concat(stdout).toString('utf8'), stderr: Buffer.concat(stderr).toString('utf8') })
        }
        const abort = (): void => finish(new LocalizedError('error.cancelled'))
        const timer = setTimeout(() => finish(frameComplete ? undefined : new LocalizedError('error.timeout')), timeoutMs)
        const acknowledgeFrame = (): void => {
            if (acknowledged) return
            acknowledged = true
            // Close stdin only after the complete frame arrived. Waiting for the
            // resulting EOF/close also drains stderr queued on a separate stream.
            if (endInput) void Promise.resolve().then(endInput).then(() => { if (ending) finish() }, () => finish())
            else finish()
        }
        const ended = (): void => {
            if (settled) return
            ending = true
            if (!options.completionMarker || frameComplete) { finish(); return }
            // Separate native callbacks can be queued independently. Allow queued
            // data to drain, but never accept a truncated frame as a successful sample.
            clearTimeout(drainTimer)
            drainTimer = setTimeout(() => finish(new IncompleteOutputError(bytes)), 100)
        }
        const append = (target: Buffer[], data: Uint8Array | string): void => {
            if (settled) return
            const chunk = typeof data === 'string' ? Buffer.from(data) : Buffer.from(data)
            bytes += chunk.length
            if (bytes > 1024 * 1024) finish(new LocalizedError('error.limit'))
            else {
                target.push(chunk)
                if (target === stdout && options.completionMarker) {
                    const text = frameTail + chunk.toString('utf8')
                    frameComplete = frameComplete || text.includes(options.completionMarker)
                    frameTail = text.slice(-options.completionMarker.length)
                    if (frameComplete) acknowledgeFrame()
                    else if (ending) ended()
                }
            }
        }
        signal.addEventListener('abort', abort, { once: true })
        if (signal.aborted) { abort(); return }

        if ('openSessionChannel' in client && typeof client.openSessionChannel === 'function') {
            void (async () => {
                const pending = await client.openSessionChannel()
                const active = await client.activateChannel(pending)
                channel = active
                if (settled) { closeChannel(active); return }
                if (active.eof) endInput = () => active.eof!()
                subscriptions.add(active.data$.subscribe({ next: data => append(stdout, data), error: error => finish(new Error(String(error))) }))
                subscriptions.add(active.extendedData$?.subscribe({ next: ([, data]) => append(stderr, data), error: error => finish(new Error(String(error))) }))
                subscriptions.add(active.eof$.subscribe(ended))
                subscriptions.add(active.closed$.subscribe(ended))
                if (!settled) await active.requestExec(command)
            })().catch(error => finish(error instanceof Error ? error : new Error(String(error))))
        } else if ('exec' in client && typeof client.exec === 'function') {
            try {
                client.exec(command, (error, active) => {
                    if (error) { finish(error); return }
                    if (!active) { finish(new LocalizedError('error.noChannel')); return }
                    channel = active
                    // Retain this error listener until the channel is GC'd; late errors after close are legal.
                    active.on('error', (err: Error) => finish(err))
                    if (settled) { closeChannel(active); return }
                    if (active.end) endInput = () => active.end!()
                    const data = (chunk: Buffer): void => append(stdout, chunk)
                    const errData = (chunk: Buffer): void => append(stderr, chunk)
                    const closed = (code?: number): void => {
                        if (typeof code === 'number' && code !== 0) finish(new LocalizedError('error.exit', { code }))
                        else ended()
                    }
                    active.on('data', data)
                    active.stderr?.on('data', errData)
                    active.once('close', closed)
                    subscriptions.add(() => {
                        active.off('data', data)
                        active.stderr?.off('data', errData)
                        active.off('close', closed)
                    })
                })
            } catch (error) { finish(error instanceof Error ? error : new Error(String(error))) }
        } else finish(new LocalizedError('error.noExec'))
    })
}
