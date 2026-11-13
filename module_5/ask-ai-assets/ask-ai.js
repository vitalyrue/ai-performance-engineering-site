(() => {
  "use strict";
  const configNode = document.getElementById("book-ask-ai-config");
  const main = document.querySelector("main.content, main");
  if (!configNode || !main || document.getElementById("book-ask-ai-panel")) return;
  let config;
  try { config = JSON.parse(configNode.textContent); } catch { return; }
  if (!config.endpoint) return;

  const MAX_SELECTION = 2000;
  const MAX_CONTEXT = 14000;
  const MAX_HISTORY = 6;
  const normalize = (text) => text.replace(/\s+/g, " ").trim();
  const trigger = document.createElement("button");
  trigger.type = "button";
  trigger.className = "book-ask-ai-trigger";
  trigger.textContent = "Ask AI";
  trigger.hidden = true;
  trigger.setAttribute("aria-controls", "book-ask-ai-panel");
  const panel = document.createElement("aside");
  panel.id = "book-ask-ai-panel";
  panel.className = "book-ask-ai-panel";
  panel.hidden = true;
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-labelledby", "book-ask-ai-title");
  panel.innerHTML = `
    <header>
      <h2 id="book-ask-ai-title">Ask AI</h2>
      <div class="book-ask-ai-actions">
        <button class="book-ask-ai-icon" type="button" data-action="reset" title="Clear conversation" aria-label="Clear conversation"><i class="bi bi-arrow-counterclockwise" aria-hidden="true"></i></button>
        <button class="book-ask-ai-icon" type="button" data-action="close" title="Close" aria-label="Close Ask AI"><i class="bi bi-x-lg" aria-hidden="true"></i></button>
      </div>
    </header>
    <div class="book-ask-ai-scroll">
      <p class="book-ask-ai-location"></p>
      <blockquote class="book-ask-ai-selection"></blockquote>
      <details class="book-ask-ai-context"><summary>Book context</summary><pre></pre></details>
      <div class="book-ask-ai-suggestions">
        <button type="button" data-question="Explain this passage more simply. Define unfamiliar terms needed to understand it.">Explain simply</button>
        <button type="button" data-question="Give one small, concrete example that explains this passage.">Give an example</button>
        <button type="button" data-question="Explain the reasoning or process in this passage step by step.">Explain the steps</button>
      </div>
      <div class="book-ask-ai-messages" aria-label="Conversation"></div>
    </div>
    <footer>
      <p class="book-ask-ai-status" role="status" aria-live="polite"></p>
      <form>
        <textarea aria-label="Your question" placeholder="Ask about this passage" maxlength="1000" rows="2" required></textarea>
        <button class="book-ask-ai-icon book-ask-ai-send" type="submit" title="Send question" aria-label="Send question"><i class="bi bi-arrow-up" aria-hidden="true"></i></button>
        <button class="book-ask-ai-icon" type="button" data-action="stop" title="Stop waiting" aria-label="Stop waiting" hidden><i class="bi bi-stop-fill" aria-hidden="true"></i></button>
      </form>
    </footer>`;
  document.body.append(trigger, panel);
  const find = (selector) => panel.querySelector(selector);
  const questionInput = find("textarea");
  const status = find(".book-ask-ai-status");
  const messages = find(".book-ask-ai-messages");
  const scroll = find(".book-ask-ai-scroll");
  const sendButton = find('[type="submit"]');
  const stopButton = find('[data-action="stop"]');
  let pendingSelection = null;
  let activeSelection = null;
  let history = [];
  let controller = null;
  let focusBeforePanel = null;
  let selectionTimer;

  function setStatus(text, error = false) {
    status.textContent = text;
    status.dataset.error = String(error);
  }

  function readableText(element, range) {
    const clone = element.cloneNode(true);
    const marker = `ASK_AI_ANCHOR_${Math.random().toString(36).slice(2)}`;
    const sourceElement = range.startContainer.nodeType === Node.ELEMENT_NODE ? range.startContainer : range.startContainer.parentElement;
    const mathElement = sourceElement.closest("mjx-container, .katex, .math");
    const anchor = mathElement && element.contains(mathElement) ? mathElement : range.startContainer;
    const path = [];
    for (let node = anchor; node !== element && node.parentNode; node = node.parentNode) {
      path.unshift([...node.parentNode.childNodes].indexOf(node));
    }
    let target = clone;
    path.forEach((index) => { target = target.childNodes[index]; });
    if (mathElement && anchor === mathElement) target.before(document.createTextNode(marker));
    else if (target.nodeType === Node.TEXT_NODE) target.splitText(range.startOffset).before(document.createTextNode(marker));
    else target.insertBefore(document.createTextNode(marker), target.childNodes[range.startOffset] || null);
    clone.querySelectorAll("script, style, nav, button, .anchorjs-link, .code-annotation-anchor, .code-copy-button, .quarto-title-meta").forEach((node) => node.remove());
    // Preserve equation source when the browser has already typeset it.
    const originalMath = [...element.querySelectorAll("mjx-container")];
    const clonedMath = [...clone.querySelectorAll("mjx-container")];
    let mathItems = [];
    try { mathItems = [...(window.MathJax?.startup?.document?.math || [])]; } catch { /* MathJax is optional. */ }
    originalMath.forEach((node, index) => {
      const item = mathItems.find((candidate) => candidate.typesetRoot === node);
      clonedMath[index]?.replaceWith(document.createTextNode(item?.math ? `$${item.math}$` : node.textContent));
    });
    clone.querySelectorAll(".katex").forEach((node) => {
      const source = node.querySelector('annotation[encoding="application/x-tex"]');
      if (source) node.replaceWith(document.createTextNode(`$${source.textContent}$`));
    });
    clone.querySelectorAll("p, li, tr, pre, h1, h2, h3, h4, figcaption, summary").forEach((node) => node.append("\n"));
    const text = clone.textContent.replace(/\u00a0/g, " ").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
    return { text: text.replace(marker, ""), anchor: Math.max(0, text.indexOf(marker)) };
  }

  function captureSelection() {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || !selection.rangeCount) {
      if (document.activeElement !== trigger) trigger.hidden = true;
      return;
    }
    const range = selection.getRangeAt(0);
    if (!main.contains(range.startContainer) || !main.contains(range.endContainer)) {
      trigger.hidden = true;
      return;
    }
    const text = selection.toString().trim();
    if (!text || text.length > MAX_SELECTION) { trigger.hidden = true; return; }
    const start = range.startContainer.nodeType === Node.ELEMENT_NODE ? range.startContainer : range.startContainer.parentElement;
    const section = start.closest("section") || main;
    const sectionHeading = section.querySelector(":scope > h1, :scope > h2, :scope > h3, :scope > h4");
    const chapterHeading = document.querySelector("#title-block-header h1, main h1");
    const bookHeading = document.querySelector(".sidebar-title, .navbar-title");
    const owner = section.contains(range.endContainer) ? section : main;
    const reference = readableText(owner, range);
    let context = reference.text;
    if (context.length > MAX_CONTEXT - text.length - 100) {
      // The DOM anchor survives equation conversion without flattening code.
      const room = MAX_CONTEXT - text.length - 100;
      const from = Math.max(0, Math.min(reference.anchor - 2500, context.length - room));
      context = context.slice(from, from + room);
    }
    context = `Selected passage:\n${text}\n\nSurrounding book section:\n${context}`.slice(0, MAX_CONTEXT);
    pendingSelection = {
      selection: text, context,
      book: (config.bookTitle || normalize(bookHeading?.textContent || config.book || "")).slice(0, 200),
      chapter: normalize(chapterHeading?.textContent || document.title).slice(0, 200),
      section: normalize(sectionHeading?.textContent || chapterHeading?.textContent || "").slice(0, 300),
      version: (config.version || normalize(document.querySelector(".book-release-meta")?.textContent || "")).slice(0, 100),
      url: locationURL(section.id),
    };
    const rects = [...range.getClientRects()].filter((rect) => rect.width && rect.height);
    const rect = rects[rects.length - 1] || range.getBoundingClientRect();
    if (!rect.width || rect.bottom < 0 || rect.top > window.innerHeight) { trigger.hidden = true; return; }
    trigger.hidden = false;
    const width = trigger.getBoundingClientRect().width;
    trigger.style.left = `${Math.max(8, Math.min(window.innerWidth - width - 8, rect.left))}px`;
    const below = rect.bottom + 8;
    trigger.style.top = `${Math.max(8, Math.min(window.innerHeight - 46, below + 40 > window.innerHeight ? rect.top - 46 : below))}px`;
  }

  function locationURL(sectionId) {
    const url = new URL(window.location.href);
    url.search = "";
    url.hash = sectionId || url.hash;
    return url.href;
  }

  function openPanel() {
    if (!pendingSelection) return;
    focusBeforePanel = document.activeElement;
    const changed = !activeSelection || activeSelection.selection !== pendingSelection.selection || activeSelection.url !== pendingSelection.url;
    if (changed) {
      controller?.abort();
      controller = null;
      setBusy(false);
      activeSelection = { ...pendingSelection };
      history = [];
      messages.replaceChildren();
      questionInput.value = "";
      setStatus("");
    }
    find(".book-ask-ai-location").textContent = `${activeSelection.book} / ${activeSelection.section || activeSelection.chapter}`;
    find(".book-ask-ai-selection").textContent = activeSelection.selection;
    find(".book-ask-ai-context pre").textContent = activeSelection.context;
    panel.hidden = false;
    document.body.classList.add("book-ask-ai-open");
    trigger.hidden = true;
    questionInput.focus({ preventScroll: true });
  }

  function closePanel() {
    panel.hidden = true;
    document.body.classList.remove("book-ask-ai-open");
    trigger.hidden = true;
    if (focusBeforePanel && focusBeforePanel !== trigger && focusBeforePanel.isConnected) focusBeforePanel.focus({ preventScroll: true });
    else {
      const selection = window.getSelection();
      const element = selection?.anchorNode?.parentElement;
      if (element && main.contains(element)) {
        const previous = element.getAttribute("tabindex");
        element.tabIndex = -1;
        element.focus({ preventScroll: true });
        if (previous === null) element.removeAttribute("tabindex");
        else element.setAttribute("tabindex", previous);
      }
    }
  }

  function inlineText(parent, text) {
    const pattern = /\*\*([^*]+)\*\*|`([^`]+)`/g;
    let offset = 0;
    for (const match of text.matchAll(pattern)) {
      parent.append(document.createTextNode(text.slice(offset, match.index)));
      const child = document.createElement(match[1] ? "strong" : "code");
      child.textContent = match[1] || match[2];
      parent.append(child);
      offset = match.index + match[0].length;
    }
    parent.append(document.createTextNode(text.slice(offset)));
  }

  function renderAnswer(parent, text) {
    let code = null;
    let list = null;
    for (const line of text.split("\n")) {
      if (line.startsWith("```")) {
        if (code) code = null;
        else {
          const pre = document.createElement("pre");
          code = document.createElement("code");
          pre.append(code);
          parent.append(pre);
        }
        list = null;
      } else if (code) code.append(document.createTextNode(line + "\n"));
      else if (/^\s*([-*]|\d+\.)\s+/.test(line)) {
        const type = /^\s*\d+\./.test(line) ? "ol" : "ul";
        if (!list || list.tagName.toLowerCase() !== type) {
          list = document.createElement(type);
          parent.append(list);
        }
        const item = document.createElement("li");
        inlineText(item, line.replace(/^\s*([-*]|\d+\.)\s+/, ""));
        list.append(item);
      } else {
        list = null;
        if (!line.trim()) continue;
        const paragraph = document.createElement("p");
        inlineText(paragraph, line.replace(/^#{1,4}\s+/, ""));
        parent.append(paragraph);
      }
    }
  }

  function addMessage(role, text) {
    const article = document.createElement("article");
    article.className = "book-ask-ai-message";
    article.dataset.role = role;
    const header = document.createElement("header");
    const label = document.createElement("strong");
    label.textContent = role === "user" ? "You" : "AI";
    header.append(label);
    if (role === "assistant") {
      const copy = document.createElement("button");
      copy.type = "button";
      copy.className = "book-ask-ai-icon";
      copy.title = "Copy answer";
      copy.setAttribute("aria-label", "Copy answer");
      copy.innerHTML = '<i class="bi bi-copy" aria-hidden="true"></i>';
      copy.addEventListener("click", async () => {
        try { await navigator.clipboard.writeText(text); setStatus("Answer copied."); }
        catch { setStatus("Copy is unavailable in this browser.", true); }
      });
      header.append(copy);
    }
    article.append(header);
    const body = document.createElement("div");
    if (role === "assistant") renderAnswer(body, text);
    else { const paragraph = document.createElement("p"); paragraph.textContent = text; body.append(paragraph); }
    article.append(body);
    messages.append(article);
    scroll.scrollTop = scroll.scrollHeight;
    return article;
  }

  function setBusy(busy) {
    sendButton.disabled = busy;
    stopButton.hidden = !busy;
    find('[data-action="reset"]').disabled = busy;
    panel.querySelectorAll("[data-question]").forEach((button) => { button.disabled = busy; });
    panel.setAttribute("aria-busy", String(busy));
  }

  async function ask(question) {
    question = question.trim();
    if (!activeSelection || !question || controller) return;
    if (question.length > 1000) { setStatus("Keep the question under 1,000 characters.", true); return; }
    const activeController = new AbortController();
    const requestSelection = activeSelection;
    controller = activeController;
    const timeout = setTimeout(() => activeController.abort("timeout"), 45000);
    setBusy(true);
    setStatus("Asking AI...");
    const userMessage = addMessage("user", question);
    try {
      const payload = { ...activeSelection, question, history: history.slice(-MAX_HISTORY) };
      const bytes = () => new TextEncoder().encode(JSON.stringify(payload)).length;
      while (bytes() > 40000 && payload.history.length) payload.history.splice(0, 2);
      while (bytes() > 40000 && payload.context.length > payload.selection.length + 100) {
        payload.context = payload.context.slice(0, Math.max(payload.selection.length + 100, Math.floor(payload.context.length * 0.8)));
      }
      if (bytes() > 40000) throw new Error("The selected passage is too large to send. Select a shorter passage.");
      const response = await fetch(config.endpoint, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: activeController.signal, credentials: "omit", cache: "no-store",
      });
      const result = await response.json().catch(() => null);
      if (activeSelection !== requestSelection) return;
      if (!response.ok) throw new Error(result?.error || "AI is temporarily unavailable. Try again later.");
      if (!result || typeof result.answer !== "string" || !result.answer.trim()) throw new Error("AI returned an empty answer. Try again.");
      if (result.answer.length > 10000) throw new Error("AI returned an answer that is too long. Try again.");
      addMessage("assistant", result.answer);
      history.push({ role: "user", content: question }, { role: "assistant", content: result.answer.slice(0, 3000) });
      history = history.slice(-MAX_HISTORY);
      questionInput.value = "";
      setStatus("AI explanation; check important details against the book.");
    } catch (error) {
      if (activeSelection !== requestSelection) return;
      userMessage.remove();
      if (activeController.signal.aborted) setStatus(activeController.signal.reason === "timeout" ? "The request timed out. Try again." : "Stopped.");
      else setStatus(error.message || "Could not connect to AI. Try again later.", true);
      questionInput.value = question;
    } finally {
      clearTimeout(timeout);
      if (controller === activeController) { controller = null; setBusy(false); }
    }
  }

  document.addEventListener("selectionchange", () => {
    clearTimeout(selectionTimer);
    selectionTimer = setTimeout(captureSelection, 180);
  });
  document.addEventListener("pointerup", (event) => {
    if (!panel.contains(event.target) && event.target !== trigger) {
      clearTimeout(selectionTimer);
      selectionTimer = setTimeout(captureSelection, 60);
    }
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !panel.hidden) { event.preventDefault(); closePanel(); }
  });
  window.addEventListener("scroll", () => { trigger.hidden = true; }, { passive: true });
  window.addEventListener("resize", () => { trigger.hidden = true; });
  trigger.addEventListener("pointerdown", (event) => event.preventDefault());
  trigger.addEventListener("click", openPanel);
  find('[data-action="close"]').addEventListener("click", closePanel);
  find('[data-action="reset"]').addEventListener("click", () => { history = []; messages.replaceChildren(); setStatus(""); questionInput.value = ""; questionInput.focus(); });
  stopButton.addEventListener("click", () => controller?.abort());
  panel.querySelectorAll("[data-question]").forEach((button) => button.addEventListener("click", () => ask(button.dataset.question)));
  find("form").addEventListener("submit", (event) => { event.preventDefault(); ask(questionInput.value); });
})();
