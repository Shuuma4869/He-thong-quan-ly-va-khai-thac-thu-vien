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

#[cfg(test)]
mod tests {
    use super::*;

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
