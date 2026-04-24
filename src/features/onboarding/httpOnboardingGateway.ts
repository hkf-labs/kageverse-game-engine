import type { OnboardingGateway } from './OnboardingGateway';
import type { OnboardingApiEnvelope, OnboardingState } from './types';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8080/api/v1';

function getAccessToken(): string | null {
    return localStorage.getItem('kageverse_jwt');
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

async function request<T>(path: string, method: 'GET' | 'POST'): Promise<T> {
    const token = getAccessToken();
    if (!token) throw new Error('Chua dang nhap');
    const response = await fetch(`${API_BASE_URL}${path}`, {
        method,
        headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
        },
    });
    const payload = (await parseJsonSafe(response)) as OnboardingApiEnvelope<T>;
    if (!response.ok || !payload?.ok) {
        throw new Error('Khong the tai du lieu onboarding');
    }
    return payload.data;
}

/**
 * NOTE:
 * - Endpoint naming duoi day la contract tam cho FE.
 * - Khi BE chot route that, chi can doi path trong class nay, UI khong doi.
 */
export class HttpOnboardingGateway implements OnboardingGateway {
    async getOnboardingState(): Promise<OnboardingState> {
        return request<OnboardingState>('/onboarding/first-map/state', 'GET');
    }

    async acceptMainQuest(): Promise<OnboardingState> {
        return request<OnboardingState>('/onboarding/first-map/accept-main-quest', 'POST');
    }

    async simulateShardDrop(): Promise<OnboardingState> {
        return request<OnboardingState>('/onboarding/first-map/simulate-shard-drop', 'POST');
    }

    async turnInMainQuest(): Promise<OnboardingState> {
        return request<OnboardingState>('/onboarding/first-map/turn-in-main-quest', 'POST');
    }
}
