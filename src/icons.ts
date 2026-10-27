// Small inline SVGs keep icons consistent without depending on Tabby's icon font.
const paths = {
    host: '<rect x="4" y="3" width="16" height="7" rx="2"/><rect x="4" y="14" width="16" height="7" rx="2"/><path d="M8 6.5h.01M8 17.5h.01M12 6.5h4M12 17.5h4"/>',
    cpu: '<rect x="6" y="6" width="12" height="12" rx="2"/><rect x="9" y="9" width="6" height="6" rx="1"/><path d="M9 3v3m6-3v3M9 18v3m6-3v3M3 9h3m-3 6h3m12-6h3m-3 6h3"/>',
    memory: '<rect x="3" y="5" width="18" height="12" rx="2"/><path d="M6 17v3m4-3v3m4-3v3m4-3v3M7 9v4m5-4v4m5-4v4"/>',
    disk: '<path d="m5 4-3 11v4a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-4L19 4Z"/><path d="M2 15h20M6 18h.01M10 18h.01"/>',
    download: '<path d="M12 3v12m-5-5 5 5 5-5M4 16v4h16v-4"/>',
    upload: '<path d="M12 15V3m-5 5 5-5 5 5M4 16v4h16v-4"/>',
    refresh: '<path d="M20 7v5h-5M4 17v-5h5M6.1 6.1A8 8 0 0 1 20 12M4 12a8 8 0 0 0 13.9 5.9"/>',
    pause: '<path d="M8 5v14M16 5v14" stroke-width="3"/>',
    play: '<path d="m8 4 12 8-12 8Z"/>',
    close: '<path d="m6 6 12 12M6 18 18 6"/>',
    chevron: '<path d="m6 15 6-6 6 6"/>',
}

export function icon (name: keyof typeof paths, className = ''): string {
    return `<svg class="icon ${className}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${paths[name]}</svg>`
}
