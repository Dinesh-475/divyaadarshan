# Design System Specification: Divine Clarity

## 1. Overview & Creative North Star
**Creative North Star: "The Digital Sanctuary"**

This design system transcends standard utility by adopting a high-end editorial approach to temple management. We are not building a database; we are crafting a digital sanctuary. The experience must feel rhythmic, meditative, and profoundly intentional.

To move beyond the "template" look, this system utilizes **The Asymmetric Breath**. Instead of perfectly symmetrical grids, we use generous, intentional white space and overlapping layers to guide the eye. By pairing the architectural stability of the deep blue with a "paper-on-glass" layering philosophy, we create a professional environment that feels both grounded and ethereal.

---

## 2. Colors & Surface Philosophy

### The "No-Line" Rule
**Borders are a failure of hierarchy.** To maintain a premium, calm atmosphere, 1px solid borders are strictly prohibited for sectioning. Boundaries must be defined exclusively through background color shifts. 

### Surface Hierarchy & Nesting
We treat the UI as a series of physical layers. We use the Material surface tiers to create depth through tonal shifts rather than lines.
*   **Base Layer:** `surface` (#f9f9fb)
*   **Sectioning:** Use `surface-container-low` (#f2f4f6) for large background regions.
*   **Interactive Elements:** Use `surface-container-lowest` (#ffffff) for primary cards to create a "lifted" effect against the slightly darker background.

### Glass & Soul
While the palette is minimal, "flat" is not "dead." 
*   **Glassmorphism:** For floating headers or navigation bars, use `surface` at 80% opacity with a `24px` backdrop blur. This allows the "spiritual" content to bleed through the interface, softening the user journey.
*   **Tonal CTAs:** Use `primary` (#4c56af) for high-emphasis actions. To add professional polish, a nearly imperceptible linear transition from `primary` to `primary_dim` (#4049a2) is permitted only on main action buttons to provide a tactile, "pressed" quality.

---

### 3. Typography
The system uses a dual-typeface pairing to balance authoritative tradition with modern accessibility.

*   **Display & Headlines (Manrope):** Chosen for its geometric purity and wide aperture. It feels modern, welcoming, and high-end.
    *   *Usage:* Use `display-lg` for daily darshan quotes and `headline-md` for temple names.
*   **Body & Labels (Inter):** A workhorse for clarity. Inter provides the mathematical precision required for scheduling, donations, and management data.
    *   *Usage:* `body-md` for all descriptive text; `label-sm` for metadata and timestamps.

**Editorial Tip:** Use "Staggered Type." Never center-align long-form text. Keep headlines left-aligned with a significant `2rem` bottom margin to the body text to create an editorial, "magazine" feel.

---

## 4. Elevation & Depth

### The Layering Principle
Depth is achieved through "Tonal Stacking."
1.  **Level 0:** `surface_container_low` (The "Floor")
2.  **Level 1:** `surface_container_lowest` (The "Card")
3.  **Level 2:** `primary_container` (The "Highlight")

### Ambient Shadows
When an element must float (e.g., a bottom sheet or FAB), do not use grey shadows.
*   **Shadow Recipe:** `0px 12px 32px rgba(26, 35, 126, 0.06)`. By tinting the shadow with our `on_surface` or `primary` hue at a very low opacity, the shadow feels like natural ambient light rather than digital "dirt."

### The "Ghost Border" Fallback
If a border is required for accessibility (e.g., in high-contrast modes), use the `outline_variant` token at **15% opacity**. It should be felt, not seen.

---

## 5. Components

### Buttons
*   **Primary:** `primary` fill with `on_primary` text. `md` (12px) roundedness. No border.
*   **Secondary:** `surface_container_high` fill. This creates a "recessed" look compared to the primary button.
*   **Tertiary:** No fill. `primary` text. Used for "Cancel" or "Back" actions to reduce cognitive load.

### Cards & Lists (The "No-Divider" Rule)
*   **Rule:** Forbid 1px dividers between list items. 
*   **Implementation:** Use a `16px` vertical gap between items. For grouping, place list items inside a `surface_container_lowest` card with an `md` (12px) corner radius. The contrast between the white card and the `surface` background is your divider.

### Smart Temple Specific Components
*   **Darshan Slot Picker:** Use `secondary_container` for unselected slots and `primary` for the selected slot. Soften the corners to `lg` (16px) to make the selection feel "inviting."
*   **Live Stream Container:** Use a `surface_dim` background with a `24px` blur overlay for the "Live" badge, ensuring the video remains the focal point.
*   **Donation Input:** A large `display-sm` type for the currency amount, centered within a `surface_container_highest` block to convey security and importance.

---

## 6. Do's and Don'ts

### Do
*   **Do** use `primary_fixed_dim` for subtle background highlights in "Success" states.
*   **Do** prioritize "Inter-Element Spacing." If in doubt, add 8px more padding.
*   **Do** use `manrope` for numbers to give them a modern, architectural feel.

### Don't
*   **Don't** use pure black (#000000) for text. Always use `on_surface` (#2d3338) to maintain a soft, premium contrast.
*   **Don't** use "Drop Shadows" on cards that are already resting on a contrasting background.
*   **Don't** use icons with varying stroke weights. Use "Light" or "Regular" weight icons to match the thin, elegant lines of the typography.

---

## 7. Roundedness Scale
*   **DEFAULT:** `0.5rem` (12px) - The standard for all interactive cards.
*   **LG:** `1rem` (16px) - For large "Sanctuary" containers or hero sections.
*   **FULL:** `9999px` - Reserved strictly for Pill Buttons and status Tags.