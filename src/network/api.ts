const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8080/api/v1';

export const authAPI = {
    async register(data: Record<string, string>) {
        const response = await fetch(`${API_BASE_URL}/auth/register`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(data),
        });
        const resData = await response.json();
        if (!response.ok) {
            throw new Error(resData?.error?.message_key || 'Registration failed');
        }
        return resData;
    },

    async login(data: Record<string, string>) {
        const response = await fetch(`${API_BASE_URL}/auth/login`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(data),
        });
        const resData = await response.json();
        if (!response.ok) {
            throw new Error(resData?.error?.message_key || 'Login failed');
        }
        return resData;
    }
};
