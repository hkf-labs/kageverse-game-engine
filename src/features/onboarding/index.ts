import type { OnboardingGateway } from './OnboardingGateway';
import { HttpOnboardingGateway } from './httpOnboardingGateway';
import { MockOnboardingGateway } from './mockOnboardingGateway';

const source = (import.meta.env.VITE_ONBOARDING_DATA_SOURCE || 'mock').toLowerCase();

let singleton: OnboardingGateway | null = null;

export function getOnboardingGateway(): OnboardingGateway {
    if (singleton) return singleton;
    singleton = source === 'api' ? new HttpOnboardingGateway() : new MockOnboardingGateway();
    return singleton;
}
