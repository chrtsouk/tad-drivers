export const MAX_PHOTO_BYTES = 3 * 1024 * 1024;

export const FAIL_REASONS = [
    { key: 'no_answer', label: 'No answer' },
    { key: 'wrong_address', label: 'Wrong address' },
    { key: 'customer_refused', label: 'Customer refused' },
    { key: 'other', label: 'Other' },
] as const;

export type FailReasonKey = (typeof FAIL_REASONS)[number]['key'];

export interface FailedInput {
    reason: FailReasonKey | null;
    text?: string;
    /** Raw base64 (no prefix) of a JPEG, or a full `data:image/jpeg;base64,` URL. */
    photo?: string | null;
}

export type FailedBuild = { ok: true; payload: { reason: string; photo?: string } } | { ok: false; error: string };

/** Decoded size in bytes of a base64 string. */
export function base64Bytes(base64: string): number {
    const clean = base64.replace(/\s/g, '');
    const padding = clean.endsWith('==') ? 2 : clean.endsWith('=') ? 1 : 0;
    return Math.floor((clean.length * 3) / 4) - padding;
}

export function toJpegDataUrl(photo: string): string {
    return photo.startsWith('data:') ? photo : `data:image/jpeg;base64,${photo}`;
}

/** Builds the body for POST /driver/orders/:id/failed and enforces the platform's rules (JPEG data URL, at most 3 MB). */
export function buildFailedPayload(input: FailedInput): FailedBuild {
    const entry = FAIL_REASONS.find((r) => r.key === input.reason);
    if (!entry) return { ok: false, error: 'Choose why the delivery failed' };
    const text = String(input.text ?? '').trim();
    if (entry.key === 'other' && !text) return { ok: false, error: 'Tell the shop what happened' };
    const reason = text ? `${entry.label}: ${text}` : entry.label;

    const payload: { reason: string; photo?: string } = { reason };
    if (input.photo) {
        const dataUrl = toJpegDataUrl(input.photo);
        const match = /^data:image\/jpeg;base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
        if (!match) return { ok: false, error: 'The photo must be a JPEG' };
        if (base64Bytes(match[1]) > MAX_PHOTO_BYTES) return { ok: false, error: 'The photo is too big (3 MB at most). Take it again.' };
        payload.photo = dataUrl;
    }
    return { ok: true, payload };
}
