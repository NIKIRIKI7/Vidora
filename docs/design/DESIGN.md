---
name: Lumina Cinematic
colors:
  surface: '#0b1326'
  surface-dim: '#0b1326'
  surface-bright: '#31394d'
  surface-container-lowest: '#060e20'
  surface-container-low: '#131b2e'
  surface-container: '#171f33'
  surface-container-high: '#222a3d'
  surface-container-highest: '#2d3449'
  on-surface: '#dae2fd'
  on-surface-variant: '#cfc2d6'
  inverse-surface: '#dae2fd'
  inverse-on-surface: '#283044'
  outline: '#988d9f'
  outline-variant: '#4d4354'
  surface-tint: '#ddb7ff'
  primary: '#ddb7ff'
  on-primary: '#490080'
  primary-container: '#b76dff'
  on-primary-container: '#400071'
  inverse-primary: '#842bd2'
  secondary: '#4fdbc8'
  on-secondary: '#003731'
  secondary-container: '#04b4a2'
  on-secondary-container: '#003f38'
  tertiary: '#c0c1ff'
  on-tertiary: '#1000a9'
  tertiary-container: '#8083ff'
  on-tertiary-container: '#0d0096'
  error: '#ffb4ab'
  on-error: '#690005'
  error-container: '#93000a'
  on-error-container: '#ffdad6'
  primary-fixed: '#f0dbff'
  primary-fixed-dim: '#ddb7ff'
  on-primary-fixed: '#2c0051'
  on-primary-fixed-variant: '#6900b3'
  secondary-fixed: '#71f8e4'
  secondary-fixed-dim: '#4fdbc8'
  on-secondary-fixed: '#00201c'
  on-secondary-fixed-variant: '#005048'
  tertiary-fixed: '#e1e0ff'
  tertiary-fixed-dim: '#c0c1ff'
  on-tertiary-fixed: '#07006c'
  on-tertiary-fixed-variant: '#2f2ebe'
  background: '#0b1326'
  on-background: '#dae2fd'
  surface-variant: '#2d3449'
typography:
  display-lg:
    fontFamily: Inter
    fontSize: 48px
    fontWeight: '700'
    lineHeight: '1.1'
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Inter
    fontSize: 32px
    fontWeight: '600'
    lineHeight: '1.2'
  headline-lg-mobile:
    fontFamily: Inter
    fontSize: 24px
    fontWeight: '600'
    lineHeight: '1.2'
  title-md:
    fontFamily: Inter
    fontSize: 18px
    fontWeight: '500'
    lineHeight: '1.5'
  body-md:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: '1.6'
  label-sm:
    fontFamily: Geist
    fontSize: 12px
    fontWeight: '500'
    lineHeight: '1.2'
    letterSpacing: 0.05em
  mono-code:
    fontFamily: Geist
    fontSize: 13px
    fontWeight: '400'
    lineHeight: '1.4'
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  base: 4px
  xs: 8px
  sm: 16px
  md: 24px
  lg: 40px
  xl: 64px
  gutter: 16px
  margin-mobile: 20px
  margin-desktop: 32px
---

## Brand & Style

The design system is engineered for a high-performance video creation environment. It balances the gravity of professional production tools with the kinetic energy of modern creative software. The aesthetic is rooted in **Modern Minimalism** with heavy **Glassmorphism** influences to simulate depth and focus within a complex workspace.

The UI targets professional creators who require an efficient, high-tech interface that recedes to prioritize content while remaining striking during interaction. The emotional response is one of surgical precision and limitless creative potential. Key visual drivers include ultra-thin borders, high-clarity translucency, and purposeful neon accents that guide the eye through the editing workflow.

## Colors

The palette is anchored in a "Deep Space" charcoal and black foundation to ensure maximum contrast for video previews. 

- **Primary (Electric Violet):** Used for primary actions, progress indicators, and active states in the timeline.
- **Secondary (Cyber Teal):** Used for success states, secondary interactive accents, and "Render/Export" pathways.
- **Tertiary (Deep Indigo):** Utilized for selection logic and subtle hover states to maintain a sophisticated depth.
- **Surface Strategy:** Backgrounds utilize a true black for high-end OLED displays, while functional panels use a deep charcoal with a slight blue tint to provide a canvas for glassmorphic effects.

## Typography

This design system utilizes **Inter** for its systematic clarity and high legibility at all sizes. For technical metadata and timeline timestamps, **Geist** is introduced to provide a developer-centric, high-tech feel.

- **Headlines:** Should be tight and impactful, utilizing negative letter-spacing for a modern, compressed look.
- **Body:** Maintains a generous line height to ensure readability against dark backgrounds.
- **Labels:** Always in Geist, often capitalized when used for UI controls or data readouts to differentiate from narrative text.

## Layout & Spacing

The layout follows a **Fluid Grid** logic with specialized containers for the video viewport and timeline. 

- **Desktop:** A 12-column grid is used for dashboard views, but the core editor uses a "Workbench" model: fixed-width sidebars (280px-320px) with a flexible central canvas.
- **Mobile:** Elements reflow into a single-column stack, prioritizing the video preview at the top 40% of the screen.
- **Spacing Rhythm:** Based on a 4px scale. Generous whitespace (32px+) is maintained between major functional groups to prevent the "cluttered pro-tool" look, favoring a minimalist, focused experience.

## Elevation & Depth

Depth in this design system is achieved through **Glassmorphism** and tonal layering rather than traditional drop shadows.

- **Level 1 (Base):** True black (#000000) for the main canvas.
- **Level 2 (Panels):** Semi-transparent charcoal with a 20px backdrop blur and a 1px border of `rgba(255, 255, 255, 0.08)`.
- **Level 3 (Popovers/Modals):** Lighter transparency with a secondary 1px "inner glow" border and an ultra-diffuse ambient shadow (40px blur, 20% opacity) tinted with the primary purple.
- **Interactive Depth:** When an element is hovered, the backdrop blur intensity increases, and the border opacity shifts to 20% using the accent color.

## Shapes

The shape language is "Calculated Softness." Elements are rounded enough to feel modern and approachable but maintain enough structure to feel professional.

- **Buttons & Inputs:** Use the standard `rounded-md` (0.5rem).
- **Cards & Major Panels:** Use `rounded-lg` (1rem) to create clear visual containment.
- **Contextual Tags/Chips:** Use `rounded-full` (Pill-shaped) to distinguish them from functional buttons.
- **Video Thumbnails:** Always use `rounded-md` to maintain a consistent crop across the library.

## Components

- **Buttons:** Primary buttons use a subtle gradient from Purple to Indigo with a white label. Secondary buttons are "Ghost" style with a glass background and a 1px teal border.
- **Timeline Tracks:** Use a dark gray base with high-contrast neon purple handles. Active segments feature a "pulse" glow effect.
- **Input Fields:** Minimalist design—bottom-border only or very subtle glass containers. Focus state triggers a teal glow and a slight increase in backdrop blur.
- **Chips/Badges:** Small, Geist-font labels with low-opacity fills of the accent colors (e.g., 10% Teal fill with 100% Teal text).
- **Cards:** Content cards feature a "glass-to-solid" hover transition where the background becomes slightly more opaque to signify focus.
- **Icons:** Thin-stroke (1.5pt) linear icons. Interactive icons toggle from neutral gray to their respective accent color (Teal for "Apply", Purple for "Edit").