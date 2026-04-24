import React, { useEffect, useRef, useState } from 'react';
import type Phaser from 'phaser';

const GameComponent: React.FC = () => {
    const gameRef = useRef<HTMLDivElement>(null);
    const gameInstance = useRef<Phaser.Game | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [loadError, setLoadError] = useState<string>('');

    useEffect(() => {
        let isMounted = true;

        const loadGame = async () => {
            try {
                setLoadError('');
                // Dynamic Import of Phaser engine and config
                const PhaserModule = await import('phaser');
                const { getGameConfig } = await import('../game/GameConfig');

                if (isMounted && gameRef.current && !gameInstance.current) {
                    const config = getGameConfig(gameRef.current.id);
                    gameInstance.current = new PhaserModule.Game(config);
                    setIsLoading(false);
                }
            } catch (err) {
                console.error("Failed to dynamically load Phaser engine", err);
                if (isMounted) {
                    setLoadError('Khong khoi tao duoc game engine. Mo Console de xem loi chi tiet.');
                    setIsLoading(false);
                }
            }
        };

        loadGame();

        return () => {
            isMounted = false;
            if (gameInstance.current) {
                gameInstance.current.destroy(true);
                gameInstance.current = null;
            }
        };
    }, []);

    return (
        <div className="game-wrapper">
            {isLoading && (
                <div className="loading-overlay">
                    <p>Loading Kageverse Engine...</p>
                </div>
            )}
            {!isLoading && loadError && (
                <div className="loading-overlay">
                    <p>{loadError}</p>
                </div>
            )}
            <div id="phaser-game-container" ref={gameRef} />
        </div>
    );
};

export default GameComponent;
