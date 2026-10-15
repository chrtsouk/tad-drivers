/**
 * The platform sends ISO-8601 timestamps with a "Z". If a value without any zone ever arrives it is UTC, never local time,
 * so a shift timer cannot be off by the phone's UTC offset.
 */
export function parseServerTime(value: string | null | undefined): number | null {
    if (!value) return null;
    let v = String(value).trim();
    if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}/.test(v)) v = v.replace(' ', 'T');
    if (!/(Z|[+-]\d{2}:?\d{2})$/i.test(v)) v += 'Z';
    const ms = Date.parse(v);
    return Number.isNaN(ms) ? null : ms;
}

/** "H:MM:SS" since `sinceIso`; "0:00:00" when the clock is unknown or ahead of the phone. */
export function formatShiftTimer(sinceIso: string | null | undefined, nowMs: number): string {
    const start = parseServerTime(sinceIso);
    if (start === null) return '0:00:00';
    const total = Math.max(0, Math.floor((nowMs - start) / 1000));
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}
