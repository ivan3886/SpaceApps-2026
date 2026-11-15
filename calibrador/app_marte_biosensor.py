import time
import numpy as np
import pandas as pd
import plotly.graph_objects as go
from scipy.optimize import curve_fit
import streamlit as st

# Configuración de página
st.set_page_config(
    page_title="ARES-BIO | Monitor de Cortisol & Telemetría Espacial",
    page_icon="🚀",
    layout="wide",
)

# Inicializar estado de calibración del sensor en memoria de sesión
if "calibracion" not in st.session_state:
    st.session_state.calibracion = {
        "I_dark_mV": 12.0,
        "I_0_mV": 3500.0,
        "A_min": 0.0800,
        "A_max": 1.4800,
        "EC50": 14.0000,
        "Hill": 1.1500,
        "R2": 0.9965,
        "estado_sensor": "NOMINAL",
    }


# Generador de base de datos sintética realista (incluye los casos de control)
@st.cache_data
def cargar_base_datos():
    np.random.seed(42)
    tripulantes = [
        {
            "id": "AST-01",
            "nombre": "Cmdr. Elena Rostova",
            "sexo": "F",
            "rol": "Comandante",
            "c_base": 18.5,
            "g_base": 88.0,
            "d_base": 320.0,
            "sens": 1.15,
        },
        {
            "id": "AST-02",
            "nombre": "Dr. Mateo Valdés",
            "sexo": "M",
            "rol": "Médico / Bioingeniero",
            "c_base": 15.2,
            "g_base": 84.0,
            "d_base": 380.0,
            "sens": 0.80,
        },
        {
            "id": "AST-03",
            "nombre": "Ing. Kenji Takahashi",
            "sexo": "M",
            "rol": "Ingeniero de Sistemas",
            "c_base": 21.0,
            "g_base": 92.0,
            "d_base": 340.0,
            "sens": 1.40,
        },
        {
            "id": "AST-04",
            "nombre": "Dra. Sofia Lindqvist",
            "sexo": "F",
            "rol": "Especialista de Carga",
            "c_base": 16.8,
            "g_base": 86.0,
            "d_base": 350.0,
            "sens": 1.00,
        },
    ]

    horas = [0.0, 0.5, 6.0, 10.0, 15.0]
    etiquetas = [
        "Despertar (T0)",
        "Post-Despertar (+30m)",
        "Mediodía (+6h)",
        "Tarde Crítica (+10h)",
        "Noche (+15h)",
    ]

    fases = [
        {
            "dia": 0,
            "fase": "1. Pre-Vuelo (Tierra - 1g)",
            "g": 1.0,
            "rad": 0.0,
            "flujo_set": 0.00,
        },
        {
            "dia": 45,
            "fase": "2. Tránsito Espacio Profundo (Mes 1.5 - 0g)",
            "g": 0.0,
            "rad": 95.0,
            "flujo_set": 0.25,
        },
        {
            "dia": 140,
            "fase": "3. Tránsito Espacio Profundo (Mes 4.5 - 0g)",
            "g": 0.0,
            "rad": 270.0,
            "flujo_set": 0.35,
        },
        {
            "dia": 210,
            "fase": "4. Superficie Marte (Sol 30 - 0.38g)",
            "g": 0.38,
            "rad": 340.0,
            "flujo_set": 0.15,
        },
    ]

    filas = []
    for ast in tripulantes:
        for f in fases:
            factor_ug = max(0.0, 1.0 - f["g"])
            dosis_sv = f["rad"] / 1000.0
            for idx, t in enumerate(horas):
                pico_car = 1.25 if t == 0.5 else 1.0
                c_tierra = ast["c_base"] * pico_car * np.exp(-0.11 * t)

                # Efecto microgravedad (+10h) + Efecto radiación acumulada
                efecto_ug = (
                    factor_ug
                    * 6.8
                    * ast["sens"]
                    * np.exp(-((t - 10.0) ** 2) / (2 * 2.5**2))
                )
                efecto_rad = dosis_sv * 19.0 * ast["sens"]

                c_real = max(
                    1.5,
                    c_tierra
                    + efecto_ug
                    + efecto_rad
                    + np.random.normal(0, 0.3),
                )

                # Simulación de ruido cósmico (SET) vs Filtro de Mediana
                set_eventos = (
                    np.random.randint(1, 4)
                    if np.random.rand() < f["flujo_set"]
                    else 0
                )
                c_sin_filtro = (
                    c_real * np.random.uniform(2.2, 3.8)
                    if set_eventos > 0
                    else c_real
                )

                delta_c = max(0, c_real - c_tierra)
                glucosa = round(
                    ast["g_base"] + delta_c * 1.35 + np.random.normal(0, 1.8), 1
                )
                dhea_ref = ast["d_base"] * np.exp(-0.07 * t)
                dhea = round(
                    max(
                        45.0,
                        dhea_ref * (1 - 0.45 * dosis_sv)
                        + np.random.normal(0, 6),
                    ),
                    1,
                )
                dark_mv = round(
                    12.0 + (dosis_sv * 45.0) + np.random.normal(0, 0.2), 2
                )

                desv_pct = ((c_real - c_tierra) / c_tierra) * 100
                if desv_pct > 55 or c_real > 27.0:
                    estado = "CRÍTICO"
                elif desv_pct > 25:
                    estado = "PRECAUCIÓN"
                else:
                    estado = "NORMAL"

                filas.append({
                    "id": ast["id"],
                    "nombre": ast["nombre"],
                    "sexo": ast["sexo"],
                    "rol": ast["rol"],
                    "fase": f["fase"],
                    "gravedad_g": f["g"],
                    "radiacion_mSv": f["rad"],
                    "momento": etiquetas[idx],
                    "hora_t": t,
                    "ref_cortisol_nM": round(c_tierra, 2),
                    "hallado_cortisol_nM": round(c_real, 2),
                    "hallado_cortisol_ug_dL": round(c_real * 0.03625, 3),
                    "cortisol_sin_filtro_nM": round(c_sin_filtro, 2),
                    "eventos_set": set_eventos,
                    "ref_glucosa": ast["g_base"],
                    "hallado_glucosa": glucosa,
                    "hallado_dhea": dhea,
                    "dark_current_mV": dark_mv,
                    "desviacion_pct": round(desv_pct, 1),
                    "estado": estado,
                })
    return pd.DataFrame(filas)


df = cargar_base_datos()

# --- BARRA LATERAL (CONTROLES DE MISIÓN) ---
st.sidebar.title("🚀 ARES-BIO OS v2.4")
st.sidebar.caption(
    "Sistema Biosensor Óptico de Cortisol | Telemetría Tierra - Marte"
)

tripulante_sel = st.sidebar.selectbox(
    "Seleccionar Tripulante:", df["nombre"].unique()
)
fase_sel = st.sidebar.selectbox("Fase de Misión:", df["fase"].unique())

st.sidebar.divider()
st.sidebar.subheader("🛠️ Estado del Hardware Óptico")
cal = st.session_state.calibracion
st.sidebar.metric(
    "Dark Current Base (I_dark)", f"{cal['I_dark_mV']:.2f} mV", delta="Estable"
)
st.sidebar.metric(
    "Curva 4PL Activa (EC50 / R²)", f"{cal['EC50']:.2f} nM | R²={cal['R2']:.4f}"
)

# Filtrar datos seleccionados
df_filtrado = df[(df["nombre"] == tripulante_sel) & (df["fase"] == fase_sel)]
info_ast = df_filtrado.iloc[0]

# --- ENCABEZADO PRINCIPAL ---
st.title("Panel Biomédico de Estrés Espacial y Telemetría Óptica")
st.markdown(
    f"**Tripulante:** {info_ast['nombre']} ({info_ast['sexo']}) | **Rol:**"
    f" {info_ast['rol']} | **Entorno:** `{info_ast['gravedad_g']} g` |"
    f" **Radiación Acumulada:** `{info_ast['radiacion_mSv']} mSv`"
)

# PESTAÑAS DE LA INTERFAZ
tab1, tab2, tab3 = st.tabs([
    "📊 Monitoreo Circadiano (Tierra vs. Espacio)",
    "☢️ Filtro de Ruido Cósmico (SET)",
    "🔧 Autocalibración del Sensor (4PL)",
])

# ==============================================================================
# PESTAÑA 1: MONITOREO BIOMÉDICO Y RITMO CIRCADIANO
# ==============================================================================
with tab1:
    # KPIs principales (enfocados en el punto crítico de las +10h del paper de NASA)
    punto_10h = df_filtrado[df_filtrado["hora_t"] == 10.0].iloc[0]

    col1, col2, col3, col4 = st.columns(4)
    col1.metric(
        "Cortisol Tarde (+10h)",
        f"{punto_10h['hallado_cortisol_nM']} nM",
        f"{punto_10h['desviacion_pct']:+.1f}% vs Tierra",
        delta_color="inverse",
    )
    col2.metric(
        "Cortisol (+10h en µg/dL)",
        f"{punto_10h['hallado_cortisol_ug_dL']} µg/dL",
        f"Ref: {round(punto_10h['ref_cortisol_nM']*0.03625, 3)} µg/dL",
    )
    col3.metric(
        "Glucosa Asociada",
        f"{punto_10h['hallado_glucosa']} mg/dL",
        f"{punto_10h['hallado_glucosa'] - punto_10h['ref_glucosa']:+.1f} mg/dL",
        delta_color="inverse",
    )
    col4.metric(
        "DHEA Contrarreguladora",
        f"{punto_10h['hallado_dhea']} pg/mL",
        "Índice Anabólico",
    )

    # Banner de Alerta Clínica
    if punto_10h["estado"] == "CRÍTICO":
        st.error(
            "🚨 **ALERTA CRÍTICA:** Sobrecarga del eje HPA y pérdida del ritmo"
            " circadiano (+10h). Alto riesgo de inmunosupresión y reactivación"
            " de virus latentes (EBV / VZV / CMV)."
        )
    elif punto_10h["estado"] == "PRECAUCIÓN":
        st.warning(
            "⚠️ **PRECAUCIÓN CIRCADIANA:** Se detecta aplanamiento de la curva"
            " vespertina (+10h) compatible con exposición a microgravedad"
            " (Mehta et al.)."
        )
    else:
        st.success(
            "✅ **ESTADO NOMINAL:** La trayectoria diurna de cortisol se"
            " mantiene dentro de los parámetros fisiológicos esperados."
        )

    # Gráfico Comparativo Tierra vs Espacio
    fig = go.Figure()
    fig.add_trace(
        go.Scatter(
            x=df_filtrado["momento"],
            y=df_filtrado["ref_cortisol_nM"],
            mode="lines+markers",
            name="Referencia Tierra (1g)",
            line=dict(color="#00CC96", width=3, dash="dash"),
        )
    )
    fig.add_trace(
        go.Scatter(
            x=df_filtrado["momento"],
            y=df_filtrado["hallado_cortisol_nM"],
            mode="lines+markers",
            name="Medición Biosensor (Misión)",
