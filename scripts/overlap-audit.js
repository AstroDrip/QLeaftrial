// Paste into the browser console (or run through a browser tool) on any page.
// Reports in-flow sibling elements whose boxes intersect. Intentional layers (absolute/fixed
// elements, canvases, transformed elements) are skipped, so any line it prints is a real collision.
// Run it at ~360, ~430, ~720 and ~1280px wide, in English and Arabic, with menus and editors open.
(() => {
  const bad = [];
  const visible = (element) => {
    const style = getComputedStyle(element);
    if (style.display === "none" || style.visibility === "hidden" || style.position === "absolute" || style.position === "fixed" || Number(style.opacity) === 0) return false;
    const box = element.getBoundingClientRect();
    return box.width > 2 && box.height > 2;
  };
  document.querySelectorAll("body *").forEach((parent) => {
    if (parent.closest("canvas,svg,.sr-only,select,option,[class*=carousel],[class*=particles]")) return;
    const children = [...parent.children].filter(visible);
    for (let i = 0; i < children.length; i++) {
      for (let j = i + 1; j < children.length; j++) {
        const a = children[i].getBoundingClientRect();
        const b = children[j].getBoundingClientRect();
        const overlapX = Math.min(a.right, b.right) - Math.max(a.left, b.left);
        const overlapY = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
        const moved = getComputedStyle(children[i]).transform !== "none" || getComputedStyle(children[j]).transform !== "none";
        if (overlapX > 1.5 && overlapY > 1.5 && !moved) bad.push(`${parent.tagName}.${parent.className} > ${children[i].className} x ${children[j].className} (${Math.round(overlapX)}x${Math.round(overlapY)})`);
      }
    }
  });
  console.table(bad);
  return bad;
})();
