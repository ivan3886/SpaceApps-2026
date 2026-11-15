const API_BASE = window.ORBIT_API_BASE || "http://127.0.0.1:8000";

let activeSampleId = null;
let activeSamples = [];
let latestSymptomId = null;
let inputMethod = "text";

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

function showScreen(id) {
  document.querySelectorAll(".screen").forEach((screen) => screen.classList.toggle("active", screen.id === id));
  document.querySelectorAll("nav button").forEach((button) => button.classList.toggle("active", button.dataset.screen === id));
  if (id === "alerts") loadAlerts();
  if (id === "sample") loadSampleHistory();
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
  window.showScreen = showScreen;
}

function createCard(title, id) {
  const article = document.createElement("article");
  article.className = "card";
  const heading = document.createElement("h2");
  heading.textContent = title;
  article.append(heading);
  if (id) article.id = id;
  return article;
}

function addSampleSelector(parent, id, labelText) {
  const wrapper = document.createElement("div");
  wrapper.className = "field";
  const label = document.createElement("label");
  label.htmlFor = id;
  label.textContent = labelText;
  const select = document.createElement("select");
  select.id = id;
  select.add(new Option("Cargando muestras…", ""));
  wrapper.append(label, select);
  parent.append(wrapper);
  select.addEventListener("change", () => {
    activeSampleId = select.value ? Number(select.value) : null;
    syncSampleSelectors();
    if (id === "history-sample") renderSampleDetails(activeSamples.find((sample) => sample.id === activeSampleId) || null);
  });
  return select;
}

function restructureScreens() {
  const overview = document.getElementById("overview");
  const body = document.getElementById("body");
  const samples = document.getElementById("sample");
  const originalForm = document.getElementById("sample-form");
  const sampleFormCard = originalForm?.closest("article");
  if (sampleFormCard) {
    const title = sampleFormCard.querySelector("h2");
    if (title) title.textContent = "Registrar muestra";
    const heading = overview.querySelector(".page-heading");
    heading?.after(sampleFormCard);
  }

  const summary = createCard("Último registro", "latest-review");
  summary.style.marginBottom = "16px";
  const quickSummary = document.createElement("p");
  quickSummary.className = "muted";
  quickSummary.textContent = "Cargando el registro más reciente…";
  summary.append(quickSummary);
  const summaryGrid = document.createElement("div");
  summaryGrid.className = "detail-grid";
  summary.append(summaryGrid);
  const summaryNote = document.createElement("p");
  summaryNote.className = "notice";
  summaryNote.textContent = "La aplicación presenta datos registrados; no determina un diagnóstico ni declara aptitud médica.";
  summary.append(summaryNote);
  overview.querySelector(".page-heading")?.after(summary);

  const sampleScreenHeading = samples.querySelector(".page-heading");
  if (sampleScreenHeading) {
    const title = sampleScreenHeading.querySelector("h1");
    if (title) title.textContent = "Historial de muestras";
    const subtitle = sampleScreenHeading.querySelector("p");
    if (subtitle) subtitle.textContent = "Consulta muestras y resultados registrados. Esta vista es de solo lectura.";
  }
  const sampleDetailsCard = document.getElementById("sample-details")?.closest("article");
  const oldResultCard = document.getElementById("result-form")?.closest("article");
  const contextCard = document.getElementById("context-categories")?.closest("article");
  sampleFormCard?.remove();
  oldResultCard?.remove();
  contextCard?.remove();

  const history = createCard("Detalle de muestra", "sample-history-card");
  addSampleSelector(history, "history-sample", "Selecciona una muestra");
  const details = document.createElement("div");
  details.id = "sample-details";
  details.setAttribute("aria-live", "polite");
  const placeholder = document.createElement("p");
  placeholder.className = "muted";
  placeholder.textContent = "Selecciona una muestra para revisar sus datos.";
  details.append(placeholder);
  history.append(details);
  if (sampleDetailsCard) sampleDetailsCard.replaceWith(history);
  else samples.append(history);

  const active = addSampleSelector(body, "active-sample", "Muestra asociada al registro");
  active.add(new Option("Sin muestra seleccionada", ""), 0);
  activeSampleId = null;
  if (contextCard) {
    const contextTitle = contextCard.querySelector("h2");
    if (contextTitle) contextTitle.textContent = "Contexto que puede afectar la muestra";
    body.append(contextCard);
  }

  const sensorCard = createCard("Análisis de la muestra");
  const sensorStatus = document.createElement("p");
  sensorStatus.id = "sensor-analysis-status";
  sensorStatus.className = "muted";
  sensorStatus.textContent = "Al registrar una muestra, aquí se mostrará el resultado recibido del sensor cuando exista una integración disponible.";
  sensorCard.append(sensorStatus);
  const sensorNotice = document.createElement("p");
  sensorNotice.className = "notice";
  sensorNotice.textContent = "Este prototipo no está conectado al hardware: no convierte señales crudas en cortisol ni genera valores. Los resultados deben proceder del sensor o del laboratorio y conservar su método y unidad.";
  sensorCard.append(sensorNotice);
  body.prepend(sensorCard);
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

function readableStatus(value) {
  const labels = { registered: "Registrada", processing: "En procesamiento", complete: "Completa", failed: "Fallida", pending: "Pendiente", valid: "Válida", invalid: "No válida" };
  return labels[value] || value || "No informado";
}

function renderSampleDetails(sample, assayResults = [], notes = [], symptoms = []) {
  const container = document.getElementById("sample-details");
  if (!container) return;
  container.replaceChildren();
  if (!sample) {
    const empty = document.createElement("p");
    empty.className = "muted";
    empty.textContent = "No hay muestras para mostrar. Registra una desde Resumen.";
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
  if (sample.result_value !== null && sample.result_value !== undefined) {
    setDetail(details, "Resultado registrado", `${sample.result_value}${sample.unit ? ` ${sample.unit}` : ""}`);
    setDetail(details, "Método", sample.assay_method || "No informado");
  }
  if (sample.wake_at) setDetail(details, "Hora de despertar", formatDate(sample.wake_at));
  if (sample.minutes_since_wake !== null && sample.minutes_since_wake !== undefined) setDetail(details, "Minutos desde despertar", sample.minutes_since_wake);
  setDetail(details, "Base temporal", sample.time_basis || "No informada");
  container.append(details);

  const resultHeading = document.createElement("h3");
  resultHeading.textContent = "Resultados recibidos";
  resultHeading.style.marginTop = "18px";
  container.append(resultHeading);
  const allResults = [...assayResults];
  if (!allResults.length && sample.result_value !== null && sample.result_value !== undefined) {
    const legacy = document.createElement("p");
    legacy.className = "muted";
    legacy.textContent = `${sample.analyte}: ${sample.result_value} ${sample.unit || ""} · ${sample.assay_method || "método no informado"}`;
    container.append(legacy);
  } else if (!allResults.length) {
    const empty = document.createElement("p");
    empty.className = "muted";
    empty.textContent = "Aún no se han recibido resultados del sensor o laboratorio.";
    container.append(empty);
  } else {
    for (const result of allResults) {
      const entry = document.createElement("div");
      entry.className = "context-entry";
      const title = document.createElement("strong");
      title.textContent = `${result.analyte}: ${result.value_original ?? "Bajo límite de detección"} ${result.unit_original || ""}`;
      const meta = document.createElement("p");
      meta.className = "muted";
      meta.textContent = `Método: ${result.assay_method || "No informado"} · Medido: ${formatDate(result.measured_at)}${result.value_normalized !== null && result.value_normalized !== undefined ? ` · Normalizado: ${result.value_normalized} ${result.unit_normalized || ""}` : ""}`;
      entry.append(title, meta);
      container.append(entry);
    }
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

function syncSampleSelectors() {
  for (const id of ["active-sample", "history-sample"]) {
    const select = document.getElementById(id);
    if (select) select.value = activeSampleId ? String(activeSampleId) : "";
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
        ? "Hay resultados registrados para esta muestra. Revísalos en Muestras junto con su método, unidades y calidad."
        : "Muestra registrada. Aún no hay resultados recibidos del sensor o laboratorio.";
    }
    await renderLatestReview();
  } catch (error) {
    if (container) container.textContent = `No se pudo cargar el detalle: ${error.message}`;
  }
}

function renderSampleOptions(samples) {
  for (const id of ["active-sample", "history-sample"]) {
    const select = document.getElementById(id);
    if (!select) continue;
    select.replaceChildren(new Option(samples.length ? "Selecciona una muestra…" : "No hay muestras registradas", ""));
    for (const sample of samples) {
      select.add(new Option(`${sample.sample_code} · ${sample.analyte} · ${formatDate(sample.collected_at)}`, String(sample.id)));
    }
  }
  const selected = samples.find((sample) => String(sample.id) === String(activeSampleId)) || samples[0] || null;
  activeSampleId = selected?.id ?? null;
  syncSampleSelectors();
  if (selected) loadSelectedSampleDetails();
  else renderSampleDetails(null);
}

async function loadSamples() {
  try {
    activeSamples = await api(`/samples?subject_code=${encodeURIComponent(getSubjectCode())}&limit=100`);
    renderSampleOptions(activeSamples);
    await renderLatestReview();
  } catch (error) {
    console.error("No se pudieron cargar las muestras:", error);
    const summary = document.getElementById("latest-review");
    if (summary) summary.querySelector("p").textContent = `No se pudo consultar la API: ${error.message}`;
  }
}

function sampleReviewText(sample) {
  if (!sample) return "Todavía no hay registros de muestras para este tripulante.";
  if (sample.analysis_status === "failed") return "El análisis figura como fallido; requiere revisión del operador.";
  if (sample.quality_status === "invalid") return "El control de calidad marcó la muestra como no válida; revisar antes de interpretar el resultado.";
  if (sample.analysis_status !== "complete" || sample.quality_status === "pending") return "Muestra registrada; el resultado del sensor o laboratorio aún no está disponible o pendiente de control de calidad.";
  return "Hay un resultado registrado. Esta vista resume datos; no constituye un diagnóstico ni una evaluación de aptitud.";
}

async function renderLatestReview() {
  const card = document.getElementById("latest-review");
  if (!card) return;
  const summary = card.querySelector("p");
  const grid = card.querySelector(".detail-grid");
  if (!summary || !grid) return;
  const sample = activeSamples[0] || null;
  grid.replaceChildren();
  summary.textContent = sampleReviewText(sample);
  if (!sample) return;
  setDetail(grid, "Estado del análisis", readableStatus(sample.analysis_status));
  setDetail(grid, "Control de calidad", readableStatus(sample.quality_status));
  setDetail(grid, "Última muestra", `${sample.sample_code} · ${formatDate(sample.collected_at)}`);
  try {
    const [notes, results] = await Promise.all([
      api(`/samples/${sample.id}/context-notes`).catch(() => []),
      api(`/samples/${sample.id}/assay-results`).catch(() => []),
    ]);
    const caveats = [];
    if (!results.length && sample.result_value == null) caveats.push("sin resultado de laboratorio/sensor");
    if (sample.quality_status === "invalid") caveats.push("control de calidad no válido");
    if (sample.minutes_since_wake == null) caveats.push("sin tiempo desde despertar");
    if (notes.length) caveats.push(`${notes.length} nota(s) de contexto asociadas`);
    setDetail(grid, "Aclaraciones", caveats.join(" · ") || "Sin aclaraciones registradas");
    if (results.length) setDetail(grid, "Resultados", results.map((item) => `${item.analyte}: ${item.value_original ?? "< LOD"} ${item.unit_original || ""}`).join("; "));
  } catch (error) {
    console.error("No se pudo completar el resumen:", error);
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
    showMessage("sample-message", `Muestra ${sample.sample_code} registrada. Esperando resultados del sensor o laboratorio; no se ha calculado ningún valor.`);
    await loadSamples();
    activeSampleId = sample.id;
    syncSampleSelectors();
    await loadSelectedSampleDetails();
    showScreen("body");
  } catch (error) {
    showMessage("sample-message", `No se pudo registrar la muestra: ${error.message}`, true);
  }
}

async function submitSymptom() {
  const zoneLabel = document.getElementById("selected-zone").textContent.trim();
  const zone = zoneToApi[zoneLabel];
  const description = document.getElementById("symptoms").value.trim();
  const severityValue = document.getElementById("symptom-severity").value;
  if (!zone) return showMessage("symptom-confirmation", "Selecciona primero una zona del mapa.", true);
  if (!description) return showMessage("symptom-confirmation", "Describe el malestar antes de guardar.", true);
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
    showMessage("symptom-confirmation", `Malestar guardado (ID ${symptom.id})${activeSampleId ? ` y asociado a la muestra ${activeSampleId}` : ""}.`);
    await loadSymptoms();
    await loadSelectedSampleDetails();
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
      await api("/context-notes", {
        method: "POST",
        body: JSON.stringify({ sample_id: Number(activeSampleId), category: checkbox.dataset.category, event_at: new Date().toISOString(), note: note || null }),
      });
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
    recognition.onerror = () => showMessage("symptom-confirmation", "No se reconoció la voz. Puedes escribir el malestar.", true);
    recognition.onend = () => { button.disabled = false; button.textContent = "🎙 Dictar malestar"; };
    recognition.start();
  });
}

function setApiStatus(text, isError = false) {
  const statusElement = document.getElementById("api-status");
  if (statusElement) statusElement.textContent = text;
  if (statusElement) statusElement.style.color = isError ? "var(--red)" : "";
}

async function initialize() {
  restructureScreens();
  connectNavigation();
  document.getElementById("sample-form")?.addEventListener("submit", submitSample);
  document.getElementById("active-sample")?.addEventListener("change", async (event) => {
    activeSampleId = event.target.value ? Number(event.target.value) : null;
    syncSampleSelectors();
    await loadSymptoms();
    await loadSelectedSampleDetails();
  });
  document.getElementById("history-sample")?.addEventListener("change", async (event) => {
    activeSampleId = event.target.value ? Number(event.target.value) : null;
    syncSampleSelectors();
    await loadSelectedSampleDetails();
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
    setApiStatus("API conectada");
    await loadSamples();
    await loadSymptoms();
    await loadAlerts();
  } catch (error) {
    setApiStatus("API no disponible", true);
    showMessage("sample-message", `No se pudo conectar con la API: ${error.message}`, true);
    const alerts = document.getElementById("alerts-list");
    if (alerts) alerts.textContent = `API no disponible: ${error.message}`;
  }
}

document.addEventListener("DOMContentLoaded", initialize);
