# Design Guidelines for EG Press

## Design Approach
**Reference-Based Approach**: Drawing from Netlify CMS and TinaCMS Git-based interfaces, focusing on productivity-oriented content management with clear information hierarchy and efficient workflows.

## Core Design Elements

### Typography System
**Font Families:**
- Interface Text: Inter (400, 500, 600)
- Code/Technical: JetBrains Mono (400, 500)

**Typography Scale:**
- Page Titles: text-3xl font-semibold (Inter)
- Section Headers: text-xl font-semibold (Inter)
- Card Titles: text-lg font-medium (Inter)
- Body Text: text-base (Inter)
- Labels: text-sm font-medium (Inter)
- Code/Paths: text-sm (JetBrains Mono)
- Captions: text-xs (Inter)

### Layout System
**Spacing Primitives:** Consistent use of Tailwind units: 2, 4, 6, 8, 12, 16 for padding and margins.

**Primary Layout Structure:**
- Three-column layout: Fixed sidebar (w-64) + Content area (flex-1) + Preview pane (w-96 when active)
- Sidebar: File tree navigation with repository selector at top
- Main content: Scrollable editor/form area with max-w-4xl centering
- Preview pane: Toggleable split-screen with live preview

**Container Strategy:**
- Sidebar: Full height, fixed position, bg-white with border-r
- Content wrapper: p-8 with max-w-4xl mx-auto for forms/editors
- Preview pane: Slide-in from right, full height

### Component Library

**Navigation & Sidebar:**
- Repository Input: Prominent input field with GitHub icon, connect button
- File Tree: Nested collapsible structure with file/folder icons, hover states, selected state highlighting
- Main Navigation: Icon + label vertical menu items (Dashboard, Posts, Pages, Settings, Theme)

**Content Management:**
- Post List: Card-based grid layout with thumbnail, title, date, status badge, action buttons
- Search/Filter Bar: Sticky top bar with search input, filter dropdowns, sort options
- Editor Interface: Split between metadata form (left) and markdown editor (right within content area)
- Markdown Editor: Toolbar with formatting buttons, full-height textarea with monospace font

**Forms & Inputs:**
- Text Fields: Outlined style with floating labels, focus ring
- Date Pickers: Calendar dropdown with clear visual hierarchy
- Tag Input: Pill-style tags with add/remove functionality
- Color Pickers: Swatch preview with hex input field
- Dropdowns: Clean list with search capability for long lists

**Theme Customization Panel:**
- Color Grid: 6 color swatches (Primary, Secondary, Background, Text, Accent, Success)
- Each Swatch: Large preview box + hex input + label
- Live Preview Toggle: Switch to see changes in real-time on sample content
- Reset/Save Actions: Clear action buttons at panel bottom

**Data Display:**
- Status Badges: Pill-shaped with Published (success), Draft (neutral), Scheduled (accent) states
- Metadata Cards: Compact info display with icon + label + value rows
- Commit History: GitHub-style list with avatar, message, timestamp

**Action Components:**
- Primary Actions: Solid background buttons for Save, Publish, Commit
- Secondary Actions: Outlined buttons for Cancel, Preview, Discard
- Destructive Actions: Text color indicates danger for Delete operations
- Icon Buttons: Small circular buttons for quick actions in lists/toolbars

**Feedback & Status:**
- Toast Notifications: Top-right corner for success/error messages
- Loading States: Skeleton screens for content loading, spinners for actions
- Empty States: Centered illustration + message + CTA for empty lists

### Visual Patterns

**Cards:**
- Rounded corners (rounded-lg)
- Subtle shadow (shadow-sm)
- Padding: p-6 for content cards, p-4 for list items
- Hover: Slight elevation increase (hover:shadow-md)

**File Tree Styling:**
- Indent levels: pl-4 increments for nesting
- Folder icons: Chevron for expand/collapse
- File icons: Type-specific icons (markdown, image, config)
- Selected file: Highlighted background with left border accent

**Split-Panel Editor:**
- Left: Form fields with clear section dividers (border-t, pt-6, mt-6)
- Right (when toggled): Markdown rendering with prose styling
- Divider: Draggable resize handle between panels

**GitHub Integration UI:**
- Repository Status: Badge showing connection state (connected/disconnected)
- Sync Indicator: Icon with last sync timestamp
- Commit Interface: Commit message textarea + author info + timestamp
- Branch Selector: Dropdown showing current branch with option to switch

### Responsive Behavior
- Desktop (1024px+): Full three-column layout
- Tablet (768-1023px): Collapsible sidebar, preview as modal overlay
- Mobile (<768px): Single column, hamburger menu for navigation, preview as full-screen modal

### Interaction Patterns
- Autosave: Visual indicator showing last saved timestamp
- Drag-and-drop: For file uploads and image insertion in editor
- Keyboard shortcuts: Visual hints for common actions (Cmd/Ctrl+S for save)
- Confirmation dialogs: Modal overlays for destructive actions

### Animations
**Minimal, Performance-Focused:**
- Sidebar toggle: Smooth slide transition (duration-200)
- File tree expand/collapse: Height transition (duration-150)
- Toast notifications: Slide + fade in/out
- NO scroll-triggered animations or complex micro-interactions