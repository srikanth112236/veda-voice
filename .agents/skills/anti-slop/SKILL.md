---
name: anti-slop
description: Enforces human-grade, bespoke UI/UX design and clean code standards. Eliminates generic AI design tropes (gratuitous glow blobs, repetitive bento boxes, filler text) and robotic code patterns.
---

# Anti-Slop Design & Engineering Skill

This skill enforces intentional, human-crafted design and code quality standards, actively preventing the common visual and code patterns colloquially known as "AI slop."

---

## 1. UI & Visual Design Standards

### Banned "AI Slop" Design Tropes
- **Gratuitous Glow Orbs:** Do not scatter random, disconnected radial gradient blobs (e.g. purple/cyan blurs) behind cards without an intentional light source or interactive anchor.
- **Generic Bento-Box Clutter:** Do not partition every page into identical rounded boxes with an icon, bold subtitle, and vague summary text. Layouts should reflect data density and natural visual reading flow.
- **Vague Buzzword Marketing:** Never generate placeholder copy like *"Unlock transformative AI experiences"* or *"Seamlessly revolutionize your workflow."* Use concrete, domain-specific, informative text (e.g. *"Sub-400ms duplex voice pipeline with tenant-isolated SIP trunks"*).
- **Overdone Translucency:** Avoid layering `backdrop-blur-md` on top of `backdrop-blur-lg` until text contrast fails accessibility standards. Background contrast must remain legible (WCAG AA minimum).

### Premium Design Principles to Apply
1. **Purposeful Visual Hierarchy:**
   - Anchor pages with a strong visual element: a clear primary metric, an active waveform, or a crisp primary action.
   - Distinct typographic scale: Use high tracking/letter-spacing adjustments (`tracking-tight` on headings, `tracking-wider uppercase text-[11px]` on metadata/labels).
2. **Restrained Color Systems:**
   - Deep neutral foundation (`zinc-950` / `zinc-900` / `zinc-800` for dark themes).
   - High-contrast, functional accent colors:
     - **Emerald / Green:** Active calls, connected sockets, verified RLS.
     - **Violet / Indigo:** Voice agent intelligence, synthesis models.
     - **Amber / Rose:** Calling window limits, compliance warnings, suppressed numbers.
3. **Tactile Micro-Interactions:**
   - Active state feedback: `active:scale-[0.98]`, subtle `transition-all duration-150`.
   - Crisp 1px borders using semi-transparent neutral values (`border-white/10` or `border-zinc-800`).
   - Clean, purposeful status indicators (e.g., pulsing ping rings for live audio streams).

---

## 2. Frontend Code Quality Standards

### Code Anti-Patterns to Eliminate
- **Chatty / Stating-the-Obvious Comments:**
  ```tsx
  // BAD AI SLOP:
  // Render the button
  <button onClick={handleClick}>Click me</button>

  // GOOD: Self-documenting code without useless commentary
  <button onClick={handleClick}>Connect Agent</button>
  ```
- **Type Laziness:** Never use `any` or cast through `unknown as any`. Define concrete TypeScript interfaces.
- **Silent Error Swallowing:** Never write `catch (e) {}` without user feedback or telemetry logging.
- **Monolithic Page Files:** Decompose pages with shared, reusable primitives (`AudioVisualizer`, `MetricBadge`, `CallStatusPill`).

---

## 3. Review Checklist for Every Screen
Before finalizing any UI change, verify:
- [ ] Is every graphic or glow tied to an active system state (e.g., call active, speaking, idle)?
- [ ] Is all copy specific to the product rather than generic AI marketing phrases?
- [ ] Does the page work cleanly at standard responsive breakpoints?
- [ ] Are text contrast and font weights legible without eye strain?
- [ ] Are all interactive elements keyboard-focusable and styled with active states?
