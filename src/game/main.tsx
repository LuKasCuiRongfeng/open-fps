import ReactDOM from "react-dom/client";
import "@/tailwind.css";
import { installContextMenuBlock } from "@ui/installContextMenuBlock";
import PlayerView from "./ui/PlayerView";

installContextMenuBlock();

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(<PlayerView />);