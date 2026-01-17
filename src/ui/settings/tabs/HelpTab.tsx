// HelpTab: help and controls information tab.
// HelpTab：帮助和控制信息标签

import { inputConfig } from "../../../config/input";

function keyLabelFromCode(code: string) {
  if (code.startsWith("Key") && code.length === 4) return code.slice(3);
  if (code.startsWith("Digit") && code.length === 6) return code.slice(5);
  return code;
}

export function HelpTab() {
  return (
    <div className="space-y-5">
      <div>
        <div className="text-sm font-semibold">Controls</div>
        <div className="mt-2 space-y-1.5 text-sm text-white/75">
          <div>Click the game view to lock pointer.</div>
          <div>WASD / Arrow keys: Move</div>
          <div>Shift: Sprint</div>
          <div>Space: Jump</div>
          <div>
            {keyLabelFromCode(inputConfig.toggleCameraMode.codes[0])}: Toggle 1st / 3rd person
          </div>
          <div>
            {keyLabelFromCode(inputConfig.toggleThirdPersonStyle.codes[0])}: Toggle OTS / Chase
          </div>
          <div>Escape: Open/Close Settings</div>
        </div>
      </div>

      <div>
        <div className="text-sm font-semibold">Notes</div>
        <div className="mt-2 space-y-1.5 text-sm text-white/75">
          <div>Settings apply immediately.</div>
          <div>Reset restores default values.</div>
        </div>
      </div>
    </div>
  );
}
