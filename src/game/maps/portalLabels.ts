import { t } from '../../i18n';
import { mapDisplayName } from './registry';

/** Nhãn cổng — luôn "Đi đến {tên map đích}", không phân biệt quay về / đi tiếp. */
export function portalLabelForTargetMap(targetMapId: string): string {
    return t('portal.label.goto_map', { name: mapDisplayName(targetMapId) });
}
