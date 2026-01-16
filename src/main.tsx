import ReactDOM from "react-dom/client";
import App from "./App";
import "./tailwind.css";

// Disable browser context menu globally (right-click menu).
// 全局禁用浏览器右键菜单
document.addEventListener("contextmenu", (e) => {
  e.preventDefault();
});

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <App />,
);
