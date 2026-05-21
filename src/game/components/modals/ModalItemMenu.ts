import { MODAL_COLORS, MODAL_Z_INDEX } from './theme';

/** Một lựa chọn trong menu item (Bùa Dịch Chuyển, ...). */
export type ModalItemMenuEntry = {
    key: string;
    label: string;
    icon?: string;
    action: () => void;
};

export type ModalItemMenuOptions = {
    /** Overlay của modal cha (vd InventoryModal shell.overlay). */
    mountParent: HTMLElement;
    /** Khoảng cách từ đáy overlay — tránh đè action bar modal. */
    bottomOffsetPx?: number;
    /** Viewport zoom đồng bộ với modal cha. */
    applyZoom?: (el: HTMLElement) => void;
};

/**
 * Menu DOM gắn vào overlay modal — **luôn nằm trên panel modal**.
 *
 * Quy tắc UI (xem theme.ts):
 * - **Menu chức năng** (F1) + NPC: `ActionMenu` Phaser trên canvas — chỉ khi
 *   không có modal HTML; không có gì đè lên menu chức năng lúc đó.
 * - **Menu từ item trong túi / modal**: dùng `ModalItemMenu` — không dùng
 *   `ActionMenu` (canvas nằm dưới overlay HTML).
 */
export class ModalItemMenu {
    private readonly mountParent: HTMLElement;
    private readonly bottomOffsetPx: number;
    private readonly applyZoom?: (el: HTMLElement) => void;

    private rootEl?: HTMLDivElement;
    private titleEl?: HTMLDivElement;
    private rowEl?: HTMLDivElement;
    private buttons: HTMLButtonElement[] = [];
    private selectedIndex = 0;
    private open = false;

    constructor(opts: ModalItemMenuOptions) {
        this.mountParent = opts.mountParent;
        this.bottomOffsetPx = opts.bottomOffsetPx ?? 72;
        this.applyZoom = opts.applyZoom;
    }

    isOpen(): boolean {
        return this.open;
    }

    close(): void {
        this.open = false;
        this.buttons = [];
        this.selectedIndex = 0;
        if (this.rootEl) {
            this.rootEl.remove();
            this.rootEl = undefined;
            this.titleEl = undefined;
            this.rowEl = undefined;
        }
    }

    navigate(direction: 'left' | 'right' | 'up' | 'down'): void {
        const n = this.buttons.length;
        if (!this.open || n === 0) return;
        if (direction === 'left') {
            this.selectedIndex = (this.selectedIndex - 1 + n) % n;
            this.refreshFocus();
        } else if (direction === 'right') {
            this.selectedIndex = (this.selectedIndex + 1) % n;
            this.refreshFocus();
        }
    }

    confirm(): void {
        if (!this.open) return;
        this.buttons[this.selectedIndex]?.click();
    }

    openMenu(title: string, items: ModalItemMenuEntry[]): void {
        if (items.length === 0) return;
        this.ensureDOM();
        if (!this.titleEl || !this.rowEl) return;

        this.open = true;
        this.selectedIndex = 0;
        this.titleEl.textContent = title;
        this.rowEl.innerHTML = '';
        this.buttons = [];

        const ITEM_W = 96;
        const ITEM_H = 84;
        items.forEach((item, idx) => {
            const btn = document.createElement('button');
            btn.type = 'button';
            Object.assign(btn.style, {
                width: `${ITEM_W}px`,
                minHeight: `${ITEM_H}px`,
                padding: '10px 6px 8px',
                borderRadius: '10px',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '4px',
                cursor: 'pointer',
                fontFamily: 'inherit',
                transition: 'border-color 0.12s ease, box-shadow 0.12s ease, background 0.12s ease, transform 0.12s ease',
            });

            if (item.icon) {
                const iconEl = document.createElement('span');
                iconEl.textContent = item.icon;
                Object.assign(iconEl.style, {
                    fontSize: '26px',
                    lineHeight: '1',
                    pointerEvents: 'none',
                });
                btn.appendChild(iconEl);
            }

            const labelEl = document.createElement('span');
            labelEl.dataset.modalItemMenuLabel = '1';
            labelEl.textContent = item.label;
            Object.assign(labelEl.style, {
                fontSize: '12px',
                fontWeight: 'bold',
                textAlign: 'center',
                lineHeight: '1.2',
                wordBreak: 'break-word',
                pointerEvents: 'none',
            });
            btn.appendChild(labelEl);

            this.paintButton(btn, idx === 0);

            btn.addEventListener('mouseenter', () => {
                this.selectedIndex = idx;
                this.refreshFocus();
            });
            btn.addEventListener('click', () => {
                this.close();
                item.action();
            });

            this.rowEl!.appendChild(btn);
            this.buttons.push(btn);
        });
        this.buttons[0]?.focus({ preventScroll: true });
    }

    private ensureDOM(): void {
        if (this.rootEl) return;

        const root = document.createElement('div');
        root.classList.add('kageverse-modal-item-menu');
        Object.assign(root.style, {
            position: 'absolute',
            left: '0',
            right: '0',
            bottom: `${this.bottomOffsetPx}px`,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '10px',
            pointerEvents: 'none',
            zIndex: String(MODAL_Z_INDEX.modalItemMenu),
            fontFamily: 'system-ui, sans-serif',
        });

        const title = document.createElement('div');
        Object.assign(title.style, {
            fontSize: '15px',
            fontWeight: 'bold',
            color: MODAL_COLORS.title,
            background: MODAL_COLORS.headerBg,
            border: `2px solid ${MODAL_COLORS.border}`,
            borderRadius: '8px',
            padding: '6px 14px',
            pointerEvents: 'auto',
            boxShadow: '0 4px 16px rgba(0,0,0,0.5)',
        });

        const row = document.createElement('div');
        Object.assign(row.style, {
            display: 'flex',
            flexWrap: 'wrap',
            justifyContent: 'center',
            gap: '10px',
            maxWidth: '96%',
            pointerEvents: 'auto',
        });

        root.appendChild(title);
        root.appendChild(row);
        this.mountParent.appendChild(root);
        this.applyZoom?.(root);

        this.rootEl = root;
        this.titleEl = title;
        this.rowEl = row;
    }

    private paintButton(btn: HTMLButtonElement, selected: boolean): void {
        Object.assign(btn.style, {
            border: `${selected ? 3 : 2}px solid ${selected ? MODAL_COLORS.borderAccent : MODAL_COLORS.border}`,
            background: selected
                ? 'linear-gradient(180deg, #6b3a14 0%, #2a1808 100%)'
                : `linear-gradient(180deg, ${MODAL_COLORS.panelBgTop} 0%, ${MODAL_COLORS.panelBgBottom} 100%)`,
            color: selected ? MODAL_COLORS.title : MODAL_COLORS.text,
            boxShadow: selected
                ? '0 0 14px rgba(255,234,122,0.65), 0 4px 14px rgba(0,0,0,0.55)'
                : '0 2px 10px rgba(0,0,0,0.4)',
            transform: selected ? 'translateY(-3px) scale(1.02)' : 'translateY(0) scale(1)',
        });
        const labelEl = btn.querySelector<HTMLElement>('[data-modal-item-menu-label]');
        if (labelEl) {
            labelEl.style.color = selected ? MODAL_COLORS.title : MODAL_COLORS.text;
        }
    }

    private refreshFocus(): void {
        this.buttons.forEach((btn, idx) => {
            this.paintButton(btn, idx === this.selectedIndex);
        });
    }
}
