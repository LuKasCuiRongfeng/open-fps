mod commands;

use commands::*;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run_editor() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .invoke_handler(tauri::generate_handler![
            create_project,
            is_valid_project,
            rename_project,
            read_project_metadata,
            read_project_map_manifest,
            read_project_map_chunk_base64,
            read_project_settings,
            save_project_metadata,
            save_project_map_manifest,
            save_project_map_chunk_base64,
            save_project_settings,
            list_recent_projects,
            add_recent_project,
            remove_recent_project,
            // Controlled editor workflows / 受控编辑器工作流
            run_cook_map,
            run_world_generation_graph,
            // Generic file operations / 通用文件操作
            read_text_file,
            write_text_file,
            delete_file,
            read_binary_file_base64,
            write_binary_file_base64,
            // PNG operations (bypass browser premultiplied alpha) / PNG 操作（绕过浏览器预乘 alpha）
            read_png_rgba,
            write_png_rgba,
        ])
        .run(tauri::generate_context!())
        .expect("error while running open-fps editor");
}

pub fn run_game() {
    tauri::Builder::default()
        .run(tauri::generate_context!())
        .expect("error while running open-fps game");
}

pub fn run() {
    run_editor();
}
