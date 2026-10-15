# TAD Drivers

The driver app for Texas After Dark: assigned drops, navigation, one-tap picked-up / delivered, live GPS, proof of delivery,
cash / earnings, message or call the customer or dispatch. Android + web.

**Status: PARKED, nothing built.** The hub never contained a driver *screen*, only the server side of it, and that has moved to
`../tad-delivery-platform/src/server/driver-api.js`. This folder holds the plan and the contract this app will be written
against. Per the owner (note 20): finish the management app first.

## The contract (what the platform serves to a driver, from the old hub code)

Every call carries `Authorization: Bearer drv_…` (a driver's own key, shown once when the dispatcher makes it; one driver sees only their own run).

| Call | Does |
|---|---|
| `GET  /driver/run` | the driver's run: drops in order, with address, phone, items, note |
| `POST /driver/location` `{lat, lng}` | the last place only (no trail is kept) |
| `POST /driver/deliveries/:id/status` `{status: 'out'\|'delivered'\|'failed', reason?}` | status changes; `failed` needs a reason |
| `GET  /driver/deliveries/:id/messages` | the thread for that drop (marks driver-side read) |
| `POST /driver/deliveries/:id/messages` `{body, audience: 'team'\|'all'}` | write to the office, or to the customer too |

The old rate limit applied (per driver key). The driver is shown the customer's address and phone for their own drops only.

## Plan

See `docs/DELIVERY_SYSTEM_PLAN.md` (Fleetbase "Navigator", Enatega rider app, Traccar for GPS). Needs the research pass first.
