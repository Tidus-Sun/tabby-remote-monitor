import { AfterViewInit, ChangeDetectorRef, Component, ElementRef, Injectable, NgZone, OnDestroy, ViewChild } from '@angular/core'
import { ConfigProvider, ConfigService, LocaleService } from 'tabby-core'
import { SettingsTabProvider } from 'tabby-settings'
import { DEFAULT_OPTIONS, MonitorOptions, normalizeOptions } from './options'
import { resolveLanguage, translate } from './i18n'
import type { MessageKey } from './i18n'
import type { Subscription } from 'rxjs'
import { APPEARANCE_PRESETS, DEFAULT_APPEARANCE } from './appearance'
import { AppearancePreview } from './appearance-preview'

@Injectable()
export class RemoteMonitorConfigProvider extends ConfigProvider {
    defaults = { remoteMonitor: { ...DEFAULT_OPTIONS } }
}

@Component({
    selector: 'remote-monitor-settings',
    template: `
      <h3>{{ t('settings.title') }}</h3>
      <p class="text-muted">{{ t('settings.description') }}</p>
      <div class="form-group"><label for="remote-monitor-language">{{ t('settings.language') }}</label>
        <select id="remote-monitor-language" class="form-control" [(ngModel)]="options.language" (ngModelChange)="save()">
          <option value="auto">{{ t('settings.auto') }}</option><option value="zh-CN">简体中文</option><option value="en">English</option>
        </select><small class="text-muted">{{ t('settings.languageHint') }}</small>
      </div>
      <div class="form-check mb-3"><label><input type="checkbox" [(ngModel)]="options.enabled" (ngModelChange)="save()"> {{ t('settings.enabled') }}</label></div>
      <section class="appearance-settings">
        <h4>{{ t('appearance.title') }}</h4>
        <label>{{ t('appearance.presets') }}</label>
        <div class="theme-presets" role="group" [attr.aria-label]="t('appearance.presets')">
          <button type="button" *ngFor="let preset of presets" class="theme-preset" [attr.aria-pressed]="options.backgroundColor === preset.backgroundColor && options.accentColor === preset.accentColor" (click)="applyPreset(preset)">
            <span class="theme-swatch" [style.background]="preset.backgroundColor" [style.borderColor]="preset.accentColor"><span [style.background]="preset.accentColor"></span></span>{{ t(preset.name) }}
          </button>
        </div>
        <div class="appearance-colors">
          <label>{{ t('appearance.background') }}<input type="color" [attr.aria-label]="t('appearance.background')" [(ngModel)]="options.backgroundColor" (ngModelChange)="updatePreview()" (change)="save()"></label>
          <label>{{ t('appearance.accent') }}<input type="color" [attr.aria-label]="t('appearance.accent')" [(ngModel)]="options.accentColor" (ngModelChange)="updatePreview()" (change)="save()"></label>
        </div>
        <div class="form-check mb-3"><label><input type="checkbox" [(ngModel)]="options.glassEffect" (ngModelChange)="save()"> {{ t('appearance.glass') }}</label><small class="text-muted">{{ t('appearance.glassHint') }}</small></div>
        <div class="appearance-sliders">
          <label>{{ t('appearance.barOpacity') }} <output>{{ options.barOpacity }}%</output><input type="range" min="50" max="100" step="1" [attr.aria-label]="t('appearance.barOpacity')" [disabled]="!options.glassEffect" [(ngModel)]="options.barOpacity" (ngModelChange)="updatePreview()" (change)="save()"></label>
          <label>{{ t('appearance.panelOpacity') }} <output>{{ options.panelOpacity }}%</output><input type="range" min="50" max="100" step="1" [attr.aria-label]="t('appearance.panelOpacity')" [disabled]="!options.glassEffect" [(ngModel)]="options.panelOpacity" (ngModelChange)="updatePreview()" (change)="save()"></label>
          <label>{{ t('appearance.blur') }} <output>{{ options.blur }}px</output><input type="range" min="0" max="32" step="1" [attr.aria-label]="t('appearance.blur')" [disabled]="!options.glassEffect" [(ngModel)]="options.blur" (ngModelChange)="updatePreview()" (change)="save()"></label>
        </div>
        <small class="text-muted">{{ t('appearance.hint') }}</small>
        <div class="preview-heading"><span>{{ t('appearance.preview') }}</span><button type="button" class="btn btn-secondary btn-sm" (click)="resetAppearance()">{{ t('appearance.reset') }}</button></div>
        <div #appearancePreview class="appearance-preview">
          <div class="preview-terminal" aria-hidden="true"><span class="preview-prompt">demo@linux:~$</span> uptime<br> 12:08:42 up 3 days, load average: 0.20, 0.34, 0.28<br><br><span class="preview-prompt">demo@linux:~$</span> df -h /<br> Filesystem   Size  Used  Avail  Use%  Mounted on<br> /dev/sda1    100G   28G    67G   30%  /<br><br><span class="preview-prompt">demo@linux:~$</span> <span class="preview-cursor">▌</span></div>
        </div>
        <small class="text-muted">{{ t('appearance.previewHint') }}</small>
      </section>
      <div class="form-group"><label>{{ t('settings.interval') }}</label><input class="form-control" type="number" min="1" max="60" [(ngModel)]="options.interval" (change)="save()"></div>
      <div class="form-group"><label>{{ t('settings.diskInterval') }}</label><input class="form-control" type="number" min="5" max="300" [(ngModel)]="options.diskInterval" (change)="save()"></div>
      <div class="form-group"><label>{{ t('settings.timeout') }}</label><input class="form-control" type="number" min="3" max="30" [(ngModel)]="options.timeout" (change)="save()"></div>
      <div class="form-group"><label>{{ t('settings.interfaces') }}</label><input class="form-control" type="text" [placeholder]="t('settings.interfacesPlaceholder')" [(ngModel)]="options.interfaces" (change)="save()"><small class="text-muted">{{ t('settings.interfacesHint') }}</small></div>
      <div class="form-check mb-3"><label><input type="checkbox" [(ngModel)]="options.pauseWhenHidden" (ngModelChange)="save()"> {{ t('settings.pauseHidden') }}</label><small class="text-muted">{{ t('settings.pauseHint') }}</small></div>
      <h4>{{ t('settings.display') }}</h4>
      <div class="display-options">
        <label><input type="checkbox" [(ngModel)]="options.showHostname" (ngModelChange)="save()"> {{ t('settings.hostname') }}</label>
        <label><input type="checkbox" [(ngModel)]="options.showCPU" (ngModelChange)="save()"> {{ t('settings.cpu') }}</label>
        <label><input type="checkbox" [(ngModel)]="options.showMemory" (ngModelChange)="save()"> {{ t('settings.memory') }}</label>
        <label><input type="checkbox" [(ngModel)]="options.showNetwork" (ngModelChange)="save()"> {{ t('settings.network') }}</label>
        <label><input type="checkbox" [(ngModel)]="options.showDisks" (ngModelChange)="save()"> {{ t('settings.disks') }}</label>
      </div>
      <div class="form-check mb-3"><label><input type="checkbox" [(ngModel)]="options.showVirtualFilesystems" (ngModelChange)="save()"> {{ t('settings.virtual') }}</label></div>
      <p class="text-muted">{{ t('settings.networkNote') }}</p>
      <p class="text-muted">{{ t('settings.sampleNote') }}</p>
      <p *ngIf="error" class="text-danger" role="alert">{{ t('settings.saveError') }}</p>
    `,
    styles: [`:host { display: block; max-width: 720px; } .form-group { margin-bottom: 16px; } .form-control { max-width: 420px; } label { display: block; } input[type=checkbox] { margin-right: 7px; } .form-check { padding-left: 0; } .display-options { display: flex; flex-wrap: wrap; gap: 18px; margin: 16px 0; } small { display: block; margin-top: 6px; } h4 { margin-top: 24px; }
      .appearance-settings { margin: 24px 0; padding-bottom: 24px; border-bottom: 1px solid #8884; }
      .theme-presets { display: flex; flex-wrap: wrap; gap: 8px; margin: 8px 0 18px; }
      .theme-preset { display: flex; align-items: center; gap: 8px; padding: 7px 10px; background: transparent; color: inherit; border: 1px solid #8885; border-radius: 6px; font: inherit; cursor: pointer; }
      .theme-preset[aria-pressed=true] { border-color: currentColor; background: #8882; }
      .theme-preset:focus-visible { outline: 2px solid currentColor; outline-offset: 2px; }
      .theme-swatch { display: grid; place-items: center; width: 28px; height: 22px; border: 1px solid; border-radius: 4px; }
      .theme-swatch span { width: 14px; height: 3px; border-radius: 2px; }
      .appearance-colors { display: flex; flex-wrap: wrap; gap: 24px; margin-bottom: 18px; }
      .appearance-colors label { display: flex; align-items: center; gap: 12px; }
      input[type=color] { width: 46px; height: 30px; padding: 2px; background: transparent; border: 1px solid #8885; border-radius: 4px; cursor: pointer; }
      .appearance-sliders { display: grid; grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); gap: 18px; }
      .appearance-sliders label { min-width: 0; } .appearance-sliders output { float: right; font-variant-numeric: tabular-nums; }
      input[type=range] { display: block; width: 100%; margin-top: 8px; } input:disabled { opacity: .4; }
      .preview-heading { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 12px; margin: 20px 0 10px; }
      .appearance-preview { display: flex; flex-direction: column; position: relative; height: 400px; overflow: hidden; border: 1px solid #8884; border-radius: 8px; background: radial-gradient(ellipse at 8% 95%, #285e6760, transparent 60%), radial-gradient(ellipse at 100% 65%, #61467860, transparent 55%), #111925; }
      .preview-terminal { flex: 1; min-height: 0; padding: 24px 18px; overflow: hidden; white-space: nowrap; color: #b4c2d8; font: 12px/2.2 Consolas, monospace; }
      .preview-prompt { color: #70dabb; } .preview-cursor { color: #8dbbff; }
    `],
})
export class RemoteMonitorSettingsComponent implements AfterViewInit, OnDestroy {
    @ViewChild('appearancePreview', { static: true }) previewHost!: ElementRef<HTMLElement>
    readonly presets = APPEARANCE_PRESETS
    options: MonitorOptions
    error = false
    private localeSubscription: Subscription
    private preview?: AppearancePreview
    private destroyed = false
    constructor (private config: ConfigService, private locale: LocaleService, private changeDetector: ChangeDetectorRef, private zone: NgZone) {
        this.options = normalizeOptions(config.store.remoteMonitor)
        this.localeSubscription = locale.localeChanged$.subscribe(() => { this.updatePreview(); changeDetector.markForCheck() })
    }
    t (key: MessageKey): string { return translate(resolveLanguage(this.options.language, this.locale.getLocale()), key) }
    ngAfterViewInit (): void { this.preview = new AppearancePreview(this.previewHost.nativeElement, this.options, this.locale.getLocale()) }
    ngOnDestroy (): void { this.destroyed = true; this.localeSubscription.unsubscribe(); this.preview?.destroy() }
    updatePreview (): void { this.preview?.configure(normalizeOptions(this.options), this.locale.getLocale()) }
    async applyPreset (preset: typeof APPEARANCE_PRESETS[number]): Promise<void> {
        this.options.backgroundColor = preset.backgroundColor
        this.options.accentColor = preset.accentColor
        await this.save()
    }
    async resetAppearance (): Promise<void> { Object.assign(this.options, DEFAULT_APPEARANCE); await this.save() }
    async save (): Promise<void> {
        this.options = normalizeOptions(this.options)
        this.updatePreview()
        try {
            // Tabby exposes structural sections through getter-only ConfigProxy
            // objects. Write the leaf properties to reach its persisted store.
            Object.assign(this.config.store.remoteMonitor, this.options)
            await this.config.save()
            this.showSaveError(false)
        } catch { this.showSaveError(true) }
    }
    private showSaveError (failed: boolean): void {
        if (this.destroyed) return
        // Native async continuations can run outside Angular's zone.
        this.zone.run(() => { this.error = failed; this.changeDetector.markForCheck() })
    }
}

@Injectable()
export class RemoteMonitorSettingsProvider extends SettingsTabProvider {
    id = 'remote-monitor'
    icon = 'fas fa-chart-line'
    title = 'Remote Monitor'
    getComponentType (): typeof RemoteMonitorSettingsComponent { return RemoteMonitorSettingsComponent }
}
