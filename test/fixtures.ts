export function sample (options: { time?: number; cpu?: string; rx?: number; tx?: number; disks?: boolean; memory?: string } = {}): string {
    return `a login banner before the protocol
__TRM_BEGIN__
__TRM_HOST__
edge-linux
__TRM_UPTIME__
${options.time ?? 100} 20
__TRM_CPU__
cpu ${options.cpu ?? '100 10 30 800 20 10 10 20 50 10'}
__TRM_MEM__
${options.memory ?? 'MemTotal: 1000000 kB\nMemAvailable: 400000 kB\nSwapTotal: 200000 kB\nSwapFree: 150000 kB'}
__TRM_NET__
Inter-| Receive | Transmit
 face |bytes packets errs drop fifo frame compressed multicast|bytes packets errs drop fifo colls carrier compressed
  lo: 100 1 0 0 0 0 0 0 100 1 0 0 0 0 0 0
eth0: ${options.rx ?? 1000} 1 0 0 0 0 0 0 ${options.tx ?? 2000} 1 0 0 0 0 0 0
docker0: 5000 1 0 0 0 0 0 0 6000 1 0 0 0 0 0 0
__TRM_ROUTE__
Iface Destination Gateway Flags RefCnt Use Metric Mask MTU Window IRTT
docker0 00000000 0100000A 0003 0 0 200 00000000 0 0 0
eth0 00000000 0100000A 0003 0 0 100 00000000 0 0 0
__TRM_LOAD__
0.12 0.24 0.36 1/100 900
${options.disks === false ? '' : `__TRM_MOUNTS__
/dev/sda1 / ext4 rw 0 0
/dev/sdb1 /mnt/my\\040data xfs rw 0 0
tmpfs /run tmpfs rw 0 0
__TRM_DISK__
Filesystem 1024-blocks Used Available Capacity Mounted on
/dev/sda1 1000000 400000 550000 43% /
/dev/sdb1 2000000 1700000 300000 85% /mnt/my data
tmpfs 100000 1000 99000 1% /run
`}__TRM_END__
`
}
