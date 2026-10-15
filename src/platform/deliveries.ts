import type { DriverRun, RunOrder } from './types';

/** The platform order that belongs to a Fleetbase order (the platform stores Fleetbase's public id). */
export function findPlatformOrder(run: DriverRun | null | undefined, fleetbaseOrderId: string | null | undefined): RunOrder | null {
    if (!run || !fleetbaseOrderId) return null;
    return run.orders.find((o) => o.fleetbase_order_id === fleetbaseOrderId) ?? null;
}

/** Delivered / Failed are only offered while the order is out with the driver. */
export function canReportDrop(order: RunOrder | null | undefined): order is RunOrder {
    return Boolean(order && order.state === 'out');
}
