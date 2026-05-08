import * as Phaser from 'phaser';
import { onLocaleChange } from '../../../i18n';
import {
    MODAL_CLOSE_BTN_CSS,
    MODAL_COLORS,
    MODAL_HEADER_CSS,
    MODAL_SIZES,
    MODAL_STATUS_CSS,
    MODAL_Z_INDEX,
    type ModalLayer,
    type ModalSize,
} from './theme';

export interface ModalShellOptions {
    scene: Phaser.Scene;
    /** CSS class debug — dán vào overlay (vd 'kageverse-overlay-shop'). */
    overlayClassName: string;
    /** Width preset — tham chiếu MODAL_SIZES.width. */
    size?: ModalSize;
    /** z-index layer — tham chiếu MODAL_Z_INDEX. */
    layer?: ModalLayer;
    /** Có hiển thị status bar dưới đáy không (default true). */
    withStatus?: boolean;
    /** Title text ban đầu (subclass có thể đổi qua setTitle). */
    title?: string;
    /**
     * Có hiển thị title element trong header không (default true). Set false
     * cho modal cần custom header content (vd ChatPanel — tabs thay vì title).
     * Subclass tự append element vào headerEl (trước close button).
     */
    withTitle?: boolean;
    /** Có hiển thị close button (✕) ở góc phải header không (default true). */
    withCloseButton?: boolean;
    /**
     * Mount target — 'canvas-parent' (sibling canvas, position absolute) hoặc
     * 'document-body' (fixed full-screen, dùng cho cinematic / blocking dialog).
     * Default 'canvas-parent'.
     */
    mount?: 'canvas-parent' | 'document-body';
    /** Callback khi user click backdrop / close button. Mặc định no-op. */
    onClose?: () => void;
    /**
     * 'modal' (default) — panel có gradient bg + border + radius + header.
     * 'cinematic' — không panel, body append trực tiếp vào overlay (DeathMenu,
     *   EndMvpOverlay). Tự cancel header/title; withCloseButton/withStatus bị
     *   ignore (luôn false).
     */
    panelStyle?: 'modal' | 'cinematic';
}

export interface ModalShell {
    /** Backdrop full-screen. */
    overlay: HTMLDivElement;
    /** Panel root (gradient bg + border). Subclass append content vào panel. */
    panel: HTMLDivElement;
    /** Header bar reference — subclass có thể inject nút phụ (◄ ► ...). */
    headerEl: HTMLDivElement;
    /** Title element trong header. */
    titleEl: HTMLDivElement;
    /** Body container — main content area. Subclass append children vào body. */
    body: HTMLDivElement;
    /** Status footer (chỉ tồn tại nếu withStatus !== false). */
    statusEl: HTMLDivElement | null;
    /** Đổi title text runtime. */
    setTitle(text: string): void;
    /**
     * Set status footer message + màu. kind 'ok' | 'error' | 'muted' (default
     * muted). Modal nào không có status footer thì gọi no-op.
     */
    setStatus(text: string, kind?: 'ok' | 'error' | 'muted'): void;
    /**
     * Đăng ký callback chạy mỗi khi locale đổi. Tự cleanup khi teardown gọi.
     * Subclass dùng để re-render text mỗi khi user đổi ngôn ngữ runtime.
     */
    registerLocaleSync(handler: () => void): void;
    /** Remove DOM + unsubscribe locale listeners. Idempotent. */
    teardown(): void;
}

/**
 * Dựng modal shell chuẩn (overlay + panel + header + close + status footer).
 * Subclass chỉ append content riêng vào shell.body, dùng setStatus() và
 * registerLocaleSync() — không tự code overlay / panel / header style.
 *
 * Trả về null nếu canvas chưa attach (mount='canvas-parent' và parentElement
 * undefined). Caller phải guard.
 */
export function createModalShell(opts: ModalShellOptions): ModalShell | null {
    const panelStyle = opts.panelStyle ?? 'modal';
    const isCinematic = panelStyle === 'cinematic';
    const layer = MODAL_Z_INDEX[opts.layer ?? 'modal'];
    const sizeKey = opts.size ?? 'md';
    const width = MODAL_SIZES.width[sizeKey];
    const designWidthPx = MODAL_SIZES.designWidthPx[sizeKey];
    // Cinematic không có header/status — force false bất chấp opts.
    const withStatus = !isCinematic && opts.withStatus !== false;
    const withCloseButton = !isCinematic && opts.withCloseButton !== false;
    const withTitle = !isCinematic && opts.withTitle !== false;
    const mount = opts.mount ?? 'canvas-parent';

    const parent = mount === 'document-body'
        ? document.body
        : opts.scene.game.canvas.parentElement;
    if (!parent) return null;

    // Backdrop overlay — full-screen, dim, click outside = close.
    const overlay = document.createElement('div');
    overlay.classList.add('kageverse-overlay', opts.overlayClassName);
    Object.assign(overlay.style, {
        position: mount === 'document-body' ? 'fixed' : 'absolute',
        inset: '0',
        background: MODAL_COLORS.backdrop,
        zIndex: String(layer),
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: 'system-ui, sans-serif',
    });
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay && opts.onClose) opts.onClose();
    });
    if (mount === 'canvas-parent') {
        // canvas-parent cần `position: relative` để absolute con hoạt động đúng.
        // Phaser không tự set — đặt 1 lần ở đây an toàn (idempotent).
        (parent as HTMLElement).style.position = 'relative';
    }
    parent.appendChild(overlay);

    // Panel — modal style: gradient bg + border + rounded; cinematic: trong
    // suốt, body append trực tiếp lên overlay (chỉ giữ panel ref để API ngoài
    // luôn có 1 element root tham chiếu).
    const panel = document.createElement('div');
    if (isCinematic) {
        Object.assign(panel.style, {
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            color: MODAL_COLORS.text,
        });
    } else {
        Object.assign(panel.style, {
            width,
            maxHeight: MODAL_SIZES.maxHeight,
            background: `linear-gradient(180deg, ${MODAL_COLORS.panelBgTop} 0%, ${MODAL_COLORS.panelBgBottom} 100%)`,
            border: `${MODAL_SIZES.borderWidth} solid ${MODAL_COLORS.border}`,
            borderRadius: MODAL_SIZES.borderRadius,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            boxShadow: '0 8px 32px rgba(0,0,0,0.7)',
            color: MODAL_COLORS.text,
        });
    }
    overlay.appendChild(panel);

    // Header bar — chỉ khi modal style.
    const headerEl = document.createElement('div');
    const titleEl = document.createElement('div');
    if (!isCinematic) {
        headerEl.style.cssText = MODAL_HEADER_CSS;
        if (withTitle) {
            // Spacer trái cân đối close button (40px) để title text-align center
            // nằm đúng giữa panel, không bị lệch trái.
            if (withCloseButton) {
                const headerSpacer = document.createElement('div');
                headerSpacer.style.cssText = 'width:40px;flex-shrink:0;';
                headerEl.appendChild(headerSpacer);
            }
            Object.assign(titleEl.style, {
                flex: '1',
                padding: `${MODAL_SIZES.headerPaddingY} ${MODAL_SIZES.headerPaddingX}`,
                fontSize: '15px',
                fontWeight: 'bold',
                color: MODAL_COLORS.title,
                letterSpacing: '1px',
                textAlign: 'center',
            });
            titleEl.textContent = opts.title ?? '';
            headerEl.appendChild(titleEl);
        }

        if (withCloseButton) {
            const closeBtn = document.createElement('div');
            closeBtn.style.cssText = MODAL_CLOSE_BTN_CSS;
            closeBtn.innerHTML = '&#10005;';
            closeBtn.addEventListener('click', () => opts.onClose?.());
            headerEl.appendChild(closeBtn);
        }

        panel.appendChild(headerEl);
    }

    // Body — main content area. Modal style: flex container co dãn trong panel.
    // Cinematic: body chính là panel content, layout do caller quyết định.
    const body = document.createElement('div');
    if (isCinematic) {
        // Cinematic body = panel itself (alias). Caller append vào body như
        // bình thường nhưng thực chất children sẽ render trên overlay center.
        Object.assign(body.style, {
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '14px',
        });
        panel.appendChild(body);
    } else {
        Object.assign(body.style, {
            flex: '1',
            minHeight: '0',
            display: 'flex',
            flexDirection: 'column',
        });
        panel.appendChild(body);
    }

    // Status footer — chỉ tồn tại nếu modal style + opts.withStatus !== false.
    let statusEl: HTMLDivElement | null = null;
    if (withStatus) {
        statusEl = document.createElement('div');
        statusEl.style.cssText = MODAL_STATUS_CSS;
        panel.appendChild(statusEl);
    }

    // Responsive zoom — scale panel theo viewport. Dùng CSS `zoom` (Chrome/
    // Firefox 126+/Safari 16+) để mọi pixel hardcode bên trong (slot 56px,
    // font 12-14px, padding...) shrink đồng đều khi màn hình bé. Tính trên
    // cả width và height: lấy min để panel luôn fit cả 2 chiều. Margin 16px
    // mỗi cạnh để chừa breathing room.
    const VIEWPORT_MARGIN = 16;
    // Design height "ước lượng" cho zoom theo chiều cao — 92vh là max-height
    // hiện tại nên dùng 720px làm benchmark; nếu màn hình rất ngắn (vd
    // landscape phone < 500px), zoom sẽ shrink theo chiều cao.
    const DESIGN_HEIGHT_PX = 720;
    const computeZoom = (): number => {
        const vw = window.innerWidth;
        const vh = window.innerHeight;
        const zw = (vw - VIEWPORT_MARGIN * 2) / designWidthPx;
        const zh = (vh - VIEWPORT_MARGIN * 2) / DESIGN_HEIGHT_PX;
        return Math.max(0.4, Math.min(1, zw, zh));
    };
    const applyZoom = () => {
        // CSS `zoom` không có trong CSSStyleDeclaration type — dùng setProperty.
        panel.style.setProperty('zoom', String(computeZoom()));
    };
    applyZoom();
    window.addEventListener('resize', applyZoom);

    // Locale subscription registry — nhiều handler cùng cleanup khi teardown.
    const localeUnsubs: Array<() => void> = [];

    return {
        overlay,
        panel,
        headerEl,
        titleEl,
        body,
        statusEl,
        setTitle(text: string) {
            titleEl.textContent = text;
        },
        setStatus(text: string, kind: 'ok' | 'error' | 'muted' = 'muted') {
            if (!statusEl) return;
            statusEl.textContent = text;
            statusEl.style.color = kind === 'ok'
                ? MODAL_COLORS.statusOk
                : kind === 'error'
                    ? MODAL_COLORS.statusError
                    : MODAL_COLORS.statusText;
        },
        registerLocaleSync(handler: () => void) {
            localeUnsubs.push(onLocaleChange(handler));
        },
        teardown() {
            window.removeEventListener('resize', applyZoom);
            for (const unsub of localeUnsubs) {
                try { unsub(); } catch { /* ignore */ }
            }
            localeUnsubs.length = 0;
            overlay.remove();
        },
    };
}
