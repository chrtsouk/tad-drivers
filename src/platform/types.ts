/** Shapes returned by the TAD delivery platform `/driver/*` API (see server/app.js `driver` router in tad-delivery-platform). */

export interface DriverMe {
    driver_id: string;
    clocked_in: boolean;
    since: string | null;
    zone: string | null;
}

export interface Shift {
    id?: number;
    driver_id?: string;
    clock_in_at?: string;
    clock_out_at?: string | null;
    zone?: string | null;
}

export interface RunOrder {
    id: number;
    number: string;
    state: string;
    stop_seq: number | null;
    name?: string | null;
    phone?: string | null;
    address?: string | null;
    postcode?: string | null;
    lat?: number | null;
    lng?: number | null;
    notes?: string | null;
    items?: Array<{ name: string; qty: number }>;
    picked_at: string | null;
    fleetbase_order_id?: string | null;
    /** Custom order fields the shop marked "show to driver" (gate code, spice level, ...). */
    custom?: Array<{ label: string; value: string }>;
}

export interface RunBatch {
    id: number;
    status: 'assigned' | 'out' | string;
    return_eta_at?: string | null;
}

export interface DriverRun {
    batch: RunBatch | null;
    orders: RunOrder[];
    next_run_waiting?: boolean;
}

export interface ScanResult {
    ok: boolean;
    order: string;
    remaining: string[];
    all_scanned: boolean;
}

export interface PlatformMessage {
    id: number;
    kind: string;
    title?: string;
    body?: string;
    batchId?: number;
    at?: string;
}

export interface LocationPoint {
    lat: number;
    lng: number;
    /** ISO time the position was taken. */
    at?: string;
}

export interface IncidentPayload {
    type: string;
    note: string;
    order_id?: number;
    /** `data:image/jpeg;base64,...` */
    photo?: string;
}
