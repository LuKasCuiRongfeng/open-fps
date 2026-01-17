mod commands;

use commands::*;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .invoke_handler(tauri::generate_handler![
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
