import { base64Bytes, MAX_PHOTO_BYTES, toJpegDataUrl } from './failure';
import type { IncidentPayload } from './types';

/** Fallback list, used until the platform's own list (GET /driver/incident-types) has been fetched. Keys must match the platform. */
export const DEFAULT_INCIDENT_TYPES: Record<string, string> = {
    customer_unavailable: 'Customer not available',
    wrong_address: 'Wrong or unreachable address',
    customer_conduct: 'Rude or aggressive customer',
    order_problem: 'Problem with the order (missing, damaged, wrong)',
    vehicle: 'Vehicle problem',
    accident: 'Accident or injury',
    safety: 'Safety concern',
    other: 'Other',
};

export interface IncidentInput {
    type: string | null;
    note: string;
    orderId?: number | null;
    photo?: string | null;
}

export type IncidentBuild = { ok: true; payload: IncidentPayload } | { ok: false; error: string };

/** Builds the body for POST /driver/incidents and enforces the platform's rules (note needed, JPEG, at most 3 MB). */
export function buildIncidentPayload(input: IncidentInput, types: Record<string, string> = DEFAULT_INCIDENT_TYPES): IncidentBuild {
    if (!input.type || !types[input.type]) return { ok: false, error: 'Choose what kind of incident it is' };
    const note = String(input.note ?? '').trim();
    if (!note) return { ok: false, error: 'Write what happened' };
    if (note.length > 1000) return { ok: false, error: 'The note is too long (1000 characters at most)' };
    const payload: IncidentPayload = { type: input.type, note };
    if (input.orderId != null) payload.order_id = input.orderId;
    if (input.photo) {
        const dataUrl = toJpegDataUrl(input.photo);
        const match = /^data:image\/jpeg;base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
        if (!match) return { ok: false, error: 'The photo must be a JPEG' };
        if (base64Bytes(match[1]) > MAX_PHOTO_BYTES) return { ok: false, error: 'The photo is too big (3 MB at most). Take it again.' };
        payload.photo = dataUrl;
    }
    return { ok: true, payload };
}
