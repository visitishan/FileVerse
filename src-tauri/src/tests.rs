use super::{
    copy_file_into_root, create_directory_in_root, map_io_error, path_to_text, read_directory,
    read_text_preview_file, rename_entry_in_root, DIRECTORY_LIMIT, TEXT_PREVIEW_BYTE_LIMIT,
};
use std::{
    fs, io,
    path::{Path, PathBuf},
    time::{SystemTime, UNIX_EPOCH},
};

struct Fixture(PathBuf);

impl Fixture {
    fn new(label: &str) -> Self {
        let unique = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("system clock should be after Unix epoch")
            .as_nanos();
        let path =
            std::env::temp_dir().join(format!("fileverse-{label}-{}-{unique}", std::process::id()));
        fs::create_dir_all(&path).expect("fixture directory should be created");
        Self(fs::canonicalize(path).expect("fixture directory should resolve canonically"))
    }

    fn path(&self) -> &Path {
        &self.0
    }
}

impl Drop for Fixture {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.0);
    }
}

#[test]
fn empty_directory_returns_an_empty_snapshot() {
    let fixture = Fixture::new("empty");
    let snapshot = read_directory(fixture.path().to_path_buf(), fixture.path()).unwrap();

    assert_eq!(snapshot.directory.kind, "directory");
    assert!(snapshot.children.is_empty());
    assert!(!snapshot.truncated);
}

#[test]
fn unicode_and_hidden_names_are_preserved_and_directories_sort_first() {
    let fixture = Fixture::new("unicode-文件");
    fs::create_dir(fixture.path().join("目录")).unwrap();
    fs::write(fixture.path().join(".hidden-note.txt"), b"hidden").unwrap();
    fs::write(fixture.path().join("résumé.txt"), b"unicode").unwrap();

    let snapshot = read_directory(fixture.path().to_path_buf(), fixture.path()).unwrap();

    assert_eq!(snapshot.directory.path, fixture.path().to_str().unwrap());
    assert_eq!(snapshot.children[0].name, "目录");
    assert_eq!(snapshot.children[0].kind, "directory");
    let hidden = snapshot
        .children
        .iter()
        .find(|entry| entry.name == ".hidden-note.txt")
        .unwrap();
    assert!(hidden.hidden);
    assert!(snapshot
        .children
        .iter()
        .any(|entry| entry.name == "résumé.txt"));
}

#[test]
fn missing_directory_returns_a_stable_not_found_error() {
    let fixture = Fixture::new("missing");
    let error = read_directory(fixture.path().join("does-not-exist"), fixture.path())
        .err()
        .unwrap();

    assert_eq!(error, "NOT_FOUND");
}

#[test]
fn paths_outside_the_selected_root_are_rejected() {
    let fixture = Fixture::new("boundary");
    let outside = std::env::temp_dir();
    let error = read_directory(outside, fixture.path()).err().unwrap();

    assert_eq!(error, "OUTSIDE_SELECTED_ROOT");
}

#[test]
fn permission_errors_map_to_a_stable_code() {
    assert_eq!(
        map_io_error(&io::Error::from(io::ErrorKind::PermissionDenied)),
        "PERMISSION_DENIED"
    );
}

#[cfg(unix)]
#[test]
fn permission_restricted_directory_returns_permission_denied() {
    use std::os::unix::fs::PermissionsExt;

    let fixture = Fixture::new("permission");
    let restricted = fixture.path().join("restricted");
    fs::create_dir(&restricted).unwrap();
    let original_permissions = fs::metadata(&restricted).unwrap().permissions();
    fs::set_permissions(&restricted, fs::Permissions::from_mode(0o000)).unwrap();

    let result = read_directory(restricted.clone(), fixture.path());

    fs::set_permissions(&restricted, original_permissions).unwrap();
    assert_eq!(result.err().as_deref(), Some("PERMISSION_DENIED"));
}

#[test]
fn large_directories_are_capped_and_marked_truncated() {
    let fixture = Fixture::new("large");
    for index in 0..=DIRECTORY_LIMIT {
        fs::write(fixture.path().join(format!("entry-{index:03}.txt")), b"").unwrap();
    }

    let snapshot = read_directory(fixture.path().to_path_buf(), fixture.path()).unwrap();

    assert_eq!(snapshot.children.len(), DIRECTORY_LIMIT);
    assert!(snapshot.truncated);
}

#[cfg(unix)]
#[test]
fn symlinks_are_listed_but_not_followed_as_directories() {
    use std::os::unix::fs::symlink;

    let fixture = Fixture::new("symlink");
    fs::create_dir(fixture.path().join("real-directory")).unwrap();
    symlink(
        fixture.path().join("real-directory"),
        fixture.path().join("linked-directory"),
    )
    .unwrap();

    let snapshot = read_directory(fixture.path().to_path_buf(), fixture.path()).unwrap();
    let link = snapshot
        .children
        .iter()
        .find(|entry| entry.name == "linked-directory")
        .unwrap();
    assert_eq!(link.kind, "symlink");
    assert!(link.is_symlink);

    let error = read_directory(fixture.path().join("linked-directory"), fixture.path())
        .err()
        .unwrap();
    assert_eq!(error, "SYMLINK_NOT_ENTERABLE");
}

#[cfg(unix)]
#[test]
fn non_utf8_paths_fail_explicitly_instead_of_being_lossily_rewritten() {
    use std::os::unix::ffi::OsStringExt;

    let path = PathBuf::from(std::ffi::OsString::from_vec(vec![
        b'n', b'a', b'm', b'e', 0xff,
    ]));

    let error = path_to_text(&path).err().unwrap();
    assert_eq!(error, "UNSUPPORTED_PATH_ENCODING");
}

#[test]
fn text_preview_reads_only_the_bounded_prefix_and_marks_truncation() {
    let fixture = Fixture::new("preview-large");
    let file = fixture.path().join("large.txt");
    fs::write(&file, vec![b'x'; TEXT_PREVIEW_BYTE_LIMIT + 6 * 1024]).unwrap();

    let preview = read_text_preview_file(file, fixture.path()).unwrap();

    assert_eq!(preview.text.len(), TEXT_PREVIEW_BYTE_LIMIT);
    assert!(preview.truncated);
}

#[test]
fn text_preview_does_not_mark_a_small_file_truncated() {
    let fixture = Fixture::new("preview-small");
    let file = fixture.path().join("note.md");
    fs::write(&file, "hello FileVerse").unwrap();

    let preview = read_text_preview_file(file, fixture.path()).unwrap();

    assert_eq!(preview.text, "hello FileVerse");
    assert!(!preview.truncated);
}

#[test]
fn text_preview_rejects_unsupported_extensions() {
    let fixture = Fixture::new("preview-unsupported");
    let file = fixture.path().join("image.png");
    fs::write(&file, b"not a text preview").unwrap();

    let error = read_text_preview_file(file, fixture.path()).err().unwrap();

    assert_eq!(error, "PREVIEW_UNSUPPORTED");
}

#[test]
fn text_preview_rejects_non_utf8_content() {
    let fixture = Fixture::new("preview-binary");
    let file = fixture.path().join("binary.md");
    fs::write(&file, b"valid prefix\n\xff\xfe\x00").unwrap();

    let error = read_text_preview_file(file, fixture.path()).err().unwrap();

    assert_eq!(error, "PREVIEW_NOT_UTF8");
}

#[test]
fn text_preview_rejects_paths_outside_the_selected_root() {
    let root = Fixture::new("preview-root");
    let outside = Fixture::new("preview-outside");
    let file = outside.path().join("secret.md");
    fs::write(&file, "outside selected root").unwrap();

    let error = read_text_preview_file(file, root.path()).err().unwrap();

    assert_eq!(error, "OUTSIDE_SELECTED_ROOT");
}

#[cfg(unix)]
#[test]
fn text_preview_rejects_symlinks() {
    use std::os::unix::fs::symlink;

    let fixture = Fixture::new("preview-symlink");
    let target = fixture.path().join("target.md");
    let link = fixture.path().join("linked.md");
    fs::write(&target, "target contents").unwrap();
    symlink(&target, &link).unwrap();

    let error = read_text_preview_file(link, fixture.path()).err().unwrap();

    assert_eq!(error, "SYMLINK_NOT_ENTERABLE");
}

#[test]
fn create_directory_adds_a_child_inside_the_selected_root() {
    let fixture = Fixture::new("create-directory");

    let snapshot =
        create_directory_in_root(fixture.path().to_path_buf(), "New folder", fixture.path())
            .unwrap();

    assert!(fixture.path().join("New folder").is_dir());
    assert!(snapshot
        .children
        .iter()
        .any(|child| child.name == "New folder" && child.kind == "directory"));
}

#[test]
fn create_directory_rejects_invalid_names() {
    let fixture = Fixture::new("create-invalid-name");

    for name in ["", "   ", ".", "..", "nested/name", "nested\\name"] {
        let error = create_directory_in_root(fixture.path().to_path_buf(), name, fixture.path())
            .err()
            .unwrap();
        assert_eq!(error, "INVALID_NAME", "name: {name:?}");
    }
    assert!(!fixture.path().join("nested").exists());
}

#[test]
fn create_directory_rejects_existing_names() {
    let fixture = Fixture::new("create-existing");
    fs::create_dir(fixture.path().join("existing")).unwrap();

    let error = create_directory_in_root(fixture.path().to_path_buf(), "existing", fixture.path())
        .err()
        .unwrap();

    assert_eq!(error, "ALREADY_EXISTS");
}

#[test]
fn create_directory_rejects_parents_outside_selected_root() {
    let root = Fixture::new("create-root");
    let outside = Fixture::new("create-outside");

    let error = create_directory_in_root(outside.path().to_path_buf(), "not-allowed", root.path())
        .err()
        .unwrap();

    assert_eq!(error, "OUTSIDE_SELECTED_ROOT");
    assert!(!outside.path().join("not-allowed").exists());
}

#[test]
fn rename_entry_renames_file_and_returns_refreshed_snapshot() {
    let fixture = Fixture::new("rename-file");
    fs::write(fixture.path().join("before.txt"), b"contents").unwrap();

    let snapshot = rename_entry_in_root(
        fixture.path().join("before.txt"),
        "after.txt",
        fixture.path(),
    )
    .unwrap();

    assert!(!fixture.path().join("before.txt").exists());
    assert_eq!(
        fs::read(fixture.path().join("after.txt")).unwrap(),
        b"contents"
    );
    assert!(snapshot
        .children
        .iter()
        .any(|child| child.name == "after.txt"));
}

#[test]
fn rename_entry_rejects_invalid_names_and_root_renames() {
    let fixture = Fixture::new("rename-invalid");
    let entry = fixture.path().join("entry.txt");
    fs::write(&entry, b"contents").unwrap();

    for name in ["", "   ", ".", "..", "nested/name", "nested\\name"] {
        assert_eq!(
            rename_entry_in_root(entry.clone(), name, fixture.path())
                .err()
                .as_deref(),
            Some("INVALID_NAME"),
            "name: {name:?}"
        );
    }
    assert_eq!(
        rename_entry_in_root(fixture.path().to_path_buf(), "renamed-root", fixture.path())
            .err()
            .as_deref(),
        Some("ROOT_CANNOT_RENAME")
    );
    assert!(entry.exists());
}

#[test]
fn rename_entry_rejects_existing_names_without_overwriting() {
    let fixture = Fixture::new("rename-existing");
    fs::write(fixture.path().join("source.txt"), b"source").unwrap();
    fs::write(fixture.path().join("destination.txt"), b"keep me").unwrap();

    let error = rename_entry_in_root(
        fixture.path().join("source.txt"),
        "destination.txt",
        fixture.path(),
    )
    .err()
    .unwrap();

    assert_eq!(error, "ALREADY_EXISTS");
    assert_eq!(
        fs::read(fixture.path().join("destination.txt")).unwrap(),
        b"keep me"
    );
    assert!(fixture.path().join("source.txt").exists());
}

#[test]
fn rename_entry_rejects_paths_outside_selected_root() {
    let root = Fixture::new("rename-root");
    let outside = Fixture::new("rename-outside");
    let item = outside.path().join("outside.txt");
    fs::write(&item, b"contents").unwrap();

    assert_eq!(
        rename_entry_in_root(item.clone(), "moved.txt", root.path())
            .err()
            .as_deref(),
        Some("OUTSIDE_SELECTED_ROOT")
    );
    assert!(item.exists());
}

#[cfg(unix)]
#[test]
fn rename_entry_rejects_symlinks() {
    use std::os::unix::fs::symlink;

    let fixture = Fixture::new("rename-symlink");
    let target = fixture.path().join("target.txt");
    let link = fixture.path().join("linked.txt");
    fs::write(&target, b"contents").unwrap();
    symlink(&target, &link).unwrap();

    assert_eq!(
        rename_entry_in_root(link.clone(), "renamed.txt", fixture.path())
            .err()
            .as_deref(),
        Some("SYMLINK_NOT_ENTERABLE")
    );
    assert!(link.exists());
}

#[test]
fn copy_file_creates_a_same_name_copy_and_returns_destination_snapshot() {
    let fixture = Fixture::new("copy-success");
    let source_directory = fixture.path().join("source");
    let destination = fixture.path().join("destination");
    fs::create_dir(&source_directory).unwrap();
    fs::create_dir(&destination).unwrap();
    let source = source_directory.join("sample.txt");
    fs::write(&source, b"copy contents").unwrap();

    let snapshot = copy_file_into_root(source, destination.clone(), fixture.path()).unwrap();

    assert_eq!(
        fs::read(destination.join("sample.txt")).unwrap(),
        b"copy contents"
    );
    assert_eq!(snapshot.directory.path, destination.to_str().unwrap());
    assert!(snapshot
        .children
        .iter()
        .any(|child| child.name == "sample.txt"));
}

#[test]
fn copy_file_rejects_collisions_without_overwriting() {
    let fixture = Fixture::new("copy-collision");
    let source_directory = fixture.path().join("source");
    let destination = fixture.path().join("destination");
    fs::create_dir(&source_directory).unwrap();
    fs::create_dir(&destination).unwrap();
    fs::write(source_directory.join("sample.txt"), b"source contents").unwrap();
    fs::write(destination.join("sample.txt"), b"keep destination").unwrap();

    let error = copy_file_into_root(
        source_directory.join("sample.txt"),
        destination.clone(),
        fixture.path(),
    )
    .err()
    .unwrap();

    assert_eq!(error, "ALREADY_EXISTS");
    assert_eq!(
        fs::read(destination.join("sample.txt")).unwrap(),
        b"keep destination"
    );
}

#[test]
fn copy_file_rejects_destinations_outside_selected_root() {
    let root = Fixture::new("copy-root");
    let outside = Fixture::new("copy-outside");
    let source = root.path().join("sample.txt");
    fs::write(&source, b"source contents").unwrap();

    let error = copy_file_into_root(source, outside.path().to_path_buf(), root.path())
        .err()
        .unwrap();

    assert_eq!(error, "OUTSIDE_SELECTED_ROOT");
    assert!(!outside.path().join("sample.txt").exists());
}

#[cfg(unix)]
#[test]
fn copy_file_rejects_symlinks_without_copying_the_target() {
    use std::os::unix::fs::symlink;

    let fixture = Fixture::new("copy-symlink");
    let destination = fixture.path().join("destination");
    fs::create_dir(&destination).unwrap();
    let target = fixture.path().join("target.txt");
    let link = fixture.path().join("linked.txt");
    fs::write(&target, b"target contents").unwrap();
    symlink(&target, &link).unwrap();

    let error = copy_file_into_root(link, destination.clone(), fixture.path())
        .err()
        .unwrap();

    assert_eq!(error, "SYMLINK_NOT_ENTERABLE");
    assert!(!destination.join("linked.txt").exists());
}
