import { NgModule } from '@angular/core'
import { CommonModule } from '@angular/common'
import { FormsModule } from '@angular/forms'
import { ConfigProvider } from 'tabby-core'
import { TerminalDecorator } from 'tabby-terminal'
import { SettingsTabProvider } from 'tabby-settings'
import { RemoteMonitorDecorator } from './decorator'
import { RemoteMonitorConfigProvider, RemoteMonitorSettingsComponent, RemoteMonitorSettingsProvider } from './settings'

@NgModule({
    imports: [CommonModule, FormsModule],
    declarations: [RemoteMonitorSettingsComponent],
    providers: [
        { provide: ConfigProvider, useClass: RemoteMonitorConfigProvider, multi: true },
        { provide: TerminalDecorator, useClass: RemoteMonitorDecorator, multi: true },
        { provide: SettingsTabProvider, useClass: RemoteMonitorSettingsProvider, multi: true },
    ],
})
export default class RemoteMonitorModule {}
