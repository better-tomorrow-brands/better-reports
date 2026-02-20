# Changelog

## [1.5.0] - 2026-02-20

### Changed
- Updated `.btn-secondary` class to use dark background (zinc-900) with white text instead of transparent with border
- Changed `.btn-secondary:hover` to use opacity (0.8) instead of background color change
- Added `gap: 0.5rem` to `.btn-sm` class for consistent spacing between icons and text
- Reduced PageTitle horizontal padding from `px-6` to `px-4` for better alignment with page content

### Fixed
- "Sync", "Sort", and "Add filter" buttons now match the visual style of other UI buttons
- Consistent padding alignment across PageTitle and page content areas

## [1.4.0] - Previous

### Added
- PageContext for managing page chrome (title, subtitle, actions)
- PageTitle component for consistent page headers
- AppShell component to prevent sidebar remounting
- PageLayout component for wrapping page content
- Descriptive subtitles to all pages

### Changed
- Applied Fal-inspired visual rhythm globally (tight spacing, small typography)
- Reduced padding throughout the application
- Increased table and content density
- Updated all pages to use new PageLayout pattern
