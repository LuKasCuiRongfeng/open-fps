import ReactDOM from "react-dom/client";
import "@/tailwind.css";
import { installContextMenuBlock } from "@ui/installContextMenuBlock";
import EditorView from "./ui/EditorView";

installContextMenuBlock();

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(<EditorView />);