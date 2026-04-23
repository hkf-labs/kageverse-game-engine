export class WebSocketClient {
    private ws: WebSocket | null = null;
    private url: string;

    constructor(url: string) {
        this.url = url;
    }

    connect() {
        this.ws = new WebSocket(this.url);

        this.ws.onopen = () => {
            console.log('Connected to server via WebSocket:', this.url);
        };

        this.ws.onmessage = (event) => {
            console.log('Message from server:', event.data);
            // Handle incoming data, e.g., other players' positions
        };

        this.ws.onerror = (error) => {
            console.error('WebSocket Error:', error);
        };

        this.ws.onclose = () => {
            console.log('WebSocket connection closed.');
        };
    }

    sendPosition(x: number, y: number) {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify({ type: 'move', data: { x, y } }));
        }
    }
}
