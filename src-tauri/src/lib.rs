use serde::Serialize;
use std::{
    fs,
    path::{Path, PathBuf},
    sync::Mutex,
    time::UNIX_EPOCH,
};

const DIRECTORY_LIMIT: usize = 300;

#[derive(Default)]
struct FilesystemState {
    selected_root: Mutex<Option<PathBuf>>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct FileNodeDto {
    id: String,
    path: String,
    parent_id: Option<String>,
    name: String,
    kind: &'static str,
    extension: Option<String>,
    size_bytes: Option<u64>,
    modified_at: Option<String>,
    hidden: bool,
    is_symlink: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct DirectorySnapshotDto {
    directory: FileNodeDto,
    children: Vec<FileNodeDto>,
    loaded_at: String,
    truncated: bool,
}

fn node_for(path: &Path) -> Result<FileNodeDto, String> {
    let metadata = fs::symlink_metadata(path).map_err(|error| map_io_error(&error))?;
    let is_symlink = metadata.file_type().is_symlink();
    let kind = if is_symlink {
        "symlink"
    } else if metadata.is_dir() {
        "directory"
    } else if metadata.is_file() {
        "file"
    } else {
        "other"
    };
    let path_buf = PathBuf::from(path);
    let path_text = path_buf.to_string_lossy().into_owned();
    let name = path.file_name().and_then(|part| part.to_str())
        .map(str::to_owned)
        .or_else(|| path.to_str().map(str::to_owned))
        .ok_or_else(|| "UNSUPPORTED_PATH_ENCODING".to_string())?;
    let extension = if kind == "file" {
        path.extension().and_then(|part| part.to_str()).map(str::to_lowercase)
    } else {
        None
    };
    let modified_at = metadata.modified().ok()
        .and_then(|time| time.duration_since(UNIX_EPOCH).ok())
        .and_then(|duration| chrono::DateTime::<chrono::Utc>::from_timestamp(duration.as_secs() as i64, 0))
        .map(|time| time.to_rfc3339());

    Ok(FileNodeDto {
        id: path_text.clone(),
        parent_id: path.parent().map(|parent| parent.to_string_lossy().into_owned()),
        hidden: name.starts_with('.'),
        size_bytes: if kind == "file" { Some(metadata.len()) } else { None },
        modified_at,
        path: path_text,
        name,
        kind,
        extension,
        is_symlink,
    })
}

fn map_io_error(error: &std::io::Error) -> String {
    match error.kind() {
        std::io::ErrorKind::NotFound => "NOT_FOUND".into(),
        std::io::ErrorKind::PermissionDenied => "PERMISSION_DENIED".into(),
        _ => "FILESYSTEM_ERROR".into(),
    }
}

#[tauri::command]
fn list_directory(path: String, state: tauri::State<'_, FilesystemState>) -> Result<DirectorySnapshotDto, String> {
    let directory_path = PathBuf::from(path);
    let root_guard = state.selected_root.lock().map_err(|_| "FILESYSTEM_ERROR".to_string())?;
    let root = root_guard.as_ref().ok_or_else(|| "ROOT_NOT_SELECTED".to_string())?;
    if !directory_path.starts_with(root) {
        return Err("OUTSIDE_SELECTED_ROOT".into());
    }
    let relative = directory_path.strip_prefix(root).map_err(|_| "OUTSIDE_SELECTED_ROOT".to_string())?;
    let mut checked_path = root.clone();
    for component in relative.components() {
        match component {
            std::path::Component::Normal(part) => checked_path.push(part),
            _ => return Err("OUTSIDE_SELECTED_ROOT".into()),
        }
        if fs::symlink_metadata(&checked_path).map_err(|error| map_io_error(&error))?.file_type().is_symlink() {
            return Err("SYMLINK_NOT_ENTERABLE".into());
        }
    }
    let directory_path = checked_path;
    let directory = node_for(&directory_path)?;
    if directory.kind != "directory" {
        return Err("NOT_DIRECTORY".into());
    }
    let iterator = fs::read_dir(&directory_path).map_err(|error| map_io_error(&error))?;
    let mut entries = Vec::new();
    let mut truncated = false;
    for entry in iterator {
        let entry = entry.map_err(|error| map_io_error(&error))?;
        if entries.len() == DIRECTORY_LIMIT {
            truncated = true;
            break;
        }
        entries.push(node_for(&entry.path())?);
    }
    entries.sort_by(|a, b| {
        let a_dir = a.kind == "directory";
        let b_dir = b.kind == "directory";
        b_dir.cmp(&a_dir).then_with(|| a.name.to_lowercase().cmp(&b.name.to_lowercase()))
    });
    Ok(DirectorySnapshotDto {
        directory,
        children: entries,
        loaded_at: chrono::Utc::now().to_rfc3339(),
        truncated,
    })
}

#[tauri::command]
fn open_default_directory(state: tauri::State<'_, FilesystemState>) -> Result<DirectorySnapshotDto, String> {
    let home = if cfg!(target_os = "windows") {
        std::env::var_os("USERPROFILE")
    } else {
        std::env::var_os("HOME")
    }.ok_or_else(|| "HOME_UNAVAILABLE".to_string())?;
    let path = fs::canonicalize(PathBuf::from(home)).map_err(|error| map_io_error(&error))?;
    *state.selected_root.lock().map_err(|_| "FILESYSTEM_ERROR".to_string())? = Some(path.clone());
    list_directory(path.to_string_lossy().into_owned(), state)
}

#[tauri::command]
async fn choose_root(app: tauri::AppHandle, state: tauri::State<'_, FilesystemState>) -> Result<Option<FileNodeDto>, String> {
    use tauri_plugin_dialog::DialogExt;
    let Some(selected) = app.dialog().file().blocking_pick_folder() else {
        return Ok(None);
    };
    let selected_path = selected.into_path().map_err(|_| "UNSUPPORTED_PATH_ENCODING".to_string())?;
    let path = fs::canonicalize(selected_path).map_err(|error| map_io_error(&error))?;
    let node = node_for(&path)?;
    if node.kind != "directory" {
        return Err("NOT_DIRECTORY".into());
    }
    *state.selected_root.lock().map_err(|_| "FILESYSTEM_ERROR".to_string())? = Some(path);
    Ok(Some(node))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(FilesystemState::default())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![choose_root, list_directory, open_default_directory])
        .run(tauri::generate_context!())
        .expect("error while running FileVerse");
}
