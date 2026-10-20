use super::{map_io_error, path_to_text, read_directory, DIRECTORY_LIMIT};
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
        Self(path)
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
