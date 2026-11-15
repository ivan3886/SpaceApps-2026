const API_BASE = window.ORBIT_API_BASE || "http://127.0.0.1:8000";

let activeSampleId = null;
let activeSamples = [];
let latestSymptomId = null;
let inputMethod = "text";
let ultimoCortisolRegistrado = 0.50; // Valor por defecto


const zoneToApi = { Cabeza: "head", Pecho: "chest", Abdomen: "abdomen", Brazos: "arms", Piernas: "legs" };
const zoneLabels = Object.fromEntries(Object.entries(zoneToApi).map(([label, zone]) => [zone, label]));
const categoryLabels = {
  stress: "Estrés o evento emocional",
  physical_activity: "Actividad física o cambio de rutina",
  sleep: "Falta de sueño o alteración del descanso",
  illness: "Malestar o enfermedad",
  injury: "Golpe o lesión",
  collection_issue: "Dificultad durante la toma o problema de muestra",
  other: "Otro evento",
};
const statusLabels = {
  registered: "Registrada", processing: "En análisis", complete: "Completa", failed: "Fallida",
  pending: "Pendiente", valid: "Válido", invalid: "No válido",
};
const recommendationLabels = {
  collect_sample: "Realizar muestra",
  repeat_sample: "Repetir muestra",
  review_protocol: "Revisar protocolo",
  onboard_medical_care: "Atención médica a bordo",
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

function readableStatus(value) {
  return statusLabels[value] || value || "No informado";
}

function setDetail(container, label, value) {
  const wrapper = document.createElement("div");
  wrapper.className = "detail-item";
  const heading = document.createElement("div");
  heading.className = "eyebrow";
  heading.textContent = label;
  const content = document.createElement("strong");
  content.textContent = value === null || value === undefined || value === "" ? "—" : String(value);
  wrapper.append(heading, content);
  container.append(wrapper);
}

function selectZone(label) {
  const heading = document.getElementById("selected-zone");
  if (heading) heading.textContent = label;
  document.querySelectorAll(".body-part, .zone-button").forEach((item) => item.classList.toggle("selected", item.dataset.zone === label));
}

function showScreen(id) {
  document.querySelectorAll(".screen").forEach((screen) => screen.classList.toggle("active", screen.id === id));
  document.querySelectorAll("nav button").forEach((button) => button.classList.toggle("active", button.dataset.screen === id));
  if (id === "alerts") loadRecommendations();
  if (id === "sample") loadSamples();
  if (id === "body") loadSymptoms();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function connectNavigation() {
  document.querySelectorAll("nav button").forEach((button) => button.addEventListener("click", () => showScreen(button.dataset.screen)));
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

function setupRecommendationView() {
  const section = document.getElementById("alerts");
  if (!section) return;
  const heading = section.querySelector(".page-heading");
  if (heading) {
    const title = heading.querySelector("h1");
    const eyebrow = heading.querySelector(".eyebrow");
    const subtitle = heading.querySelector("p");
    if (title) title.textContent = "Indicaciones médicas";
    if (eyebrow) eyebrow.textContent = "Seguimiento a bordo";
    if (subtitle) subtitle.textContent = "Consulta las indicaciones aprobadas por el equipo médico.";
  }
  const navButton = document.querySelector('nav button[data-screen="alerts"]');
  if (navButton) navButton.innerHTML = "⚑ &nbsp; Indicaciones";
  section.querySelector("#alerts-list")?.remove();
  section.querySelector("#recommendation-form")?.closest("article")?.remove();
  // Contenedor propio para las indicaciones por cortisol (loadRecommendations no lo vacía).
  const cortisolIndications = document.createElement("div");
  cortisolIndications.id = "cortisol-indications";
  cortisolIndications.className = "grid";
  cortisolIndications.setAttribute("aria-live", "polite");
  heading?.after(cortisolIndications);
  const card = document.createElement("article");
  card.className = "card";
  const list = document.createElement("div");
  list.id = "recommendations-list";
  list.className = "grid";
  list.setAttribute("aria-live", "polite");
  list.textContent = "Cargando indicaciones…";
  card.append(list);
  cortisolIndications.after(card);
}

function setApiStatus(text, isError = false) {
  const element = document.getElementById("api-status");
  if (element) {
    element.textContent = text;
    element.style.color = isError ? "var(--red)" : "";
  }
}

function syncSampleSelectors() {
  for (const id of ["active-sample", "history-sample"]) {
    const select = document.getElementById(id);
    if (select) select.value = activeSampleId ? String(activeSampleId) : "";
  }
}

function updateSampleSelectors(samples) {
  for (const id of ["active-sample", "history-sample"]) {
    const select = document.getElementById(id);
    if (!select) continue;
    select.replaceChildren(new Option(samples.length ? "Selecciona una muestra…" : "No hay muestras registradas", ""));
    for (const sample of samples) {
      select.add(new Option(`${sample.sample_code} · ${sample.analyte} · ${formatDate(sample.collected_at)}`, String(sample.id)));
    }
  }
  if (!activeSampleId || !samples.some((sample) => String(sample.id) === String(activeSampleId))) {
    activeSampleId = samples[0]?.id ?? null;
  }
  syncSampleSelectors();
}

function getLatestSample() {
  return [...activeSamples].sort((a, b) => new Date(b.collected_at) - new Date(a.collected_at))[0] || null;
}

function sampleReviewText(sample) {
  if (!sample) return "Todavía no hay muestras registradas para este tripulante.";
  if (sample.analysis_status === "failed") return "El análisis figura como fallido; requiere revisión del operador.";
  if (sample.quality_status === "invalid") return "El control de calidad marcó la muestra como no válida. Revisar antes de interpretar el resultado.";
  if (sample.analysis_status !== "complete" || sample.quality_status === "pending") return "Muestra registrada; el resultado del sensor o laboratorio está pendiente.";
  return "Resultado registrado. Este resumen no constituye un diagnóstico ni una evaluación de aptitud.";
}

async function renderLatestReview() {
  const card = document.getElementById("latest-review");
  if (!card) return;
  const summary = card.querySelector("p");
  const grid = card.querySelector(".detail-grid");
  if (!summary || !grid) return;
  const sample = getLatestSample();
  grid.replaceChildren();
  summary.textContent = sampleReviewText(sample);
  if (!sample) return;
  setDetail(grid, "Estado del análisis", readableStatus(sample.analysis_status));
  setDetail(grid, "Control de calidad", readableStatus(sample.quality_status));
  setDetail(grid, "Muestra", `${sample.sample_code} · ${formatDate(sample.collected_at)}`);
  const caveats = [];
  if (!sample.result_value) caveats.push("sin resultado informado");
  if (sample.minutes_since_wake === null || sample.minutes_since_wake === undefined) caveats.push("sin tiempo desde despertar");
  setDetail(grid, "Aclaraciones", caveats.join(" · ") || "Sin aclaraciones registradas");
}

function renderSampleList() {
  const container = document.getElementById("sample-list");
  if (!container) return;
  container.replaceChildren();
  if (!activeSamples.length) {
    const empty = document.createElement("p");
    empty.className = "muted";
    empty.textContent = "No hay muestras para este tripulante.";
    container.append(empty);
    return;
  }
  for (const sample of activeSamples) {
    const row = document.createElement("div");
    row.className = "sample-row";
    const description = document.createElement("div");
    const code = document.createElement("strong");
    code.textContent = `${sample.sample_code} · ${sample.analyte}`;
    const meta = document.createElement("p");
    meta.className = "muted";
    meta.textContent = `${formatDate(sample.collected_at)} · Análisis: ${readableStatus(sample.analysis_status)} · Calidad: ${readableStatus(sample.quality_status)}`;
    description.append(code, meta);
    const button = document.createElement("button");
    button.className = "button";
    button.type = "button";
    button.textContent = "Ver detalle";
    button.addEventListener("click", async () => {
      activeSampleId = sample.id;
      syncSampleSelectors();
      await loadSelectedSampleDetails();
    });
    row.append(description, button);
    container.append(row);
  }
}

function renderSampleDetails(sample, assayResults = [], notes = [], symptoms = []) {
  const container = document.getElementById("sample-details");
  if (!container) return;
  container.replaceChildren();
  if (!sample) {
    const empty = document.createElement("p");
    empty.className = "muted";
    empty.textContent = "Selecciona una muestra para revisar sus datos.";
    container.append(empty);
    return;
  }
  const details = document.createElement("div");
  details.className = "detail-grid";
  setDetail(details, "Código", sample.sample_code);
  setDetail(details, "Tripulante", sample.subject_code);
  setDetail(details, "Analito", sample.analyte);
  setDetail(details, "Fecha y hora de toma", formatDate(sample.collected_at));
  setDetail(details, "Estado del análisis", readableStatus(sample.analysis_status));
  setDetail(details, "Control de calidad", readableStatus(sample.quality_status));
  setDetail(details, "Método", sample.assay_method || "No informado");
  setDetail(details, "Resultado registrado", sample.result_value === null || sample.result_value === undefined ? "Sin resultado informado" : `${sample.result_value} ${sample.unit || ""}`);
  setDetail(details, "Resultado disponible", formatDate(sample.result_available_at));
  setDetail(details, "Hora de despertar", formatDate(sample.wake_at));
  setDetail(details, "Minutos desde despertar", sample.minutes_since_wake);
  container.append(details);

  const resultsHeading = document.createElement("h3");
  resultsHeading.textContent = "Resultados recibidos";
  resultsHeading.style.marginTop = "18px";
  container.append(resultsHeading);
  if (!assayResults.length) {
    const empty = document.createElement("p");
    empty.className = "muted";
    empty.textContent = sample.result_value === null || sample.result_value === undefined
      ? "Aún no se han recibido resultados del sensor o laboratorio."
      : `${sample.analyte}: ${sample.result_value} ${sample.unit || ""} · ${sample.assay_method || "método no informado"}`;
    container.append(empty);
  }
  for (const result of assayResults) {
    const entry = document.createElement("div");
    entry.className = "context-entry";
    const title = document.createElement("strong");
    title.textContent = `${result.analyte}: ${result.value_original ?? "Bajo límite de detección"} ${result.unit_original || ""}`;
    const meta = document.createElement("p");
    meta.className = "muted";
    meta.textContent = `Método: ${result.assay_method || "No informado"} · Medido: ${formatDate(result.measured_at)}`;
    entry.append(title, meta);
    container.append(entry);
  }

  const contextHeading = document.createElement("h3");
  contextHeading.textContent = "Contexto registrado";
  contextHeading.style.marginTop = "18px";
  container.append(contextHeading);
  if (!notes.length) {
    const empty = document.createElement("p");
    empty.className = "muted";
    empty.textContent = "No hay contexto asociado a esta muestra.";
    container.append(empty);
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

  const symptomHeading = document.createElement("h3");
  symptomHeading.textContent = "Malestares asociados";
  symptomHeading.style.marginTop = "18px";
  container.append(symptomHeading);
  const linkedSymptoms = symptoms.filter((symptom) => Number(symptom.sample_id) === Number(sample.id));
  if (!linkedSymptoms.length) {
    const empty = document.createElement("p");
    empty.className = "muted";
    empty.textContent = "No hay malestares asociados a esta muestra.";
    container.append(empty);
  }
  for (const symptom of linkedSymptoms) {
    const entry = document.createElement("div");
    entry.className = "context-entry";
    const title = document.createElement("strong");
    title.textContent = `${zoneLabels[symptom.body_zone] || symptom.body_zone}: ${symptom.description}`;
    const meta = document.createElement("p");
    meta.className = "muted";
    meta.textContent = `Registrado: ${formatDate(symptom.reported_at || symptom.created_at)} · Gravedad percibida: ${symptom.severity ?? "sin indicar"}/5`;
    entry.append(title, meta);
    container.append(entry);
  }
}

async function loadSelectedSampleDetails() {
  const container = document.getElementById("sample-details");
  if (!activeSampleId) {
    renderSampleDetails(null);
    return;
  }
  if (container) container.textContent = "Cargando detalle…";
  try {
    const [sample, notes, symptoms, assayResults] = await Promise.all([
      api(`/samples/${activeSampleId}`),
      api(`/samples/${activeSampleId}/context-notes`).catch(() => []),
      api(`/symptoms?subject_code=${encodeURIComponent(getSubjectCode())}&limit=500`),
      api(`/samples/${activeSampleId}/assay-results`).catch(() => []),
    ]);
    renderSampleDetails(sample, assayResults, notes, symptoms);
    const sensorStatus = document.getElementById("sensor-analysis-status");
    if (sensorStatus) {
      sensorStatus.textContent = assayResults.length || sample.result_value !== null
        ? "Hay resultados registrados para esta muestra. Consulta el detalle en Muestras."
        : "Muestra registrada. Aún no hay resultados recibidos del sensor o laboratorio.";
    }
  } catch (error) {
    if (container) container.textContent = `No se pudo cargar el detalle: ${error.message}`;
  }
}

function updateSampleSelectors(samples) {
  for (const id of ["active-sample", "history-sample"]) {
    const select = document.getElementById(id);
    if (!select) continue;
    select.replaceChildren(new Option(samples.length ? "Selecciona una muestra…" : "No hay muestras registradas", ""));
    for (const sample of samples) {
      select.add(new Option(`${sample.sample_code} · ${sample.analyte} · ${formatDate(sample.collected_at)}`, String(sample.id)));
    }
  }
  if (!activeSampleId || !samples.some((sample) => String(sample.id) === String(activeSampleId))) activeSampleId = samples[0]?.id ?? null;
  for (const id of ["active-sample", "history-sample"]) {
    const select = document.getElementById(id);
    if (select) select.value = activeSampleId ? String(activeSampleId) : "";
  }
}

async function loadSamples() {
  try {
    activeSamples = await api(`/samples?subject_code=${encodeURIComponent(getSubjectCode())}&limit=100`);
    updateSampleSelectors(activeSamples);
    renderSampleList();
    await renderLatestReview();
    if (activeSampleId) await loadSelectedSampleDetails();
    else renderSampleDetails(null);
  } catch (error) {
    console.error("No se pudieron cargar las muestras:", error);
    const list = document.getElementById("sample-list");
    if (list) list.textContent = `No se pudo cargar el historial: ${error.message}`;
    const summary = document.getElementById("latest-review");
    if (summary) {
      const message = summary.querySelector("p");
      if (message) message.textContent = `No se pudo consultar la API: ${error.message}`;
    }
  }
}

async function loadSampleHistory() {
  await loadSamples();
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
    showMessage("sample-message", `Muestra ${sample.sample_code} registrada. Esperando el resultado del sensor o laboratorio; no se ha calculado ningún valor.`);
    await loadSamples();
    activeSampleId = sample.id;
    updateSampleSelectors(activeSamples);
    await loadSelectedSampleDetails();
    showScreen("body");
  } catch (error) {
    showMessage("sample-message", `No se pudo registrar la muestra: ${error.message}`, true);
  }
}

async function submitSymptom() {
  const zoneLabel = document.getElementById("selected-zone")?.textContent.trim();
  const zone = zoneToApi[zoneLabel];
  const description = document.getElementById("symptoms")?.value.trim();
  const severityValue = document.getElementById("symptom-severity")?.value;
  if (!zone) return showMessage("symptom-confirmation", "Selecciona primero una zona del mapa.", true);
  if (!description) return showMessage("symptom-confirmation", "Describe el malestar antes de guardar.", true);
  try {
    const symptom = await api("/symptoms", {
      method: "POST",
      body: JSON.stringify({ subject_code: getSubjectCode(), body_zone: zone, description, severity: severityValue ? Number(severityValue) : null, input_method: inputMethod, transcription_confirmed: inputMethod === "voice", sample_id: activeSampleId }),
    });
    latestSymptomId = symptom.id;
    inputMethod = "text";
    document.getElementById("symptoms").value = "";
    document.getElementById("symptom-severity").value = "";
    showMessage("symptom-confirmation", `Malestar guardado (ID ${symptom.id})${activeSampleId ? ` y asociado a la muestra ${activeSampleId}` : ""}.`);
    await loadSymptoms();
    if (activeSampleId) await loadSelectedSampleDetails();
    await renderLatestReview();
  } catch (error) {
    showMessage("symptom-confirmation", `No se pudo guardar: ${error.message}`, true);
  }
}

async function submitContext() {
  if (!activeSampleId) return showMessage("context-confirmation", "Selecciona la muestra relacionada antes de guardar el contexto.", true);
  const checkboxes = [...document.querySelectorAll("#context-categories input[data-category]:checked")];
  if (!checkboxes.length) return showMessage("context-confirmation", "Selecciona al menos una categoría.", true);
  const note = document.getElementById("context-note").value.trim();
  try {
    for (const checkbox of checkboxes) {
      await api("/context-notes", { method: "POST", body: JSON.stringify({ sample_id: Number(activeSampleId), category: checkbox.dataset.category, event_at: new Date().toISOString(), note: note || null }) });
    }
    checkboxes.forEach((checkbox) => { checkbox.checked = false; });
    document.getElementById("context-note").value = "";
    showMessage("context-confirmation", `Contexto asociado a la muestra ${activeSampleId}.`);
    await loadSelectedSampleDetails();
    await renderLatestReview();
  } catch (error) {
    showMessage("context-confirmation", `No se pudo guardar el contexto: ${error.message}`, true);
  }
}

async function submitRecommendation(event) {
  event.preventDefault();
  if (!latestSymptomId && !activeSampleId) return showMessage("recommendation-message", "Registra primero un síntoma o una muestra para asociar la indicación.", true);
  try {
    const recommendation = await api("/recommendations", {
      method: "POST",
      body: JSON.stringify({ subject_code: getSubjectCode(), symptom_report_id: latestSymptomId, sample_id: activeSampleId, recommendation_type: document.getElementById("recommendation-type").value, instructions: document.getElementById("recommendation-instructions").value.trim(), status: "pending", ruleset_version: document.getElementById("ruleset-version").value.trim() }),
    });
    showMessage("recommendation-message", `Indicación guardada (ID ${recommendation.id}). No se generó automáticamente.`);
    document.getElementById("recommendation-instructions").value = "";
    await loadRecommendations();
  } catch (error) {
    showMessage("recommendation-message", `No se pudo guardar: ${error.message}`, true);
  }
}

async function loadSymptoms() {
  try {
    const symptoms = await api(`/symptoms?subject_code=${encodeURIComponent(getSubjectCode())}&limit=500`);
    const severityByZone = {};
    for (const symptom of symptoms) {
      if (activeSampleId && symptom.sample_id != null && Number(symptom.sample_id) !== Number(activeSampleId)) continue;
      const level = Math.max(1, Math.min(5, Number(symptom.severity) || 1));
      severityByZone[symptom.body_zone] = Math.max(severityByZone[symptom.body_zone] || 0, level);
    }
    for (const [label, apiZone] of Object.entries(zoneToApi)) {
      document.querySelectorAll(`.body-part[data-zone="${label}"]`).forEach((part) => {
        part.classList.remove("reported-1", "reported-2", "reported-3", "reported-4", "reported-5");
        if (severityByZone[apiZone]) part.classList.add(`reported-${severityByZone[apiZone]}`);
      });
    }
  } catch (error) {
    console.error("No se pudieron cargar los malestares:", error);
  }
}

async function loadRecommendations() {
  const container = document.getElementById("recommendations-list");
  if (!container) return;
  container.replaceChildren();
  try {
    const recommendations = await api(`/recommendations?subject_code=${encodeURIComponent(getSubjectCode())}&limit=100`);
    if (!recommendations.length) {
      const empty = document.createElement("p");
      empty.className = "muted";
      empty.textContent = "No hay indicaciones médicas registradas para este tripulante.";
      container.append(empty);
      return;
    }
    for (const item of recommendations) {
      const card = document.createElement("article");
      card.className = "card";
      const title = document.createElement("h2");
      title.textContent = recommendationLabels[item.recommendation_type] || "Indicación médica";
      const status = document.createElement("span");
      status.className = "tag blue";
      status.textContent = statusLabels[item.status] || item.status;
      const instructions = document.createElement("p");
      instructions.style.marginTop = "12px";
      instructions.textContent = item.instructions;
      const meta = document.createElement("p");
      meta.className = "muted";
      meta.style.marginTop = "10px";
      meta.textContent = `Indicada: ${formatDate(item.created_at)} · Protocolo: ${item.ruleset_version}${item.sample_id ? ` · Muestra ID ${item.sample_id}` : ""}`;
      card.append(title, status, instructions, meta);
      container.append(card);
    }
  } catch (error) {
    const failure = document.createElement("p");
    failure.className = "muted";
    failure.textContent = `No se pudieron cargar las indicaciones: ${error.message}`;
    container.append(failure);
  }
}

function setupVoiceInput() {
  const button = document.getElementById("voice-input");
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!button) return;
  if (!SpeechRecognition) { button.disabled = true; button.title = "Este navegador no ofrece reconocimiento de voz."; return; }
  button.addEventListener("click", () => {
    const recognition = new SpeechRecognition();
    recognition.lang = "es"; recognition.interimResults = false; recognition.maxAlternatives = 1;
    button.disabled = true; button.textContent = "Escuchando…";
    recognition.onresult = (event) => {
      document.getElementById("symptoms").value = event.results[0][0].transcript;
      inputMethod = "voice";
      showMessage("symptom-confirmation", "Revisa la transcripción antes de guardar.");
    };
    recognition.onerror = () => showMessage("symptom-confirmation", "No se reconoció la voz. Puedes escribir el malestar.", true);
    recognition.onend = () => { button.disabled = false; button.textContent = "🎙 Dictar malestar"; };
    recognition.start();
  });
}

async function initialize() {
  connectNavigation();
  setupRecommendationView();
  document.getElementById("sample-form")?.addEventListener("submit", submitSample);
  document.getElementById("active-sample")?.addEventListener("change", async (event) => {
    activeSampleId = event.target.value ? Number(event.target.value) : null;
    syncSampleSelectors();
    await loadSymptoms();
    if (activeSampleId) await loadSelectedSampleDetails();
  });
  document.getElementById("history-sample")?.addEventListener("change", async (event) => {
    activeSampleId = event.target.value ? Number(event.target.value) : null;
    syncSampleSelectors();
    if (activeSampleId) await loadSelectedSampleDetails();
  });
  document.getElementById("save-symptom")?.addEventListener("click", submitSymptom);
  document.getElementById("save-context")?.addEventListener("click", submitContext);
  document.getElementById("subject-code")?.addEventListener("change", async () => {
    activeSampleId = null;
    await loadSamples();
    await loadSymptoms();
    await loadRecommendations();
  });
  setupVoiceInput();
  try {
    await api("/health");
    const apiStatus = document.getElementById("api-status");
    if (apiStatus) apiStatus.textContent = "API conectada";
    await loadSamples();
    await loadSymptoms();
    await loadRecommendations();
  } catch (error) {
    const apiStatus = document.getElementById("api-status");
    if (apiStatus) { apiStatus.textContent = "API no disponible"; apiStatus.style.color = "var(--red)"; }
    showMessage("sample-message", `No se pudo conectar con la API: ${error.message}`, true);
  }
}

// Función que simula la lectura del sensor y genera las indicaciones médicas
function registrarMuestraYGenerarIndicaciones() {
  // 1. Generar valor aleatorio entre 0.10 y 5.00 (simulando el sensor)
  // Dentro del evento submit de tu formulario de muestras actual:
// (Generas o capturas tu nivelCortisol, por ejemplo con tu Math.random aleatorio de 0.10 a 5.00)
const nivelCortisol = parseFloat((Math.random() * (5.00 - 0.10) + 0.10).toFixed(2));
ultimoCortisolRegistrado = nivelCortisol; // <--- Guarda el valor

// 1. Mostrar el valor calculado en el campo de la interfaz (reemplazando el texto de "no conectado")
const sensorStatusEl = document.getElementById('sensor-analysis-status');
if (sensorStatusEl) {
    let tagClass = 'green';
    let catTexto = 'ESTABLE (0.10 - 1.00)';
    if (nivelCortisol > 3.00) {
        tagClass = 'red';
        catTexto = 'EXTREMO (3.01 - 5.00)';
    } else if (nivelCortisol > 1.00) {
        tagClass = 'amber';
        catTexto = 'ALTO (1.01 - 3.00)';
    }
    sensorStatusEl.innerHTML = `
        <strong>Muestra analizada.</strong><br>
        Nivel de Cortisol: <span class="tag ${tagClass}">${nivelCortisol} µg/dL — ${catTexto}</span>
    `;
}

// 2. Llamar a la función que pinta las indicaciones
actualizarIndicacionesMedicas(nivelCortisol);
  // 2. Obtener las casillas tildadas de incidencias
  const golpeLesion = document.getElementById('chkGolpeLesion')?.checked || false;
  const estres = document.getElementById('chkEstres')?.checked || false;
  const faltaSueno = document.getElementById('chkFaltaSueno')?.checked || false;

  // Contenedor en la pantalla "Indicaciones"
  const contenedor = document.getElementById('indicacionesContenedor');
  if (!contenedor) return;

  let htmlIndicaciones = `<h3>Protocolo Médico de Misión - Indicaciones</h3>`;
  htmlIndicaciones += `<p class="text-muted">Nivel de Cortisol Registrado: <strong>${nivelCortisol} µg/dL</strong></p>`;

  // --- EVALUACIÓN DE CORTISOL SEGÚN RANGOS ---
  if (nivelCortisol >= 3.01 && nivelCortisol <= 5.00) {
      // Rango Extremo (con melatonina)
      htmlIndicaciones += `
          <div class="alerta-critica p-3 mb-3 border border-danger rounded bg-light-danger">
              <span class="badge bg-danger text-white">¡NIVEL EXTREMO (3.01 - 5.00)!</span>
              <p class="mt-2">Se detectó una saturación crítica de estrés biológico. Protocolo de emergencia activado:</p>
              <ul>
                  <li>💡 <strong>Control lumínico:</strong> Controlar la iluminación LED para emular estrictamente el ritmo circadiano terrestre.</li>
                  <li>🥽 <strong>Realidad Virtual:</strong> Utilizar cascos de realidad virtual mostrando paisajes relajantes de la Tierra para generar sensación de tranquilidad y confort.</li>
                  <li>📡 <strong>Asistencia remota:</strong> Solicitar asistencia psicológica remota desde la Tierra de inmediato (si las comunicaciones lo permiten).</li>
                  <li>💊 <strong>Inductor de sueño:</strong> <em>[Nivel extremo detectado]</em> Administrar inductor de sueño como la <strong>melatonina</strong> bajo pauta médica de emergencia.</li>
              </ul>
          </div>
      `;
  } else if (nivelCortisol >= 1.01 && nivelCortisol <= 3.00) {
      // Rango Alto (sin melatonina)
      htmlIndicaciones += `
          <div class="alerta-advertencia p-3 mb-3 border border-warning rounded bg-light-warning">
              <span class="badge bg-warning text-dark">NIVEL ALTO (1.01 - 3.00)</span>
              <p class="mt-2">Se requiere contención preventiva:</p>
              <ul>
                  <li>💡 <strong>Control lumínico:</strong> Ajustar la iluminación LED de la cabina a tonalidades cálidas para favorecer la relajación.</li>
                  <li>🥽 <strong>Realidad Virtual:</strong> Iniciar sesión de inmersión con cascos VR (paisajes terrestres) para reducir los niveles de ansiedad.</li>
                  <li>📡 <strong>Monitoreo:</strong> Vigilar parámetros vitales y programar reporte con el soporte médico en Tierra.</li>
              </ul>
          </div>
      `;
  } else {
      // Rango Estables (0.10 a 1.00)
      htmlIndicaciones += `
          <div class="alerta-normal p-3 mb-3 border border-success rounded bg-light-success">
              <span class="badge bg-success text-white">NIVEL ESTABLE (0.10 - 1.00)</span>
              <p class="mt-2">Parámetros dentro de la normalidad. Continuar con las operaciones regulares de la misión.</p>
          </div>
      `;
  }

  // --- INDICACIONES EXTRAS SEGÚN CASILLAS TILDADAS ---
  let extrasHtml = "";

  if (golpeLesion) {
      extrasHtml += `<li>🩹 <strong>Golpe o Lesión:</strong> Aplicar protocolo de revisión de trauma, utilizar botiquín de primeros auxilios y registrar telemetría de la zona afectada.</li>`;
  }
  if (estres) {
      extrasHtml += `<li>🧘 <strong>Estrés Operativo:</strong> Realizar pausa activa de 10 minutos, ejercicios de respiración guiada y revisión de cargas de trabajo.</li>`;
  }
  if (faltaSueno) {
      extrasHtml += `<li>🛌 <strong>Falta de Sueño:</strong> Modificar ventana de descanso en el próximo turno para asegurar recuperación cognitiva óptima.</li>`;
  }

  if (extrasHtml !== "") {
      htmlIndicaciones += `
          <div class="indicaciones-extras mt-3 p-3 border rounded bg-light">
              <h5>Medidas Adicionales por Incidencias Registradas:</h5>
              <ul>${extrasHtml}</ul>
          </div>
      `;
  }

  // Inyectar en el DOM
  contenedor.innerHTML = htmlIndicaciones;
}

// Vincular al botón de "Registrar muestra" y cambios en checkboxes
document.addEventListener('DOMContentLoaded', () => {
  const btnRegistrar = document.getElementById('btnRegistrarMuestra');
  if (btnRegistrar) {
      btnRegistrar.addEventListener('click', registrarMuestraYGenerarIndicaciones);
  }

  // Opcional: si tildan/destildan casillas, refresca las indicaciones con el último valor simulado
  const checkboxes = document.querySelectorAll('#chkGolpeLesion, #chkEstres, #chkFaltaSueno');
  checkboxes.forEach(chk => {
      chk.addEventListener('change', () => {
          // Si ya hay un contenedor activo, actualiza las extras sin cambiar el valor del sensor
          if (document.getElementById('indicacionesContenedor').innerHTML.trim() !== "") {
              // Opcional: puedes volver a llamar a la función o mantener el valor actual.
          }
      });
  });
});

// Variable global para almacenar el último cortisol analizado en la sesión
ultimoCortisolRegistrado = null; // Sin muestra analizada todavía

// Función para generar y mostrar las indicaciones médicas dinámicamente
function actualizarIndicacionesMedicas(nivelCortisol) {
  const alertsList = document.getElementById('alerts-list');
  if (!alertsList) return;

  const golpeLesion = document.getElementById('chkGolpeLesion')?.checked || false;
  const estres = document.getElementById('chkEstres')?.checked || false;
  const faltaSueno = document.getElementById('chkFaltaSueno')?.checked || false;

  let html = '';

  // --- EVALUACIÓN DE CORTISOL ---
  if (nivelCortisol >= 3.01 && nivelCortisol <= 5.00) {
      html += `
          <article class="card" style="border-color: var(--red); background: #2b181a;">
              <div class="tag red" style="margin-bottom: 8px;">NIVEL EXTREMO (${nivelCortisol} µg/dL)</div>
              <h3>Protocolo de Emergencia Crítica</h3>
              <p class="muted">Se requiere intervención inmediata:</p>
              <ul style="margin-top: 10px; padding-left: 20px; line-height: 1.6;">
                  <li>💡 <strong>Control lumínico:</strong> Controlar la iluminación LED para emular estrictamente el ritmo circadiano terrestre.</li>
                  <li>🥽 <strong>Realidad Virtual:</strong> Utilizar cascos de realidad virtual mostrando paisajes de la Tierra para generar tranquilidad y confort.</li>
                  <li>📡 <strong>Asistencia remota:</strong> Asistencia psicológica remota desde la Tierra en caso de que sea posible.</li>
                  <li>💊 <strong>Inductor de sueño:</strong> <em>[Nivel extremo detectado]</em> Se sugiere administrar un inductor de sueño como la <strong>melatonina</strong>.</li>
              </ul>
          </article>
      `;
  } else if (nivelCortisol >= 1.01 && nivelCortisol <= 3.00) {
      html += `
          <article class="card" style="border-color: var(--amber); background: #2b2418;">
              <div class="tag amber" style="margin-bottom: 8px;">NIVEL ALTO (${nivelCortisol} µg/dL)</div>
              <h3>Protocolo de Contención Preventiva</h3>
              <p class="muted">Se requiere estabilización:</p>
              <ul style="margin-top: 10px; padding-left: 20px; line-height: 1.6;">
                  <li>💡 <strong>Control lumínico:</strong> Controlar la iluminación LED para emular el ritmo circadiano terrestre.</li>
                  <li>🥽 <strong>Realidad Virtual:</strong> Utilizar cascos de realidad virtual mostrando paisajes de la Tierra para generar tranquilidad y confort.</li>
                  <li>📡 <strong>Asistencia remota:</strong> Asistencia psicológica remota desde la Tierra en caso de que sea posible.</li>
              </ul>
          </article>
      `;
  } else {
      html += `
          <article class="card" style="border-color: var(--green); background: #193a2b;">
              <div class="tag" style="margin-bottom: 8px;">NIVEL ESTABLE (${nivelCortisol} µg/dL)</div>
              <h3>Parámetros Óptimos</h3>
              <p class="muted">El nivel de cortisol se encuentra dentro del rango estable (0.10 - 1.00).</p>
              <ul style="margin-top: 10px; padding-left: 20px; line-height: 1.6;">
                  <li>✅ Continuar con las operaciones normales de la misión.</li>
              </ul>
          </article>
      `;
  }

  // --- CASILLAS ADICIONALES ---
  let extrasHtml = '';
  if (golpeLesion) extrasHtml += `<li>🩹 <strong>Golpe o lesión:</strong> Evaluar zona afectada y aplicar protocolo de primeros auxilios.</li>`;
  if (estres) extrasHtml += `<li>🧘 <strong>Estrés:</strong> Realizar pausa operativa y ejercicios de respiración guiada de 10 minutos.</li>`;
  if (faltaSueno) extrasHtml += `<li>🛌 <strong>Falta de sueño:</strong> Reorganizar turnos para garantizar un descanso continuo mínimo de 6 horas.</li>`;

  if (extrasHtml !== '') {
      html += `
          <article class="card" style="margin-top: 16px;">
              <h3>Medidas por Incidencias Registradas</h3>
              <ul style="margin-top: 10px; padding-left: 20px; line-height: 1.6;">${extrasHtml}</ul>
          </article>
      `;
  }

  alertsList.innerHTML = html;
}

// Opcional: actualizar si cambian las casillas y ya hay un valor registrado
document.querySelectorAll('#chkGolpeLesion, #chkEstres, #chkFaltaSueno').forEach(chk => {
  chk.addEventListener('change', () => {
      if (ultimoCortisolRegistrado !== null) actualizarIndicacionesMedicas(ultimoCortisolRegistrado);
  });
});

document.getElementById('sample-form')?.addEventListener('submit', (e) => {
  e.preventDefault();

  // 1. Generar el valor aleatorio de cortisol (entre 0.10 y 5.00)
  const nivelCortisol = parseFloat((Math.random() * (5.00 - 0.10) + 0.10).toFixed(2));
  
  // Asignamos a tu variable global existente (sin usar let ni const)
  ultimoCortisolRegistrado = nivelCortisol;

  // 2. Usar setTimeout para ganarle a la API y asegurar que se dibuje en pantalla
  setTimeout(() => {
      const sensorStatusEl = document.getElementById('sensor-analysis-status');
      if (sensorStatusEl) {
          let categoriaColor = 'green';
          let textoCategoria = 'ESTABLE (0.10 - 1.00)';
          
          if (nivelCortisol > 3.00) {
              categoriaColor = 'red';
              textoCategoria = 'EXTREMO (3.01 - 5.00)';
          } else if (nivelCortisol > 1.00) {
              categoriaColor = 'amber';
              textoCategoria = 'ALTO (1.01 - 3.00)';
          }

          sensorStatusEl.innerHTML = `
              <strong>Muestra analizada con éxito.</strong><br>
              Nivel de Cortisol Detectado: <span class="tag ${categoriaColor}">${nivelCortisol} µg/dL — ${textoCategoria}</span>
          `;
      }

      // 3. Generar las indicaciones correspondientes en la pestaña de Alertas
      actualizarIndicacionesMedicas(nivelCortisol);

      const msg = document.getElementById('sample-message');
      if (msg) msg.textContent = "¡Muestra registrada y analizada correctamente!";
  }, 150); // 150 milisegundos de respiro para pisar la respuesta de la red
});


// Función robusta que asegura que SIEMPRE se muestre una tarjeta (incluso si es normal)
function actualizarIndicacionesMedicas(nivelCortisol) {
  const alertsList = document.getElementById('cortisol-indications');
  if (!alertsList) return;

  const golpeLesion = document.getElementById('chkGolpeLesion')?.checked || false;
  const estres = document.getElementById('chkEstres')?.checked || false;
  const faltaSueno = document.getElementById('chkFaltaSueno')?.checked || false;

  let html = '';

  // --- EVALUACIÓN DE CORTISOL (¡Ahora incluye la tarjeta para nivel normal!) ---
  if (nivelCortisol >= 3.01 && nivelCortisol <= 5.00) {
      html += `
          <article class="card" style="border-color: var(--red); background: #2b181a;">
              <div class="tag red" style="margin-bottom: 8px;">NIVEL EXTREMO (${nivelCortisol} µg/dL)</div>
              <h3>Protocolo de Emergencia Crítica</h3>
              <p class="muted">Se requiere intervención inmediata:</p>
              <ul style="margin-top: 10px; padding-left: 20px; line-height: 1.6;">
                  <li>💡 <strong>Control lumínico:</strong> Controlar la iluminación LED para emular estrictamente el ritmo circadiano terrestre.</li>
                  <li>🥽 <strong>Realidad Virtual:</strong> Utilizar cascos de realidad virtual mostrando paisajes de la Tierra para generar tranquilidad y confort.</li>
                  <li>📡 <strong>Asistencia remota:</strong> Asistencia psicológica remota desde la Tierra en caso de que sea posible.</li>
                  <li>💊 <strong>Inductor de sueño:</strong> <em>[Nivel extremo detectado]</em> Se sugiere administrar un inductor de sueño como la <strong>melatonina</strong>.</li>
              </ul>
          </article>
      `;
  } else if (nivelCortisol >= 1.01 && nivelCortisol <= 3.00) {
      html += `
          <article class="card" style="border-color: var(--amber); background: #2b2418;">
              <div class="tag amber" style="margin-bottom: 8px;">NIVEL ALTO (${nivelCortisol} µg/dL)</div>
              <h3>Protocolo de Contención Preventiva</h3>
              <p class="muted">Se requiere estabilización:</p>
              <ul style="margin-top: 10px; padding-left: 20px; line-height: 1.6;">
                  <li>💡 <strong>Control lumínico:</strong> Controlar la iluminación LED para emular el ritmo circadiano terrestre.</li>
                  <li>🥽 <strong>Realidad Virtual:</strong> Utilizar cascos de realidad virtual mostrando paisajes de la Tierra para generar tranquilidad y confort.</li>
                  <li>📡 <strong>Asistencia remota:</strong> Asistencia psicológica remota desde la Tierra en caso de que sea posible.</li>
              </ul>
          </article>
      `;
  } else {
      html += `
          <article class="card" style="border-color: var(--green); background: #193a2b;">
              <div class="tag" style="margin-bottom: 8px;">NIVEL ESTABLE (${nivelCortisol} µg/dL)</div>
              <h3>Parámetros Óptimos</h3>
              <p class="muted">El nivel de cortisol se encuentra dentro del rango estable (0.10 - 1.00).</p>
              <ul style="margin-top: 10px; padding-left: 20px; line-height: 1.6;">
                  <li>✅ Continuar con las operaciones normales de la misión. Mantener pautas habituales de descanso.</li>
              </ul>
          </article>
      `;
  }

  // --- CASILLAS ADICIONALES ---
  let extrasHtml = '';
  if (golpeLesion) extrasHtml += `<li>🩹 <strong>Golpe o lesión:</strong> Evaluar zona afectada y aplicar protocolo de primeros auxilios.</li>`;
  if (estres) extrasHtml += `<li>🧘 <strong>Estrés:</strong> Realizar pausa operativa y ejercicios de respiración guiada de 10 minutos.</li>`;
  if (faltaSueno) extrasHtml += `<li>🛌 <strong>Falta de sueño:</strong> Reorganizar turnos para garantizar un descanso continuo mínimo de 6 horas.</li>`;

  if (extrasHtml !== '') {
      html += `
          <article class="card" style="margin-top: 16px;">
              <h3>Medidas por Incidencias Registradas</h3>
              <ul style="margin-top: 10px; padding-left: 20px; line-height: 1.6;">${extrasHtml}</ul>
          </article>
      `;
  }

  alertsList.innerHTML = html;
}

document.addEventListener("DOMContentLoaded", initialize);