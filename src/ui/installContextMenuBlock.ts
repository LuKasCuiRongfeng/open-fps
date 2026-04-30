let installed = false;

export function installContextMenuBlock(): void {
  if (installed) return;

  installed = true;
  document.addEventListener("contextmenu", (event) => event.preventDefault());
}