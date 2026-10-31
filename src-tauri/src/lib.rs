use serde::Serialize;
use std::{
    collections::HashSet,
    fs,
    io::Read,
    path::{Path, PathBuf},
    sync::Mutex,
    time::UNIX_EPOCH,
};
use tauri::Manager;

const DIRECTORY_LIMIT: usize = 300;
const TEXT_PREVIEW_BYTE_LIMIT: usize = 64 * 1024;
const TEXT_PREVIEW_EXTENSIONS: &[&str] = &[
    "txt", "md", "markdown", "json", "csv", "log", "yaml", "yml", "toml", "xml", "html", "css",
    "js", "jsx", "ts", "tsx", "rs",
];

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

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct MoveFileResultDto {
    source_parent: DirectorySnapshotDto,
    destination: DirectorySnapshotDto,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct SidebarLocationDto {
    id: &'static str,
    name: &'static str,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct TextPreviewDto {
    text: String,
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
    let path_text = path_to_text(path)?;
    let parent_id = path.parent().map(path_to_text).transpose()?;
    let name = path
        .file_name()
        .and_then(|part| part.to_str())
        .map(str::to_owned)
        .or_else(|| path.to_str().map(str::to_owned))
        .ok_or_else(|| "UNSUPPORTED_PATH_ENCODING".to_string())?;
    let extension = if kind == "file" {
        path.extension()
            .and_then(|part| part.to_str())
            .map(str::to_lowercase)
    } else {
        None
    };
    let modified_at = metadata
        .modified()
        .ok()
        .and_then(|time| time.duration_since(UNIX_EPOCH).ok())
        .and_then(|duration| {
            chrono::DateTime::<chrono::Utc>::from_timestamp(duration.as_secs() as i64, 0)
        })
        .map(|time| time.to_rfc3339());

    Ok(FileNodeDto {
        id: path_text.clone(),
        parent_id,
        hidden: name.starts_with('.'),
        size_bytes: if kind == "file" {
            Some(metadata.len())
        } else {
            None
        },
        modified_at,
        path: path_text,
        name,
        kind,
        extension,
        is_symlink,
    })
}

fn path_to_text(path: &Path) -> Result<String, String> {
    path.to_str()
        .map(str::to_owned)
        .ok_or_else(|| "UNSUPPORTED_PATH_ENCODING".to_string())
}

fn map_io_error(error: &std::io::Error) -> String {
    match error.kind() {
        std::io::ErrorKind::NotFound => "NOT_FOUND".into(),
        std::io::ErrorKind::PermissionDenied => "PERMISSION_DENIED".into(),
        _ => "FILESYSTEM_ERROR".into(),
    }
}

fn location_candidates(
    app: &tauri::AppHandle,
) -> Vec<(&'static str, &'static str, Result<PathBuf, String>)> {
    let paths = app.path();
    let home = paths.home_dir();
    let projects = home
        .as_ref()
        .map(|path| path.join("Projects"))
        .map_err(|error| error.to_string());
    vec![
        ("home", "Home", home.map_err(|error| error.to_string())),
        (
            "desktop",
            "Desktop",
            paths.desktop_dir().map_err(|error| error.to_string()),
        ),
        (
            "documents",
            "Documents",
            paths.document_dir().map_err(|error| error.to_string()),
        ),
        (
            "downloads",
            "Downloads",
            paths.download_dir().map_err(|error| error.to_string()),
        ),
        ("projects", "Projects", projects),
        (
            "pictures",
            "Pictures",
            paths.picture_dir().map_err(|error| error.to_string()),
        ),
        (
            "music",
            "Music",
            paths.audio_dir().map_err(|error| error.to_string()),
        ),
        (
            "movies",
            "Movies",
            paths.video_dir().map_err(|error| error.to_string()),
        ),
    ]
}

fn resolve_sidebar_location(app: &tauri::AppHandle, id: &str) -> Result<PathBuf, String> {
    let (_, _, path) = location_candidates(app)
        .into_iter()
        .find(|(candidate_id, _, _)| *candidate_id == id)
        .ok_or_else(|| "LOCATION_UNAVAILABLE".to_string())?;
    let path = path.map_err(|_| "LOCATION_UNAVAILABLE".to_string())?;
    let path = fs::canonicalize(path).map_err(|error| map_io_error(&error))?;
    let metadata = fs::symlink_metadata(&path).map_err(|error| map_io_error(&error))?;
    if !metadata.is_dir() {
        return Err("NOT_DIRECTORY".into());
    }
    Ok(path)
}

#[tauri::command]
fn list_sidebar_locations(app: tauri::AppHandle) -> Vec<SidebarLocationDto> {
    let mut seen = HashSet::new();
    location_candidates(&app)
        .into_iter()
        .filter_map(|(id, name, candidate)| {
            let path = fs::canonicalize(candidate.ok()?).ok()?;
            if !fs::metadata(&path).ok()?.is_dir() || !seen.insert(path) {
                return None;
            }
            Some(SidebarLocationDto { id, name })
        })
        .collect()
}

#[tauri::command]
fn open_sidebar_location(
    id: String,
    app: tauri::AppHandle,
    state: tauri::State<'_, FilesystemState>,
) -> Result<DirectorySnapshotDto, String> {
    let path = resolve_sidebar_location(&app, &id)?;
    let snapshot = read_directory(path.clone(), &path)?;
    *state
        .selected_root
        .lock()
        .map_err(|_| "FILESYSTEM_ERROR".to_string())? = Some(path);
    Ok(snapshot)
}

#[tauri::command]
fn list_directory(
    path: String,
    state: tauri::State<'_, FilesystemState>,
) -> Result<DirectorySnapshotDto, String> {
    let directory_path = PathBuf::from(path);
    let root_guard = state
        .selected_root
        .lock()
        .map_err(|_| "FILESYSTEM_ERROR".to_string())?;
    let root = root_guard
        .as_ref()
        .ok_or_else(|| "ROOT_NOT_SELECTED".to_string())?;
    read_directory(directory_path, root)
}

#[tauri::command]
fn preview_text_file(
    path: String,
    state: tauri::State<'_, FilesystemState>,
) -> Result<TextPreviewDto, String> {
    let root_guard = state
        .selected_root
        .lock()
        .map_err(|_| "FILESYSTEM_ERROR".to_string())?;
    let root = root_guard
        .as_ref()
        .ok_or_else(|| "ROOT_NOT_SELECTED".to_string())?;
    read_text_preview_file(PathBuf::from(path), root)
}

#[tauri::command]
fn create_directory(
    parent_path: String,
    name: String,
    state: tauri::State<'_, FilesystemState>,
) -> Result<DirectorySnapshotDto, String> {
    let root_guard = state
        .selected_root
        .lock()
        .map_err(|_| "FILESYSTEM_ERROR".to_string())?;
    let root = root_guard
        .as_ref()
        .ok_or_else(|| "ROOT_NOT_SELECTED".to_string())?;
    create_directory_in_root(PathBuf::from(parent_path), &name, root)
}

#[tauri::command]
fn rename_entry(
    path: String,
    name: String,
    state: tauri::State<'_, FilesystemState>,
) -> Result<DirectorySnapshotDto, String> {
    let root_guard = state
        .selected_root
        .lock()
        .map_err(|_| "FILESYSTEM_ERROR".to_string())?;
    let root = root_guard
        .as_ref()
        .ok_or_else(|| "ROOT_NOT_SELECTED".to_string())?;
    rename_entry_in_root(PathBuf::from(path), &name, root)
}

#[tauri::command]
fn trash_entry(
    path: String,
    state: tauri::State<'_, FilesystemState>,
) -> Result<DirectorySnapshotDto, String> {
    let root_guard = state
        .selected_root
        .lock()
        .map_err(|_| "FILESYSTEM_ERROR".to_string())?;
    let root = root_guard
        .as_ref()
        .ok_or_else(|| "ROOT_NOT_SELECTED".to_string())?;
    trash_entry_in_root(PathBuf::from(path), root)
}

fn trash_entry_in_root(path: PathBuf, root: &Path) -> Result<DirectorySnapshotDto, String> {
    let path = resolve_scoped_path(path, root)?;
    if path == root {
        return Err("ROOT_CANNOT_TRASH".into());
    }
    let metadata = fs::symlink_metadata(&path).map_err(|error| map_io_error(&error))?;
    if !metadata.is_file() && !metadata.is_dir() {
        return Err("NOT_TRASHABLE".into());
    }
    let parent = path
        .parent()
        .ok_or_else(|| "INVALID_PATH".to_string())?
        .to_path_buf();

    #[cfg(target_os = "macos")]
    trash_path_with(|| trash::delete(&path))?;
    #[cfg(not(target_os = "macos"))]
    return Err("TRASH_UNAVAILABLE".into());

    read_directory(parent, root)
}

fn trash_path_with<E>(delete: impl FnOnce() -> Result<(), E>) -> Result<(), String> {
    delete().map_err(|_| "TRASH_FAILED".to_string())
}

#[tauri::command]
async fn copy_selected_file(
    path: String,
    app: tauri::AppHandle,
    state: tauri::State<'_, FilesystemState>,
) -> Result<Option<DirectorySnapshotDto>, String> {
    use tauri_plugin_dialog::DialogExt;
    let root = {
        let root_guard = state
            .selected_root
            .lock()
            .map_err(|_| "FILESYSTEM_ERROR".to_string())?;
        root_guard
            .as_ref()
            .ok_or_else(|| "ROOT_NOT_SELECTED".to_string())?
            .clone()
    };
    let source = PathBuf::from(path);
    let selected = app
        .dialog()
        .file()
        .set_directory(&root)
        .blocking_pick_folder();
    let Some(selected) = selected else {
        return Ok(None);
    };
    let destination = selected
        .into_path()
        .map_err(|_| "UNSUPPORTED_PATH_ENCODING".to_string())?;
    copy_file_into_root(source, destination, &root).map(Some)
}

#[tauri::command]
async fn move_selected_file(
    path: String,
    app: tauri::AppHandle,
    state: tauri::State<'_, FilesystemState>,
) -> Result<Option<MoveFileResultDto>, String> {
    use tauri_plugin_dialog::DialogExt;
    let root = {
        let root_guard = state
            .selected_root
            .lock()
            .map_err(|_| "FILESYSTEM_ERROR".to_string())?;
        root_guard
            .as_ref()
            .ok_or_else(|| "ROOT_NOT_SELECTED".to_string())?
            .clone()
    };
    let source = PathBuf::from(path);
    let selected = app
        .dialog()
        .file()
        .set_directory(&root)
        .blocking_pick_folder();
    let Some(selected) = selected else {
        return Ok(None);
    };
    let destination = selected
        .into_path()
        .map_err(|_| "UNSUPPORTED_PATH_ENCODING".to_string())?;
    move_file_into_root(source, destination, &root).map(Some)
}

fn move_file_into_root(
    source: PathBuf,
    destination: PathBuf,
    root: &Path,
) -> Result<MoveFileResultDto, String> {
    let source = resolve_scoped_path(source, root)?;
    let destination = resolve_scoped_path(destination, root)?;
    let source_metadata = fs::symlink_metadata(&source).map_err(|error| map_io_error(&error))?;
    if source_metadata.file_type().is_symlink() {
        return Err("SYMLINK_NOT_ENTERABLE".into());
    }
    if !source_metadata.is_file() {
        return Err("NOT_FILE".into());
    }
    let destination_metadata =
        fs::symlink_metadata(&destination).map_err(|error| map_io_error(&error))?;
    if !destination_metadata.is_dir() {
        return Err("NOT_DIRECTORY".into());
    }
    let source_parent = source
        .parent()
        .ok_or_else(|| "INVALID_PATH".to_string())?
        .to_path_buf();
    let file_name = source.file_name().ok_or_else(|| "NOT_FILE".to_string())?;
    let target = destination.join(file_name);

    // A hard-link-then-unlink move cannot overwrite a destination created
    // concurrently. It also fails safely across filesystems or where hard
    // links are unsupported, leaving the source untouched.
    move_with_hard_link(&source, &target, |source, target| {
        fs::hard_link(source, target)
    })?;

    Ok(MoveFileResultDto {
        source_parent: read_directory(source_parent, root)?,
        destination: read_directory(destination, root)?,
    })
}

fn move_with_hard_link(
    source: &Path,
    target: &Path,
    create_link: impl FnOnce(&Path, &Path) -> std::io::Result<()>,
) -> Result<(), String> {
    create_link(source, target).map_err(|error| match error.kind() {
        std::io::ErrorKind::AlreadyExists => "ALREADY_EXISTS".to_string(),
        std::io::ErrorKind::CrossesDevices | std::io::ErrorKind::Unsupported => {
            "MOVE_UNSUPPORTED".to_string()
        }
        _ => map_io_error(&error),
    })?;
    if let Err(error) = fs::remove_file(source) {
        let _ = fs::remove_file(target);
        return Err(map_io_error(&error));
    }
    Ok(())
}

fn copy_file_into_root(
    source: PathBuf,
    destination: PathBuf,
    root: &Path,
) -> Result<DirectorySnapshotDto, String> {
    let source = resolve_scoped_path(source, root)?;
    let destination = resolve_scoped_path(destination, root)?;
    let source_metadata = fs::symlink_metadata(&source).map_err(|error| map_io_error(&error))?;
    if source_metadata.file_type().is_symlink() {
        return Err("SYMLINK_NOT_ENTERABLE".into());
    }
    if !source_metadata.is_file() {
        return Err("NOT_FILE".into());
    }
    let destination_metadata =
        fs::symlink_metadata(&destination).map_err(|error| map_io_error(&error))?;
    if !destination_metadata.is_dir() {
        return Err("NOT_DIRECTORY".into());
    }
    let file_name = source.file_name().ok_or_else(|| "NOT_FILE".to_string())?;
    let target = destination.join(file_name);
    let mut target_file = fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&target)
        .map_err(|error| match error.kind() {
            std::io::ErrorKind::AlreadyExists => "ALREADY_EXISTS".to_string(),
            _ => map_io_error(&error),
        })?;
    let copy_result = (|| {
        let mut source_file = fs::File::open(&source).map_err(|error| map_io_error(&error))?;
        std::io::copy(&mut source_file, &mut target_file).map_err(|error| map_io_error(&error))?;
        target_file.sync_all().map_err(|error| map_io_error(&error))
    })();
    if let Err(error) = copy_result {
        let _ = fs::remove_file(&target);
        return Err(error);
    }
    read_directory(destination, root)
}

fn create_directory_in_root(
    parent_path: PathBuf,
    name: &str,
    root: &Path,
) -> Result<DirectorySnapshotDto, String> {
    if name.trim().is_empty()
        || name == "."
        || name == ".."
        || name
            .chars()
            .any(|character| matches!(character, '/' | '\\' | '\0'))
    {
        return Err("INVALID_NAME".into());
    }
    let parent_path = resolve_scoped_path(parent_path, root)?;
    if !fs::symlink_metadata(&parent_path)
        .map_err(|error| map_io_error(&error))?
        .is_dir()
    {
        return Err("NOT_DIRECTORY".into());
    }
    let new_path = parent_path.join(name);
    fs::create_dir(&new_path).map_err(|error| match error.kind() {
        std::io::ErrorKind::AlreadyExists => "ALREADY_EXISTS".to_string(),
        _ => map_io_error(&error),
    })?;
    read_directory(parent_path.clone(), root)
}

fn rename_entry_in_root(
    path: PathBuf,
    name: &str,
    root: &Path,
) -> Result<DirectorySnapshotDto, String> {
    if name.trim().is_empty()
        || name == "."
        || name == ".."
        || name
            .chars()
            .any(|character| matches!(character, '/' | '\\' | '\0'))
    {
        return Err("INVALID_NAME".into());
    }
    let path = resolve_scoped_path(path, root)?;
    if path == root {
        return Err("ROOT_CANNOT_RENAME".into());
    }
    let parent_path = path.parent().ok_or_else(|| "INVALID_PATH".to_string())?;
    let parent_path = resolve_scoped_path(parent_path.to_path_buf(), root)?;
    let metadata = fs::symlink_metadata(&path).map_err(|error| map_io_error(&error))?;
    if !metadata.is_file() && !metadata.is_dir() {
        return Err("NOT_RENAMEABLE".into());
    }
    let new_path = parent_path.join(name);
    if new_path == path {
        return read_directory(parent_path, root);
    }
    match fs::symlink_metadata(&new_path) {
        Ok(_) => return Err("ALREADY_EXISTS".into()),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
        Err(error) => return Err(map_io_error(&error)),
    }
    fs::rename(&path, &new_path).map_err(|error| match error.kind() {
        std::io::ErrorKind::AlreadyExists => "ALREADY_EXISTS".to_string(),
        _ => map_io_error(&error),
    })?;
    read_directory(parent_path, root)
}

fn read_text_preview_file(path: PathBuf, root: &Path) -> Result<TextPreviewDto, String> {
    let file_path = resolve_scoped_path(path, root)?;
    let extension = file_path
        .extension()
        .and_then(|part| part.to_str())
        .map(str::to_ascii_lowercase)
        .ok_or_else(|| "PREVIEW_UNSUPPORTED".to_string())?;
    if !TEXT_PREVIEW_EXTENSIONS.contains(&extension.as_str()) {
        return Err("PREVIEW_UNSUPPORTED".into());
    }
    let metadata = fs::symlink_metadata(&file_path).map_err(|error| map_io_error(&error))?;
    if metadata.file_type().is_symlink() {
        return Err("SYMLINK_NOT_ENTERABLE".into());
    }
    if !metadata.is_file() {
        return Err("NOT_FILE".into());
    }
    let file = fs::File::open(&file_path).map_err(|error| map_io_error(&error))?;
    let mut bytes = Vec::with_capacity(TEXT_PREVIEW_BYTE_LIMIT + 1);
    file.take((TEXT_PREVIEW_BYTE_LIMIT + 1) as u64)
        .read_to_end(&mut bytes)
        .map_err(|error| map_io_error(&error))?;
    let truncated = bytes.len() > TEXT_PREVIEW_BYTE_LIMIT;
    if truncated {
        bytes.truncate(TEXT_PREVIEW_BYTE_LIMIT);
    }
    let text = match std::str::from_utf8(&bytes) {
        Ok(text) => text.to_owned(),
        Err(error) if truncated && error.error_len().is_none() => {
            bytes.truncate(error.valid_up_to());
            std::str::from_utf8(&bytes)
                .map_err(|_| "PREVIEW_NOT_UTF8".to_string())?
                .to_owned()
        }
        Err(_) => return Err("PREVIEW_NOT_UTF8".into()),
    };
    Ok(TextPreviewDto { text, truncated })
}

fn resolve_scoped_path(path: PathBuf, root: &Path) -> Result<PathBuf, String> {
    if !path.starts_with(root) {
        return Err("OUTSIDE_SELECTED_ROOT".into());
    }
    let relative = path
        .strip_prefix(root)
        .map_err(|_| "OUTSIDE_SELECTED_ROOT".to_string())?;
    let mut checked_path = PathBuf::from(root);
    for component in relative.components() {
        match component {
            std::path::Component::Normal(part) => checked_path.push(part),
            _ => return Err("OUTSIDE_SELECTED_ROOT".into()),
        }
        if fs::symlink_metadata(&checked_path)
            .map_err(|error| map_io_error(&error))?
            .file_type()
            .is_symlink()
        {
            return Err("SYMLINK_NOT_ENTERABLE".into());
        }
    }
    let canonical_path = fs::canonicalize(checked_path).map_err(|error| map_io_error(&error))?;
    if !canonical_path.starts_with(root) {
        return Err("OUTSIDE_SELECTED_ROOT".into());
    }
    Ok(canonical_path)
}

fn read_directory(directory_path: PathBuf, root: &Path) -> Result<DirectorySnapshotDto, String> {
    if !directory_path.starts_with(root) {
        return Err("OUTSIDE_SELECTED_ROOT".into());
    }
    let relative = directory_path
        .strip_prefix(root)
        .map_err(|_| "OUTSIDE_SELECTED_ROOT".to_string())?;
    let mut checked_path = PathBuf::from(root);
    for component in relative.components() {
        match component {
            std::path::Component::Normal(part) => checked_path.push(part),
            _ => return Err("OUTSIDE_SELECTED_ROOT".into()),
        }
        if fs::symlink_metadata(&checked_path)
            .map_err(|error| map_io_error(&error))?
            .file_type()
            .is_symlink()
        {
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
        b_dir
            .cmp(&a_dir)
            .then_with(|| a.name.to_lowercase().cmp(&b.name.to_lowercase()))
            .then_with(|| a.name.cmp(&b.name))
    });
    Ok(DirectorySnapshotDto {
        directory,
        children: entries,
        loaded_at: chrono::Utc::now().to_rfc3339(),
        truncated,
    })
}

#[tauri::command]
fn open_default_directory(
    app: tauri::AppHandle,
    state: tauri::State<'_, FilesystemState>,
) -> Result<DirectorySnapshotDto, String> {
    let home = app
        .path()
        .home_dir()
        .map_err(|_| "HOME_UNAVAILABLE".to_string())?;
    let path = fs::canonicalize(home).map_err(|error| map_io_error(&error))?;
    let snapshot = read_directory(path.clone(), &path)?;
    *state
        .selected_root
        .lock()
        .map_err(|_| "FILESYSTEM_ERROR".to_string())? = Some(path.clone());
    Ok(snapshot)
}

#[tauri::command]
async fn choose_root(
    app: tauri::AppHandle,
    state: tauri::State<'_, FilesystemState>,
) -> Result<Option<DirectorySnapshotDto>, String> {
    use tauri_plugin_dialog::DialogExt;
    let Some(selected) = app.dialog().file().blocking_pick_folder() else {
        return Ok(None);
    };
    let selected_path = selected
        .into_path()
        .map_err(|_| "UNSUPPORTED_PATH_ENCODING".to_string())?;
    let path = fs::canonicalize(selected_path).map_err(|error| map_io_error(&error))?;
    let snapshot = read_directory(path.clone(), &path)?;
    *state
        .selected_root
        .lock()
        .map_err(|_| "FILESYSTEM_ERROR".to_string())? = Some(path);
    Ok(Some(snapshot))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(FilesystemState::default())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            choose_root,
            list_directory,
            open_default_directory,
            list_sidebar_locations,
            open_sidebar_location,
            preview_text_file,
            create_directory,
            rename_entry,
            copy_selected_file,
            move_selected_file,
            trash_entry
        ])
        .run(tauri::generate_context!())
        .expect("error while running FileVerse");
}

#[cfg(test)]
mod tests;
