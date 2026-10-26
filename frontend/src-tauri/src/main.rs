#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn allowed_navigation(url: &tauri::Url, development: bool, https_scheme: bool) -> bool {
    if !url.username().is_empty() || url.password().is_some() {
        return false;
    }
    (url.scheme() == if https_scheme { "https" } else { "http" }
        && url.host_str() == Some("tauri.localhost")
        && url.port_or_known_default() == Some(if https_scheme { 443 } else { 80 }))
        || (development
            && url.scheme() == "http"
            && url.host_str() == Some("localhost")
            && url.port() == Some(5173))
}

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![open_catalog_source])
        .setup(|app| {
            let https_scheme = app.config().app.windows[0].use_https_scheme;
            tauri::WebviewWindowBuilder::from_config(app, &app.config().app.windows[0])?
                .on_navigation(move |url| allowed_navigation(url, cfg!(dev), https_scheme))
                .build()?;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("Không khởi động được cửa sổ LAMS");
}

fn allowed_source(url: &tauri::Url) -> bool {
    url.scheme() == "https"
        && url.username().is_empty()
        && url.password().is_none()
        && url.port_or_known_default() == Some(443)
        && matches!(
            url.host_str(),
            Some(
                "openlibrary.org"
                    | "covers.openlibrary.org"
                    | "books.google.com"
                    | "commons.wikimedia.org"
                    | "upload.wikimedia.org"
                    | "creativecommons.org"
                    | "archive.org"
                    | "developers.google.com"
                    | "standardebooks.org"
            )
        )
}

#[tauri::command]
fn open_catalog_source(url: String) -> Result<(), String> {
    let parsed = tauri::Url::parse(&url).map_err(|_| "URL không hợp lệ")?;
    if !allowed_source(&parsed) {
        return Err("Nguồn không được phép mở".into());
    }
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        let windows = std::env::var_os("WINDIR").unwrap_or_else(|| "C:\\Windows".into());
        std::process::Command::new(std::path::PathBuf::from(windows).join("explorer.exe"))
            .arg(parsed.as_str())
            .creation_flags(0x08000000)
            .spawn()
            .map_err(|_| "Không mở được trình duyệt")?;
        Ok(())
    }
    #[cfg(not(target_os = "windows"))]
    Err("Lệnh này chỉ hỗ trợ Windows".into())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn only_opens_https_catalog_sources() {
        assert!(allowed_source(
            &"https://openlibrary.org/books/OL1M".parse().unwrap()
        ));
        assert!(allowed_source(
            &"https://standardebooks.org/ebooks/jane-austen/pride-and-prejudice"
                .parse()
                .unwrap()
        ));
        for value in [
            "file:///C:/secret",
            "https://openlibrary.org.evil.test/",
            "https://standardebooks.org.evil.test/",
            "http://openlibrary.org/",
            "https://user:pass@openlibrary.org/",
            "https://openlibrary.org:444/",
            "https://example.com/",
        ] {
            assert!(!allowed_source(&value.parse().unwrap()));
        }
    }

    #[test]
    fn restricts_navigation_to_bundled_app() {
        for value in ["http://tauri.localhost/", "http://tauri.localhost/#/ho-so"] {
            assert!(allowed_navigation(&value.parse().unwrap(), false, false));
        }
        for value in [
            "https://example.com",
            "http://tauri.localhost.evil.test",
            "file:///C:/secret",
            "http://localhost:5173",
            "http://user@tauri.localhost/",
            "http://tauri.localhost:8080",
        ] {
            assert!(!allowed_navigation(&value.parse().unwrap(), false, false));
        }
        assert!(allowed_navigation(
            &"http://localhost:5173/#/ho-so".parse().unwrap(),
            true,
            false
        ));
        assert!(allowed_navigation(
            &"https://tauri.localhost/#/ho-so".parse().unwrap(),
            false,
            true
        ));
        assert!(!allowed_navigation(
            &"http://tauri.localhost/".parse().unwrap(),
            false,
            true
        ));
        assert!(!allowed_navigation(
            &"https://tauri.localhost:8080/".parse().unwrap(),
            false,
            true
        ));
    }
}
