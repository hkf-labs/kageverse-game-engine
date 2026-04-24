import type { OnboardingState } from './types';

export interface OnboardingGateway {
    getOnboardingState(): Promise<OnboardingState>;
    acceptMainQuest(): Promise<OnboardingState>;
    simulateShardDrop(): Promise<OnboardingState>;
    turnInMainQuest(): Promise<OnboardingState>;
}
