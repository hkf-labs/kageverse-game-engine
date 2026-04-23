import GameComponent from './components/GameComponent';
import './App.css';

function App() {
  return (
    <div className="App">
      <header className="kageverse-header">
        <h1>Kageverse Web3 Engine</h1>
        <p>Dynamic Loaded Phaser Game MMORPG Boilerplate</p>
      </header>
      <main>
        <GameComponent />
      </main>
    </div>
  );
}

export default App;
