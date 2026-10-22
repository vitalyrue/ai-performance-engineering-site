/* Module 3 local folds; Publisher remains responsible for chapter References. */
(() => {
  "use strict";

  function init() {
    if (document.documentElement.dataset.m3FoldsReady) return;
    document.documentElement.dataset.m3FoldsReady = "true";

    const folds = [];
    for (const wrapper of document.querySelectorAll("[data-m3-fold='1']")) {
      if (wrapper.closest("details")) continue;
      const details = document.createElement("details");
      details.className = "m3-fold";
      const key = wrapper.dataset.m3FoldKey || String(folds.length + 1);
      details.id = `m3-fold-${key.replace(/[^a-zA-Z0-9_-]/g, "-")}`;
      const summary = document.createElement("summary");
      if (wrapper.dataset.m3FoldCustomCaption === "true") {
        summary.textContent = wrapper.dataset.m3FoldTitle || "Expandable content";
      } else {
        const kind = wrapper.dataset.m3FoldKind;
        const heading = kind === "table"
          ? wrapper.querySelector("figcaption")
          : wrapper.querySelector(".publisher-worked-calculation > p:first-child, .publisher-clarification-note > p:first-child");
        if (heading) {
          for (const child of [...heading.childNodes]) summary.append(child.cloneNode(true));
          for (const identified of summary.querySelectorAll("[id]")) identified.removeAttribute("id");
        } else {
          summary.textContent = wrapper.dataset.m3FoldTitle || "Expandable content";
        }
      }
      const body = document.createElement("div");
      body.className = "m3-fold-body";
      while (wrapper.firstChild) body.append(wrapper.firstChild);
      details.append(summary, body);
      details.open = wrapper.dataset.m3FoldDefaultOpen === "true";
      wrapper.replaceWith(details);
      folds.push(details);
    }

    function referenceDetails() {
      return [...document.querySelectorAll("details.publisher-chapter-references")];
    }
    function setAll(open) {
      for (const details of folds) details.open = open;
      for (const details of referenceDetails()) details.open = open;
    }

    if (folds.length) {
      const toolbar = document.createElement("div");
      toolbar.className = "m3-fold-toolbar";
      toolbar.setAttribute("role", "group");
      toolbar.setAttribute("aria-label", "Expandable content");
      for (const [label, open] of [["Expand all", true], ["Collapse all", false]]) {
        const button = document.createElement("button");
        button.type = "button";
        button.textContent = label;
        button.addEventListener("click", () => setAll(open));
        toolbar.append(button);
      }
      const main = document.querySelector("main");
      const header = main && main.querySelector("header");
      if (header) header.after(toolbar);
      else if (main) main.prepend(toolbar);
    }

    function targetFor(hash) {
      try { return hash ? document.getElementById(decodeURIComponent(hash.slice(1))) : null; }
      catch (_) { return null; }
    }
    function reveal(target, scroll) {
      if (!target) return;
      for (let node = target; node; node = node.parentElement) {
        if (node.matches("details.m3-fold, details.publisher-chapter-references")) node.open = true;
      }
      if (scroll) requestAnimationFrame(() => requestAnimationFrame(() => target.scrollIntoView({block: "start"})));
    }
    document.addEventListener("click", event => {
      const link = event.target.closest && event.target.closest("a[href]");
      if (!link) return;
      let url;
      try { url = new URL(link.href, location.href); } catch (_) { return; }
      if (url.origin === location.origin && url.pathname === location.pathname &&
          url.search === location.search && url.hash) reveal(targetFor(url.hash), true);
    }, true);
    window.addEventListener("hashchange", () => reveal(targetFor(location.hash), true));
    reveal(targetFor(location.hash), true);

    document.addEventListener("keydown", event => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "f") setAll(true);
    });
    let printState = null;
    function beforePrint() {
      if (printState) return;
      printState = {
        folds: folds.map(item => item.open),
        references: referenceDetails().map(item => item.open),
      };
      setAll(true);
    }
    function afterPrint() {
      if (!printState) return;
      folds.forEach((item, index) => { item.open = printState.folds[index]; });
      referenceDetails().forEach((item, index) => { item.open = printState.references[index] ?? false; });
      printState = null;
    }
    window.addEventListener("beforeprint", beforePrint);
    window.addEventListener("afterprint", afterPrint);
    if (window.matchMedia) {
      const media = window.matchMedia("print");
      if (media.addEventListener) media.addEventListener("change", event => event.matches ? beforePrint() : afterPrint());
    }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, {once: true});
  else init();
})();
