const API_BASE = window.ORBIT_API_BASE || "http://127.0.0.1:8000";

let activeSampleId = null;
let latestSymptomId = null;
let inputMethod = "text";
const zoneToApi = { Cabeza: "head", Pecho: "chest", Abdomen: "abdomen", Brazos: "arms", Piernas: "legs" };
const categoryLabels = {
  stress: "Estrés o evento emocional",
  physical_activity: "Actividad física o cambio de rutina",
  sleep: "Falta de sueño o alteración del descanso",
  illness: "Malestar o enfermedad",
  injury: "Golpe o lesión",
  collection_issue: "Dificultad durante la toma o problema de muestra",
  other: "Otro evento",
};

async function api(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: { ...(options.body ? { "Content-Type": "application/json" } : {}), ...(options.headers || {}) },
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

function formatDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString("es");
}

function selectZone(label) {
  const heading = document.getElementById("selected-zone");
  if (heading) heading.textContent = label;
  document.querySelectorAll(".body-part, .zone-button").forEach((item) => item.classList.toggle("selected", item.dataset.zone === label));
}

function connectNavigation() {
  const buttons = document.querySelectorAll("nav button");
  const screens = document.querySelectorAll(".screen");
  function showScreen(id) {
    screens.forEach((screen) => screen.classList.toggle("active", screen.id === id));
    buttons.forEach((button) => button.classList.toggle("active", button.dataset.screen === id));
    if (id === "alerts") loadAlerts();
    if (id === "sample") loadSelectedSampleDetails();
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

function setDetail(item, label, value) {
  const wrapper = document.createElement("div");
  wrapper.className = "detail-item";
  const heading = document.createElement("div");
  heading.className = "eyebrow";
  heading.textContent = label;
  const content = document.createElement("strong");
  content.textContent = value || "—";
  wrapper.append(heading, content);
  item.append(wrapper);
}

function renderSampleDetails(sample, notes) {
  const container = document.getElementById("sample-details");
  container.replaceChildren();
  if (!sample) {
    container.textContent = "Selecciona una muestra para ver su detalle.";
    return;
  }

  const details = document.createElement("div");
  details.className = "detail-grid";
  setDetail(details, "Código", sample.sample_code);
  setDetail(details, "Tripulante", sample.subject_code);
  setDetail(details, "Analito", sample.analyte);
  setDetail(details, "Fecha de toma", formatDate(sample.collected_at));
  setDetail(details, "Estado del análisis", sample.analysis_status);
  setDetail(details, "Control de calidad", sample.quality_status);
  setDetail(details, "Resultado", sample.result_value === null ? "Sin resultado informado" : `${sample.result_value}${sample.unit ? ` ${sample.unit}` : ""}`);
  setDetail(details, "Método", sample.assay_method || "No informado");
  setDetail(details, "Resultado disponible", formatDate(sample.result_available_at));
  container.append(details);

  const contextHeading = document.createElement("h3");
  contextHeading.textContent = "Contexto registrado";
  contextHeading.style.marginTop = "18px";
  container.append(contextHeading);
  if (!notes.length) {
    const empty = document.createElement("p");
    empty.className = "muted";
    empty.textContent = "No hay contexto guardado para esta muestra.";
    container.append(empty);
    return;
  }

  for (const note of notes) {
    const entry = document.createElement("div");
    entry.className = "context-entry";
    const title = document.createElement("strong");
    title.textContent = categoryLabels[note.category] || note.category;
    const date = document.createElement("p");
    date.className = "muted";
    date.textContent = `Evento: ${formatDate(note.event_at)} · Registrado: ${formatDate(note.entered_at)}`;
    entry.append(title, date);
    if (note.note) {
      const description = document.createElement("p");
      description.textContent = note.note;
      entry.append(description);
    }
    container.append(entry);
  }
}

function fillResultForm(sample) {
  document.getElementById("result-value").value = sample.result_value ?? "";
  document.getElementById("result-unit").value = sample.unit ?? "";
  document.getElementById("assay-method").value = sample.assay_method ?? "";
  document.getElementById("analysis-status").value = sample.analysis_status;
  document.getElementById("quality-status").value = sample.quality_status;
}

async function loadSelectedSampleDetails() {
  const details = document.getElementById("sample-details");
  if (!activeSampleId) {
    renderSampleDetails(null, []);
    return;
  }
  details.textContent = "Cargando detalle de muestra…";
  try {
    const [sample, notes] = await Promise.all([
      api(`/samples/${activeSampleId}`),
      api(`/samples/${activeSampleId}/context-notes`),
    ]);
    renderSampleDetails(sample, notes);
    fillResultForm(sample);
  } catch (error) {
    details.textContent = `No se pudo cargar el detalle: ${error.message}`;
  }
}

function renderSamples(samples, preferLatest = false) {
  const select = document.getElementById("active-sample");
  if (!select) return;
  const previous = String(activeSampleId || select.value || "");
  select.replaceChildren(new Option(samples.length ? "Selecciona una muestra…" : "No hay muestras para este tripulante", ""));
  for (const sample of samples) {
    select.add(new Option(`${sample.sample_code} · ${sample.analyte} · ID ${sample.id}`, String(sample.id)));
  }
  const selected = (!preferLatest && samples.find((sample) => String(sample.id) === previous)) || samples[0];
  activeSampleId = selected?.id ?? null;
  select.value = activeSampleId ? String(activeSampleId) : "";
  loadSelectedSampleDetails();
}

async function loadSamples(preferLatest = false) {
  try {
    const samples = await api(`/samples?subject_code=${encodeURIComponent(getSubjectCode())}&limit=100`);
    renderSamples(samples, preferLatest);
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
        sample_code: codeInput.value.trim(), subject_code: getSubjectCode(),
        collected_at: new Date().toISOString(), analyte: document.getElementById("analyte").value.trim() || "cortisol",
        analysis_status: "registered", quality_status: "pending",
      }),
    });
    activeSampleId = sample.id;
    codeInput.value = "";
    showMessage("sample-message", `Muestra ${sample.sample_code} guardada (ID ${sample.id}). El resultado queda pendiente hasta cargar el análisis.`);
    await loadSamples();
    document.getElementById("active-sample").value = String(sample.id);
    activeSampleId = sample.id;
    await loadSelectedSampleDetails();
  } catch (error) {
    showMessage("sample-message", `No se pudo guardar la muestra: ${error.message}`, true);
  }
}

async function submitResult(event) {
  event.preventDefault();
  if (!activeSampleId) return showMessage("result-message", "Selecciona una muestra antes de guardar el resultado.", true);
  const value = document.getElementById("result-value").value;
  const unit = document.getElementById("result-unit").value.trim();
  if (value !== "" && !unit) return showMessage("result-message", "Indica la unidad para el valor del resultado.", true);
  if (value === "" && unit) return showMessage("result-message", "Ingresa el valor o deja vacía también la unidad.", true);
  try {
    const updated = await api(`/samples/${activeSampleId}`, {
      method: "PATCH",
      body: JSON.stringify({
        result_value: value === "" ? null : value,
        unit: unit || null,
        assay_method: document.getElementById("assay-method").value.trim() || null,
        analysis_status: document.getElementById("analysis-status").value,
        quality_status: document.getElementById("quality-status").value,
        result_available_at: value === "" ? null : new Date().toISOString(),
      }),
    });
    showMessage("result-message", "Resultado de análisis actualizado.");
    const notes = await api(`/samples/${activeSampleId}/context-notes`);
    renderSampleDetails(updated, notes);
  } catch (error) {
    showMessage("result-message", `No se pudo guardar el resultado: ${error.message}`, true);
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
        input_method: inputMethod, transcription_confirmed: inputMethod === "voice", sample_id: activeSampleId,
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
        body: JSON.stringify({ sample_id: Number(selectedSample), category: checkbox.dataset.category, event_at: new Date().toISOString(), note: note || null }),
      });
    }
    checkboxes.forEach((checkbox) => { checkbox.checked = false; });
    document.getElementById("context-note").value = "";
    showMessage("context-confirmation", `Contexto guardado para la muestra ID ${selectedSample}.`);
    await loadSelectedSampleDetails();
  } catch (error) {
    showMessage("context-confirmation", `No se pudo guardar el contexto: ${error.message}`, true);
    await loadSelectedSampleDetails();
  }
}

async function submitRecommendation(event) {
  event.preventDefault();
  if (!latestSymptomId && !activeSampleId) return showMessage("recommendation-message", "Registra primero un síntoma o una muestra para asociar la indicación.", true);
  try {
    const recommendation = await api("/recommendations", {
      method: "POST",
      body: JSON.stringify({
        subject_code: getSubjectCode(), symptom_report_id: latestSymptomId, sample_id: activeSampleId,
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
      const badge = document.createElement("span"); badge.className = `tag ${levelClass(alert.level)}`; badge.textContent = alert.level;
      const title = document.createElement("h2"); title.style.marginTop = "12px"; title.textContent = alert.message;
      const recommendation = document.createElement("p"); recommendation.className = "muted"; recommendation.textContent = alert.recommendation;
      const meta = document.createElement("p"); meta.className = "muted"; meta.style.marginTop = "10px";
      meta.textContent = `Acción: ${alert.action_status} · Envío: ${alert.delivery_status} · ${formatDate(alert.created_at)}`;
      card.append(badge, title, recommendation, meta);
      if (!alert.acknowledged_at) {
        const button = document.createElement("button"); button.className = "button primary"; button.style.marginTop = "14px"; button.textContent = "Confirmar lectura";
        button.addEventListener("click", async () => {
          button.disabled = true;
          try { await api(`/alerts/${alert.id}/acknowledge`, { method: "POST" }); await loadAlerts(); }
          catch (error) { button.disabled = false; meta.textContent = `No se pudo confirmar: ${error.message}`; }
        });
        card.append(button);
      } else {
        const confirmed = document.createElement("p"); confirmed.className = "muted"; confirmed.style.marginTop = "10px";
        confirmed.textContent = `Lectura confirmada: ${formatDate(alert.acknowledged_at)}`; card.append(confirmed);
      }
      container.append(card);
    }
  } catch (error) {
    const failure = document.createElement("article"); failure.className = "card";
    failure.textContent = `No se pudieron cargar las alertas: ${error.message}`; container.append(failure);
  }
}

function setupVoiceInput() {
  const button = document.getElementById("voice-input");
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) { button.disabled = true; button.title = "Este navegador no ofrece reconocimiento de voz."; return; }
  button.addEventListener("click", () => {
    const recognition = new SpeechRecognition();
    recognition.lang = "es"; recognition.interimResults = false; recognition.maxAlternatives = 1;
    button.disabled = true; button.textContent = "Escuchando…";
    recognition.onresult = (event) => {
      document.getElementById("symptoms").value = event.results[0][0].transcript;
      inputMethod = "voice"; showMessage("symptom-confirmation", "Revisa la transcripción antes de guardar.");
    };
    recognition.onerror = () => showMessage("symptom-confirmation", "No se reconoció la voz. Puedes escribir el síntoma.", true);
    recognition.onend = () => { button.disabled = false; button.textContent = "🎙 Dictar síntoma"; };
    recognition.start();
  });
}

async function initialize() {
  connectNavigation();
  document.getElementById("sample-form")?.addEventListener("submit", submitSample);
  document.getElementById("result-form")?.addEventListener("submit", submitResult);
  document.getElementById("active-sample")?.addEventListener("change", async (event) => {
    activeSampleId = event.target.value ? Number(event.target.value) : null;
    showMessage("result-message", "");
    await loadSelectedSampleDetails();
  });
  document.getElementById("save-symptom")?.addEventListener("click", submitSymptom);
  document.getElementById("save-context")?.addEventListener("click", submitContext);
  document.getElementById("recommendation-form")?.addEventListener("submit", submitRecommendation);
  document.getElementById("subject-code")?.addEventListener("change", async () => {
    activeSampleId = null;
    await loadSamples(true);
    await loadSymptoms();
    await loadAlerts();
  });
  setupVoiceInput();
  try {
    await api("/health");
    document.getElementById("api-status").textContent = "API conectada";
    await loadSamples(true);
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
