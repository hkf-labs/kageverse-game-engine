// TS types mirror Go realtime domain ở kageverse-server/internal/modules/realtime/domain.
// Khi BE đổi shape thì sync ở đây — không có codegen tự động.
//
// Tham chiếu: docs/api/realtime.md ở repo BE.

export type RealtimeDirection = 'left' | 'right';

export type CharStatsReason =
    | 'use_item'
    | 'respawn'
    | 'retaliation'
    | 'heal'
    | 'level_up';

// Inbound (client → server)

export type JoinMapPayload = {
    map_id: string;
    x: number;
    y: number;
    dir: RealtimeDirection;
};

export type MovePayload = {
    x: number;
    y: number;
    dir: RealtimeDirection;
};

// Outbound: personal channel

export type CharStatsPayload = {
    current_hp: number;
    max_hp: number;
    current_mp: number;
    max_mp: number;
    /** Optional — chỉ set khi reason đụng EXP (retaliation, level_up). */
    exp?: number;
    /** Optional — đi cùng exp. */
    exp_to_next_level?: number;
    reason: CharStatsReason;
};

export type CharLevelUpPayload = {
    from_level: number;
    to_level: number;
    new_max_hp: number;
    new_max_mp: number;
    new_min_attack: number;
    new_max_attack: number;
    new_defense: number;
    current_hp: number;
    current_mp: number;
};

export type SnapshotPositionPayload = {
    x: number;
    y: number;
};

export type PlayerSelfPayload = {
    character_id: string;
    x: number;
    y: number;
    dir: RealtimeDirection;
};

// AppearancePayload — sprite key cho từng layer body. BE để rỗng cho MVP
// (FE fallback default sprites). Tương lai equipment system populate dựa
// trên equipped items: helmet → head, armor → top, pants → bottom, weapon
// → weapon. Field optional ở JSON (omitempty BE-side).
export type AppearancePayload = {
    head_sprite_key?: string;
    top_sprite_key?: string;
    bottom_sprite_key?: string;
    weapon_sprite_key?: string;
};

export type PlayerPresencePayload = {
    character_id: string;
    display_name: string;
    class: string;
    level: number;
    gender: string;
    costume_primary_color: string;
    /** Optional — empty object hoặc thiếu field → FE dùng default body sprites. */
    appearance?: AppearancePayload;
    x: number;
    y: number;
    dir: RealtimeDirection;
};

export type MapSnapshotPayload = {
    map_id: string;
    you: PlayerSelfPayload;
    others: PlayerPresencePayload[];
};

// Outbound: room broadcast

export type PlayerMovedPayload = {
    character_id: string;
    x: number;
    y: number;
    dir: RealtimeDirection;
    /** Server unix ms — dùng để discard out-of-order packet. */
    ts: number;
};

export type PlayerLeftPayload = {
    character_id: string;
};

// Errors / system

export type ErrorPayload = {
    code: number;
    msg_key: string;
    request_event?: string;
};

// Envelope

export type ClientEvent =
    | { t: 'join_map'; p: JoinMapPayload }
    | { t: 'leave_map'; p: Record<string, never> }
    | { t: 'move'; p: MovePayload }
    | { t: 'ping'; p: Record<string, never> };

export type ServerEvent =
    | { t: 'char_stats'; p: CharStatsPayload }
    | { t: 'char_level_up'; p: CharLevelUpPayload }
    | { t: 'snapshot_position'; p: SnapshotPositionPayload }
    | { t: 'map_snapshot'; p: MapSnapshotPayload }
    | { t: 'player_joined'; p: PlayerPresencePayload }
    | { t: 'player_moved'; p: PlayerMovedPayload }
    | { t: 'player_left'; p: PlayerLeftPayload }
    | { t: 'pong'; p: Record<string, never> }
    | { t: 'error'; p: ErrorPayload };

export type ServerEventType = ServerEvent['t'];

// Error codes — mirror BE constants. Khớp internal/modules/realtime/domain/errors.go.
export const REALTIME_ERROR_CODES = {
    INVALID_ENVELOPE: 150001,
    UNKNOWN_EVENT_TYPE: 150002,
    SESSION_REPLACED: 150010,
    UNAUTHORIZED: 150011,
    CHARACTER_NOT_FOUND: 150012,
    OUT_OF_BOUNDS: 150020,
    MAX_SPEED_EXCEEDED: 150021,
    MAP_LOCKED: 150022,
    NOT_IN_MAP: 150030,
    SEND_BUFFER_FULL: 150040,
    INTERNAL: 150099,
} as const;

// WS application close codes — khớp BE.
export const REALTIME_CLOSE_CODES = {
    AUTH_FAILED: 4001,
    SESSION_REPLACED: 4010,
    SERVER_SHUTDOWN: 4030,
} as const;
