import { resolveAppTarget } from "./app/appTarget";
import EditorView from "./ui/EditorView";
import PlayerView from "./ui/PlayerView";

function App() {
    const appTarget = resolveAppTarget();

    return appTarget === "game" ? <PlayerView /> : <EditorView />;
}

export default App;
