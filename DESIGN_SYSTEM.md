# Better Reports Design System

## Overview

Better Reports uses a Fal-inspired design system focused on **tight spacing**, **small typography**, and **high information density**.

## Core Principles

### Visual Rhythm
- **Tight spacing**: 12-16px between elements (0.75rem - 1rem)
- **Small fonts**: 11-15px for body text (text-xs to text-sm)
- **Compact controls**: 36-40px height for inputs and buttons
- **Muted colors**: zinc-600/zinc-400 for labels, zinc-700/zinc-800 for borders
- **High density**: Maximize information display while maintaining readability

## Layout Structure

### Page Layout
```tsx
<PageLayout title="Page Title" subtitle="Optional description" actions={<Actions />}>
  <div className="page-container">
    <div className="page-header">
      {/* Scorecards, filters, etc */}
    </div>
    <div className="page-content">
      {/* Main content */}
    </div>
  </div>
</PageLayout>
```

### App Shell
- **TopBar**: Logo, breadcrumbs (left), search, org selector, alerts, user (right)
- **PageTitle**: Full-width title with subtitle and actions
- **Sidebar**: Fixed width (w-56), persistent across navigation
- **Content**: Flexible, scrollable area

## Typography

### Sizes
- **Page titles**: `text-lg font-semibold` (18px)
- **Subtitles**: `text-xs text-zinc-500` (12px)
- **Body text**: `text-sm` (14px)
- **Labels**: `text-xs text-zinc-600` (12px)
- **Table headers**: `text-xs font-medium` (12px)

### Colors
- **Primary text**: `text-zinc-900 dark:text-zinc-100`
- **Secondary text**: `text-zinc-500 dark:text-zinc-400`
- **Muted text**: `text-zinc-600 dark:text-zinc-400`

## Spacing

### Padding
- **Page header**: `px-6 py-4` → `px-4 py-3`
- **Page content**: `px-6 pb-6` → `px-4 pb-4`
- **PageTitle**: `px-4 py-4`
- **Cards**: `p-4` (reduced from p-6)
- **Table cells**: `px-3 py-1.5` (reduced from px-4 py-2.5)
- **Scorecards**: `p-3` with `gap-2`

### Gaps
- **Element spacing**: `gap-3` (12px) for most layouts
- **Button groups**: `gap-2` (8px)
- **Scorecard grids**: `gap-3` (12px)

## Components

### Buttons

#### Primary Button
```tsx
<button className="px-3 py-1.5 bg-zinc-900 text-white dark:bg-white dark:text-zinc-900 rounded-md font-medium hover:opacity-80 text-xs">
  Action
</button>
```

#### Secondary Button (now matches primary)
```css
.btn-secondary {
  background: rgb(24 24 27);
  color: #ffffff;
  border: none;
}
```

#### Button Sizes
- **Small**: `.btn-sm` - `padding: 0.375rem 0.75rem; font-size: 0.75rem; gap: 0.5rem;`
- **Extra small**: `.btn-xs` - `padding: 0.25rem 0.625rem; font-size: 0.75rem;`

### Forms

#### Inputs
- **Height**: 36-40px
- **Padding**: `px-3 py-1.5`
- **Font size**: `text-sm`
- **Border**: `border-zinc-300 dark:border-zinc-700`

#### Labels
- **Font size**: `text-xs`
- **Color**: `text-zinc-600 dark:text-zinc-400`
- **Spacing**: `mb-1.5`

### Tables

#### Density
```css
.table-cell {
  padding: 0.375rem 0.75rem; /* 6px 12px */
}
```

#### Headers
- **Font**: `text-xs font-medium`
- **Color**: `text-zinc-600 dark:text-zinc-400`
- **Background**: `bg-zinc-50 dark:bg-zinc-900`

### Scorecards

```tsx
<Scorecard
  title="Metric Name"      // text-xs text-zinc-600
  value="1,234"            // text-2xl font-semibold
  subtitle="Optional info" // text-xs text-zinc-500
/>
```

- **Padding**: `p-3`
- **Gap**: `gap-1.5`
- **Border**: `border-zinc-200 dark:border-zinc-800`

## Colors

### Backgrounds
- **Page**: `bg-white dark:bg-black`
- **Surface**: `bg-white dark:bg-zinc-950`
- **Hover**: `hover:bg-zinc-50 dark:hover:bg-zinc-800`
- **Card**: `bg-white dark:bg-zinc-900`

### Borders
- **Default**: `border-zinc-200 dark:border-zinc-800`
- **Light**: `border-zinc-100 dark:border-zinc-800`
- **Input**: `border-zinc-300 dark:border-zinc-700`

### Text
- **Primary**: `text-zinc-900 dark:text-zinc-100`
- **Secondary**: `text-zinc-500 dark:text-zinc-400`
- **Muted**: `text-zinc-600 dark:text-zinc-400`

## Context & State Management

### PageContext
Used to manage page chrome (title, subtitle, actions) without causing sidebar remounting:

```tsx
// In page component
<PageLayout title="Page Title" subtitle="Description" actions={<Actions />}>
  {children}
</PageLayout>

// AppShell reads from context and renders PageTitle + Sidebar
```

**Important**: PageContext is scoped to layout/chrome only. Don't add business logic or data fetching to it.

## Migration Guide

### Converting Old Pages
1. Wrap content in `<PageLayout>`
2. Move page title/subtitle to PageLayout props
3. Move action buttons to `actions` prop
4. Update padding from `px-6` to `px-4`
5. Update button classes from `btn-secondary` to match new dark style

### Button Updates
```tsx
// Old
<button className="btn btn-secondary btn-sm">Action</button>

// New (uses updated .btn-secondary)
<button className="btn btn-secondary btn-sm">Action</button>

// Or inline (for custom styling)
<button className="px-3 py-1.5 bg-zinc-900 text-white rounded-md text-xs">
  Action
</button>
```

## Version History

### v1.5.0 (Current)
- Completed Fal-inspired design system implementation
- Updated all button styles to use consistent dark backgrounds
- Fixed PageTitle padding alignment
- Added gap property to button components for icon spacing

### v1.4.0
- Implemented PageContext for layout management
- Created PageTitle, AppShell, and PageLayout components
- Applied tight spacing and small typography globally
- Updated all pages with descriptive subtitles
- Increased table and content density
