// Tauri commands for project management.
// Tauri 项目管理命令

use std::fs;
use std::path::PathBuf;
use tauri::Manager;

/// Project file names.
/// 项目文件名
const PROJECT_FILE: &str = "project.json";
const MAP_FILE: &str = "map.json";
const SETTINGS_FILE: &str = "settings.json";

/// Get the projects directory path (for listing recent projects).
/// 获取项目目录路径（用于列出最近项目）
fn get_projects_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {}", e))?;

    let projects_dir = app_data_dir.join("projects");

    if !projects_dir.exists() {
        fs::create_dir_all(&projects_dir)
            .map_err(|e| format!("Failed to create projects dir: {}", e))?;
    }

    Ok(projects_dir)
}

/// Ensure project folder exists, create if not.
/// 确保项目文件夹存在，不存在则创建
fn ensure_project_folder(path: &PathBuf) -> Result<(), String> {
    if !path.exists() {
        fs::create_dir_all(path)
            .map_err(|e| format!("Failed to create project folder: {}", e))?;
    }
    Ok(())
}

// --- Project validation / 项目验证 ---

/// Open a project folder and return its path if valid.
/// 打开项目文件夹并返回路径（如果有效）
#[tauri::command]
pub async fn open_project(project_path: String) -> Result<String, String> {
    let path = PathBuf::from(&project_path);
    let project_file = path.join(PROJECT_FILE);

    if !project_file.exists() {
        return Err("Invalid project folder: project.json not found".to_string());
    }

    Ok(project_path)
}

/// Check if a path is a valid project folder.
/// 检查路径是否为有效的项目文件夹
#[tauri::command]
pub async fn is_valid_project(project_path: String) -> Result<bool, String> {
    let path = PathBuf::from(&project_path);
    Ok(path.join(PROJECT_FILE).exists())
}

// --- Project read operations / 项目读取操作 ---

/// Read project metadata (project.json).
/// 读取项目元数据 (project.json)
#[tauri::command]
pub async fn read_project_metadata(project_path: String) -> Result<String, String> {
    let path = PathBuf::from(&project_path).join(PROJECT_FILE);
    fs::read_to_string(&path).map_err(|e| format!("Failed to read project metadata: {}", e))
}

/// Read project map data (map.json).
/// 读取项目地图数据 (map.json)
#[tauri::command]
pub async fn read_project_map(project_path: String) -> Result<String, String> {
    let path = PathBuf::from(&project_path).join(MAP_FILE);
    if !path.exists() {
        return Err("Map file not found".to_string());
    }
    fs::read_to_string(&path).map_err(|e| format!("Failed to read map data: {}", e))
}

/// Read project settings (settings.json).
/// 读取项目设置 (settings.json)
/// Returns empty string if settings file doesn't exist yet.
/// 如果设置文件尚不存在，返回空字符串
#[tauri::command]
pub async fn read_project_settings(project_path: String) -> Result<String, String> {
    let path = PathBuf::from(&project_path).join(SETTINGS_FILE);
    if !path.exists() {
        return Ok("".to_string());
    }
    fs::read_to_string(&path).map_err(|e| format!("Failed to read settings: {}", e))
}

// --- Project write operations / 项目写入操作 ---

/// Save project metadata to project.json.
/// 保存项目元数据到 project.json
#[tauri::command]
pub async fn save_project_metadata(project_path: String, data: String) -> Result<(), String> {
    let path = PathBuf::from(&project_path);
    ensure_project_folder(&path)?;
    fs::write(path.join(PROJECT_FILE), &data)
        .map_err(|e| format!("Failed to save project metadata: {}", e))
}

/// Save project map data to map.json.
/// 保存项目地图数据到 map.json
#[tauri::command]
pub async fn save_project_map(project_path: String, data: String) -> Result<(), String> {
    let path = PathBuf::from(&project_path);
    ensure_project_folder(&path)?;
    fs::write(path.join(MAP_FILE), &data)
        .map_err(|e| format!("Failed to save map data: {}", e))
}

/// Save project settings to settings.json.
/// 保存项目设置到 settings.json
#[tauri::command]
pub async fn save_project_settings(project_path: String, data: String) -> Result<(), String> {
    let path = PathBuf::from(&project_path);
    ensure_project_folder(&path)?;
    fs::write(path.join(SETTINGS_FILE), &data)
        .map_err(|e| format!("Failed to save settings: {}", e))
}

// --- Project management / 项目管理 ---

/// Create a new project in the specified folder.
/// 在指定文件夹中创建新项目
/// Creates project folder, assets subfolder, and writes metadata.
/// 创建项目文件夹、assets 子文件夹，并写入元数据
#[tauri::command]
pub async fn create_project(project_path: String, metadata: String) -> Result<(), String> {
    let path = PathBuf::from(&project_path);
    ensure_project_folder(&path)?;

    // Create assets subfolder for future asset storage.
    // 创建 assets 子文件夹用于将来存储资源
    let assets_path = path.join("assets");
    if !assets_path.exists() {
        fs::create_dir_all(&assets_path)
            .map_err(|e| format!("Failed to create assets folder: {}", e))?;
    }

    fs::write(path.join(PROJECT_FILE), &metadata)
        .map_err(|e| format!("Failed to write project metadata: {}", e))
}

/// Rename project folder to new name.
/// 将项目文件夹重命名为新名称
/// Returns the new full path after renaming.
/// 返回重命名后的完整路径
#[tauri::command]
pub async fn rename_project(old_path: String, new_name: String) -> Result<String, String> {
    let old_path = PathBuf::from(&old_path);
    let parent = old_path
        .parent()
        .ok_or_else(|| "Cannot get parent directory".to_string())?;
    let new_path = parent.join(&new_name);

    if new_path.exists() {
        return Err(format!("Folder '{}' already exists", new_name));
    }

    fs::rename(&old_path, &new_path).map_err(|e| format!("Failed to rename project: {}", e))?;
    Ok(new_path.to_string_lossy().to_string())
}

/// List recent projects from app data directory.
/// 列出应用数据目录中的最近项目
/// Scans the projects folder and returns paths of valid projects.
/// 扫描 projects 文件夹并返回有效项目的路径
#[tauri::command]
pub async fn list_recent_projects(app: tauri::AppHandle) -> Result<Vec<String>, String> {
    let projects_dir = get_projects_dir(&app)?;
    let mut projects = Vec::new();

    if let Ok(entries) = fs::read_dir(&projects_dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            // Only include directories with valid project.json.
            // 仅包含具有有效 project.json 的目录
            if path.is_dir() && path.join(PROJECT_FILE).exists() {
                projects.push(path.to_string_lossy().to_string());
            }
        }
    }

    Ok(projects)
}
