export const CONNECTION_DETAIL_LIMIT = 100

export interface TCPConnection { state: string; local: string; remote: string }
export interface ConnectionSummary {
    total: number
    established: number
    states: Record<string, number>
    entries: TCPConnection[]
}

// Stream the complete socket table into awk, but only transmit bounded details.
// No DNS lookups, process inspection, elevated permissions or remote temp files.
export const CONNECTION_COLLECTOR = `
printf '\\n__TRM_CONNECTIONS__\\n'
{
    if command -v ss >/dev/null 2>&1; then
        ss -H -n -t -a 2>/dev/null && printf '\\nTRM_OK\\n'
    elif command -v netstat >/dev/null 2>&1; then
        netstat -antW 2>/dev/null && printf '\\nTRM_OK\\n'
    fi
} | awk '
    $1 == "TRM_OK" { ok = 1; next }
    NF == 0 || /^Active / || /^Proto / { next }
    {
        if ($1 ~ /^tcp6?$/ && NF >= 6 && $2 ~ /^[0-9]+$/) {
            state = $6; local = $4; remote = $5
        } else if (NF >= 5 && $2 ~ /^[0-9]+$/ && $3 ~ /^[0-9]+$/) {
            state = $1; local = $4; remote = $5
        } else { invalid = 1; next }
        gsub(/-/, "_", state)
        if (state == "ESTAB") state = "ESTABLISHED"
        if (state == "FIN_WAIT_1") state = "FIN_WAIT1"
        if (state == "FIN_WAIT_2") state = "FIN_WAIT2"
        if (state !~ /^[A-Z][A-Z0-9_]*$/ || local !~ /:/ || remote !~ /:/) { invalid = 1; next }
        counts[state]++
        row = "ROW " state " " local " " remote
        if (state == "ESTABLISHED") {
            if (++established <= ${CONNECTION_DETAIL_LIMIT}) active[established] = row
        } else if (++others <= ${CONNECTION_DETAIL_LIMIT}) rest[others] = row
    }
    END {
        if (!ok || invalid) { print "FAILED"; exit }
        for (state in counts) print "COUNT", state, counts[state]
        shown = 0
        for (i = 1; i <= established && shown < ${CONNECTION_DETAIL_LIMIT}; i++) { print active[i]; shown++ }
        for (i = 1; i <= others && shown < ${CONNECTION_DETAIL_LIMIT}; i++) { print rest[i]; shown++ }
        print "OK"
    }
'
`

export function parseConnections (lines: string[] | undefined): ConnectionSummary | undefined {
    if (!lines?.length || lines[lines.length - 1] !== 'OK') return undefined
    const states: Record<string, number> = Object.create(null)
    const entries: TCPConnection[] = []
    for (const line of lines.slice(0, -1)) {
        const count = /^COUNT ([A-Z][A-Z0-9_]*) (\d+)$/.exec(line)
        if (count) {
            const value = Number(count[2])
            if (!Number.isSafeInteger(value) || value <= 0 || states[count[1]] !== undefined) return undefined
            states[count[1]] = value
            continue
        }
        const row = /^ROW ([A-Z][A-Z0-9_]*) (\S+:\S+) (\S+:\S+)$/.exec(line)
        if (!row || entries.length >= CONNECTION_DETAIL_LIMIT) return undefined
        // netstat leaves IPv6 endpoints unbracketed; separate the final port.
        const endpoint = (value: string): string => value[0] !== '[' && value.indexOf(':') !== value.lastIndexOf(':')
            ? `[${value.slice(0, value.lastIndexOf(':'))}]${value.slice(value.lastIndexOf(':'))}` : value
        entries.push({ state: row[1], local: endpoint(row[2]), remote: endpoint(row[3]) })
    }
    const total = Object.values(states).reduce((sum, count) => sum + count, 0)
    if (!Number.isSafeInteger(total) || entries.length !== Math.min(total, CONNECTION_DETAIL_LIMIT)) return undefined
    const seen: Record<string, number> = Object.create(null)
    for (const entry of entries) {
        seen[entry.state] = (seen[entry.state] ?? 0) + 1
        if (!states[entry.state] || seen[entry.state] > states[entry.state]) return undefined
    }
    return { total, established: states.ESTABLISHED ?? 0, states, entries }
}
