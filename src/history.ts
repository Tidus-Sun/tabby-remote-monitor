import { clampPercent } from './metrics'

export const CPU_HISTORY_WINDOW = 60000
export interface CPUHistoryPoint { time: number; value: number | null }

export function appendCPUHistory (history: CPUHistoryPoint[], time: number, value: number | null): CPUHistoryPoint[] {
    const last = history[history.length - 1]
    // Clock rollback starts a new timeline; duplicate timestamps replace the last sample.
    const previous = last && time < last.time ? [] : history
    return [...previous.filter(point => point.time >= time - CPU_HISTORY_WINDOW && point.time < time).slice(-599), {
        time, value: value !== null && Number.isFinite(value) ? clampPercent(value) : null,
    }]
}

/** Null marks a real sampling interruption. A slow successful sample is still valid:
 * CPU usage is computed from the counters across the actual elapsed interval. */
export function cpuHistorySegments (history: CPUHistoryPoint[], end: number): CPUHistoryPoint[][] {
    const segments: CPUHistoryPoint[][] = []
    let segment: CPUHistoryPoint[] = []
    for (const point of history) {
        if (point.time < end - CPU_HISTORY_WINDOW || point.time > end) continue
        if (point.value === null) { segment = []; continue }
        if (!segment.length) {
            segment = []
            segments.push(segment)
        }
        segment.push(point)
    }
    return segments
}
