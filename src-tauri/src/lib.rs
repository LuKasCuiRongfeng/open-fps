use std::fs;
use std::path::PathBuf;
use tauri::Manager;

/// Get the maps directory path.
/// 获取地图目录路径
fn get_maps_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {}", e))?;
    
    let maps_dir = app_data_dir.join("maps");
    
    // Create directory if it doesn't exist.
    // 如果目录不存在则创建
    if !maps_dir.exists() {
        fs::create_dir_all(&maps_dir)
            .map_err(|e| format!("Failed to create maps dir: {}", e))?;
    }
    
    Ok(maps_dir)
}

/// Save map data to file.
/// 保存地图数据到文件
#[tauri::command]
async fn save_map(app: tauri::AppHandle, filename: String, data: String) -> Result<String, String> {
    let maps_dir = get_maps_dir(&app)?;
    
    // Sanitize filename.
    // 净化文件名
    let safe_filename = filename
        .chars()
        .filter(|c| c.is_alphanumeric() || *c == '_' || *c == '-' || *c == ' ')
        .collect::<String>();
    
    if safe_filename.is_empty() {
        return Err("Invalid filename".to_string());
    }
    
    let filepath = maps_dir.join(format!("{}.ofps-map", safe_filename));
    
    fs::write(&filepath, &data)
        .map_err(|e| format!("Failed to write map file: {}", e))?;
    
    Ok(filepath.to_string_lossy().to_string())
}

/// Load map data from file.
/// 从文件加载地图数据
#[tauri::command]
async fn load_map(app: tauri::AppHandle, filename: String) -> Result<String, String> {
    let maps_dir = get_maps_dir(&app)?;
    let filepath = maps_dir.join(format!("{}.ofps-map", filename));
    
    if !filepath.exists() {
        return Err(format!("Map file not found: {}", filename));
    }
    
    fs::read_to_string(&filepath)
        .map_err(|e| format!("Failed to read map file: {}", e))
}

/// List all saved maps.
/// 列出所有保存的地图
#[tauri::command]
async fn list_maps(app: tauri::AppHandle) -> Result<Vec<String>, String> {
    let maps_dir = get_maps_dir(&app)?;
    
    let mut maps = Vec::new();
    
    let entries = fs::read_dir(&maps_dir)
        .map_err(|e| format!("Failed to read maps dir: {}", e))?;
    
    for entry in entries {
        let entry = entry.map_err(|e| format!("Failed to read entry: {}", e))?;
        let path = entry.path();
        
        if path.extension().map_or(false, |ext| ext == "ofps-map") {
            if let Some(stem) = path.file_stem() {
                maps.push(stem.to_string_lossy().to_string());
            }
        }
    }
    
    maps.sort();
    Ok(maps)
}

/// Delete a saved map.
/// 删除保存的地图
#[tauri::command]
async fn delete_map(app: tauri::AppHandle, filename: String) -> Result<(), String> {
    let maps_dir = get_maps_dir(&app)?;
    let filepath = maps_dir.join(format!("{}.ofps-map", filename));
    
    if !filepath.exists() {
        return Err(format!("Map file not found: {}", filename));
    }
    
    fs::remove_file(&filepath)
        .map_err(|e| format!("Failed to delete map file: {}", e))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .invoke_handler(tauri::generate_handler![
            save_map,
            load_map,
            list_maps,
            delete_map,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
