# Changelog

All notable changes to **Shorts Killer** are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.8.0] - 2026-10-11

### Added
- Append-only event storage for statistics (`trigger`, `watched`, `saved_estimate`)
- Correct multi-tab statistics (no more lost updates when several YouTube tabs are open)
- Automatic migration of legacy v0.7 aggregated stats into the event model
- Automatic cleanup of old events
- More accurate weekly blocked count in the popup
- Block rate metric in the main UI
- Project `README.md`

### Changed
- Hard mode no longer redirects to Rickroll; it returns the user to the normal YouTube homepage
- `savedMinutes` is now treated as an **estimated** time saved (`saved_estimate`)
- Continue button copy made more explicit about a conscious choice
- Telegram reports switched from Markdown to HTML formatting
- Shorts-hiding selectors made less aggressive to reduce false positives
- Statistics terminology clarified across UI and reports

### Fixed
- Race conditions when writing stats from multiple tabs
- Repeated protection of the same Shorts video ID
- Mixing of old aggregated stats with new event-based data
- Version mismatches between manifest, UI, and source comments

### Security
- Normal usage statistics remain fully local (`chrome.storage.local`)
- Telegram is used only on explicit user action
- Dynamic Telegram text no longer depends on Markdown escaping

## [0.7.0] - 2026-10-10

### Added
- Option **Hide Shorts everywhere**
  - Hides Shorts cards, shelves, and menu entries on Home, Search, and Subscriptions
  - Does not interfere with the actual `/shorts/` page (handled by the blocker)
- 30-day local history (`stats.history`)
- Stronger strict-limit lock via `strictLimitDate` / `strictLimitValue`

### Changed
- Visibility of Shorts elements is updated live with a `MutationObserver`

### Fixed
- Strict limit enforcement consistency between popup and content script

## [0.6.0] - 2026-10-10

### Fixed
- Daily reset now uses **local date** instead of UTC
- YouTube SPA navigation from one Short to another is handled correctly
- Each Shorts video is protected once via `currentShortId` tracking
- Strict daily limit is enforced in the content script as well as the popup
- Removed double-counting path through `beforeunload`

## [0.5.0] - 2026-10-09

### Added
- Two-screen popup UI (main screen + settings via gear icon)
- Quick mode switch on the main screen
- Telegram integration
  - Bot token and Chat ID fields
  - "Send report now" button
- Host permission for `https://api.telegram.org/*`

### Changed
- Detailed settings moved off the main screen for a cleaner primary UI

## [0.4.0] - 2026-10-09

### Added
- Random reflective questions before the "Watch anyway" button
- Large question pool (30+)
- Dedicated styles for the question block in the overlay

## [0.3.0] - 2026-10-09

### Added
- Time saved is counted when the user leaves Shorts **before** pressing "Watch anyway"
- **Strict limit** mode: after the daily limit is reached, it cannot be increased until the next day
- "Resets tomorrow" label in the popup

### Fixed
- Cases where protection triggered but saved time was not recorded on leave

## [0.2.0] - 2026-10-09

### Added
- Soft mode (overlay + timer) and hard mode (immediate block)
- Configurable timer duration
- Daily Shorts limit
- Local statistics: triggers, watched, saved minutes
- Popup UI for settings and stats
- Persistence via `chrome.storage.local`

### Changed
- Rickroll is used only in hard mode or when the daily limit is exceeded

## [0.1.0] - 2026-10-09

### Added
- Initial proof of concept
- Redirect any YouTube Shorts URL to Rickroll
- Basic SPA navigation handling (`yt-navigate-finish`)
- Click interception on Shorts links

---

## Links

- Repository: _(add your GitHub URL here)_
- Issues: _(add your GitHub issues URL here)_
