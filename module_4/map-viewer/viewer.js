(() => {
  "use strict";
  let dialog, stage, canvas, picture, caption, scaleLabel, opener;
  let scale = 1, fitted = 1, drag = null;
  const maxScale = 8;
  const button = (label, action, text = label) => {
    const node = document.createElement("button");
    node.type = "button"; node.textContent = text; node.setAttribute("aria-label", label);
    node.addEventListener("click", action); return node;
  };
  const fitScale = () => Math.min((stage.clientWidth - 32) / picture.naturalWidth,
    (stage.clientHeight - 32) / picture.naturalHeight, 1);
  function resize(next, point) {
    if (!picture.naturalWidth) return;
    const rect = picture.getBoundingClientRect();
    const box = stage.getBoundingClientRect();
    const px = point ? point.x - box.left : stage.clientWidth / 2;
    const py = point ? point.y - box.top : stage.clientHeight / 2;
    const x = (box.left + px - rect.left) / scale;
    const y = (box.top + py - rect.top) / scale;
    scale = Math.min(maxScale, Math.max(fitted, next));
    picture.style.width = `${picture.naturalWidth * scale}px`;
    scaleLabel.textContent = `${Math.round(scale * 100)}%`;
    stage.classList.toggle("is-zoomed", scale > fitted + .001);
    // Measure after resizing so centering at fit size stays correct.
    const after = picture.getBoundingClientRect();
    stage.scrollLeft += after.left + x * scale - box.left - px;
    stage.scrollTop += after.top + y * scale - box.top - py;
  }
  function fit() {
    fitted = Math.max(.01, fitScale()); resize(fitted);
    stage.scrollLeft = 0; stage.scrollTop = 0;
  }
  function create() {
    dialog = document.createElement("dialog"); dialog.className = "m4-map-dialog";
    dialog.setAttribute("aria-labelledby", "m4-map-viewer-title");
    const toolbar = document.createElement("div"); toolbar.className = "m4-map-toolbar";
    const title = document.createElement("strong"); title.id = "m4-map-viewer-title"; title.textContent = "Map";
    scaleLabel = document.createElement("output"); scaleLabel.className = "m4-map-scale";
    scaleLabel.setAttribute("aria-label", "Image zoom");
    toolbar.append(title, button("Fit map", fit, "Fit"), button("Zoom out", () => resize(scale / 1.4), "−"),
      scaleLabel, button("Zoom in", () => resize(scale * 1.4), "+"),
      button("Actual image size", () => resize(1), "Actual size"), button("Close map", () => dialog.close(), "Close"));
    stage = document.createElement("div"); stage.className = "m4-map-stage"; stage.tabIndex = 0;
    stage.setAttribute("role", "region"); stage.setAttribute("aria-label", "Map image. Zoom with the controls or mouse wheel; drag to move.");
    canvas = document.createElement("div"); canvas.className = "m4-map-canvas";
    picture = document.createElement("img"); picture.draggable = false;
    canvas.append(picture); stage.append(canvas);
    caption = document.createElement("p"); caption.className = "m4-map-caption";
    dialog.append(toolbar, stage, caption); document.body.append(dialog);
    dialog.addEventListener("close", () => { drag = null; stage.classList.remove("is-dragging"); opener?.focus(); });
    dialog.addEventListener("click", event => { if (event.target === dialog) dialog.close(); });
    dialog.addEventListener("keydown", event => {
      if (["+", "="].includes(event.key)) { event.preventDefault(); resize(scale * 1.4); }
      if (event.key === "-") { event.preventDefault(); resize(scale / 1.4); }
      if (event.key === "0") { event.preventDefault(); fit(); }
      if (event.key === "1") { event.preventDefault(); resize(1); }
    });
    stage.addEventListener("wheel", event => {
      event.preventDefault(); resize(scale * Math.exp(-event.deltaY * .002), {x:event.clientX, y:event.clientY});
    }, {passive:false});
    stage.addEventListener("pointerdown", event => {
      if (event.button !== 0 || scale <= fitted + .001) return;
      event.preventDefault(); drag = {x:event.clientX, y:event.clientY, left:stage.scrollLeft, top:stage.scrollTop};
      stage.setPointerCapture(event.pointerId); stage.classList.add("is-dragging");
    });
    stage.addEventListener("pointermove", event => {
      if (!drag) return; stage.scrollLeft = drag.left + drag.x - event.clientX; stage.scrollTop = drag.top + drag.y - event.clientY;
    });
    const stopDrag = () => { drag = null; stage.classList.remove("is-dragging"); };
    stage.addEventListener("pointerup", stopDrag); stage.addEventListener("pointercancel", stopDrag);
    window.addEventListener("resize", () => { if (dialog.open) fit(); });
  }
  document.addEventListener("click", event => {
    const link = event.target.closest("a[data-map-viewer]");
    if (!link || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    if (typeof HTMLDialogElement === "undefined" || !HTMLDialogElement.prototype.showModal) return;
    event.preventDefault(); if (!dialog) create(); opener = link;
    const source = link.querySelector("img"); picture.alt = source?.alt || "Map";
    const figure = link.closest("figure") || link.parentElement;
    caption.textContent = figure.querySelector("figcaption")?.textContent.trim() || picture.alt;
    picture.onload = fit; picture.src = link.href;
    dialog.showModal(); if (picture.complete && picture.naturalWidth) fit();
  });
})();
