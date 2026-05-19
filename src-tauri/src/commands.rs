// Tauri commands for project management.
// Tauri 项目管理命令

use serde::{Deserialize, Serialize};
use std::fs::{self, File};
use std::io::Write;
use std::path::{Component, Path, PathBuf};
use std::process::{Command, Stdio};
use std::time::{Instant, SystemTime, UNIX_EPOCH};
use tauri::Manager;

/// Project file names.
/// 项目文件名
const PROJECT_FILE: &str = "project.json";
const MAP_FILE: &str = "map.json";
const MAPS_DIR: &str = "maps";
const SETTINGS_FILE: &str = "settings.json";
const RECENT_PROJECTS_FILE: &str = "recent_projects.json";
const COOK_MAP_MAX_STAGE_COUNT: usize = 16;
const COOK_MAP_MAX_SCOPE_KEYS: usize = 4096;
const COOK_MAP_MAX_OUTPUT_CHARS: usize = 24_000;
const COOK_MAP_ALLOWED_STAGES: &[&str] = &[
    "assetRegistry",
    "semantics",
    "terrain",
    "paint",
    "vegetation",
    "objects",
    "collision",
    "nav",
];

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CookMapScopes {
    terrain_regions: Vec<String>,
    paint_regions: Vec<String>,
    vegetation_regions: Vec<String>,
    partition_cells: Vec<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CookMapRequest {
    project_path: String,
    map_id: String,
    dry_run: bool,
    full: bool,
    changed_stages: Vec<String>,
    scopes: CookMapScopes,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CookMapResult {
    command: Vec<String>,
    exit_code: i32,
    stdout: String,
    stderr: String,
    duration_ms: u64,
}

/// Ensure project folder exists, create if not.
/// 确保项目文件夹存在，不存在则创建
fn ensure_project_folder(path: &PathBuf) -> Result<(), String> {
    if !path.exists() {
        fs::create_dir_all(path).map_err(|e| format!("Failed to create project folder: {}", e))?;
    }
    Ok(())
}

fn ensure_parent_directory(path: &PathBuf) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        if !parent.exists() {
            fs::create_dir_all(parent).map_err(|e| format!("Failed to create directory: {}", e))?;
        }
    }

    Ok(())
}

fn safe_write_temp_path(path: &PathBuf) -> Result<PathBuf, String> {
    let file_name = path
        .file_name()
        .ok_or_else(|| "Path must include a file name".to_string())?
        .to_string_lossy();
    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|e| format!("Failed to create temp file timestamp: {}", e))?
        .as_nanos();

    Ok(path.with_file_name(format!(
        ".{}.{}.{}.tmp",
        file_name,
        std::process::id(),
        timestamp
    )))
}

fn safe_write_backup_path(path: &PathBuf) -> Result<PathBuf, String> {
    let file_name = path
        .file_name()
        .ok_or_else(|| "Path must include a file name".to_string())?
        .to_string_lossy();

    Ok(path.with_file_name(format!(".{}.bak", file_name)))
}

fn recover_safe_write(path: &PathBuf) -> Result<(), String> {
    let backup_path = safe_write_backup_path(path)?;
    if path.exists() {
        if backup_path.exists() {
            fs::remove_file(&backup_path)
                .map_err(|e| format!("Failed to remove stale backup file: {}", e))?;
        }
        return Ok(());
    }

    if backup_path.exists() {
        // EN: A previous save may have crashed after moving the old file aside; restore it before any read/write.
        // 中文: 上次保存可能在移走旧文件后崩溃；任何读写前先恢复旧文件。
        fs::rename(&backup_path, path)
            .map_err(|e| format!("Failed to recover backup file: {}", e))?;
    }

    Ok(())
}

fn write_temp_file(path: &PathBuf, bytes: &[u8]) -> Result<(), String> {
    let mut file = File::create(path).map_err(|e| format!("Failed to create temp file: {}", e))?;
    file.write_all(bytes)
        .map_err(|e| format!("Failed to write temp file: {}", e))?;
    file.sync_all()
        .map_err(|e| format!("Failed to sync temp file: {}", e))
}

fn safe_write(path: &PathBuf, bytes: &[u8]) -> Result<(), String> {
    // EN: Stage through temp + backup so interrupted saves recover the previous complete file on next access.
    // 中文: 通过临时文件与备份文件分阶段写入，使中断保存能在下次访问时恢复旧完整文件。
    ensure_parent_directory(path)?;
    recover_safe_write(path)?;

    let temp_path = safe_write_temp_path(path)?;
    let backup_path = safe_write_backup_path(path)?;
    write_temp_file(&temp_path, bytes)?;

    let had_existing_file = path.exists();
    if had_existing_file {
        if backup_path.exists() {
            fs::remove_file(&backup_path)
                .map_err(|e| format!("Failed to remove stale backup file: {}", e))?;
        }

        if let Err(error) = fs::rename(path, &backup_path) {
            let _ = fs::remove_file(&temp_path);
            return Err(format!("Failed to stage existing file backup: {}", error));
        }
    }

    if let Err(error) = fs::rename(&temp_path, path) {
        if had_existing_file && backup_path.exists() && !path.exists() {
            let _ = fs::rename(&backup_path, path);
        }
        let _ = fs::remove_file(&temp_path);
        return Err(format!("Failed to replace file: {}", error));
    }

    if backup_path.exists() {
        let _ = fs::remove_file(&backup_path);
    }

    Ok(())
}

fn validate_single_path_segment(value: &str, field_name: &str) -> Result<(), String> {
    if value.is_empty() {
        return Err(format!("{} cannot be empty", field_name));
    }

    let mut components = Path::new(value).components();
    match (components.next(), components.next()) {
        (Some(Component::Normal(_)), None) => Ok(()),
        _ => Err(format!("{} must be a single folder-safe name", field_name)),
    }
}

fn project_map_manifest_path(project_path: &str, map_id: &str) -> Result<PathBuf, String> {
    validate_single_path_segment(map_id, "map_id")?;

    Ok(PathBuf::from(project_path)
        .join(MAPS_DIR)
        .join(map_id)
        .join(MAP_FILE))
}

fn validate_relative_file_path(value: &str, field_name: &str) -> Result<(), String> {
    if value.is_empty() {
        return Err(format!("{} cannot be empty", field_name));
    }

    for component in Path::new(value).components() {
        match component {
            Component::Normal(_) => {}
            _ => return Err(format!("{} must be a safe relative file path", field_name)),
        }
    }

    Ok(())
}

fn project_map_chunk_path(
    project_path: &str,
    map_id: &str,
    chunk_path: &str,
) -> Result<PathBuf, String> {
    validate_single_path_segment(map_id, "map_id")?;
    validate_relative_file_path(chunk_path, "chunk_path")?;

    Ok(PathBuf::from(project_path)
        .join(MAPS_DIR)
        .join(map_id)
        .join(chunk_path))
}

fn recent_projects_file(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {}", e))?;

    if !app_data_dir.exists() {
        fs::create_dir_all(&app_data_dir)
            .map_err(|e| format!("Failed to create app data dir: {}", e))?;
    }

    Ok(app_data_dir.join(RECENT_PROJECTS_FILE))
}

fn load_recent_project_paths(path: &PathBuf) -> Result<Vec<String>, String> {
    recover_safe_write(path)?;

    if !path.exists() {
        return Ok(Vec::new());
    }

    let content =
        fs::read_to_string(path).map_err(|e| format!("Failed to read recent projects: {}", e))?;
    serde_json::from_str(&content).map_err(|e| format!("Failed to parse recent projects: {}", e))
}

fn save_recent_project_paths(path: &PathBuf, paths: &[String]) -> Result<(), String> {
    let content = serde_json::to_string_pretty(paths)
        .map_err(|e| format!("Failed to serialize recent projects: {}", e))?;
    safe_write(path, content.as_bytes())
        .map_err(|e| format!("Failed to save recent projects: {}", e))
}

// --- Project validation / 项目验证 ---

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
    recover_safe_write(&path)?;
    fs::read_to_string(&path).map_err(|e| format!("Failed to read project metadata: {}", e))
}

/// Read project map manifest (map.json).
/// 读取项目地图清单 (map.json)
#[tauri::command]
pub async fn read_project_map_manifest(
    project_path: String,
    map_id: String,
) -> Result<String, String> {
    let path = project_map_manifest_path(&project_path, &map_id)?;
    recover_safe_write(&path)?;
    if !path.exists() {
        return Err("Map manifest not found".to_string());
    }
    fs::read_to_string(&path).map_err(|e| format!("Failed to read map manifest: {}", e))
}

/// Read a project map height chunk as base64.
/// 以 base64 读取项目地图高度 chunk
#[tauri::command]
pub async fn read_project_map_chunk_base64(
    project_path: String,
    map_id: String,
    chunk_path: String,
) -> Result<String, String> {
    use base64::{Engine as _, engine::general_purpose::STANDARD};

    let path = project_map_chunk_path(&project_path, &map_id, &chunk_path)?;
    recover_safe_write(&path)?;
    if !path.exists() {
        return Err("Map chunk not found".to_string());
    }

    let bytes = fs::read(&path).map_err(|e| format!("Failed to read map chunk: {}", e))?;
    Ok(STANDARD.encode(&bytes))
}

/// Read project settings (settings.json).
/// 读取项目设置 (settings.json)
/// Returns empty string if settings file doesn't exist yet.
/// 如果设置文件尚不存在，返回空字符串
#[tauri::command]
pub async fn read_project_settings(project_path: String) -> Result<String, String> {
    let path = PathBuf::from(&project_path).join(SETTINGS_FILE);
    recover_safe_write(&path)?;
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
    safe_write(&path.join(PROJECT_FILE), data.as_bytes())
        .map_err(|e| format!("Failed to save project metadata: {}", e))
}

/// Save project map manifest to map.json.
/// 保存项目地图清单到 map.json
#[tauri::command]
pub async fn save_project_map_manifest(
    project_path: String,
    map_id: String,
    data: String,
) -> Result<(), String> {
    let project_root = PathBuf::from(&project_path);
    ensure_project_folder(&project_root)?;

    let path = project_map_manifest_path(&project_path, &map_id)?;

    safe_write(&path, data.as_bytes()).map_err(|e| format!("Failed to save map manifest: {}", e))
}

/// Save a project map height chunk from base64.
/// 从 base64 保存项目地图高度 chunk
#[tauri::command]
pub async fn save_project_map_chunk_base64(
    project_path: String,
    map_id: String,
    chunk_path: String,
    base64: String,
) -> Result<(), String> {
    use base64::{Engine as _, engine::general_purpose::STANDARD};

    let project_root = PathBuf::from(&project_path);
    ensure_project_folder(&project_root)?;

    let path = project_map_chunk_path(&project_path, &map_id, &chunk_path)?;
    let bytes = STANDARD
        .decode(&base64)
        .map_err(|e| format!("Failed to decode map chunk: {}", e))?;
    safe_write(&path, &bytes).map_err(|e| format!("Failed to save map chunk: {}", e))
}

/// Save project settings to settings.json.
/// 保存项目设置到 settings.json
#[tauri::command]
pub async fn save_project_settings(project_path: String, data: String) -> Result<(), String> {
    let path = PathBuf::from(&project_path);
    ensure_project_folder(&path)?;
    safe_write(&path.join(SETTINGS_FILE), data.as_bytes())
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

    safe_write(&path.join(PROJECT_FILE), metadata.as_bytes())
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

    validate_single_path_segment(&new_name, "new_name")?;

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
    let recent_file = recent_projects_file(&app)?;
    let paths = load_recent_project_paths(&recent_file)?;

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
    let recent_file = recent_projects_file(&app)?;
    let mut paths = load_recent_project_paths(&recent_file)?;

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
    save_recent_project_paths(&recent_file, &paths)
}

/// Remove a project from the recent projects list.
/// 从最近项目列表中移除项目
#[tauri::command]
pub async fn remove_recent_project(
    app: tauri::AppHandle,
    project_path: String,
) -> Result<(), String> {
    let recent_file = recent_projects_file(&app)?;
    let mut paths = load_recent_project_paths(&recent_file)?;

    paths.retain(|p| p != &project_path);

    save_recent_project_paths(&recent_file, &paths)
}

// --- Controlled world cook execution / 受控世界 cook 执行 ---

/// Run the whitelisted map cook workflow for the editor.
/// 为编辑器运行白名单地图 cook 工作流。
#[tauri::command]
pub async fn run_cook_map(request: CookMapRequest) -> Result<CookMapResult, String> {
    tauri::async_runtime::spawn_blocking(move || run_cook_map_blocking(request))
        .await
        .map_err(|e| format!("Failed to join cook command task: {}", e))?
}

/// Run the whitelisted world generation graph workflow for the editor.
/// 为编辑器运行白名单世界生成图工作流。
#[tauri::command]
pub async fn run_world_generation_graph(request: CookMapRequest) -> Result<CookMapResult, String> {
    tauri::async_runtime::spawn_blocking(move || run_world_generation_graph_blocking(request))
        .await
        .map_err(|e| format!("Failed to join graph command task: {}", e))?
}

fn run_cook_map_blocking(request: CookMapRequest) -> Result<CookMapResult, String> {
    // EN: Build argv from structured fields only; never pass user text through a shell.
    // 中文: 只从结构化字段构造 argv；绝不把用户文本交给 shell 解释。
    let args = create_cook_map_args(&request)?;
    let repository_root = repository_root()?;
    let script_path = repository_root.join("scripts").join("cook-map-assets.mjs");
    if !script_path.exists() {
        return Err("Cook map script is not available in this build".to_string());
    }

    let executable = pnpm_executable();
    let mut command_display = Vec::with_capacity(args.len() + 1);
    command_display.push(executable.to_string());
    command_display.extend(args.iter().cloned());

    let started_at = Instant::now();
    let output = Command::new(executable)
        .current_dir(&repository_root)
        .args(&args)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output()
        .map_err(|e| format!("Failed to run cook map command: {}", e))?;

    Ok(CookMapResult {
        command: command_display,
        exit_code: output
            .status
            .code()
            .unwrap_or_else(|| if output.status.success() { 0 } else { -1 }),
        stdout: truncate_command_output(&output.stdout),
        stderr: truncate_command_output(&output.stderr),
        duration_ms: started_at.elapsed().as_millis().min(u128::from(u64::MAX)) as u64,
    })
}

fn run_world_generation_graph_blocking(request: CookMapRequest) -> Result<CookMapResult, String> {
    let args = create_world_generation_graph_args(&request)?;
    let repository_root = repository_root()?;
    let script_path = repository_root
        .join("scripts")
        .join("execute-world-generation-graph.mjs");
    if !script_path.exists() {
        return Err("World generation graph script is not available in this build".to_string());
    }

    let executable = pnpm_executable();
    let mut command_display = Vec::with_capacity(args.len() + 1);
    command_display.push(executable.to_string());
    command_display.extend(args.iter().cloned());

    let started_at = Instant::now();
    let output = Command::new(executable)
        .current_dir(&repository_root)
        .args(&args)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output()
        .map_err(|e| format!("Failed to run world generation graph command: {}", e))?;

    Ok(CookMapResult {
        command: command_display,
        exit_code: output
            .status
            .code()
            .unwrap_or_else(|| if output.status.success() { 0 } else { -1 }),
        stdout: truncate_command_output(&output.stdout),
        stderr: truncate_command_output(&output.stderr),
        duration_ms: started_at.elapsed().as_millis().min(u128::from(u64::MAX)) as u64,
    })
}

fn create_cook_map_args(request: &CookMapRequest) -> Result<Vec<String>, String> {
    let project_path = validate_cook_project_path(&request.project_path)?;
    validate_single_path_segment(&request.map_id, "map_id")?;
    validate_cook_stages(&request.changed_stages)?;
    validate_cook_scopes(&request.scopes)?;

    if request.full && (has_cook_stage_input(request) || has_cook_scope_input(&request.scopes)) {
        return Err("Full cook request cannot include changed stages or local scopes".to_string());
    }

    if !request.full && !has_cook_stage_input(request) && !has_cook_scope_input(&request.scopes) {
        return Err(
            "Cook request must include a full rebuild or at least one local change".to_string(),
        );
    }

    let mut args = vec![
        "cook:map".to_string(),
        "--".to_string(),
        project_path.to_string_lossy().to_string(),
        "--map".to_string(),
        request.map_id.clone(),
    ];

    if request.dry_run {
        args.push("--plan".to_string());
    }

    if request.full {
        args.push("--full".to_string());
        return Ok(args);
    }

    if !request.changed_stages.is_empty() {
        args.push("--changed-stage".to_string());
        args.push(request.changed_stages.join(","));
    }

    append_cook_scope_args(
        &mut args,
        "--terrain-region",
        &request.scopes.terrain_regions,
    );
    append_cook_scope_args(&mut args, "--paint-region", &request.scopes.paint_regions);
    append_cook_scope_args(
        &mut args,
        "--vegetation-region",
        &request.scopes.vegetation_regions,
    );
    append_cook_scope_args(&mut args, "--cell", &request.scopes.partition_cells);
    Ok(args)
}

fn create_world_generation_graph_args(request: &CookMapRequest) -> Result<Vec<String>, String> {
    let project_path = validate_cook_project_path(&request.project_path)?;
    validate_single_path_segment(&request.map_id, "map_id")?;
    validate_cook_stages(&request.changed_stages)?;
    validate_cook_scopes(&request.scopes)?;

    if request.full && (has_cook_stage_input(request) || has_cook_scope_input(&request.scopes)) {
        return Err("Full graph request cannot include changed stages or local scopes".to_string());
    }

    if !request.full && !has_cook_stage_input(request) && !has_cook_scope_input(&request.scopes) {
        return Err(
            "Graph request must include a full rebuild or at least one local change".to_string(),
        );
    }

    let mut args = vec![
        "gen:graph".to_string(),
        "--".to_string(),
        project_path.to_string_lossy().to_string(),
        "--map".to_string(),
        request.map_id.clone(),
    ];

    if request.dry_run {
        args.push("--plan".to_string());
    }

    if request.full {
        args.push("--full".to_string());
        return Ok(args);
    }

    if !request.changed_stages.is_empty() {
        args.push("--changed-stage".to_string());
        args.push(request.changed_stages.join(","));
    }

    append_cook_scope_args(
        &mut args,
        "--terrain-region",
        &request.scopes.terrain_regions,
    );
    append_cook_scope_args(&mut args, "--paint-region", &request.scopes.paint_regions);
    append_cook_scope_args(
        &mut args,
        "--vegetation-region",
        &request.scopes.vegetation_regions,
    );
    append_cook_scope_args(&mut args, "--cell", &request.scopes.partition_cells);
    Ok(args)
}

fn validate_cook_project_path(value: &str) -> Result<PathBuf, String> {
    if value.trim().is_empty() {
        return Err("project_path cannot be empty".to_string());
    }

    let path = fs::canonicalize(PathBuf::from(value))
        .map_err(|e| format!("Failed to resolve project path: {}", e))?;
    if !path.is_dir() {
        return Err("project_path must point to a project folder".to_string());
    }
    if !path.join(PROJECT_FILE).exists() {
        return Err("project_path is missing project.json".to_string());
    }

    Ok(path)
}

fn validate_cook_stages(stages: &[String]) -> Result<(), String> {
    if stages.len() > COOK_MAP_MAX_STAGE_COUNT {
        return Err(format!(
            "Cook request has too many changed stages: {}",
            stages.len()
        ));
    }

    for stage in stages {
        if !COOK_MAP_ALLOWED_STAGES.contains(&stage.as_str()) {
            return Err(format!("Unknown cook stage '{}'", stage));
        }
    }

    Ok(())
}

fn validate_cook_scopes(scopes: &CookMapScopes) -> Result<(), String> {
    validate_grid_key_list("terrain region", &scopes.terrain_regions)?;
    validate_grid_key_list("paint region", &scopes.paint_regions)?;
    validate_grid_key_list("vegetation region", &scopes.vegetation_regions)?;
    validate_grid_key_list("partition cell", &scopes.partition_cells)
}

fn validate_grid_key_list(field_name: &str, values: &[String]) -> Result<(), String> {
    if values.len() > COOK_MAP_MAX_SCOPE_KEYS {
        return Err(format!(
            "Cook request has too many {} keys: {}",
            field_name,
            values.len()
        ));
    }

    for value in values {
        validate_grid_key(field_name, value)?;
    }

    Ok(())
}

fn validate_grid_key(field_name: &str, value: &str) -> Result<(), String> {
    let (x, z) = value
        .split_once(',')
        .ok_or_else(|| format!("{} key '{}' must use '<x>,<z>'", field_name, value))?;
    if !is_integer_text(x) || !is_integer_text(z) {
        return Err(format!(
            "{} key '{}' must use integer coordinates",
            field_name, value
        ));
    }

    x.parse::<i32>()
        .and_then(|_| z.parse::<i32>())
        .map_err(|_| {
            format!(
                "{} key '{}' is outside the supported coordinate range",
                field_name, value
            )
        })?;
    Ok(())
}

fn is_integer_text(value: &str) -> bool {
    let digits = value.strip_prefix('-').unwrap_or(value);
    !digits.is_empty() && digits.bytes().all(|byte| byte.is_ascii_digit())
}

fn has_cook_stage_input(request: &CookMapRequest) -> bool {
    !request.changed_stages.is_empty()
}

fn has_cook_scope_input(scopes: &CookMapScopes) -> bool {
    !scopes.terrain_regions.is_empty()
        || !scopes.paint_regions.is_empty()
        || !scopes.vegetation_regions.is_empty()
        || !scopes.partition_cells.is_empty()
}

fn append_cook_scope_args(args: &mut Vec<String>, flag: &str, values: &[String]) {
    for value in values {
        args.push(flag.to_string());
        args.push(value.clone());
    }
}

fn repository_root() -> Result<PathBuf, String> {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .map(Path::to_path_buf)
        .ok_or_else(|| "Failed to resolve repository root".to_string())
}

fn pnpm_executable() -> &'static str {
    if cfg!(windows) { "pnpm.cmd" } else { "pnpm" }
}

fn truncate_command_output(bytes: &[u8]) -> String {
    let text = String::from_utf8_lossy(bytes);
    if text.chars().count() <= COOK_MAP_MAX_OUTPUT_CHARS {
        return text.to_string();
    }

    let mut truncated = text
        .chars()
        .take(COOK_MAP_MAX_OUTPUT_CHARS)
        .collect::<String>();
    truncated.push_str("\n[output truncated]");
    truncated
}

// --- Generic file operations / 通用文件操作 ---

/// Read a text file from disk.
/// 从磁盘读取文本文件
#[tauri::command]
pub async fn read_text_file(path: String) -> Result<String, String> {
    let path = PathBuf::from(&path);
    recover_safe_write(&path)?;
    fs::read_to_string(&path).map_err(|e| format!("Failed to read file: {}", e))
}

/// Write a text file to disk.
/// 将文本文件写入磁盘
#[tauri::command]
pub async fn write_text_file(path: String, content: String) -> Result<(), String> {
    let path = PathBuf::from(&path);
    // Ensure parent directory exists.
    // 确保父目录存在
    ensure_parent_directory(&path)?;
    safe_write(&path, content.as_bytes()).map_err(|e| format!("Failed to write file: {}", e))
}

/// Delete a single file from disk.
/// 从磁盘删除单个文件
#[tauri::command]
pub async fn delete_file(path: String) -> Result<(), String> {
    let path = PathBuf::from(&path);
    if !path.exists() {
        return Ok(());
    }

    if !path.is_file() {
        return Err("Path is not a file".to_string());
    }

    fs::remove_file(&path).map_err(|e| format!("Failed to delete file: {}", e))
}

/// Read a binary file from disk as base64.
/// 从磁盘读取二进制文件为 base64
#[tauri::command]
pub async fn read_binary_file_base64(path: String) -> Result<String, String> {
    use base64::{Engine as _, engine::general_purpose::STANDARD};
    let path = PathBuf::from(&path);
    recover_safe_write(&path)?;
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
    ensure_parent_directory(&path)?;
    let bytes = STANDARD
        .decode(&base64)
        .map_err(|e| format!("Failed to decode base64: {}", e))?;
    safe_write(&path, &bytes).map_err(|e| format!("Failed to write file: {}", e))
}

/// Read a PNG file and return raw RGBA pixels as base64 + dimensions.
/// 读取 PNG 文件并返回原始 RGBA 像素（base64）+ 尺寸
/// This bypasses browser's premultiplied alpha issue.
/// 这绕过了浏览器的预乘 alpha 问题
#[tauri::command]
pub async fn read_png_rgba(path: String) -> Result<(String, u32, u32), String> {
    use base64::{Engine as _, engine::general_purpose::STANDARD};
    use png::Decoder;
    use std::io::BufReader;

    let path = PathBuf::from(&path);
    recover_safe_write(&path)?;
    let file = std::fs::File::open(&path).map_err(|e| format!("Failed to open PNG: {}", e))?;
    let decoder = Decoder::new(BufReader::new(file));
    let mut reader = decoder
        .read_info()
        .map_err(|e| format!("Failed to read PNG info: {}", e))?;

    let output_size = reader
        .output_buffer_size()
        .ok_or_else(|| "Failed to determine PNG output buffer size".to_string())?;
    let mut buf = vec![0; output_size];
    let info = reader
        .next_frame(&mut buf)
        .map_err(|e| format!("Failed to decode PNG frame: {}", e))?;

    let width = info.width;
    let height = info.height;

    // Convert to RGBA if needed.
    // 如有需要，转换为 RGBA
    let rgba_pixels = match info.color_type {
        png::ColorType::Rgba => buf[..info.buffer_size()].to_vec(),
        png::ColorType::Rgb => {
            // Convert RGB to RGBA (add A=255).
            // 将 RGB 转换为 RGBA（添加 A=255）
            let rgb = &buf[..info.buffer_size()];
            let mut rgba = Vec::with_capacity((width * height * 4) as usize);
            for chunk in rgb.chunks(3) {
                rgba.push(chunk[0]);
                rgba.push(chunk[1]);
                rgba.push(chunk[2]);
                rgba.push(255);
            }
            rgba
        }
        png::ColorType::GrayscaleAlpha => {
            // Convert GA to RGBA.
            // 将 GA 转换为 RGBA
            let ga = &buf[..info.buffer_size()];
            let mut rgba = Vec::with_capacity((width * height * 4) as usize);
            for chunk in ga.chunks(2) {
                let gray = chunk[0];
                let alpha = chunk[1];
                rgba.push(gray);
                rgba.push(gray);
                rgba.push(gray);
                rgba.push(alpha);
            }
            rgba
        }
        png::ColorType::Grayscale => {
            // Convert G to RGBA.
            // 将 G 转换为 RGBA
            let g = &buf[..info.buffer_size()];
            let mut rgba = Vec::with_capacity((width * height * 4) as usize);
            for &gray in g {
                rgba.push(gray);
                rgba.push(gray);
                rgba.push(gray);
                rgba.push(255);
            }
            rgba
        }
        _ => return Err(format!("Unsupported PNG color type: {:?}", info.color_type)),
    };

    Ok((STANDARD.encode(&rgba_pixels), width, height))
}

/// Write raw RGBA pixels to a PNG file.
/// 将原始 RGBA 像素写入 PNG 文件
/// This bypasses browser's premultiplied alpha issue.
/// 这绕过了浏览器的预乘 alpha 问题
#[tauri::command]
pub async fn write_png_rgba(
    path: String,
    base64_pixels: String,
    width: u32,
    height: u32,
) -> Result<(), String> {
    use base64::{Engine as _, engine::general_purpose::STANDARD};
    use png::{BitDepth, ColorType, Encoder};
    use std::io::BufWriter;

    let path = PathBuf::from(&path);

    // Ensure parent directory exists.
    // 确保父目录存在
    ensure_parent_directory(&path)?;

    let pixels = STANDARD
        .decode(&base64_pixels)
        .map_err(|e| format!("Failed to decode base64: {}", e))?;

    let expected_len = (width * height * 4) as usize;
    if pixels.len() != expected_len {
        return Err(format!(
            "Pixel data length mismatch: expected {}, got {}",
            expected_len,
            pixels.len()
        ));
    }

    let mut encoded = Vec::new();
    {
        let w = BufWriter::new(&mut encoded);
        let mut encoder = Encoder::new(w, width, height);
        encoder.set_color(ColorType::Rgba);
        encoder.set_depth(BitDepth::Eight);
        // Use fast compression for better save speed.
        // 使用快速压缩以提高保存速度
        encoder.set_compression(png::Compression::Fast);

        let mut writer = encoder
            .write_header()
            .map_err(|e| format!("Failed to write PNG header: {}", e))?;

        writer
            .write_image_data(&pixels)
            .map_err(|e| format!("Failed to write PNG data: {}", e))?;
    }

    safe_write(&path, &encoded).map_err(|e| format!("Failed to write PNG file: {}", e))
}
