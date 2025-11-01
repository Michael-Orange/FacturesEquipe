# Design Guidelines: FiltrePlante Invoice Submission App

## Design Approach
**System-Based Approach**: Material Design with FiltrePlante brand identity
- Mobile-first design optimized for touch interfaces
- Functional, utility-focused interface for field professionals
- Clean, modern aesthetic aligned with environmental/sustainability branding

## Color Palette

### Primary Colors
- **Teal Primary**: #157a70 (174° 69% 29%) - Headers, primary buttons, brand elements
- **Teal Secondary**: #2997aa (191° 63% 41%) - Secondary actions, links, highlights
- **Light Green Background**: #edf8f7 (171° 43% 96%) - Card backgrounds, result containers
- **Beige Earth**: #8D6E63 (15° 25% 47%) - Labels, neutral sections, secondary text

### System Colors
- **Success**: Teal variants for confirmations
- **Error**: Standard Material Design error red
- **Background**: White (light mode), dark slate (dark mode)
- **Text**: High contrast ratios maintaining WCAG AA compliance

## Typography

### Font Family
- **Primary**: Inter (Google Fonts)
- Clean, modern, highly readable sans-serif

### Hierarchy
- **H1**: 2rem (32px), semibold - Page titles
- **H2**: 1.5rem (24px), medium - Section headers
- **H3**: 1.25rem (20px), medium - Card titles
- **Body**: 1rem (16px), regular - Form labels, content
- **Small**: 0.875rem (14px), regular - Helper text, metadata

## Layout System

### Spacing Units
Use Tailwind's spacing scale with primary units: 2, 4, 6, 8, 12, 16, 20, 24
- **Micro spacing**: p-2, gap-2 (8px) - Between related elements
- **Standard spacing**: p-4, gap-4 (16px) - Form fields, card padding
- **Section spacing**: py-8, py-12 (32-48px) - Between major sections
- **Large spacing**: py-16, py-20 (64-80px) - Page margins, hero sections

### Grid Structure
- **Desktop**: Two-column layout (60/40 split when applicable)
- **Mobile**: Single column, full-width
- **Max Container Width**: max-w-7xl for wide content, max-w-2xl for forms

## Component Library

### Buttons
- **Height**: Minimum 56px (touch-optimized)
- **Primary**: Teal background (#157a70), white text, rounded-lg
- **Secondary**: Teal outline, teal text, rounded-lg
- **Corner Radius**: 8px (rounded-lg)
- **Padding**: px-6 py-3
- **States**: Hover darkens 10%, active scales 98%

### Form Inputs
- **Text Fields**: Border-gray-300, rounded-lg, p-3, focus:ring-2 ring-teal-500
- **Dropdowns**: Native HTML select styled consistently, minimum 56px height
- **Search Fields**: Icon prefix (🔍), rounded-full, light background
- **Labels**: Beige earth color, font-medium, mb-2
- **Helper Text**: text-sm, text-gray-600

### Cards
- **Background**: Light green (#edf8f7)
- **Border Radius**: 8px (rounded-lg)
- **Padding**: p-6
- **Shadow**: shadow-sm on light mode, subtle glow on dark
- **Border**: None or 1px light border

### Supplier Search Component
- **Search Bar**: Full-width, rounded-full, bg-white, with search icon
- **Suggestion List**: Dropdown below search, max 10 items, scrollable
- **Quick Access Sections**: 
  - "Mes derniers" (5 items) - Distinguished with subtle background
  - "Plus gros volumes" (5 items) - Similar treatment
- **New Supplier Button**: Secondary style, [+ Nouveau fournisseur]
- **Similarity Warning**: Modal popup with ⚠️ icon, two clear action buttons

### Project Dropdown
- **Grouped Options**: 
  - "🟢 PROJETS ACTIFS 2025" header
  - "📋 PROJETS 2024 ET ANTÉRIEURS" header
- **Option Format**: "Number - Project Name"
- **Placeholder**: "Sélectionner un projet..."

### File Upload
- **Zone**: Dashed border, teal accent, drag-and-drop capable
- **Accepted**: PDF and images clearly indicated
- **Preview**: Thumbnail or filename displayed after selection

### Data Tables (Tracking Pages)
- **Header**: Teal background, white text
- **Rows**: Alternating subtle backgrounds, hover state
- **Actions**: Icon buttons (download, delete) aligned right
- **Mobile**: Collapse to cards with key info visible

### Navigation
- **Header**: Teal primary background (#157a70), white text, h-16
- **Logo/Title**: Left-aligned, font-semibold
- **User Info**: Right-aligned when applicable
- **Mobile Menu**: Hamburger if needed, slide-out drawer

### Modals/Popups
- **Overlay**: Semi-transparent dark background
- **Container**: White, rounded-lg, max-w-md, centered
- **Padding**: p-6
- **Actions**: Right-aligned, primary + secondary buttons

## Animations
**Minimal & Purposeful**
- Button hover: Subtle color shift (150ms)
- Form focus: Ring appearance (200ms)
- Modal entry: Fade + slight scale (250ms)
- Loading states: Teal spinner or skeleton screens
- NO scroll animations, parallax, or decorative motion

## Responsive Behavior

### Mobile (< 768px)
- Single column layouts
- Full-width cards and buttons
- Larger tap targets (56px minimum)
- Simplified navigation
- Stack form fields vertically

### Tablet (768px - 1024px)
- Two-column grids where appropriate
- Moderate spacing adjustments
- Maintain touch-friendly sizing

### Desktop (> 1024px)
- Multi-column layouts (60/40 for form/results)
- Increased spacing for breathing room
- Hover states become visible

## Accessibility
- **Focus States**: Clear 2px teal ring on all interactive elements
- **Color Contrast**: All text meets WCAG AA (4.5:1 minimum)
- **Touch Targets**: 56px minimum for all buttons and inputs
- **Labels**: Every form input has associated label
- **Error Messages**: Clear, specific, immediately visible
- **Screen Reader**: Semantic HTML, ARIA labels where needed

## Dark Mode Support
- Automatic detection via system preferences
- Teal palette adapts (lighter shades on dark backgrounds)
- Card backgrounds: Dark slate instead of light green
- Maintain contrast ratios throughout

## Images
**No hero images** - This is a utility application focused on efficiency
- **Icons Only**: Use for categories, file types, action buttons
- **Supplier Logos**: Optional small icons if available in database
- **File Previews**: Thumbnails of uploaded invoices in tracking view