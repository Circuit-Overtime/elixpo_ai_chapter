# Real-Time Collaboration with Durable Objects

LixSketch uses Cloudflare Durable Objects for real-time collaboration. Each canvas room is a single Durable Object instance that coordinates all connected users via WebSockets.

## Why Durable Objects?

Traditional WebSocket servers have a problem: if you have multiple server instances, you need a pub/sub layer (Redis, NATS, etc.) to broadcast messages between them. Durable Objects solve this by guaranteeing that **all connections to a room are handled by a single instance**.

This means:
- No external pub/sub needed
- No message ordering issues
- State is always consistent
- Automatic scaling per room

## The Architecture

When a user joins `/room/{roomId}`:

1. **WebSocket upgrade** — the browser opens a WebSocket to the Cloudflare Worker
2. **Routing** — the Worker routes the connection to the Durable Object for that `roomId`
3. **State sync** — the DO sends the current canvas state to the new user
4. **Broadcasting** — any change from one user is broadcast to all others in the room

```lixscript
// WebSocket Collaboration Architecture
$blue = #4A90D9
$green = #2ECC71
$orange = #E67E22
$gray = #e0e0e0
$teal = #1ABC9C

rect user1 at 50, 50 size 140x50 {
  stroke: $blue
  label: "User A"
}

rect user2 at 50, 150 size 140x50 {
  stroke: $blue
  label: "User B"
}

rect user3 at 50, 250 size 140x50 {
  stroke: $blue
  label: "User C"
}

rect worker at 280, 130 size 160x70 {
  stroke: $orange
  label: "CF Worker"
}

rect durable at 530, 130 size 180x70 {
  stroke: $green
  label: "Durable Object"
}

rect state at 530, 270 size 180x50 {
  stroke: $teal
  label: "Room State"
}

arrow a1 from user1.right to worker.left {
  stroke: $gray
  label: "WS"
}

arrow a2 from user2.right to worker.left {
  stroke: $gray
  label: "WS"
}

arrow a3 from user3.right to worker.left {
  stroke: $gray
  label: "WS"
}

arrow a4 from worker.right to durable.left {
  stroke: $orange
  label: "Route by roomId"
}

arrow a5 from durable.bottom to state.top {
  stroke: $teal
  label: "Read/Write"
}
```

## Message Protocol

Each WebSocket message is a JSON object with a `type` field:

- `join` — user enters the room (includes guest profile)
- `leave` — user disconnects
- `sync` — full state snapshot (sent to new joiners)
- `delta` — incremental change (shape added/moved/deleted)
- `cursor` — cursor position update (throttled to 60fps)
- `presence` — list of active users in the room

Deltas are the key to performance. Instead of sending the full canvas state on every change, we send only what changed:

```json
{
  "type": "delta",
  "action": "move",
  "shapeId": "rect-abc123",
  "data": { "x": 150, "y": 200 }
}
```

## Conflict Resolution

Since all messages go through a single Durable Object, ordering is guaranteed. The DO processes messages sequentially, so there are no conflicts. If two users move the same shape simultaneously, the last write wins — which is the expected behavior for a visual canvas.

## Presence & Cursors

Each user's cursor position is broadcast to the room at up to 60fps. The Durable Object doesn't persist cursor data — it's ephemeral, only forwarded to other connected users.

User presence (who's in the room) is tracked by the DO and broadcast whenever someone joins or leaves.
