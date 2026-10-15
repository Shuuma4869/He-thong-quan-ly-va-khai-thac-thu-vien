#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn allowed_navigation(url: &tauri::Url, development: bool) -> bool {
    if url.scheme() != "http" || !url.username().is_empty() || url.password().is_some() {
        return false;
    }
    (url.host_str() == Some("tauri.localhost") && url.port_or_known_default() == Some(80))
        || (development && url.host_str() == Some("localhost") && url.port() == Some(5173))
}

fn main() {
    tauri::Builder::default()
        .setup(|app| {
            tauri::WebviewWindowBuilder::from_config(app, &app.config().app.windows[0])?
                .on_navigation(|url| allowed_navigation(url, cfg!(dev)))
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
            assert!(allowed_navigation(&value.parse().unwrap(), false));
        }
        for value in [
            "https://example.com",
            "http://tauri.localhost.evil.test",
            "file:///C:/secret",
            "http://localhost:5173",
            "http://user@tauri.localhost/",
            "http://tauri.localhost:8080",
        ] {
            assert!(!allowed_navigation(&value.parse().unwrap(), false));
        }
        assert!(allowed_navigation(
            &"http://localhost:5173/#/ho-so".parse().unwrap(),
            true
        ));
    }
}
