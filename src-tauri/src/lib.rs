use std::fs;
use std::path::PathBuf;
use tauri::Manager;

/// Get the projects directory path (for listing recent projects).
/// 获取项目目录路径（用于列出最近项目）
fn get_projects_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {}", e))?;
    
    let projects_dir = app_data_dir.join("projects");
    
    // Create directory if it doesn't exist.
    // 如果目录不存在则创建
    if !projects_dir.exists() {
        fs::create_dir_all(&projects_dir)
            .map_err(|e| format!("Failed to create projects dir: {}", e))?;
    }
    
    Ok(projects_dir)
}

/// Project file names.
/// 项目文件名
const PROJECT_FILE: &str = "project.json";
const MAP_FILE: &str = "map.json";
const SETTINGS_FILE: &str = "settings.json";

/// Open a project folder and return its path if valid.
/// 打开项目文件夹并返回路径（如果有效）
#[tauri::command]
async fn open_project(project_path: String) -> Result<String, String> {
    let path = PathBuf::from(&project_path);
    
    // Check if project.json exists.
    // 检查 project.json 是否存在
    let project_file = path.join(PROJECT_FILE);
    if !project_file.exists() {
        return Err("Invalid project folder: project.json not found".to_string());
    }
    
    Ok(project_path)
}

/// Read project metadata.
/// 读取项目元数据
#[tauri::command]
async fn read_project_metadata(project_path: String) -> Result<String, String> {
    let path = PathBuf::from(&project_path).join(PROJECT_FILE);
    fs::read_to_string(&path)
        .map_err(|e| format!("Failed to read project metadata: {}", e))
}

/// Read project map data.
/// 读取项目地图数据
#[tauri::command]
async fn read_project_map(project_path: String) -> Result<String, String> {
    let path = PathBuf::from(&project_path).join(MAP_FILE);
    if !path.exists() {
        return Err("Map file not found".to_string());
    }
    fs::read_to_string(&path)
        .map_err(|e| format!("Failed to read map data: {}", e))
}

/// Read project settings.
/// 读取项目设置
#[tauri::command]
async fn read_project_settings(project_path: String) -> Result<String, String> {
    let path = PathBuf::from(&project_path).join(SETTINGS_FILE);
    if !path.exists() {
        // Return empty string if settings don't exist yet.
        // 如果设置还不存在，返回空字符串
        return Ok("".to_string());
    }
    fs::read_to_string(&path)
        .map_err(|e| format!("Failed to read settings: {}", e))
}

/// Save project metadata.
/// 保存项目元数据
#[tauri::command]
async fn save_project_metadata(project_path: String, data: String) -> Result<(), String> {
    let path = PathBuf::from(&project_path);
    
    // Create project folder if it doesn't exist.
    // 如果项目文件夹不存在则创建
    if !path.exists() {
        fs::create_dir_all(&path)
            .map_err(|e| format!("Failed to create project folder: {}", e))?;
    }
    
    let file_path = path.join(PROJECT_FILE);
    fs::write(&file_path, &data)
        .map_err(|e| format!("Failed to save project metadata: {}", e))
}

/// Save project map data.
/// 保存项目地图数据
#[tauri::command]
async fn save_project_map(project_path: String, data: String) -> Result<(), String> {
    let path = PathBuf::from(&project_path);
    
    // Create project folder if it doesn't exist.
    // 如果项目文件夹不存在则创建
    if !path.exists() {
        fs::create_dir_all(&path)
            .map_err(|e| format!("Failed to create project folder: {}", e))?;
    }
    
    let file_path = path.join(MAP_FILE);
    fs::write(&file_path, &data)
        .map_err(|e| format!("Failed to save map data: {}", e))
}

/// Save project settings.
/// 保存项目设置
#[tauri::command]
async fn save_project_settings(project_path: String, data: String) -> Result<(), String> {
    let path = PathBuf::from(&project_path);
    
    // Create project folder if it doesn't exist.
    // 如果项目文件夹不存在则创建
    if !path.exists() {
        fs::create_dir_all(&path)
            .map_err(|e| format!("Failed to create project folder: {}", e))?;
    }
    
    let file_path = path.join(SETTINGS_FILE);
    fs::write(&file_path, &data)
        .map_err(|e| format!("Failed to save settings: {}", e))
}

/// Create a new project in the specified folder.
/// 在指定文件夹中创建新项目
#[tauri::command]
async fn create_project(project_path: String, metadata: String) -> Result<(), String> {
    let path = PathBuf::from(&project_path);
    
    // Create project folder.
    // 创建项目文件夹
    if !path.exists() {
        fs::create_dir_all(&path)
            .map_err(|e| format!("Failed to create project folder: {}", e))?;
    }
    
    // Create assets subfolder.
    // 创建 assets 子文件夹
    let assets_path = path.join("assets");
    if !assets_path.exists() {
        fs::create_dir_all(&assets_path)
            .map_err(|e| format!("Failed to create assets folder: {}", e))?;
    }
    
    // Write project metadata.
    // 写入项目元数据
    let metadata_path = path.join(PROJECT_FILE);
    fs::write(&metadata_path, &metadata)
        .map_err(|e| format!("Failed to write project metadata: {}", e))?;
    
    Ok(())
}

/// Check if a path is a valid project folder.
/// 检查路径是否为有效的项目文件夹
#[tauri::command]
async fn is_valid_project(project_path: String) -> Result<bool, String> {
    let path = PathBuf::from(&project_path);
    let project_file = path.join(PROJECT_FILE);
    Ok(project_file.exists())
}

/// Rename project folder.
/// 重命名项目文件夹
#[tauri::command]
async fn rename_project(old_path: String, new_name: String) -> Result<String, String> {
    let old_path = PathBuf::from(&old_path);
    
    // Get parent directory.
    // 获取父目录
    let parent = old_path.parent()
        .ok_or_else(|| "Cannot get parent directory".to_string())?;
    
    let new_path = parent.join(&new_name);
    
    // Check if new path already exists.
    // 检查新路径是否已存在
    if new_path.exists() {
        return Err(format!("Folder '{}' already exists", new_name));
    }
    
    // Rename the folder.
    // 重命名文件夹
    fs::rename(&old_path, &new_path)
        .map_err(|e| format!("Failed to rename project: {}", e))?;
    
    Ok(new_path.to_string_lossy().to_string())
}

/// List recent projects from app data.
/// 列出应用数据中的最近项目
#[tauri::command]
async fn list_recent_projects(app: tauri::AppHandle) -> Result<Vec<String>, String> {
    let projects_dir = get_projects_dir(&app)?;
    
    let mut projects = Vec::new();
    
    if let Ok(entries) = fs::read_dir(&projects_dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_dir() {
                let project_file = path.join(PROJECT_FILE);
                if project_file.exists() {
                    projects.push(path.to_string_lossy().to_string());
                }
            }
        }
    }
    
    Ok(projects)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .invoke_handler(tauri::generate_handler![
            // Project commands.
            // 项目命令
            open_project,
            create_project,
            is_valid_project,
            rename_project,
            read_project_metadata,
            read_project_map,
            read_project_settings,
            save_project_metadata,
            save_project_map,
            save_project_settings,
            list_recent_projects,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
