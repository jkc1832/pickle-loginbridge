"use strict";

(() => {
  const sitePattern = /^[a-z0-9]+(?:-[a-z0-9]+)+$/;
  const keyPattern = /^[A-Za-z_][A-Za-z0-9_]*$/;
  const forbiddenKeys = new Set(["__proto__", "prototype", "constructor"]);
  const modes = ["config_download", "api_token", "token_convert"];
  const content = document.getElementById("content");
  const status = document.getElementById("status");
  let clearForm = () => {};

  function assert(condition) {
    if (!condition) throw new Error("INVALID_CONFIG");
  }

  function isObject(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value);
  }

  function checkKeys(value, allowed, required = []) {
    assert(isObject(value));
    assert(Object.keys(value).every(key => allowed.includes(key)));
    assert(required.every(key => Object.hasOwn(value, key)));
  }

  function isText(value, max = 500) {
    return typeof value === "string" && value.trim().length > 0 && value.length <= max;
  }

  function safeKey(key) {
    return keyPattern.test(key) && !forbiddenKeys.has(key);
  }

  function webUrl(value, httpsOnly = false) {
    assert(isText(value, 2048));
    const url = new URL(value);
    assert((httpsOnly ? ["https:"] : ["https:", "http:"]).includes(url.protocol));
    assert(!url.username && !url.password && !url.hash);
    return url;
  }

  // Templates are data trees. References replace whole values without interpolation.
  function validateTemplate(value, fieldNames, allowResponse, depth = 0) {
    assert(depth <= 12);
    if (value === null || ["string", "boolean", "number"].includes(typeof value)) return;
    if (Array.isArray(value)) {
      assert(value.length <= 100);
      value.forEach(item => validateTemplate(item, fieldNames, allowResponse, depth + 1));
      return;
    }
    assert(isObject(value));
    const keys = Object.keys(value);
    assert(keys.length <= 100);
    if (Object.hasOwn(value, "$field")) {
      assert(keys.length === 1 && fieldNames.has(value.$field));
      return;
    }
    if (Object.hasOwn(value, "$response")) {
      assert(allowResponse && keys.length === 1);
      assert(Array.isArray(value.$response) && value.$response.length > 0 && value.$response.length <= 12);
      assert(value.$response.every(key => typeof key === "string" && safeKey(key)));
      return;
    }
    for (const key of keys) {
      assert(safeKey(key));
      validateTemplate(value[key], fieldNames, allowResponse, depth + 1);
    }
  }

  function validateSite(site, expectedId) {
    checkKeys(site, ["$schema", "siteId", "name", "bridgeUrl", "originLoginUrl", "description", "mode", "filename", "fields", "output", "api", "requireDownloadParam"],
      ["siteId", "name", "bridgeUrl", "originLoginUrl", "description", "mode", "filename", "fields", "output"]);
    assert(site.siteId === expectedId && sitePattern.test(site.siteId) && site.siteId.length <= 43);
    if (Object.hasOwn(site, "$schema")) assert(site.$schema === "./_schema.json");
    assert(isText(site.name, 100) && isText(site.description));
    webUrl(site.bridgeUrl, true);
    webUrl(site.originLoginUrl);
    assert(modes.includes(site.mode));
    assert(typeof site.filename === "string" && /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,99}\.json$/.test(site.filename));
    assert(!Object.hasOwn(site, "requireDownloadParam") || typeof site.requireDownloadParam === "boolean");
    assert(Array.isArray(site.fields) && site.fields.length > 0 && site.fields.length <= 20);
    const fieldNames = new Set();
    for (const field of site.fields) {
      checkKeys(field, ["name", "label", "type", "autocomplete", "inputmode", "maxLength"], ["name", "label", "type", "autocomplete"]);
      assert(typeof field.name === "string" && safeKey(field.name) && field.name.length <= 64 && !fieldNames.has(field.name));
      assert(isText(field.label, 100) && ["text", "password"].includes(field.type));
      assert(["username", "current-password", "off"].includes(field.autocomplete));
      assert(field.type !== "password" || field.autocomplete === "current-password");
      assert(field.type !== "text" || field.autocomplete !== "current-password");
      assert(!Object.hasOwn(field, "inputmode") || ["text", "numeric", "email", "tel"].includes(field.inputmode));
      assert(!Object.hasOwn(field, "maxLength") || (Number.isInteger(field.maxLength) && field.maxLength >= 1 && field.maxLength <= 16384));
      assert(site.mode !== "token_convert" || field.type === "password");
      fieldNames.add(field.name);
    }
    assert(site.fields.some(field => field.type === "password"));
    assert(isObject(site.output) && Object.keys(site.output).length > 0);
    assert(!Object.hasOwn(site.output, "$field") && !Object.hasOwn(site.output, "$response"));
    validateTemplate(site.output, fieldNames, site.mode === "api_token");
    if (site.mode === "api_token") {
      checkKeys(site.api, ["url", "body"], ["url", "body"]);
      const apiUrl = webUrl(site.api.url, true);
      assert(!apiUrl.search);
      assert(isObject(site.api.body) && Object.keys(site.api.body).length > 0);
      assert(!Object.hasOwn(site.api.body, "$field") && !Object.hasOwn(site.api.body, "$response"));
      validateTemplate(site.api.body, fieldNames, false);
    } else {
      assert(!Object.hasOwn(site, "api"));
    }
    return site;
  }

  function assemble(template, fields, response) {
    if (template === null || typeof template !== "object") return template;
    if (Array.isArray(template)) return template.map(item => assemble(item, fields, response));
    if (Object.hasOwn(template, "$field")) return fields[template.$field];
    if (Object.hasOwn(template, "$response")) {
      let value = response;
      for (const key of template.$response) {
        if (!isObject(value) || !Object.hasOwn(value, key)) throw new Error("INVALID_RESPONSE");
        value = value[key];
      }
      if (typeof value !== "string" || !value.trim() || value.length > 65536) throw new Error("INVALID_RESPONSE");
      return value;
    }
    const result = Object.create(null);
    for (const [key, value] of Object.entries(template)) result[key] = assemble(value, fields, response);
    return result;
  }

  function setStatus(message, state = "") {
    status.className = state;
    status.textContent = message;
  }

  function element(tag, text, className) {
    const node = document.createElement(tag);
    if (text) node.textContent = text;
    if (className) node.className = className;
    return node;
  }

  function link(label, url) {
    const node = element("a", label);
    node.href = url;
    node.rel = "noopener noreferrer";
    return node;
  }

  async function readJson(path) {
    const response = await fetch(path, { credentials: "omit", cache: "no-store", redirect: "error", referrerPolicy: "no-referrer" });
    if (!response.ok) throw new Error("CONFIG_UNAVAILABLE");
    return response.json();
  }

  async function loadSite(siteId) {
    assert(typeof siteId === "string" && sitePattern.test(siteId) && siteId.length <= 43);
    return validateSite(await readJson(`sites/${siteId}.json`), siteId);
  }

  function downloadJson(payload, filename) {
    let serialized = null;
    let blob = null;
    let objectUrl = null;
    const anchor = document.createElement("a");
    try {
      serialized = JSON.stringify(payload, null, 2);
      blob = new Blob([serialized], { type: "application/json;charset=utf-8" });
      objectUrl = URL.createObjectURL(blob);
      anchor.href = objectUrl;
      anchor.download = filename;
      // Detached link: neither the JSON nor a download link is inserted into the page.
      anchor.click();
    } finally {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      anchor.removeAttribute("href");
      serialized = null;
      blob = null;
      objectUrl = null;
      payload = null;
    }
  }

  function renderSite(site, preview) {
    document.getElementById("page-title").textContent = site.name;
    document.title = `${site.name} · Pickle Login Bridge`;
    content.append(element("p", site.description));
    const origin = element("p");
    const originLink = link(site.mode === "token_convert" ? "공식 사이트에서 토큰 발급받기" : "원본 사이트 열기", site.originLoginUrl);
    originLink.target = "_blank";
    origin.append(originLink);
    content.append(origin);
    if (preview) content.append(element("p", "테스트용 주소입니다. 피클에 계정을 저장할 때는 이 서비스의 전용 연결 주소를 사용해 주세요.", "notice"));
    if (site.mode === "api_token") content.append(element("p", "로그인을 위해 입력한 정보를 해당 서비스로 직접 보냅니다. 로그인에 성공하면 연결 파일을 내려받습니다.", "notice"));
    else content.append(element("p", "입력한 정보는 이 브라우저 안에서 파일로 만들어집니다.", "notice"));

    const form = document.createElement("form");
    form.method = "post";
    const inputs = new Map();
    for (const field of site.fields) {
      const group = element("div");
      const input = document.createElement("input");
      input.id = `field-${field.name}`;
      input.name = field.name;
      input.type = field.type;
      input.autocomplete = field.autocomplete;
      input.required = true;
      input.maxLength = field.maxLength || 4096;
      input.spellcheck = false;
      input.setAttribute("autocapitalize", "none");
      if (field.inputmode) input.inputMode = field.inputmode;
      const label = element("label", field.label);
      label.htmlFor = input.id;
      group.append(label, input);
      form.append(group);
      inputs.set(field.name, input);
    }
    const actions = element("div", "", "actions");
    const submit = element("button", site.mode === "api_token" ? "로그인하고 연결 파일 받기" : "연결 파일 받기");
    submit.type = "submit";
    const reset = element("button", "입력 지우기", "secondary");
    reset.type = "button";
    actions.append(submit, reset);
    form.append(actions);
    content.append(form);

    const downloadAllowed = !site.requireDownloadParam || new URLSearchParams(location.search).get("download") === "1";
    let active = null;
    let revision = 0;
    function clearInputs() {
      for (const input of inputs.values()) input.value = "";
    }
    function setBusy(busy) {
      submit.disabled = busy || !downloadAllowed;
      form.setAttribute("aria-busy", String(busy));
      for (const input of inputs.values()) input.disabled = busy || !downloadAllowed;
    }
    clearForm = () => {
      revision++;
      active?.abort();
      active = null;
      clearInputs();
      setBusy(false);
      setStatus(downloadAllowed ? "" : "파일을 받으려면 주소 끝에 download=1 옵션을 추가해 주세요.");
    };
    reset.addEventListener("click", clearForm);
    clearForm();
    if (!downloadAllowed) {
      const enabledUrl = new URL(location.href);
      enabledUrl.searchParams.set("download", "1");
      content.append(link("파일 다운로드를 허용하고 시작하기", enabledUrl.href));
    }

    form.addEventListener("submit", async event => {
      event.preventDefault();
      if (active || !downloadAllowed || !form.reportValidity()) return;
      const operation = ++revision;
      const controller = new AbortController();
      active = controller;
      let timeout;
      let fields = Object.create(null);
      let payload = null;
      let body = null;
      let responseData = null;
      try {
        for (const field of site.fields) {
          const value = inputs.get(field.name).value;
          if (!value.length || value.length > (field.maxLength || 4096)) throw new Error("INVALID_INPUT");
          fields[field.name] = value;
        }
        setBusy(true);
        if (site.mode === "api_token") {
          setStatus("로그인 정보를 확인하고 있습니다.");
          body = JSON.stringify(assemble(site.api.body, fields, null));
          clearInputs();
          timeout = setTimeout(() => controller.abort(), 30000);
          const pending = fetch(site.api.url, {
            method: "POST", mode: "cors", credentials: "omit", redirect: "error",
            cache: "no-store", referrerPolicy: "no-referrer", signal: controller.signal,
            headers: { "Content-Type": "application/json; charset=utf-8", "Accept": "application/json", "Accept-Language": "ko-KR" },
            body
          });
          body = null;
          const response = await pending;
          if (!response.ok) throw new Error("LOGIN_FAILED");
          responseData = await response.json();
          if (revision !== operation) return;
        }
        payload = assemble(site.output, fields, responseData);
        if (revision !== operation || controller.signal.aborted) return;
        downloadJson(payload, site.filename);
        setStatus("연결 파일 다운로드를 시작했습니다. 브라우저의 다운로드 목록을 확인해 주세요.", "success");
      } catch (error) {
        if (revision !== operation) return;
        const messages = {
          LOGIN_FAILED: "로그인하지 못했습니다. 아이디와 비밀번호를 확인하고 다시 시도해 주세요.",
          INVALID_INPUT: "입력한 정보의 길이를 확인하고 다시 시도해 주세요.",
          INVALID_RESPONSE: "서비스에서 연결에 필요한 정보를 받지 못했습니다. 관리자에게 문의해 주세요."
        };
        const message = controller.signal.aborted ? "응답 시간이 초과되었습니다. 잠시 후 다시 시도해 주세요."
          : messages[error.message] || "파일을 만들지 못했습니다. 연결 상태와 브라우저의 다운로드 허용 여부를 확인해 주세요. 서비스가 브라우저 연결을 허용하지 않을 수도 있습니다.";
        setStatus(message, "error");
      } finally {
        clearTimeout(timeout);
        fields = null;
        payload = null;
        body = null;
        responseData = null;
        if (revision === operation) {
          clearInputs();
          active = null;
          setBusy(false);
        }
      }
    });
  }

  async function renderDirectory(hosts) {
    const results = await Promise.allSettled([...new Set(Object.values(hosts))].map(loadSite));
    const list = element("ul", "", "site-list");
    for (const result of results) {
      if (result.status !== "fulfilled") continue;
      const site = result.value;
      const item = element("li");
      item.append(element("h2", site.name), element("p", site.description));
      const addresses = element("dl");
      for (const [label, url] of [["로그인 브릿지 주소", site.bridgeUrl], ["원본 로그인 주소", site.originLoginUrl]]) {
        const value = element("dd");
        value.append(link(url, url));
        addresses.append(element("dt", label), value);
      }
      item.append(addresses);
      list.append(item);
    }
    content.append(list);
    setStatus(results.some(result => result.status === "rejected") ? "일부 서비스 정보를 불러오지 못했습니다. 잠시 후 새로고침해 주세요." : "");
  }

  async function start() {
    const local = ["localhost", "127.0.0.1", "[::1]"].includes(location.hostname);
    if (location.protocol !== "https:" && !(location.protocol === "http:" && local)) {
      setStatus("공개 HTTPS 연결 주소로 접속해 주세요.", "error");
      return;
    }
    const hosts = await readJson("hosts.json");
    assert(isObject(hosts) && Object.keys(hosts).length > 0);
    for (const [host, siteId] of Object.entries(hosts)) {
      assert(/^[a-z0-9.-]+$/.test(host) && !forbiddenKeys.has(host));
      assert(typeof siteId === "string" && sitePattern.test(siteId) && siteId.length <= 43);
    }
    const mapped = Object.hasOwn(hosts, location.hostname) ? hosts[location.hostname] : null;
    const conventional = /^pickle-loginbridge--([a-z0-9]+(?:-[a-z0-9]+)+)\.pages\.dev$/.exec(location.hostname)?.[1];
    const siteId = mapped || conventional || new URLSearchParams(location.search).get("site");
    if (siteId) renderSite(await loadSite(siteId), !mapped && !conventional);
    else await renderDirectory(hosts);
  }

  window.addEventListener("pagehide", () => clearForm());
  window.addEventListener("pageshow", event => { if (event.persisted) clearForm(); });
  start().catch(() => {
    content.replaceChildren();
    setStatus("서비스 설정을 불러오지 못했습니다. 연결 주소를 확인하거나 관리자에게 문의해 주세요.", "error");
  });
})();
