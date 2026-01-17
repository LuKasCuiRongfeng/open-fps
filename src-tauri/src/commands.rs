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
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {}", e))?;
    let recent_file = app_data_dir.join("recent_projects.json");

    if !recent_file.exists() {
        return Ok(Vec::new());
    }

    let content = fs::read_to_string(&recent_file)
        .map_err(|e| format!("Failed to read recent projects: {}", e))?;
    
    let paths: Vec<String> = serde_json::from_str(&content)
        .map_err(|e| format!("Failed to parse recent projects: {}", e))?;
    
    // Filter out invalid/deleted projects.
    // 过滤掉无效/已删除的项目
    let valid_paths: Vec<String> = paths
        .into_iter()
        .filter(|p| PathBuf::from(p).join(PROJECT_FILE).exists())
        .collect();

    Ok(valid_paths)
}

/// Add a project to the recent projects list.
/// 将项目添加到最近项目列表
#[tauri::command]
pub async fn add_recent_project(app: tauri::AppHandle, project_path: String) -> Result<(), String> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {}", e))?;
    
    if !app_data_dir.exists() {
        fs::create_dir_all(&app_data_dir)
            .map_err(|e| format!("Failed to create app data dir: {}", e))?;
    }

    let recent_file = app_data_dir.join("recent_projects.json");
    
    // Read existing list.
    // 读取现有列表
    let mut paths: Vec<String> = if recent_file.exists() {
        let content = fs::read_to_string(&recent_file).unwrap_or_default();
        serde_json::from_str(&content).unwrap_or_default()
    } else {
        Vec::new()
    };

    // Remove if already exists (to move to front).
    // 如果已存在则移除（以移动到最前面）
    paths.retain(|p| p != &project_path);
    
    // Add to front.
    // 添加到最前面
    paths.insert(0, project_path);
    
    // Keep only last 10.
    // 只保留最近的 10 个
    paths.truncate(10);
    
    // Write back.
    // 写回
    let content = serde_json::to_string_pretty(&paths)
        .map_err(|e| format!("Failed to serialize recent projects: {}", e))?;
    fs::write(&recent_file, content)
        .map_err(|e| format!("Failed to save recent projects: {}", e))?;

    Ok(())
}

/// Remove a project from the recent projects list.
/// 从最近项目列表中移除项目
#[tauri::command]
pub async fn remove_recent_project(app: tauri::AppHandle, project_path: String) -> Result<(), String> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {}", e))?;
    let recent_file = app_data_dir.join("recent_projects.json");
    
    if !recent_file.exists() {
        return Ok(());
    }

    let content = fs::read_to_string(&recent_file).unwrap_or_default();
    let mut paths: Vec<String> = serde_json::from_str(&content).unwrap_or_default();
    
    paths.retain(|p| p != &project_path);
    
    let content = serde_json::to_string_pretty(&paths)
        .map_err(|e| format!("Failed to serialize recent projects: {}", e))?;
    fs::write(&recent_file, content)
        .map_err(|e| format!("Failed to save recent projects: {}", e))?;

    Ok(())
}

// --- Generic file operations / 通用文件操作 ---

/// Read a text file from disk.
/// 从磁盘读取文本文件
#[tauri::command]
pub async fn read_text_file(path: String) -> Result<String, String> {
    let path = PathBuf::from(&path);
    fs::read_to_string(&path).map_err(|e| format!("Failed to read file: {}", e))
}

/// Write a text file to disk.
/// 将文本文件写入磁盘
#[tauri::command]
pub async fn write_text_file(path: String, content: String) -> Result<(), String> {
    let path = PathBuf::from(&path);
    // Ensure parent directory exists.
    // 确保父目录存在
    if let Some(parent) = path.parent() {
        if !parent.exists() {
            fs::create_dir_all(parent)
                .map_err(|e| format!("Failed to create directory: {}", e))?;
        }
    }
    fs::write(&path, content).map_err(|e| format!("Failed to write file: {}", e))
}

/// Read a binary file from disk as base64.
/// 从磁盘读取二进制文件为 base64
#[tauri::command]
pub async fn read_binary_file_base64(path: String) -> Result<String, String> {
    use base64::{Engine as _, engine::general_purpose::STANDARD};
    let path = PathBuf::from(&path);
    let bytes = fs::read(&path).map_err(|e| format!("Failed to read file: {}", e))?;
    Ok(STANDARD.encode(&bytes))
}

/// Write a binary file to disk from base64.
/// 从 base64 写入二进制文件到磁盘
#[tauri::command]
pub async fn write_binary_file_base64(path: String, base64: String) -> Result<(), String> {
    use base64::{Engine as _, engine::general_purpose::STANDARD};
    let path = PathBuf::from(&path);
    // Ensure parent directory exists.
    // 确保父目录存在
    if let Some(parent) = path.parent() {
        if !parent.exists() {
            fs::create_dir_all(parent)
                .map_err(|e| format!("Failed to create directory: {}", e))?;
        }
    }
    let bytes = STANDARD.decode(&base64).map_err(|e| format!("Failed to decode base64: {}", e))?;
    fs::write(&path, bytes).map_err(|e| format!("Failed to write file: {}", e))
}
