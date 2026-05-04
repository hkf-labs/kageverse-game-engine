import type { ServerEvent, ServerEventType } from './protocol/events';

// Handler nhận payload đã narrow theo type. Phaser scene + UI component
// subscribe qua key 'char_stats', 'player_moved'... và nhận đúng shape.
type HandlerFor<T extends ServerEventType> = (
    payload: Extract<ServerEvent, { t: T }>['p'],
) => void;

type AnyHandler = (payload: unknown) => void;

// Pub/sub đơn giản. Handlers giữ Set để safe khi remove giữa loop.
export class EventDispatcher {
    private handlers: Map<ServerEventType, Set<AnyHandler>> = new Map();

    on<T extends ServerEventType>(type: T, handler: HandlerFor<T>): () => void {
        let set = this.handlers.get(type);
        if (!set) {
            set = new Set();
            this.handlers.set(type, set);
        }
        set.add(handler as AnyHandler);
        // Return unsubscribe — caller dùng trong scene.shutdown để cleanup.
        return () => {
            set?.delete(handler as AnyHandler);
        };
    }

    off<T extends ServerEventType>(type: T, handler: HandlerFor<T>): void {
        this.handlers.get(type)?.delete(handler as AnyHandler);
    }

    /** Clear all listeners (e.g. logout). */
    clear(): void {
        this.handlers.clear();
    }

    dispatch(evt: ServerEvent): void {
        const set = this.handlers.get(evt.t);
        if (!set || set.size === 0) return;
        // Snapshot để handler tự unsubscribe trong callback không break iteration.
        const snapshot = Array.from(set);
        for (const h of snapshot) {
            try {
                h(evt.p);
            } catch (err) {
                console.error(`[realtime] handler ${evt.t} threw`, err);
            }
        }
    }
}
