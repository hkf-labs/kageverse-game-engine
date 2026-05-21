import { getMockMapDetail } from '../features/maps';
import type { MapDetail } from '../features/maps';
import { t } from '../i18n';
import { normalizeLootDrops } from './lootDrop';
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
    if (!token) throw new Error(t('api.error.not_logged_in'));

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
            throw new Error(`${formatApiError(resData, t('api.error.load_countries'))} (trace_id=${traceId || 'n/a'})`);
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
            throw new Error(`${formatApiError(resData, t('api.error.register'))} (trace_id=${traceId || 'n/a'})`);
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
            throw new Error(`${formatApiError(resData, t('api.error.login'))} (trace_id=${traceId || 'n/a'})`);
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
    exp: number;
    exp_to_next_level: number;
    class: string;
    death_state: 'alive' | 'dead' | 'spectating';
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
    last_map_id: string | null;
    last_pos_x: number | null;
    last_pos_y: number | null;
    /**
     * Cờ bypass map gating cho tài khoản test/QA. Khi true, FE bỏ qua mọi
     * điều kiện mở khoá portal (quest, level, ...) — flip thủ công ở DB.
     */
    unlock_all_maps: boolean;
    /**
     * Danh sách map_id character đã unlock thật (theo quest progress).
     * Default chỉ ['village_001']. Q1 on_accept thêm 3 farm path đầu
     * ('village_to_fire_001' + 'village_to_wind_001' + 'village_to_ice_001');
     * Q9 thêm 'fire_to_village004_001'. FE dùng để lock portal đến map chưa unlock.
     */
    unlocked_maps: string[];
    last_seen_at: string;
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
            throw new Error(`${formatApiError(resData, t('api.error.load_characters'))} (trace_id=${traceId || 'n/a'})`);
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
            throw new Error(`${formatApiError(resData, t('api.error.create_character'))} (trace_id=${traceId || 'n/a'})`);
        }
        return resData as { character: CharacterDTO; max_characters_per_user: number };
    },

    async getWallet(characterId: string): Promise<WalletDTO> {
        const { response, traceId } = await authFetch(`/characters/${encodeURIComponent(characterId)}/wallet`);
        const resData = await parseJsonSafe(response);
        if (!response.ok) {
            throw new Error(`${formatApiError(resData, t('api.error.load_wallet'))} (trace_id=${traceId || 'n/a'})`);
        }
        return resData as WalletDTO;
    },

    /**
     * Lưu tọa độ + map cuối cùng. `keepalive=true` cho phép request sống tiếp khi
     * tab bị F5 / đóng — dùng cho beforeunload listener.
     * Trả 204 No Content khi thành công.
     */
    async savePosition(
        characterId: string,
        payload: { map_id: string; x: number; y: number },
        opts?: { keepalive?: boolean },
    ): Promise<void> {
        const token = getAccessToken();
        if (!token) return; // chưa login → bỏ qua, không throw để không cản unload.
        const url = `${API_BASE_URL}/characters/${encodeURIComponent(characterId)}/position`;
        const headers = buildHeaders({
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
        });
        await fetch(url, {
            method: 'POST',
            headers,
            body: JSON.stringify(payload),
            keepalive: opts?.keepalive ?? false,
        });
        // Không parse response — fire-and-forget. Lỗi network sẽ được throw bên dưới.
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
    upgrade_category: 'weapon' | 'jewelry' | 'apparel' | null;
    durability: number | null;
    is_bound: boolean;
    is_equipped: boolean;
    equipped_slot: string | null;
    base_stats: Record<string, number> | null;
    rolled_stats: Record<string, number> | null;
    expires_at: string | null;
};

export type EquippedItemDTO = {
    slot: string;
    item: InventoryItemDTO;
};

export type EquipResponse = {
    equipped: EquippedItemDTO;
    replaced: EquippedItemDTO | null;
};

export type UnequipResponse = {
    unequipped: EquippedItemDTO;
};

export type ListEquippedResponse = {
    character_id: string;
    items: EquippedItemDTO[];
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

export type TeleportCharmDestinationDTO = {
    map_id: string;
    display_name_key: string;
    category: string;
    is_unlocked: boolean;
};

export type TeleportCharmCategoryDTO = {
    category: string;
    label_key: string;
    destinations: TeleportCharmDestinationDTO[];
};

export type TeleportCharmMenuDTO = {
    categories: TeleportCharmCategoryDTO[];
};

export type TeleportCompletedDTO = {
    map_id: string;
    display_name_key: string;
    category: string;
};

/** Payload tuỳ chọn khi POST /inventory/use (hiện: Bùa Dịch Chuyển bước 2). */
export type UseItemParams = {
    type: 'teleport_hub_map';
    map_id: string;
};

export type UseInventoryEffects = {
    hp_delta?: number;
    mp_delta?: number;
    buff_added?: unknown;
    food_buff_started?: FoodBuffStartedDTO;
    /** Set khi item là Bí Kíp Kỹ Năng (sub_type=skill_book) đã consume thành
     * công. actions liệt kê grant_skill action với skill_id mới học. FE trigger
     * animation + auto-assign vào skill hotbar slot trống. */
    skill_learned?: SkillLearnedEffect;
    /** Bùa Dịch Chuyển — bước 1: mở menu Làng / Trường (chưa tiêu Bùa). */
    teleport_charm_menu?: TeleportCharmMenuDTO;
    /** Bùa Dịch Chuyển — bước 2: đã tiêu Bùa, FE chuyển scene tới map_id. */
    teleport_completed?: TeleportCompletedDTO;
};

export type SkillLearnedEffect = {
    actions: Array<{
        type: string;
        params: Record<string, unknown> & { skill_id?: string };
    }>;
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
            throw new Error(`${formatApiError(resData, t('api.error.load_inventory'))} (trace_id=${traceId || 'n/a'})`);
        }
        return resData as ListInventoryResponse;
    },

    async use(
        characterId: string,
        userItemId: string,
        amount = 1,
        params?: UseItemParams,
    ): Promise<UseInventoryResponse> {
        const body: Record<string, unknown> = { user_item_id: userItemId, amount };
        if (params) body.params = params;
        const { response, traceId } = await authFetch(`/characters/${encodeURIComponent(characterId)}/inventory/use`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });
        const resData = await parseJsonSafe(response);
        if (!response.ok) {
            throw new Error(`${formatApiError(resData, t('api.error.use_item'))} (trace_id=${traceId || 'n/a'})`);
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
            throw new Error(`${formatApiError(resData, t('api.error.drop_item'))} (trace_id=${traceId || 'n/a'})`);
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
            throw new Error(`${formatApiError(resData, t('api.error.sort_slots'))} (trace_id=${traceId || 'n/a'})`);
        }
        return resData as MoveInventoryResponse;
    },

    async equip(characterId: string, userItemId: string, slot: string): Promise<EquipResponse> {
        const { response, traceId } = await authFetch(`/characters/${encodeURIComponent(characterId)}/inventory/equip`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ user_item_id: userItemId, slot }),
        });
        const resData = await parseJsonSafe(response);
        if (!response.ok) {
            throw new Error(`${formatApiError(resData, t('api.error.equip'))} (trace_id=${traceId || 'n/a'})`);
        }
        return resData as EquipResponse;
    },

    async unequip(characterId: string, slot: string): Promise<UnequipResponse> {
        const { response, traceId } = await authFetch(`/characters/${encodeURIComponent(characterId)}/inventory/unequip`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ slot }),
        });
        const resData = await parseJsonSafe(response);
        if (!response.ok) {
            throw new Error(`${formatApiError(resData, t('api.error.unequip'))} (trace_id=${traceId || 'n/a'})`);
        }
        return resData as UnequipResponse;
    },

    async listEquipped(characterId: string): Promise<ListEquippedResponse> {
        const { response, traceId } = await authFetch(`/characters/${encodeURIComponent(characterId)}/inventory/equipped`);
        const resData = await parseJsonSafe(response);
        if (!response.ok) {
            throw new Error(`${formatApiError(resData, t('api.error.load_equipped'))} (trace_id=${traceId || 'n/a'})`);
        }
        return resData as ListEquippedResponse;
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

export type TeleportDestinationDTO = {
    map_id: string;
    display_name_key: string;
    category: string;
    is_current: boolean;
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
    teleport_destinations?: TeleportDestinationDTO[];
    offered_quest_ids: string[];
    turn_in_quest_ids: string[];
    /** Map quest_id → confirm_warning_key (i18n) cho quest có side effect không
     * thể đảo ngược (vd Bái Sư set_class). Có entry → FE mở confirm modal trước
     * khi gọi accept API. Empty/undefined = không quest nào cần confirm. */
    quest_warnings?: Record<string, string>;
};

export type CancelMainQuestResponse = {
    cancelled: boolean;
    dialogue_key: string;
    quest_id?: string;
    quest_name_key?: string;
};

export const npcAPI = {
    async getInteract(mapId: string, npcTemplateId: string, characterId?: string): Promise<NpcInteractResponse> {
        const qs = characterId ? `?character_id=${encodeURIComponent(characterId)}` : '';
        const path = `/maps/${encodeURIComponent(mapId)}/npcs/${encodeURIComponent(npcTemplateId)}${qs}`;
        const { response, traceId } = await authFetch(path);
        const resData = await parseJsonSafe(response);
        if (!response.ok) {
            throw new Error(`${formatApiError(resData, t('api.error.load_npc'))} (trace_id=${traceId || 'n/a'})`);
        }
        return resData as NpcInteractResponse;
    },

    /** Gọi khi player bấm action "talk" — BE tick talk_npc objective. Trả 204
     * No Content khi OK. FE nên chỉ gọi khi còn quest active có objective
     * talk_npc matching NPC (tránh request thừa). */
    async talk(mapId: string, npcTemplateId: string, characterId: string): Promise<void> {
        const qs = `?character_id=${encodeURIComponent(characterId)}`;
        const path = `/maps/${encodeURIComponent(mapId)}/npcs/${encodeURIComponent(npcTemplateId)}/talk${qs}`;
        const { response, traceId } = await authFetch(path, { method: 'POST' });
        if (!response.ok) {
            const resData = await parseJsonSafe(response);
            throw new Error(`${formatApiError(resData, t('api.error.talk_npc'))} (trace_id=${traceId || 'n/a'})`);
        }
    },

    /** Hủy nhiệm vụ chính tuyến đang làm. Luôn trả 200 JSON —
     * cancelled=false = không có quest, FE hiện lời thoại NPC thay vì báo lỗi. */
    async cancelMainQuest(mapId: string, npcTemplateId: string, characterId: string): Promise<CancelMainQuestResponse> {
        const qs = `?character_id=${encodeURIComponent(characterId)}`;
        const path = `/maps/${encodeURIComponent(mapId)}/npcs/${encodeURIComponent(npcTemplateId)}/cancel-main-quest${qs}`;
        const { response, traceId } = await authFetch(path, { method: 'POST' });
        const resData = await parseJsonSafe(response);
        if (!response.ok) {
            throw new Error(`${formatApiError(resData, t('api.error.cancel_quest'))} (trace_id=${traceId || 'n/a'})`);
        }
        return resData as CancelMainQuestResponse;
    },
};

// ----- Quest -----

export type QuizOptionDTO = {
    id: string;
    label_key: string;
};

export type QuestObjectiveDTO = {
    type:
        | 'kill_monster'
        | 'talk_npc'
        | 'collect_item'
        | 'use_item'
        | 'buy_item'
        | 'equip_item'
        | 'visit_zone'
        | 'item_upgraded'
        | 'quiz_npc';
    target_id: string;
    count: number;
    done: number;
    npc_id?: string;
    question_key?: string;
    options?: QuizOptionDTO[];
};

export type QuestRewardItemDTO = {
    template_id: string;
    qty: number;
};

export type QuestRewardsDTO = {
    exp: number;
    yen: number;
    coin: number;
    items?: QuestRewardItemDTO[];
};

export type QuestStatus = 'active' | 'completed' | 'claimed';

export type QuestDTO = {
    quest_id: string;
    name_key: string;
    category: 'main' | 'side' | 'daily' | 'weekly';
    quest_type: string;
    min_level: number;
    giver_npc_id: string | null;
    turn_in_npc_id: string | null;
    prerequisite_id: string | null;
    status: QuestStatus;
    objectives: QuestObjectiveDTO[];
    rewards: QuestRewardsDTO;
    accepted_at?: string;
    completed_at?: string | null;
    claimed_at?: string | null;
};

export type ListQuestsResponse = {
    character_id: string;
    quests: QuestDTO[];
};

export type NextOfferedDTO = {
    quest_id: string;
    name_key: string;
    min_level: number;
    giver_npc_id: string | null;
    objectives: QuestObjectiveDTO[];
};

export type QuestBoardCategoryDTO = {
    category: 'main' | 'side' | 'daily' | 'weekly';
    quests: QuestDTO[];
    next_offered: NextOfferedDTO | null;
};

export type QuestBoardResponse = {
    character_id: string;
    categories: QuestBoardCategoryDTO[];
};

export type AcceptQuestResponse = { quest: QuestDTO };

export type TurnInQuestResponse = {
    quest: QuestDTO;
    granted_rewards: QuestRewardsDTO;
    // Set khi grant_xp / rewards.exp khiến cascade level up. FE consume để
    // update HUD + show banner mà không phải re-fetch character. Mirror combat
    // AttackResponse.level_up shape.
    level_up?: LevelUpDTO;
};

export type NpcQuestListsDTO = {
    offered_quest_ids: string[];
    turn_in_quest_ids: string[];
};

export type NpcAvailabilityResponse = {
    character_id: string;
    npcs: Record<string, NpcQuestListsDTO>;
};

export type SubmitQuizRequest = {
    npc_id: string;
    step_id: string;
    option_id: string;
};

export type SubmitQuizResponse = {
    correct: boolean;
    quest?: QuestDTO;
};

export const questAPI = {
    async list(characterId: string, status?: QuestStatus): Promise<ListQuestsResponse> {
        const qs = status ? `?status=${encodeURIComponent(status)}` : '';
        const { response, traceId } = await authFetch(`/characters/${encodeURIComponent(characterId)}/quests${qs}`);
        const resData = await parseJsonSafe(response);
        if (!response.ok) {
            throw new Error(`${formatApiError(resData, t('api.error.load_quests'))} (trace_id=${traceId || 'n/a'})`);
        }
        return resData as ListQuestsResponse;
    },

    async accept(characterId: string, questId: string, npcId: string): Promise<AcceptQuestResponse> {
        const { response, traceId } = await authFetch(`/characters/${encodeURIComponent(characterId)}/quests/${encodeURIComponent(questId)}/accept`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ npc_id: npcId }),
        });
        const resData = await parseJsonSafe(response);
        if (!response.ok) {
            throw new Error(`${formatApiError(resData, t('api.error.accept_quest'))} (trace_id=${traceId || 'n/a'})`);
        }
        return resData as AcceptQuestResponse;
    },

    async board(characterId: string): Promise<QuestBoardResponse> {
        const { response, traceId } = await authFetch(`/characters/${encodeURIComponent(characterId)}/quests/board`);
        const resData = await parseJsonSafe(response);
        if (!response.ok) {
            throw new Error(`${formatApiError(resData, t('api.error.load_quest_log'))} (trace_id=${traceId || 'n/a'})`);
        }
        return resData as QuestBoardResponse;
    },

    async npcAvailability(characterId: string): Promise<NpcAvailabilityResponse> {
        const { response, traceId } = await authFetch(`/characters/${encodeURIComponent(characterId)}/quests/npc-availability`);
        const resData = await parseJsonSafe(response);
        if (!response.ok) {
            throw new Error(`${formatApiError(resData, t('api.error.load_npc_status'))} (trace_id=${traceId || 'n/a'})`);
        }
        return resData as NpcAvailabilityResponse;
    },

    async turnIn(
        characterId: string,
        questId: string,
        npcId: string,
        classId?: string,
    ): Promise<TurnInQuestResponse> {
        const body: { npc_id: string; class_id?: string } = { npc_id: npcId };
        if (classId) {
            body.class_id = classId;
        }
        const { response, traceId } = await authFetch(`/characters/${encodeURIComponent(characterId)}/quests/${encodeURIComponent(questId)}/turn-in`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });
        const resData = await parseJsonSafe(response);
        if (!response.ok) {
            throw new Error(`${formatApiError(resData, t('api.error.turn_in_quest'))} (trace_id=${traceId || 'n/a'})`);
        }
        return resData as TurnInQuestResponse;
    },

    async submitQuiz(
        characterId: string,
        questId: string,
        body: SubmitQuizRequest,
    ): Promise<SubmitQuizResponse> {
        const { response, traceId } = await authFetch(
            `/characters/${encodeURIComponent(characterId)}/quests/${encodeURIComponent(questId)}/quiz`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            },
        );
        const resData = await parseJsonSafe(response);
        if (!response.ok) {
            throw new Error(`${formatApiError(resData, t('api.error.submit_quiz'))} (trace_id=${traceId || 'n/a'})`);
        }
        return resData as SubmitQuizResponse;
    },
};

// ----- Combat -----

export type MonsterInstanceDTO = {
    instance_id: string;
    template_id: string;
    name_key: string;
    level: number;
    affinity?: string;
    movement_type: 'ground' | 'flying';
    sprite_key: string;
    grade: 'normal' | 'elite' | 'leader' | 'world_boss';
    max_hp: number;
    current_hp: number;
    attack_range_px: number;
    pos_x: number;
    pos_y: number;
    state: 'alive' | 'dead';
    respawn_in_sec?: number;
};

export type LootKind = 'yen' | 'item';

export type LootDropDTO = {
    drop_id: string;
    kind: LootKind;
    pos_x: number;
    pos_y: number;
    /** Character được ưu tiên nhặt. Rỗng = không khoá. */
    owner_character_id?: string;
    /** RFC3339 timestamp. Sau thời điểm này → public (ai cũng nhặt). Rỗng = không khoá. */
    owner_lock_expires_at?: string;
    /** RFC3339 — hết hạn trên mặt đất (spawn + 15s). BE luôn gửi; FE despawn theo timestamp. */
    expires_at: string;
    /** Quest item — chỉ character đang làm quest mới nhặt được. Rỗng cho drop thường. */
    quest_template_id?: string;
    /** Yen kind */
    yen_amount?: number;
    /** Item kind (reserved) */
    item_template_id?: string;
    qty?: number;
};

export type ListMonstersResponse = {
    map_id: string;
    monsters: MonsterInstanceDTO[];
    drops: LootDropDTO[];
    server_now: string;
};

export type AttackRequest = {
    instance_id: string;
    map_id: string;
    skill_id?: string;
    player_x: number;
    player_y: number;
};

export type HitResultDTO = {
    instance_id: string;
    damage: number;
    is_crit: boolean;
    hp_remaining: number;
    dead: boolean;
    xp_credited: number;
};

export type RetaliationDTO = {
    instance_id: string;
    damage: number;
    player_hp_after: number;
};

export type LevelUpDTO = {
    from_level: number;
    to_level: number;
    new_max_hp: number;
    new_max_mp: number;
    new_min_attack: number;
    new_max_attack: number;
    new_defense: number;
};

export type AttackResponse = {
    hits: HitResultDTO[];
    retaliations: RetaliationDTO[];
    xp_gained: number;
    level_up?: LevelUpDTO;
    drops: LootDropDTO[];
    character_current_hp: number;
    character_current_mp: number;
    character_level: number;
    character_exp: number;
    character_exp_to_next_level: number;
    character_dead: boolean;
};

export type PickupDropRequest = {
    map_id: string;
    drop_id: string;
    player_x: number;
    player_y: number;
};

export type PickupDropResponse = {
    drop_id: string;
    kind: LootKind;
    /** Yen kind */
    yen_amount?: number;
    yen_balance?: number;
    /** Item kind (reserved) */
    item_template_id?: string;
    qty?: number;
};

export type RespawnResponse = {
    current_hp: number;
    current_mp: number;
    map_id: string;
};

export type SetDeathStateResponse = {
    death_state: 'alive' | 'dead' | 'spectating';
};

export type CombatTickRequest = {
    map_id: string;
    player_x: number;
    player_y: number;
};

export type CombatTickResponse = {
    retaliations: RetaliationDTO[];
    /** Quái còn aggro (BE); FE hiệu ứng đánh dùng retaliations, không field này. */
    aggro_instance_ids?: string[];
    character_current_hp: number;
    character_current_mp: number;
    character_dead: boolean;
};

export const combatAPI = {
    async listMonsters(mapId: string, characterId: string): Promise<ListMonstersResponse> {
        const path = `/maps/${encodeURIComponent(mapId)}/monsters?character_id=${encodeURIComponent(characterId)}`;
        const { response, traceId } = await authFetch(path);
        const resData = await parseJsonSafe(response);
        if (!response.ok) {
            throw new Error(`${formatApiError(resData, t('api.error.load_monsters'))} (trace_id=${traceId || 'n/a'})`);
        }
        const res = resData as ListMonstersResponse;
        const anchorMs =
            typeof res.server_now === 'string' ? Date.parse(res.server_now) : Date.now();
        return { ...res, drops: normalizeLootDrops(res.drops, anchorMs) };
    },
    async attack(characterId: string, req: AttackRequest): Promise<AttackResponse> {
        const path = `/characters/${encodeURIComponent(characterId)}/attack`;
        const { response, traceId } = await authFetch(path, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(req),
        });
        const resData = await parseJsonSafe(response);
        if (!response.ok) {
            throw new Error(`${formatApiError(resData, t('api.error.attack'))} (trace_id=${traceId || 'n/a'})`);
        }
        const res = resData as AttackResponse;
        return { ...res, drops: normalizeLootDrops(res.drops, Date.now()) };
    },
    async respawn(characterId: string): Promise<RespawnResponse> {
        const path = `/characters/${encodeURIComponent(characterId)}/respawn`;
        const { response, traceId } = await authFetch(path, { method: 'POST' });
        const resData = await parseJsonSafe(response);
        if (!response.ok) {
            throw new Error(`${formatApiError(resData, t('api.error.respawn'))} (trace_id=${traceId || 'n/a'})`);
        }
        return resData as RespawnResponse;
    },
    async tick(characterId: string, req: CombatTickRequest): Promise<CombatTickResponse> {
        const path = `/characters/${encodeURIComponent(characterId)}/combat-tick`;
        const { response, traceId } = await authFetch(path, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(req),
        });
        const resData = await parseJsonSafe(response);
        if (!response.ok) {
            throw new Error(`${formatApiError(resData, t('api.error.combat_tick'))} (trace_id=${traceId || 'n/a'})`);
        }
        return resData as CombatTickResponse;
    },
    async pickupDrop(characterId: string, req: PickupDropRequest): Promise<PickupDropResponse> {
        const path = `/characters/${encodeURIComponent(characterId)}/drops/pickup`;
        const { response, traceId } = await authFetch(path, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(req),
        });
        const resData = await parseJsonSafe(response);
        if (!response.ok) {
            throw new Error(`${formatApiError(resData, t('api.error.pickup_drop'))} (trace_id=${traceId || 'n/a'})`);
        }
        return resData as PickupDropResponse;
    },
    async setDeathState(characterId: string, action: 'spectate' | 'kill'): Promise<SetDeathStateResponse> {
        const path = `/characters/${encodeURIComponent(characterId)}/death-state`;
        const { response, traceId } = await authFetch(path, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action }),
        });
        const resData = await parseJsonSafe(response);
        if (!response.ok) {
            throw new Error(`${formatApiError(resData, t('api.error.death_state'))} (trace_id=${traceId || 'n/a'})`);
        }
        return resData as SetDeathStateResponse;
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
    /** null cho item không class-bound (consumable, material). FE shop UI dùng để filter submenu. */
    class_id: string | null;
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
            throw new Error(`${formatApiError(resData, t('api.error.load_shop'))} (trace_id=${traceId || 'n/a'})`);
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
            throw new Error(`${formatApiError(resData, t('api.error.buy'))} (trace_id=${traceId || 'n/a'})`);
        }
        return resData as ShopBuyResponse;
    },
};

// ----- Skill -----

export type SkillFaction = 'none' | 'sword' | 'bow' | 'katana' | 'fan' | 'dart' | 'kunai';
export type SkillType = 'active_attack' | 'active_buff' | 'passive';

export type NextUpgradeDTO = {
    to_level: number;
    sp_cost: number;
    min_char_level: number;
    ready: boolean;
};

export type PrereqMissingDTO = {
    skill_id: string;
    need_level: number;
    current_level: number;
};

export type SkillDTO = {
    skill_id: string;
    name_key: string;
    description_key?: string | null;
    faction: SkillFaction;
    skill_type: SkillType;
    required_level: number;
    current_skill_level: number;
    max_skill_level: number;
    learned: boolean;
    upgradable: boolean;
    next_upgrade: NextUpgradeDTO | null;
    prerequisites_met: boolean;
    missing_prerequisites?: PrereqMissingDTO[];
    cooldown_ms: number;
    cooldown_remaining_ms: number;
    mp_cost: number;
    range_px: number;
    aoe_radius_px: number;
    max_targets: number;
    current_stats: Record<string, number>;
    icon_key?: string | null;
    animation_key?: string | null;
};

export type ListSkillsResponse = {
    character_id: string;
    skill_points: number;
    skill_slots: (string | null)[];
    skills: SkillDTO[];
};

export type UpgradeSkillResponse = {
    skill_id: string;
    from_level: number;
    to_level: number;
    sp_consumed: number;
    skill_points_remaining: number;
    current_stats: Record<string, number>;
};

export type AssignSlotsResponse = {
    skill_slots: (string | null)[];
};

export type ActiveSkillBuffDTO = {
    skill_id: string;
    started_at_unix_ms: number;
    expires_at_unix_ms: number;
    stats: Record<string, number>;
};

export type CastSkillResponse = {
    skill_id: string;
    skill_type: string;
    /** Set khi skill_type='active_buff'. Empty cho active_attack future. */
    buff?: ActiveSkillBuffDTO;
    mp_remaining: number;
    cooldown_end_unix_ms: number;
};

export const skillAPI = {
    async list(characterId: string): Promise<ListSkillsResponse> {
        const { response, traceId } = await authFetch(`/characters/${encodeURIComponent(characterId)}/skills`);
        const resData = await parseJsonSafe(response);
        if (!response.ok) {
            throw new Error(`${formatApiError(resData, t('api.error.load_skills'))} (trace_id=${traceId || 'n/a'})`);
        }
        return resData as ListSkillsResponse;
    },

    async upgrade(characterId: string, skillId: string): Promise<UpgradeSkillResponse> {
        const path = `/characters/${encodeURIComponent(characterId)}/skills/${encodeURIComponent(skillId)}/upgrade`;
        const { response, traceId } = await authFetch(path, { method: 'POST' });
        const resData = await parseJsonSafe(response);
        if (!response.ok) {
            throw new Error(`${formatApiError(resData, t('api.error.upgrade_skill'))} (trace_id=${traceId || 'n/a'})`);
        }
        return resData as UpgradeSkillResponse;
    },

    async cast(characterId: string, skillId: string): Promise<CastSkillResponse> {
        const path = `/characters/${encodeURIComponent(characterId)}/skills/${encodeURIComponent(skillId)}/cast`;
        const { response, traceId } = await authFetch(path, { method: 'POST' });
        const resData = await parseJsonSafe(response);
        if (!response.ok) {
            throw new Error(`${formatApiError(resData, t('api.error.cast_skill'))} (trace_id=${traceId || 'n/a'})`);
        }
        return resData as CastSkillResponse;
    },

    async assignSlots(characterId: string, slots: (string | null)[]): Promise<AssignSlotsResponse> {
        const { response, traceId } = await authFetch(`/characters/${encodeURIComponent(characterId)}/skill-slots`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ slots }),
        });
        const resData = await parseJsonSafe(response);
        if (!response.ok) {
            throw new Error(`${formatApiError(resData, t('api.error.assign_slot'))} (trace_id=${traceId || 'n/a'})`);
        }
        return resData as AssignSlotsResponse;
    },
};

// ----- Equipment Upgrade (Hoshi) -----

export type EnchantStatBonus = {
    atk: number;
    def: number;
    hp: number;
    mp: number;
};

export type UpgradeEquipmentResponse = {
    user_item_id: string;
    item_template_id: string;
    old_enchant_level: number;
    new_enchant_level: number;
    stones_consumed: number;
    yen_consumed: number;
    hidden_tier_unlock: number;
    new_bonus: EnchantStatBonus;
};

export type ExtractEquipmentResponse = {
    user_item_id: string;
    item_template_id: string;
    old_enchant_level: number;
    new_enchant_level: number;
    stones_refunded: number;
    yen_refunded: number;
    hidden_tiers_lost: number[];
};

export const equipmentUpgradeAPI = {
    async upgrade(characterId: string, userItemId: string): Promise<UpgradeEquipmentResponse> {
        const { response, traceId } = await authFetch(`/characters/${encodeURIComponent(characterId)}/equipment/upgrade`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ user_item_id: userItemId }),
        });
        const resData = await parseJsonSafe(response);
        if (!response.ok) {
            throw new Error(`${formatApiError(resData, t('api.error.upgrade_equipment'))} (trace_id=${traceId || 'n/a'})`);
        }
        return resData as UpgradeEquipmentResponse;
    },

    async extract(characterId: string, userItemId: string): Promise<ExtractEquipmentResponse> {
        const { response, traceId } = await authFetch(`/characters/${encodeURIComponent(characterId)}/equipment/extract`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ user_item_id: userItemId }),
        });
        const resData = await parseJsonSafe(response);
        if (!response.ok) {
            throw new Error(`${formatApiError(resData, t('api.error.extract_equipment'))} (trace_id=${traceId || 'n/a'})`);
        }
        return resData as ExtractEquipmentResponse;
    },
};
