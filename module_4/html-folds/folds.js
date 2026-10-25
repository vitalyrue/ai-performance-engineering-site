/* Module 4 only. Source HTML stays expanded until this enhancement runs. */
(() => {
  "use strict";
  function init() {
    if (document.documentElement.dataset.m4FoldsReady) return;
    document.documentElement.dataset.m4FoldsReady = "true";
    const folds = [];
    const references = [];
    for (const [index, wrapper] of [...document.querySelectorAll("[data-m4-fold]")].entries()) {
      const headings = [...wrapper.querySelectorAll("[data-m4-fold-heading]")];
      if (!headings.length || wrapper.closest("details")) continue;
      const details = document.createElement("details");
      details.className = "m4-fold";
      details.id = `m4-fold-${index + 1}`;
      const summary = document.createElement("summary");
      // One disclosure caption. Keep further authored captions inside the body.
      for (const heading of headings.slice(0, 1)) {
        const label = document.createElement("span");
        for (const attribute of heading.attributes) label.setAttribute(attribute.name, attribute.value);
        label.classList.add("m4-fold-label");
        while (heading.firstChild) label.append(heading.firstChild);
        heading.remove();
        summary.append(label);
      }
      for (const heading of headings.slice(1)) {
        if (heading.dataset.m4FoldUi === "caption") heading.remove();
        else heading.removeAttribute("data-m4-fold-heading");
      }
      const body = document.createElement("div");
      body.className = "m4-fold-body";
      while (wrapper.firstChild) body.append(wrapper.firstChild);
      details.append(summary, body);
      details.open = wrapper.dataset.m4FoldDefaultOpen === "true";
      wrapper.append(details);
      folds.push(details);
    }
    for (const section of document.querySelectorAll("[data-m4-endnotes]")) {
      const heading = section.querySelector("[data-m4-endnotes-heading]");
      const body = section.querySelector("[data-m4-endnotes-body]");
      if (!heading || !body) continue;
      const button = document.createElement("button");
      button.type = "button";
      button.className = "m4-references-toggle";
      button.setAttribute("aria-controls", body.id);
      while (heading.firstChild) button.append(heading.firstChild);
      heading.append(button);
      const item = {section, body, button};
      const set = open => {
        body.hidden = !open;
        button.setAttribute("aria-expanded", String(open));
      };
      item.set = set;
      button.addEventListener("click", () => set(body.hidden));
      set(false);
      references.push(item);
    }
    const setAll = open => {
      for (const details of folds) details.open = open;
      for (const item of references) item.set(open);
    };
    if (folds.length || references.length) {
      const toolbar = document.createElement("div");
      toolbar.className = "m4-fold-toolbar";
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
      for (let ancestor = target; ancestor; ancestor = ancestor.parentElement) {
        if (ancestor.matches("details.m4-fold")) ancestor.open = true;
      }
      for (const item of references) {
        if (item.section.contains(target)) item.set(true);
      }
      if (scroll) requestAnimationFrame(() => requestAnimationFrame(() => target.scrollIntoView({block: "start"})));
    }
    document.addEventListener("click", event => {
      const link = event.target.closest && event.target.closest("a[href]");
      if (!link) return;
      let url;
      try { url = new URL(link.href, location.href); } catch (_) { return; }
      if (url.origin === location.origin && url.pathname === location.pathname && url.search === location.search && url.hash) {
        reveal(targetFor(url.hash), true);
      }
    }, true);
    window.addEventListener("hashchange", () => reveal(targetFor(location.hash), true));
    reveal(targetFor(location.hash), true);
    document.addEventListener("keydown", event => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "f") setAll(true);
    });
    let printState = null;
    function beforePrint() {
      if (printState) return;
      printState = {folds: folds.map(item => item.open), references: references.map(item => !item.body.hidden)};
      setAll(true);
    }
    function afterPrint() {
      if (!printState) return;
      folds.forEach((item, index) => { item.open = printState.folds[index]; });
      references.forEach((item, index) => item.set(printState.references[index]));
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
