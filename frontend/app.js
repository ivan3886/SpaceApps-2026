const API_BASE = window.ORBIT_API_BASE || "http://127.0.0.1:8000";

let activeSampleId = null;
let latestSymptomId = null;
let inputMethod = "text";

const zoneToApi = {
  Cabeza: "head",
  Pecho: "chest",
  Abdomen: "abdomen",
  Brazos: "arms",
  Piernas: "legs",
};

async function api(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(options.headers || {}),
    },
  });
  if (!response.ok) {
    let detail = `HTTP ${response.status}`;
    try {
      const body = await response.json();
      detail = typeof body.detail === "string" ? body.detail : JSON.stringify(body.detail || body);
    } catch { /* Response may not be JSON. */ }
    throw new Error(detail);
  }
  if (response.status === 204) return null;
  return response.json();
}

function showMessage(id, message, isError = false) {
  const element = document.getElementById(id);
  if (!element) return;
  element.textContent = message;
  element.style.color = isError ? "var(--red)" : "var(--muted)";
}

function getSubjectCode() {
  return document.getElementById("subject-code")?.value.trim() || "CREW-01";
}

function selectZone(label) {
  const heading = document.getElementById("selected-zone");
  if (heading) heading.textContent = label;
  document.querySelectorAll(".body-part, .zone-button").forEach((item) => {
    item.classList.toggle("selected", item.dataset.zone === label);
  });
}

function connectNavigation() {
  const buttons = document.querySelectorAll("nav button");
  const screens = document.querySelectorAll(".screen");
  function showScreen(id) {
    screens.forEach((screen) => screen.classList.toggle("active", screen.id === id));
    buttons.forEach((button) => button.classList.toggle("active", button.dataset.screen === id));
    if (id === "alerts") loadAlerts();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  buttons.forEach((button) => button.addEventListener("click", () => showScreen(button.dataset.screen)));
  document.querySelectorAll("[data-go]").forEach((button) => button.addEventListener("click", () => showScreen(button.dataset.go)));
  document.querySelectorAll("[data-zone]").forEach((item) => {
    item.addEventListener("click", () => selectZone(item.dataset.zone));
    if (item.classList.contains("body-part")) {
      item.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          selectZone(item.dataset.zone);
        }
      });
    }
  });
}

function renderSamples(samples) {
  const select = document.getElementById("active-sample");
  if (!select) return;
  const previous = String(activeSampleId || select.value || "");
  select.replaceChildren(new Option("Selecciona una muestra…", ""));
  for (const sample of samples) {
    select.add(new Option(`${sample.sample_code} · ${sample.analyte} · ID ${sample.id}`, String(sample.id)));
  }
  const selected = samples.find((sample) => String(sample.id) === previous) || samples[0];
  activeSampleId = selected?.id ?? null;
  select.value = activeSampleId ? String(activeSampleId) : "";
}

async function loadSamples() {
  try {
    const samples = await api(`/samples?subject_code=${encodeURIComponent(getSubjectCode())}&limit=100`);
    renderSamples(samples);
  } catch (error) {
    console.error("No se pudieron cargar las muestras:", error);
  }
}

async function submitSample(event) {
  event.preventDefault();
  const codeInput = document.getElementById("sample-code");
  try {
    const sample = await api("/samples", {
      method: "POST",
      body: JSON.stringify({
        sample_code: codeInput.value.trim(),
        subject_code: getSubjectCode(),
        collected_at: new Date().toISOString(),
        analyte: document.getElementById("analyte").value.trim() || "cortisol",
        analysis_status: "registered",
        quality_status: "pending",
      }),
    });
    activeSampleId = sample.id;
    codeInput.value = "";
    showMessage("sample-message", `Muestra ${sample.sample_code} guardada (ID ${sample.id}).`);
    await loadSamples();
    document.getElementById("active-sample").value = String(sample.id);
  } catch (error) {
    showMessage("sample-message", `No se pudo guardar la muestra: ${error.message}`, true);
  }
}

async function submitSymptom() {
  const zoneLabel = document.getElementById("selected-zone").textContent.trim();
  const zone = zoneToApi[zoneLabel];
  const description = document.getElementById("symptoms").value.trim();
  const severityValue = document.getElementById("symptom-severity").value;
  if (!zone) return showMessage("symptom-confirmation", "Selecciona primero una zona del mapa.", true);
  if (!description) return showMessage("symptom-confirmation", "Describe el síntoma antes de guardar.", true);

  try {
    const symptom = await api("/symptoms", {
      method: "POST",
      body: JSON.stringify({
        subject_code: getSubjectCode(), body_zone: zone, description,
        severity: severityValue ? Number(severityValue) : null,
        input_method: inputMethod,
        transcription_confirmed: inputMethod === "voice",
        sample_id: activeSampleId,
      }),
    });
    latestSymptomId = symptom.id;
    inputMethod = "text";
    document.getElementById("symptoms").value = "";
    document.getElementById("symptom-severity").value = "";
    showMessage("symptom-confirmation", `Síntoma guardado (ID ${symptom.id}). Puedes asociarlo a una indicación en Alertas.`);
    await loadSymptoms();
  } catch (error) {
    showMessage("symptom-confirmation", `No se pudo guardar: ${error.message}`, true);
  }
}

async function submitContext() {
  const selectedSample = document.getElementById("active-sample").value;
  if (!selectedSample) return showMessage("context-confirmation", "Registra o selecciona una muestra primero.", true);
  const checkboxes = [...document.querySelectorAll("#context-categories input[data-category]:checked")];
  if (!checkboxes.length) return showMessage("context-confirmation", "Selecciona al menos una categoría.", true);
  const note = document.getElementById("context-note").value.trim();
  try {
    for (const checkbox of checkboxes) {
      await api("/context-notes", {
        method: "POST",
        body: JSON.stringify({
          sample_id: Number(selectedSample), category: checkbox.dataset.category,
          event_at: new Date().toISOString(), note: note || null,
        }),
      });
    }
    checkboxes.forEach((checkbox) => { checkbox.checked = false; });
    document.getElementById("context-note").value = "";
    showMessage("context-confirmation", `Contexto asociado y guardado para la muestra ID ${selectedSample}.`);
  } catch (error) {
    showMessage("context-confirmation", `No se pudo guardar el contexto: ${error.message}`, true);
  }
}

async function submitRecommendation(event) {
  event.preventDefault();
  if (!latestSymptomId && !activeSampleId) {
    return showMessage("recommendation-message", "Registra primero un síntoma o una muestra para asociar la indicación.", true);
  }
  try {
    const recommendation = await api("/recommendations", {
      method: "POST",
      body: JSON.stringify({
        subject_code: getSubjectCode(), symptom_report_id: latestSymptomId,
        sample_id: activeSampleId,
        recommendation_type: document.getElementById("recommendation-type").value,
        instructions: document.getElementById("recommendation-instructions").value.trim(),
        status: "pending", ruleset_version: document.getElementById("ruleset-version").value.trim(),
      }),
    });
    showMessage("recommendation-message", `Indicación guardada (ID ${recommendation.id}). No se generó automáticamente.`);
    document.getElementById("recommendation-instructions").value = "";
  } catch (error) {
    showMessage("recommendation-message", `No se pudo guardar: ${error.message}`, true);
  }
}

async function loadSymptoms() {
  try {
    const symptoms = await api(`/symptoms?subject_code=${encodeURIComponent(getSubjectCode())}&limit=100`);
    const severityByZone = {};
    for (const symptom of symptoms) {
      const level = symptom.severity || 1;
      severityByZone[symptom.body_zone] = Math.max(severityByZone[symptom.body_zone] || 0, level);
    }
    for (const [label, apiZone] of Object.entries(zoneToApi)) {
      document.querySelectorAll(`.body-part[data-zone="${label}"]`).forEach((part) => {
        part.classList.remove("reported-1", "reported-2", "reported-3", "reported-4", "reported-5");
        if (severityByZone[apiZone]) part.classList.add(`reported-${severityByZone[apiZone]}`);
      });
    }
  } catch (error) {
    console.error("No se pudieron cargar los síntomas:", error);
  }
}

function levelClass(level) {
  if (level === "emergency" || level === "priority") return "red";
  if (level === "follow_up") return "amber";
  return "blue";
}

async function loadAlerts() {
  const container = document.getElementById("alerts-list");
  if (!container) return;
  container.replaceChildren();
  try {
    const alerts = await api(`/alerts?subject_code=${encodeURIComponent(getSubjectCode())}&limit=100`);
    if (!alerts.length) {
      const empty = document.createElement("article");
      empty.className = "card muted";
      empty.textContent = "Todavía no hay alertas para este tripulante.";
      container.append(empty);
      return;
    }
    for (const alert of alerts) {
      const card = document.createElement("article");
      card.className = "card";
      const badge = document.createElement("span");
      badge.className = `tag ${levelClass(alert.level)}`;
      badge.textContent = alert.level;
      const title = document.createElement("h2");
      title.style.marginTop = "12px";
      title.textContent = alert.message;
      const recommendation = document.createElement("p");
      recommendation.className = "muted";
      recommendation.textContent = alert.recommendation;
      const meta = document.createElement("p");
      meta.className = "muted";
      meta.style.marginTop = "10px";
      meta.textContent = `Acción: ${alert.action_status} · Envío: ${alert.delivery_status} · ${new Date(alert.created_at).toLocaleString("es")}`;
      card.append(badge, title, recommendation, meta);
      if (!alert.acknowledged_at) {
        const button = document.createElement("button");
        button.className = "button primary";
        button.style.marginTop = "14px";
        button.textContent = "Confirmar lectura";
        button.addEventListener("click", async () => {
          button.disabled = true;
          try {
            await api(`/alerts/${alert.id}/acknowledge`, { method: "POST" });
            await loadAlerts();
          } catch (error) {
            button.disabled = false;
            meta.textContent = `No se pudo confirmar: ${error.message}`;
          }
        });
        card.append(button);
      } else {
        const confirmed = document.createElement("p");
        confirmed.className = "muted";
        confirmed.style.marginTop = "10px";
        confirmed.textContent = `Lectura confirmada: ${new Date(alert.acknowledged_at).toLocaleString("es")}`;
        card.append(confirmed);
      }
      container.append(card);
    }
  } catch (error) {
    const failure = document.createElement("article");
    failure.className = "card";
    failure.textContent = `No se pudieron cargar las alertas: ${error.message}`;
    container.append(failure);
  }
}

function setupVoiceInput() {
  const button = document.getElementById("voice-input");
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    button.disabled = true;
    button.title = "Este navegador no ofrece reconocimiento de voz.";
    return;
  }
  button.addEventListener("click", () => {
    const recognition = new SpeechRecognition();
    recognition.lang = "es";
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    button.disabled = true;
    button.textContent = "Escuchando…";
    recognition.onresult = (event) => {
      document.getElementById("symptoms").value = event.results[0][0].transcript;
      inputMethod = "voice";
      showMessage("symptom-confirmation", "Revisa la transcripción antes de guardar.");
    };
    recognition.onerror = () => showMessage("symptom-confirmation", "No se reconoció la voz. Puedes escribir el síntoma.", true);
    recognition.onend = () => {
      button.disabled = false;
      button.textContent = "🎙 Dictar síntoma";
    };
    recognition.start();
  });
}

async function initialize() {
  document.querySelectorAll("nav button, [data-go]").forEach((button) => {
    // Navigation handlers are attached by connectNavigation below.
  });
  connectNavigation();
  document.getElementById("sample-form")?.addEventListener("submit", submitSample);
  document.getElementById("active-sample")?.addEventListener("change", (event) => {
    activeSampleId = event.target.value ? Number(event.target.value) : null;
  });
  document.getElementById("save-symptom")?.addEventListener("click", submitSymptom);
  document.getElementById("save-context")?.addEventListener("click", submitContext);
  document.getElementById("recommendation-form")?.addEventListener("submit", submitRecommendation);
  document.getElementById("subject-code")?.addEventListener("change", async () => {
    activeSampleId = null;
    await loadSamples();
    await loadSymptoms();
    await loadAlerts();
  });
  setupVoiceInput();

  try {
    await api("/health");
    document.getElementById("api-status").textContent = "API conectada";
    await loadSamples();
    await loadSymptoms();
    await loadAlerts();
  } catch (error) {
    document.getElementById("api-status").textContent = "API no disponible";
    showMessage("sample-message", `No se pudo conectar con la API: ${error.message}`, true);
    const alerts = document.getElementById("alerts-list");
    if (alerts) alerts.textContent = `API no disponible: ${error.message}`;
  }
}

document.addEventListener("DOMContentLoaded", initialize);
