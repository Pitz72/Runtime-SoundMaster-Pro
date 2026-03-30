```markdown
# Design System Strategy: The Analog-Digital Interface

## 1. Overview & Creative North Star
**Creative North Star: "The Brutalist Control Room"**

This design system is a sophisticated evolution of the Cyber-Soviet aesthetic. It eschews the "clean-tech" minimalism of Silicon Valley in favor of a heavy, industrial, and highly intentional utility. We are designing a professional audio tool that feels like a decommissioned nuclear reactor control panel repurposed for high-end digital signal processing.

The system breaks the "template" look by utilizing **Monolithic Layouts**—large, unyielding blocks of functional data—paired with **Intentional Asymmetry**. We do not center elements to be "safe"; we align them to the grid of a technical schematic. The visual weight is anchored in deep charcoal voids, punctuated by high-frequency "Radioactive" accents that demand immediate cognitive attention.

---

## 2. Color Architecture

Our palette is built on the principle of **Spectral Functionalism**. Every color has a specific "voltage" or utility within the audio workflow.

### The "No-Line" Rule
Traditional 1px solid borders are strictly prohibited for sectioning. They create visual noise that interferes with waveform visualization. Instead, define boundaries through **Tonal Shifts**. Use `surface_container` (#201F1F) against the `background` (#131313) to create a "recessed" area for faders or knobs. 

### Surface Hierarchy & Nesting
Treat the UI as a physical stack of industrial plates:
- **Base Layer:** `surface_dim` (#131313) – The main chassis of the application.
- **Secondary Well:** `surface_container` (#201F1F) – Used for grouping global controls (e.g., the Master Bus).
- **Control Modules:** `surface_container_high` (#2A2A2A) – The "tactile" panels where users interact with sliders and toggles.
- **Active Indicators:** `primary_container` (#39FF14) – Used sparingly for "power-on" states or signal clipping.

### Signature Textures
To avoid a flat, "web-like" feel, use a subtle **Inner Glow Gradient** on primary action buttons. Transition from `primary` (#EFFFE3) at the top edge to `primary_container` (#39FF14) at the bottom. This mimics the self-illumination of an industrial green bulb.

---

## 3. Typography: The Technical Editorial
We utilize a high-contrast pairing that balances technical precision with Soviet-era propaganda-style signage.

*   **Display & Headlines (Space Grotesk):** These are your "Industrial Signage." They must be bold, uppercase, and used for high-level navigation or major module titles (e.g., "COMPRESSOR," "OSCILLATOR"). The tight tracking and blocky nature convey an authoritative, heavy presence.
*   **Data & Body (Inter / JetBrains Mono):** The "Technical Manual." Use Inter for general labels and JetBrains Mono for specific frequency values, decibel readings, and millisecond timings. The monospaced nature of the data ensures that as values change, the UI does not "jitter."

**Hierarchy Tip:** Use `label_sm` in `on_surface_variant` (#BACCB0) for sub-labels. This lower-contrast green-grey mimics the etched text on a weathered metal faceplate.

---

## 4. Elevation & Depth: Tonal Layering
In a professional audio utility, shadows are usually a distraction. We achieve depth through **Refractive Layering**.

*   **The Layering Principle:** Instead of drop shadows, use `surface_container_lowest` (#0E0E0E) to create "carved out" sections. If a module needs to feel like it is "sitting on top," use `surface_bright` (#393939) as the background.
*   **Ambient Glow (The "Vacuum Tube" Effect):** For floating menus or tooltips, apply a `secondary_container` (#FFB211) glow with a 24px blur at 10% opacity. This mimics the warm, ambient light of a vacuum tube.
*   **The Ghost Border Fallback:** Where separation is mission-critical (e.g., overlapping waveforms), use `outline_variant` (#3C4B35) at 15% opacity. It should feel like a faint pencil line on a blueprint, not a UI element.
*   **Glassmorphism:** Use for "HUD" overlays. Apply `surface_container_low` at 60% opacity with a 12px backdrop-blur to allow the waveforms behind it to remain visible but diffused.

---

## 5. Components

### Tactile Buttons
*   **Primary (Action):** Rectangular (`0px` radius). Background: `primary_container` (#39FF14). Text: `on_primary` (#053900). On hover, add a `primary_fixed` glow.
*   **Tertiary (Utility):** Background: Transparent. Border: `outline_variant` at 20%. Text: `on_surface`.

### Monolithic Cards
*   **Rule:** Forbid the use of divider lines. 
*   **Structure:** Use `spacing_4` (0.9rem) of vertical whitespace between groups. Use a `surface_container_highest` header bar to "cap" the card, providing a visual handle.

### Input Fields & Knobs
*   **Inputs:** Use `surface_container_lowest` for the field background to make it look "inset" into the hardware. Use `primary_container` (#39FF14) for the caret and active focus state.
*   **Audio Knobs:** Visualize as circles within a square `surface_container_high` box. The "indicator needle" should be `secondary_container` (#FFB211) to stand out against the green/grey theme.

### Indicators & Chips
*   **Status Chips:** Use `0px` border radius. `Crimson Alert` (`on_tertiary_container`) for "MUTE" or "CLIP." `Radioactive Green` for "SOLO" or "ACTIVE."

---

## 6. Do’s and Don'ts

### Do:
*   **Use the Spacing Scale Rigorously:** Use `spacing_20` (4.5rem) to separate major sections. The UI needs "oxygen" to breathe amidst the heavy technical data.
*   **Embrace the Hard Edge:** Everything is `0px` radius. Rounded corners are for consumer apps; this is an instrument.
*   **Color as Data:** Only use `secondary` (Amber) for highlights and alerts. If everything is amber, nothing is important.

### Don’t:
*   **Don't use "Grey":** Use our industrial palette. Avoid `#808080`. Use `on_surface_variant` (#BACCB0) which has a slight green tint, keeping the "Cyber-Soviet" atmosphere alive.
*   **Don't Center Everything:** Lean into left-aligned editorial layouts. It feels more like a professional logbook or a technical schematic.
*   **Don't use Standard Shadows:** If you need lift, use a tonal shift or a tinted ambient glow. Never use a generic black drop shadow.