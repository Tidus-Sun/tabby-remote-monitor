import { Injectable, NgZone } from '@angular/core'
import { ConfigService, LocaleService } from 'tabby-core'
import { BaseTerminalTabComponent, TerminalDecorator } from 'tabby-terminal'
import type { Subscription } from 'rxjs'
import { normalizeOptions } from './options'
import { Monitor } from './monitor'
import { StatusBar } from './statusbar'
import type { ExecClient } from './transport'

type Terminal = BaseTerminalTabComponent<any>
interface SSHConnection { open: boolean; ssh: ExecClient }
type SSHTerminal = Terminal & { sshSession: SSHConnection | null }
interface Attachment { monitor: Monitor; bar: StatusBar; subscriptions: Subscription[] }

@Injectable()
export class RemoteMonitorDecorator extends TerminalDecorator {
    private attachments = new Map<Terminal, Attachment>()

    constructor (private config: ConfigService, private zone: NgZone, private locale: LocaleService) { super() }

    attach (terminal: Terminal): void {
        // Detect the built-in SSH tab without importing an unexported SSHSession class.
        if (terminal.profile?.type !== 'ssh' || !('sshSession' in terminal) || this.attachments.has(terminal)) return
        const sshTab = terminal as SSHTerminal
        this.zone.runOutsideAngular(() => {
            const options = normalizeOptions(this.config.store.remoteMonitor)
            const monitor = new Monitor(() => {
                const session = sshTab.sshSession
                return session?.ssh ? { identity: session, client: session.ssh, open: session.open && !!terminal.session?.open } : undefined
            }, options, state => bar.update(state))
            const bar = new StatusBar(terminal.element.nativeElement, options, () => monitor.togglePaused(), () => monitor.refresh(), this.locale.getLocale())
            const subscriptions = [
                terminal.sessionChanged$.subscribe(() => this.zone.runOutsideAngular(() => monitor.wake())),
                terminal.visibility$.subscribe(visible => this.zone.runOutsideAngular(() => monitor.setVisible(visible))),
                this.config.changed$.subscribe(() => this.zone.runOutsideAngular(() => {
                    const updated = normalizeOptions(this.config.store.remoteMonitor)
                    bar.configure(updated, this.locale.getLocale())
                    monitor.configure(updated)
                })),
                this.locale.localeChanged$.subscribe(locale => this.zone.runOutsideAngular(() => {
                    bar.configure(normalizeOptions(this.config.store.remoteMonitor), locale)
                })),
            ]
            this.attachments.set(terminal, { monitor, bar, subscriptions })
            monitor.start()
        })
    }

    detach (terminal: Terminal): void {
        const attachment = this.attachments.get(terminal)
        if (attachment) {
            attachment.subscriptions.forEach(subscription => subscription.unsubscribe())
            attachment.monitor.destroy()
            attachment.bar.destroy()
            this.attachments.delete(terminal)
        }
        super.detach(terminal)
    }
}
