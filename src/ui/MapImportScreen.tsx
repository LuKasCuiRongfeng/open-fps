// MapImportScreen: Pre-game screen to import or skip map loading.
// MapImportScreen：游戏前导入或跳过地图加载的界面

import { useState, useCallback } from "react";
import { importMapWithDialog } from "../game/editor";
import type { MapData } from "../game/editor/MapData";

interface Props {
  onComplete: (mapData: MapData | null) => void;
}

/**
 * Map import screen shown before game starts.
 * 游戏开始前显示的地图导入界面
 *
 * User can:
 * - Import a map file via file dialog
 * - Skip to use procedural terrain (no editing)
 *
 * 用户可以：
 * - 通过文件对话框导入地图文件
 * - 跳过，使用程序生成的地形（不可编辑）
 */
export function MapImportScreen({ onComplete }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Handle import via file dialog.
  // 通过文件对话框处理导入
  const handleImport = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const mapData = await importMapWithDialog();
      if (mapData) {
        onComplete(mapData);
      } else {
        // User cancelled dialog.
        // 用户取消对话框
        setLoading(false);
      }
    } catch (e) {
      setError(`Failed to load map: ${e}`);
      setLoading(false);
    }
  }, [onComplete]);

  // Skip import, use procedural terrain.
  // 跳过导入，使用程序生成的地形
  const handleSkip = useCallback(() => {
    onComplete(null);
  }, [onComplete]);

  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-gradient-to-b from-slate-900 to-slate-800">
      <div className="w-full max-w-md rounded-xl bg-black/60 p-8 backdrop-blur-md">
        {/* Title / 标题 */}
        <h1 className="mb-2 text-center text-3xl font-bold text-white">
          Open FPS
        </h1>
        <p className="mb-8 text-center text-sm text-gray-400">
          Terrain Editor & Game
        </p>

        {/* Description / 描述 */}
        <p className="mb-6 text-center text-sm text-gray-300">
          Import a map file to edit, or skip to explore procedural terrain.
          <br />
          <span className="text-gray-400">
            导入地图文件进行编辑，或跳过以探索程序生成的地形。
          </span>
        </p>

        {error && (
          <div className="mb-4 rounded-lg bg-red-900/30 p-3 text-sm text-red-300">
            {error}
          </div>
        )}

        {/* Actions / 操作 */}
        <div className="flex flex-col gap-3">
          <button
            onClick={handleImport}
            disabled={loading}
            className="w-full rounded-lg bg-blue-600 py-3 font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-gray-700 disabled:text-gray-500"
          >
            {loading ? "Loading..." : "Import Map..."}
          </button>

          <button
            onClick={handleSkip}
            disabled={loading}
            className="w-full rounded-lg bg-gray-700 py-3 font-medium text-white transition-colors hover:bg-gray-600 disabled:cursor-not-allowed disabled:text-gray-500"
          >
            Skip (Explore Only)
          </button>
        </div>

        {/* Info / 说明 */}
        <div className="mt-6 rounded-lg bg-blue-900/30 p-3 text-xs text-blue-200">
          <strong>Note:</strong> If you skip, terrain will be procedurally generated
          and cannot be edited. You can export the procedural terrain from Settings
          to create a map file for later editing.
          <br />
          <strong>注意：</strong> 如果跳过，地形将是程序生成的，无法编辑。
          您可以从设置中导出程序地形以创建地图文件供以后编辑。
        </div>
      </div>
    </div>
  );
}
