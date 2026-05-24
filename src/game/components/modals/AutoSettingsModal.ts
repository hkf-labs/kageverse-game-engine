import { BaseModal } from './BaseModal';
import type { ModalShell, ModalShellOptions } from './createModalShell';
import { MODAL_COLORS } from './theme';

/** Cài đặt giá trị mặc định — chưa apply logic, chỉ lưu UI state. */
const DEFAULTS = {
    autoHpEnabled: false,
    autoHpThreshold: 50,
    autoMpEnabled: false,
    autoMpThreshold: 30,
    pickupAll: false,
    pickupYen: false,
    pickupHpMp: false,
    pickupQuestItem: false,
};

interface AutoSettings {
    autoHpEnabled: boolean;
    autoHpThreshold: number;
    autoMpEnabled: boolean;
    autoMpThreshold: number;
    pickupAll: boolean;
    pickupYen: boolean;
    pickupHpMp: boolean;
    pickupQuestItem: boolean;
}

function sectionTitle(text: string): HTMLDivElement {
    const el = document.createElement('div');
    el.textContent = text;
    el.style.cssText = `font-size: 12px; font-weight: 700; color: ${MODAL_COLORS.textMuted}; letter-spacing: 0.8px; text-transform: uppercase; margin: 16px 0 8px;`;
    return el;
}

function divider(): HTMLHRElement {
    const hr = document.createElement('hr');
    hr.style.cssText = `border: none; border-top: 1px solid ${MODAL_COLORS.divider}; margin: 4px 0;`;
    return hr;
}

/**
 * AutoSettingsModal — Cài đặt tự động trong game.
 * UI-only: hiển thị toggle + slider cho các thông số tự động.
 * Logic áp dụng chưa implement (defer post-MVP).
 */
export class AutoSettingsModal extends BaseModal {
    private settings: AutoSettings = { ...DEFAULTS };

    protected buildShellOptions(): Omit<ModalShellOptions, 'scene'> {
        return {
            overlayClassName: 'kageverse-overlay-auto-settings',
            size: 'sm',
            layer: 'blockingDialog',
            mount: 'document-body',
            withStatus: false,
            title: '⚙️ Tự Động',
            onClose: () => this.close(),
        };
    }

    protected teardownShell(): void {
        super.teardownShell();
    }

    protected populateShell(shell: ModalShell): void {
        const body = document.createElement('div');
        body.style.cssText = 'padding: 14px 18px 18px; overflow-y: auto; flex: 1; display: flex; flex-direction: column; gap: 4px;';
        shell.body.appendChild(body);

        // ── Phần 1: Hồi phục tự động ──────────────────────────────────────
        body.appendChild(sectionTitle('🧪 Hồi phục tự động'));

        body.appendChild(this.buildThresholdRow(
            'Tự động dùng HP khi dưới',
            '%',
            this.settings.autoHpEnabled,
            this.settings.autoHpThreshold,
            (enabled) => { this.settings.autoHpEnabled = enabled; },
            (val) => { this.settings.autoHpThreshold = val; },
            '#e05555',
        ));

        body.appendChild(this.buildThresholdRow(
            'Tự động dùng MP khi dưới',
            '%',
            this.settings.autoMpEnabled,
            this.settings.autoMpThreshold,
            (enabled) => { this.settings.autoMpEnabled = enabled; },
            (val) => { this.settings.autoMpThreshold = val; },
            '#5599ee',
        ));

        // ── Phần 2: Nhặt đồ ───────────────────────────────────────────────
        body.appendChild(divider());
        body.appendChild(sectionTitle('🎁 Nhặt đồ tự động'));

        const subPickupRows: { el: HTMLDivElement; input: HTMLInputElement }[] = [];

        const { el: rowAll, input: inputAll } = this.buildToggleRow(
            '🗡️ Nhặt tất cả',
            'Tự động nhặt mọi vật phẩm rơi ra',
            this.settings.pickupAll,
            (v) => {
                this.settings.pickupAll = v;
                for (const sub of subPickupRows) setSubPickupDisabled(sub, v);
            },
        );
        body.appendChild(rowAll);
        void inputAll; // inputAll không cần ref thêm

        const setSubPickupDisabled = (
            sub: { el: HTMLDivElement; input: HTMLInputElement },
            disabled: boolean,
        ) => {
            sub.input.checked = disabled ? true : sub.input.checked;
            sub.input.disabled = disabled;
            sub.el.style.opacity = disabled ? '0.5' : '1';
            sub.el.style.pointerEvents = disabled ? 'none' : '';
        };

        for (const [label, desc, key] of [
            ['💴 Nhặt Yên',               'Tự động nhặt tiền rơi',          'pickupYen'],
            ['💊 Nhặt HP / MP',           'Tự động nhặt bình hồi phục',     'pickupHpMp'],
            ['📜 Nhặt vật phẩm nhiệm vụ', 'Tự động nhặt item quest',        'pickupQuestItem'],
        ] as const) {
            const { el, input } = this.buildToggleRow(
                label, desc,
                this.settings[key],
                (v) => { (this.settings[key] as boolean) = v; },
            );
            if (this.settings.pickupAll) setSubPickupDisabled({ el, input }, true);
            subPickupRows.push({ el, input });
            body.appendChild(el);
        }

        // ── Footer ghi chú ────────────────────────────────────────────────
        body.appendChild(divider());
        const note = document.createElement('div');
        note.textContent = '⚠️ Tính năng tự động đang trong giai đoạn phát triển.';
        note.style.cssText = `margin-top: 8px; font-size: 11px; color: ${MODAL_COLORS.textMuted}; font-style: italic; text-align: center;`;
        body.appendChild(note);
    }

    open(): void {
        const shell = this.ensureShell();
        if (!shell) return;
        this.visible = true;
        this.scene.input.keyboard?.disableGlobalCapture();
    }

    navigate(_direction: 'left' | 'right' | 'up' | 'down'): void { /* no keyboard nav — mouse/touch only */ }
    confirm(): void { /* no confirm action */ }

    close(): void {
        if (!this.visible && !this.shell) return;
        this.scene.input.keyboard?.enableGlobalCapture();
        this.teardownShell();
    }

    // ── Builders ──────────────────────────────────────────────────────────

    /**
     * Row: [Toggle] Label + slider để nhập % ngưỡng.
     * Toggle bật/tắt row; slider chỉ hiển thị khi bật.
     */
    private buildThresholdRow(
        label: string,
        unit: string,
        initEnabled: boolean,
        initValue: number,
        onToggle: (v: boolean) => void,
        onValue: (v: number) => void,
        accentColor: string,
    ): HTMLDivElement {
        const wrap = document.createElement('div');
        wrap.style.cssText = `
            padding: 10px 12px; border-radius: 8px;
            background: rgba(255,255,255,0.04); margin-bottom: 6px;
            border: 1px solid ${MODAL_COLORS.divider};
        `;

        // Row trên: toggle + label
        const topRow = document.createElement('div');
        topRow.style.cssText = 'display: flex; align-items: center; gap: 10px;';

        const { label: toggleLabel } = this.buildToggle(initEnabled, accentColor, (checked) => {
            onToggle(checked);
            sliderRow.style.display = checked ? 'flex' : 'none';
        });

        const labelEl = document.createElement('span');
        labelEl.textContent = label;
        labelEl.style.cssText = `font-size: 13px; color: ${MODAL_COLORS.text}; flex: 1;`;

        topRow.appendChild(toggleLabel);
        topRow.appendChild(labelEl);
        wrap.appendChild(topRow);

        // Row dưới: slider + giá trị (hiển thị khi bật)
        const sliderRow = document.createElement('div');
        sliderRow.style.cssText = `display: ${initEnabled ? 'flex' : 'none'}; align-items: center; gap: 8px; margin-top: 8px; padding-left: 34px;`;

        const slider = document.createElement('input');
        slider.type = 'range';
        slider.min = '1';
        slider.max = '100';
        slider.value = String(initValue);
        slider.style.cssText = `flex: 1; accent-color: ${accentColor}; cursor: pointer;`;

        const valDisplay = document.createElement('span');
        valDisplay.textContent = `${initValue}${unit}`;
        valDisplay.style.cssText = `min-width: 38px; text-align: right; font-size: 13px; font-weight: 700; color: ${accentColor};`;

        slider.addEventListener('input', () => {
            const v = Number(slider.value);
            valDisplay.textContent = `${v}${unit}`;
            onValue(v);
        });

        sliderRow.appendChild(slider);
        sliderRow.appendChild(valDisplay);
        wrap.appendChild(sliderRow);

        return wrap;
    }

    /** Row: [Toggle] Label + mô tả nhỏ. Trả về el + input ref để caller wire thêm logic. */
    private buildToggleRow(
        label: string,
        description: string,
        initValue: boolean,
        onChange: (v: boolean) => void,
    ): { el: HTMLDivElement; input: HTMLInputElement } {
        const wrap = document.createElement('div');
        wrap.style.cssText = `
            display: flex; align-items: center; gap: 10px;
            padding: 9px 12px; border-radius: 8px;
            background: rgba(255,255,255,0.04); margin-bottom: 5px;
            border: 1px solid ${MODAL_COLORS.divider};
        `;

        const { label: toggleLabel, input } = this.buildToggle(initValue, MODAL_COLORS.borderAccent, onChange);

        const textCol = document.createElement('div');
        textCol.style.cssText = 'display: flex; flex-direction: column; gap: 2px; flex: 1;';

        const labelEl = document.createElement('span');
        labelEl.textContent = label;
        labelEl.style.cssText = `font-size: 13px; color: ${MODAL_COLORS.text}; font-weight: 600;`;

        const descEl = document.createElement('span');
        descEl.textContent = description;
        descEl.style.cssText = `font-size: 11px; color: ${MODAL_COLORS.textMuted};`;

        textCol.appendChild(labelEl);
        textCol.appendChild(descEl);
        wrap.appendChild(toggleLabel);
        wrap.appendChild(textCol);

        return { el: wrap, input };
    }

    /** Tạo toggle switch HTML thuần — không dùng thư viện ngoài. */
    private buildToggle(
        initChecked: boolean,
        onColor: string,
        onChange: (checked: boolean) => void,
    ): { label: HTMLLabelElement; input: HTMLInputElement } {
        const label = document.createElement('label');
        label.style.cssText = 'position: relative; display: inline-block; width: 38px; height: 22px; flex-shrink: 0; cursor: pointer;';

        const input = document.createElement('input');
        input.type = 'checkbox';
        input.checked = initChecked;
        input.style.cssText = 'opacity: 0; width: 0; height: 0; position: absolute;';

        const track = document.createElement('span');
        const applyTrackStyle = (checked: boolean) => {
            track.style.cssText = `
                position: absolute; inset: 0; border-radius: 22px;
                background: ${checked ? onColor : 'rgba(255,255,255,0.15)'};
                transition: background 0.2s;
            `;
        };
        applyTrackStyle(initChecked);

        const thumb = document.createElement('span');
        const applyThumbStyle = (checked: boolean) => {
            thumb.style.cssText = `
                position: absolute; top: 3px; left: ${checked ? '19px' : '3px'};
                width: 16px; height: 16px; border-radius: 50%;
                background: #fff; transition: left 0.2s;
                box-shadow: 0 1px 4px rgba(0,0,0,0.4);
            `;
        };
        applyThumbStyle(initChecked);

        input.addEventListener('change', () => {
            applyTrackStyle(input.checked);
            applyThumbStyle(input.checked);
            onChange(input.checked);
        });

        label.appendChild(input);
        label.appendChild(track);
        label.appendChild(thumb);
        return { label, input };
    }
}
