const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8080/api/v1';

function getAccessToken(): string | null {
    return localStorage.getItem('kageverse_jwt');
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
        const response = await fetch(`${API_BASE_URL}/auth/supported-countries`);
        const resData = await response.json();
        if (!response.ok) {
            throw new Error(formatApiError(resData, 'Không tải được danh sách quốc gia'));
        }
        const list = resData?.countries;
        return Array.isArray(list) ? list : [];
    },

    async register(data: { username: string; email: string; password: string; country_code: string }) {
        const response = await fetch(`${API_BASE_URL}/auth/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data),
        });
        const resData = await response.json();
        if (!response.ok) {
            throw new Error(formatApiError(resData, 'Đăng ký thất bại'));
        }
        return resData as {
            user: Record<string, unknown>;
            access_token: string;
            refresh_token?: string;
        };
    },

    async login(data: { identifier: string; password: string }) {
        const response = await fetch(`${API_BASE_URL}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data),
        });
        const resData = await response.json();
        if (!response.ok) {
            throw new Error(formatApiError(resData, 'Đăng nhập thất bại'));
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
        const response = await fetch(`${API_BASE_URL}/characters`, {
            headers: { Authorization: `Bearer ${token}` },
        });
        const resData = await response.json();
        if (!response.ok) {
            throw new Error(formatApiError(resData, 'Không tải được nhân vật'));
        }
        return resData as ListCharactersResponse;
    },

    async create(payload: CreateCharacterPayload): Promise<{ character: CharacterDTO; max_characters_per_user: number }> {
        const token = getAccessToken();
        if (!token) throw new Error('Chưa đăng nhập');
        const response = await fetch(`${API_BASE_URL}/characters`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify(payload),
        });
        const resData = await response.json();
        if (!response.ok) {
            throw new Error(formatApiError(resData, 'Tạo nhân vật thất bại'));
        }
        return resData as { character: CharacterDTO; max_characters_per_user: number };
    },
};
