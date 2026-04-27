import { getMockMapDetail } from '../features/maps';
import type { MapDetail } from '../features/maps';
export type { MapDetail, Vec2 } from '../features/maps';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8080/api/v1';
const TRACE_ID_HEADER = 'X-Trace-Id';

const ACCESS_TOKEN_KEY = 'kageverse_jwt';
const REFRESH_TOKEN_KEY = 'kageverse_refresh';

export function getAccessToken(): string | null {
    return localStorage.getItem(ACCESS_TOKEN_KEY);
}

function getRefreshToken(): string | null {
    return localStorage.getItem(REFRESH_TOKEN_KEY);
}

export function setTokens(accessToken: string, refreshToken?: string): void {
    localStorage.setItem(ACCESS_TOKEN_KEY, accessToken);
    if (refreshToken) localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
}

export function clearTokens(): void {
    localStorage.removeItem(ACCESS_TOKEN_KEY);
    localStorage.removeItem(REFRESH_TOKEN_KEY);
}

function createTraceId(): string {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        return crypto.randomUUID();
    }
    return `trace-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function buildHeaders(extra: Record<string, string> = {}): Headers {
    const headers = new Headers(extra);
    if (!headers.has(TRACE_ID_HEADER)) {
        headers.set(TRACE_ID_HEADER, createTraceId());
    }
    return headers;
}

async function parseJsonSafe(response: Response): Promise<unknown> {
    const text = await response.text();
    if (!text) return {};
    try {
        return JSON.parse(text);
    } catch {
        return {};
    }
}

function asRecord(value: unknown): Record<string, unknown> | null {
    return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null;
}

function extractTraceId(response: Response, fallbackHeaders?: Headers): string {
    return (
        response.headers.get(TRACE_ID_HEADER) ||
        fallbackHeaders?.get(TRACE_ID_HEADER) ||
        ''
    );
}

export function formatApiError(resData: unknown, fallback: string): string {
    const data = asRecord(resData);
    const err = data ? asRecord(data.error) : null;
    if (!err) return fallback;
    if (typeof err.message_key === 'string') return err.message_key;
    if (Array.isArray(err.field_errors) && err.field_errors.length > 0) {
        const fe = asRecord(err.field_errors[0]);
        if (!fe) return fallback;
        if (typeof fe.message_key === 'string') return fe.message_key;
        if (typeof fe.field === 'string' && typeof fe.code === 'string') return `${fe.field}: ${fe.code}`;
    }
    return fallback;
}

let refreshInFlight: Promise<string> | null = null;

async function refreshAccessToken(): Promise<string> {
    if (refreshInFlight) return refreshInFlight;

    refreshInFlight = (async () => {
        const refresh = getRefreshToken();
        if (!refresh) throw new Error('auth.error.no_refresh_token');

        const headers = buildHeaders({ 'Content-Type': 'application/json' });
        const response = await fetch(`${API_BASE_URL}/auth/refresh`, {
            method: 'POST',
            headers,
            body: JSON.stringify({ refresh_token: refresh }),
        });

        if (!response.ok) {
            throw new Error('auth.error.refresh_failed');
        }

        const data = (await parseJsonSafe(response)) as { access_token?: string; refresh_token?: string };
        if (!data.access_token) throw new Error('auth.error.refresh_failed');
        setTokens(data.access_token, data.refresh_token);
        return data.access_token;
    })();

    try {
        return await refreshInFlight;
    } finally {
        refreshInFlight = null;
    }
}

async function authFetch(
    path: string,
    init: { method?: string; body?: BodyInit | null; headers?: Record<string, string> } = {},
): Promise<{ response: Response; traceId: string }> {
    const token = getAccessToken();
    if (!token) throw new Error('Chưa đăng nhập');

    const doFetch = async (accessToken: string) => {
        const headers = buildHeaders({
            ...(init.headers || {}),
            Authorization: `Bearer ${accessToken}`,
        });
        const response = await fetch(`${API_BASE_URL}${path}`, {
            method: init.method,
            headers,
            body: init.body,
        });
        return { response, headers };
    };

    let result = await doFetch(token);

    if (result.response.status === 401) {
        try {
            const newToken = await refreshAccessToken();
            result = await doFetch(newToken);
        } catch {
            clearTokens();
            throw new Error('auth.error.unauthorized');
        }
    }

    return {
        response: result.response,
        traceId: extractTraceId(result.response, result.headers),
    };
}

export function logout(): void {
    clearTokens();
}

export type SupportedCountry = { country_code: string; preferred_language: string };

export const authAPI = {
    async supportedCountries(): Promise<SupportedCountry[]> {
        const headers = buildHeaders();
        const response = await fetch(`${API_BASE_URL}/auth/supported-countries`, { headers });
        const resData = await parseJsonSafe(response);
        const traceId = extractTraceId(response, headers);
        if (!response.ok) {
            throw new Error(`${formatApiError(resData, 'Không tải được danh sách quốc gia')} (trace_id=${traceId || 'n/a'})`);
        }
        const data = asRecord(resData);
        const list = data?.countries;
        return Array.isArray(list) ? list : [];
    },

    async register(data: { username: string; email: string; password: string; country_code: string }) {
        const headers = buildHeaders({ 'Content-Type': 'application/json' });
        const response = await fetch(`${API_BASE_URL}/auth/register`, {
            method: 'POST',
            headers,
            body: JSON.stringify(data),
        });
        const resData = await parseJsonSafe(response);
        const traceId = extractTraceId(response, headers);
        if (!response.ok) {
            throw new Error(`${formatApiError(resData, 'Đăng ký thất bại')} (trace_id=${traceId || 'n/a'})`);
        }
        return resData as {
            user: Record<string, unknown>;
            access_token: string;
            refresh_token?: string;
        };
    },

    async login(data: { identifier: string; password: string }) {
        const headers = buildHeaders({ 'Content-Type': 'application/json' });
        const response = await fetch(`${API_BASE_URL}/auth/login`, {
            method: 'POST',
            headers,
            body: JSON.stringify(data),
        });
        const resData = await parseJsonSafe(response);
        const traceId = extractTraceId(response, headers);
        if (!response.ok) {
            throw new Error(`${formatApiError(resData, 'Đăng nhập thất bại')} (trace_id=${traceId || 'n/a'})`);
        }
        return resData as {
            user: Record<string, unknown>;
            access_token: string;
            refresh_token?: string;
        };
    },
};

export type ActiveFoodBuffDTO = {
    item_template_id: string;
    started_at: string;
    expires_at: string;
};

export type CharacterDTO = {
    id: string;
    user_id: string;
    display_name: string;
    gender: string;
    costume_primary_color: string;
    level: number;
    class: string;
    current_hp: number;
    max_hp: number;
    current_mp: number;
    max_mp: number;
    min_attack: number;
    max_attack: number;
    defense: number;
    coin: number;
    gold: number;
    gem: number;
    active_food_buff: ActiveFoodBuffDTO | null;
    created_at: string;
};

export type ListCharactersResponse = {
    characters: CharacterDTO[];
    max_characters_per_user: number;
};

export type CreateCharacterPayload = {
    display_name: string;
    gender: 'male' | 'female';
    costume_primary_color: 'blue' | 'red';
};

export type WalletDTO = {
    character_id: string;
    coin: number;
    gold: number;
    gem: number;
};

export const charactersAPI = {
    async list(): Promise<ListCharactersResponse> {
        const { response, traceId } = await authFetch('/characters');
        const resData = await parseJsonSafe(response);
        if (!response.ok) {
            throw new Error(`${formatApiError(resData, 'Không tải được nhân vật')} (trace_id=${traceId || 'n/a'})`);
        }
        return resData as ListCharactersResponse;
    },

    async create(payload: CreateCharacterPayload): Promise<{ character: CharacterDTO; max_characters_per_user: number }> {
        const { response, traceId } = await authFetch('/characters', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });
        const resData = await parseJsonSafe(response);
        if (!response.ok) {
            throw new Error(`${formatApiError(resData, 'Tạo nhân vật thất bại')} (trace_id=${traceId || 'n/a'})`);
        }
        return resData as { character: CharacterDTO; max_characters_per_user: number };
    },

    async getWallet(characterId: string): Promise<WalletDTO> {
        const { response, traceId } = await authFetch(`/characters/${encodeURIComponent(characterId)}/wallet`);
        const resData = await parseJsonSafe(response);
        if (!response.ok) {
            throw new Error(`${formatApiError(resData, 'Không tải được ví tiền')} (trace_id=${traceId || 'n/a'})`);
        }
        return resData as WalletDTO;
    },
};

export type InventoryItemType = 'equipment' | 'consumable' | 'material' | 'quest';

export type InventoryItemDTO = {
    id: string;
    slot_index: number | null;
    item_template_id: string;
    name_key: string;
    item_type: InventoryItemType;
    sub_type: string | null;
    sprite_key: string;
    amount: number;
    max_stack: number;
    upgrade_level: number;
    durability: number | null;
    is_bound: boolean;
    expires_at: string | null;
};

export type ListInventoryResponse = {
    character_id: string;
    max_slots: number;
    used_slots: number;
    items: InventoryItemDTO[];
};

export type CharacterStatsSnapshot = {
    current_hp: number;
    max_hp: number;
    current_mp: number;
    max_mp: number;
    hp_potion_cd_until: string | null;
    mp_potion_cd_until: string | null;
};

export type FoodBuffStartedDTO = {
    item_template_id: string;
    started_at: string;
    expires_at: string;
    heal_hp_per_sec: number;
    heal_mp_per_sec: number;
    previous_buff_overridden: string | null;
};

export type UseInventoryEffects = {
    hp_delta?: number;
    mp_delta?: number;
    buff_added?: unknown;
    food_buff_started?: FoodBuffStartedDTO;
};

export type UseInventoryResponse = {
    user_item: { id: string; slot_index: number | null; amount: number } | null;
    effects: UseInventoryEffects | null;
    character_stats: CharacterStatsSnapshot | null;
};

export type DropInventoryResponse = {
    dropped: { user_item_id: string; amount: number };
    remaining_amount: number;
};

export type MoveInventoryResponse = {
    merged: boolean;
    from: { slot_index: number; user_item_id: string | null; amount?: number };
    to: { slot_index: number; user_item_id: string | null; amount?: number };
};

export const inventoryAPI = {
    async list(characterId: string): Promise<ListInventoryResponse> {
        const { response, traceId } = await authFetch(`/characters/${encodeURIComponent(characterId)}/inventory`);
        const resData = await parseJsonSafe(response);
        if (!response.ok) {
            throw new Error(`${formatApiError(resData, 'Không tải được túi đồ')} (trace_id=${traceId || 'n/a'})`);
        }
        return resData as ListInventoryResponse;
    },

    async use(characterId: string, userItemId: string, amount = 1): Promise<UseInventoryResponse> {
        const { response, traceId } = await authFetch(`/characters/${encodeURIComponent(characterId)}/inventory/use`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ user_item_id: userItemId, amount }),
        });
        const resData = await parseJsonSafe(response);
        if (!response.ok) {
            throw new Error(`${formatApiError(resData, 'Sử dụng vật phẩm thất bại')} (trace_id=${traceId || 'n/a'})`);
        }
        return resData as UseInventoryResponse;
    },

    async drop(characterId: string, userItemId: string, amount?: number): Promise<DropInventoryResponse> {
        const body: Record<string, unknown> = { user_item_id: userItemId };
        if (typeof amount === 'number') body.amount = amount;
        const { response, traceId } = await authFetch(`/characters/${encodeURIComponent(characterId)}/inventory/drop`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });
        const resData = await parseJsonSafe(response);
        if (!response.ok) {
            throw new Error(`${formatApiError(resData, 'Vứt vật phẩm thất bại')} (trace_id=${traceId || 'n/a'})`);
        }
        return resData as DropInventoryResponse;
    },

    async move(characterId: string, fromSlot: number, toSlot: number, mergeWhenPossible = true): Promise<MoveInventoryResponse> {
        const { response, traceId } = await authFetch(`/characters/${encodeURIComponent(characterId)}/inventory/move`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ from_slot: fromSlot, to_slot: toSlot, merge_when_possible: mergeWhenPossible }),
        });
        const resData = await parseJsonSafe(response);
        if (!response.ok) {
            throw new Error(`${formatApiError(resData, 'Sắp xếp slot thất bại')} (trace_id=${traceId || 'n/a'})`);
        }
        return resData as MoveInventoryResponse;
    },
};

export const mapsAPI = {
    async getDetail(mapId: string): Promise<MapDetail> {
        return getMockMapDetail(mapId);
    },
};

// ----- NPC Interaction -----

export type NpcActionDTO = {
    action: string;
    label_key: string;
};

export type NpcInteractResponse = {
    map_id: string;
    npc_template_id: string;
    npc_type: string;
    display_name_key: string;
    sprite_key: string;
    scope: string;
    default_dialogue_key: string | null;
    position: { x: number; y: number };
    is_hidden: boolean;
    available_actions: NpcActionDTO[];
};

export const npcAPI = {
    async getInteract(mapId: string, npcTemplateId: string): Promise<NpcInteractResponse> {
        const path = `/maps/${encodeURIComponent(mapId)}/npcs/${encodeURIComponent(npcTemplateId)}`;
        const { response, traceId } = await authFetch(path);
        const resData = await parseJsonSafe(response);
        if (!response.ok) {
            throw new Error(`${formatApiError(resData, 'Không tải được NPC')} (trace_id=${traceId || 'n/a'})`);
        }
        return resData as NpcInteractResponse;
    },
};

// ----- Shop -----

export type ShopCurrencyType = 'coin' | 'gold' | 'gem';

export type ShopPriceDTO = {
    currency_type: ShopCurrencyType;
    price: number;
    stock_remaining: number | null;
};

export type ShopListingDTO = {
    item_template_id: string;
    name_key: string;
    item_type: InventoryItemType;
    sub_type: string | null;
    sprite_key: string;
    required_level: number;
    max_stack: number;
    prices: ShopPriceDTO[];
    base_stats: Record<string, number> | null;
};

export type ShopListResponse = {
    map_id: string;
    npc_template_id: string;
    npc_type: string;
    display_name_key: string;
    items: ShopListingDTO[];
};

export type ShopBuyPayload = {
    map_id: string;
    npc_template_id: string;
    item_template_id: string;
    currency_type: ShopCurrencyType;
    amount: number;
};

export type ShopBuyResponse = {
    purchased: {
        item_template_id: string;
        amount: number;
        user_item_id: string;
    };
    currency: {
        type: ShopCurrencyType;
        spent: number;
        balance_after: number;
    };
    stock_remaining: number | null;
};

export const shopAPI = {
    async list(mapId: string, npcTemplateId: string): Promise<ShopListResponse> {
        const path = `/maps/${encodeURIComponent(mapId)}/npcs/${encodeURIComponent(npcTemplateId)}/shop`;
        const { response, traceId } = await authFetch(path);
        const resData = await parseJsonSafe(response);
        if (!response.ok) {
            throw new Error(`${formatApiError(resData, 'Không tải được shop')} (trace_id=${traceId || 'n/a'})`);
        }
        return resData as ShopListResponse;
    },

    async buy(characterId: string, payload: ShopBuyPayload): Promise<ShopBuyResponse> {
        const { response, traceId } = await authFetch(`/characters/${encodeURIComponent(characterId)}/shop/buy`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });
        const resData = await parseJsonSafe(response);
        if (!response.ok) {
            throw new Error(`${formatApiError(resData, 'Mua hàng thất bại')} (trace_id=${traceId || 'n/a'})`);
        }
        return resData as ShopBuyResponse;
    },
};
