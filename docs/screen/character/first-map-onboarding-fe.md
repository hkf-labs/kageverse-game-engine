# First Map Onboarding - FE Integration Notes

## Muc tieu
- UI scene onboarding chay duoc voi mock ngay, khong phu thuoc backend.
- Khi BE san sang, chi doi `VITE_ONBOARDING_DATA_SOURCE=api` va cap nhat route trong `HttpOnboardingGateway`.
- Scene/UI khong doi contract, khong sua flow render.

## Kien truc toi uu cho viec ghep API
- `types.ts`: contract chung cho UI + data layer.
- `OnboardingGateway.ts`: interface duy nhat Scene goi.
- `mockOnboardingGateway.ts`: data gia lap cho FE review.
- `httpOnboardingGateway.ts`: adapter REST cho API that.
- `index.ts`: chon adapter theo env.

## Nguyen tac de giam sua code ve sau
- UI Scene chi import `getOnboardingGateway()`.
- Khong goi `fetch` truc tiep trong Scene.
- Khong xu ly snake_case/camelCase lan tung component; gom vao gateway.
- Route API thay doi thi sua 1 cho trong `HttpOnboardingGateway`.

## Env
- `VITE_ONBOARDING_DATA_SOURCE=mock` (mac dinh): dung mock.
- `VITE_ONBOARDING_DATA_SOURCE=api`: dung backend that.
