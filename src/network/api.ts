import { getMockMapDetail } from '../features/maps';
import type { MapDetail, Vec2 } from '../features/maps';
export type { MapDetail, Vec2 } from '../features/maps';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8080/api/v1';
const TRACE_ID_HEADER = 'X-Trace-Id';

function getAccessToken(): string | null {
    return localStorage.getItem('kageverse_jwt');
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

async function parseJsonSafe(response: Response): Promise<any> {
    const text = await response.text();
    if (!text) return {};
    try {
        return JSON.parse(text);
    } catch {
        return {};
    }
}

function extractTraceId(response: Response, fallbackHeaders?: Headers): string {
    return (
        response.headers.get(TRACE_ID_HEADER) ||
        fallbackHeaders?.get(TRACE_ID_HEADER) ||
        ''
    );
}

export function formatApiError(resData: any, fallback: string): string {
    const err = resData?.error;
    if (!err) return fallback;
    if (err.message_key) return String(err.message_key);
    if (Array.isArray(err.field_errors) && err.field_errors.length > 0) {
        const fe = err.field_errors[0];
        if (fe?.message_key) return String(fe.message_key);
        if (fe?.field && fe?.code) return `${fe.field}: ${fe.code}`;
    }
    return fallback;
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
        const list = resData?.countries;
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

export type CharacterDTO = {
    id: string;
    user_id: string;
    display_name: string;
    gender: string;
    costume_primary_color: string;
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

export const charactersAPI = {
    async list(): Promise<ListCharactersResponse> {
        const token = getAccessToken();
        if (!token) throw new Error('Chưa đăng nhập');
        const headers = buildHeaders({ Authorization: `Bearer ${token}` });
        const response = await fetch(`${API_BASE_URL}/characters`, {
            headers,
        });
        const resData = await parseJsonSafe(response);
        const traceId = extractTraceId(response, headers);
        if (!response.ok) {
            throw new Error(`${formatApiError(resData, 'Không tải được nhân vật')} (trace_id=${traceId || 'n/a'})`);
        }
        return resData as ListCharactersResponse;
    },

    async create(payload: CreateCharacterPayload): Promise<{ character: CharacterDTO; max_characters_per_user: number }> {
        const token = getAccessToken();
        if (!token) throw new Error('Chưa đăng nhập');
        const headers = buildHeaders({
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
        });
        const response = await fetch(`${API_BASE_URL}/characters`, {
            method: 'POST',
            headers,
            body: JSON.stringify(payload),
        });
        const resData = await parseJsonSafe(response);
        const traceId = extractTraceId(response, headers);
        if (!response.ok) {
            throw new Error(`${formatApiError(resData, 'Tạo nhân vật thất bại')} (trace_id=${traceId || 'n/a'})`);
        }
        return resData as { character: CharacterDTO; max_characters_per_user: number };
    },
};

export const mapsAPI = {
    async getDetail(mapId: string): Promise<MapDetail> {
        return getMockMapDetail(mapId);
    },
};
