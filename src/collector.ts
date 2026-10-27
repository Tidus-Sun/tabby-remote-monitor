export const COLLECTOR_END = '\n__TRM_END__\n'

/** Only static, read-only commands are sent to the remote shell. No user input is interpolated. */
export function collectorCommand (includeDisks: boolean): string {
    const script = `
export LC_ALL=C
if [ "$(uname -s)" != Linux ] || [ ! -r /proc/stat ]; then
    printf '\\n__TRM_UNSUPPORTED__\\n'
    printf '\\n__TRM_END__\\n'
    IFS= read -r trm_ack || :
    exit 0
fi
printf '\\n__TRM_BEGIN__\\n'
printf '__TRM_HOST__\\n'
cat /proc/sys/kernel/hostname
printf '\\n__TRM_UPTIME__\\n'
cat /proc/uptime
printf '\\n__TRM_CPU__\\n'
head -n 1 /proc/stat
printf '\\n__TRM_MEM__\\n'
cat /proc/meminfo
printf '\\n__TRM_NET__\\n'
cat /proc/net/dev
printf '\\n__TRM_ROUTE__\\n'
cat /proc/net/route 2>/dev/null
printf '\\n__TRM_LOAD__\\n'
cat /proc/loadavg
${includeDisks ? `printf '\\n__TRM_MOUNTS__\\n'
cat /proc/mounts
printf '\\n__TRM_DISK__\\n'
df -kP -l 2>/dev/null || printf '\\n__TRM_DISK_FAILED__\\n'
` : ''}printf '\\n__TRM_END__\\n'
# Keep the channel alive until the client has received the whole frame and
# closes stdin. This avoids native EOF/close callbacks overtaking queued data.
IFS= read -r trm_ack || :
`
    // Force POSIX sh even when the user's login shell is fish/csh.
    return "sh -c '" + script.replace(/'/g, "'\\''") + "'"
}
