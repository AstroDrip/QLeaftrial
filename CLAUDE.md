# QLeaves working rules

## Layout: nothing may collide or overlap
Whatever component or element is used, no two elements may collide, overlap, clip each other or push each other off-screen, at any screen width, in English and Arabic (RTL), and in every state (closed, open, hovered, loading, error).

- Size growing or floating elements (search capsule, menus, drawers, toasts, floating cart bar) to the free space beside their neighbours, measured from the real layout, never to a fixed width that can run into a neighbour.
- Interactive controls that sit in one row (an editor summary and a Delete button, for example) need their own boxes. Do not stack them in the same grid cell.
- Genuine overlays (dropdown results, modals) may sit above page content but never over the control that opened them or over another control in the same row.
- Before calling UI work finished, run `scripts/overlap-audit.js` in the browser pane at about 360, 430, 720 and 1280px, in English and Arabic, with the relevant menu or editor open. It must report nothing, and the page must have no horizontal overflow.
