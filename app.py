"""
=================================================================================
PREDICTOR CLÍNICO DE DENGUE PEDIÁTRICO (F1000Research Cohort)
Dashboard Clínico y Analítico de Nivel Ejecutivo con Flask + Tailwind CSS + Chart.js
=================================================================================
"""

import os
import sys
import json
import logging
import joblib
import numpy as np

# --- OPTIMIZACIÓN DE MEMORIA PARA RENDER ---
os.environ['TF_CPP_MIN_LOG_LEVEL'] = '2'
os.environ['CUDA_VISIBLE_DEVICES'] = '-1' # Fuerza el uso de CPU para ahorrar memoria RAM

import tensorflow as tf
from flask import Flask, request, jsonify, render_template

# Configuración básica de logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s [%(levelname)s] %(message)s')
logger = logging.getLogger("AppDengueDashboard")

# Configuración de rutas y Flask
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
MODELS_DIR = os.path.join(BASE_DIR, "models")
TEMPLATES_DIR = os.path.join(BASE_DIR, "templates")
STATIC_DIR = os.path.join(BASE_DIR, "static")

app = Flask(__name__, template_folder=TEMPLATES_DIR, static_folder=STATIC_DIR)

# Suprimir advertencias y telemetría de TensorFlow
os.environ['TF_CPP_MIN_LOG_LEVEL'] = '2'
os.environ['TF_ENABLE_ONEDNN_OPTS'] = '0'
import tensorflow as tf
from flask import Flask, request, jsonify, render_template

logging.basicConfig(level=logging.INFO, format='%(asctime)s [%(levelname)s] %(message)s')
logger = logging.getLogger("AppDengueDashboard")

# Configuración de rutas y Flask
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
MODELS_DIR = os.path.join(BASE_DIR, "models")
TEMPLATES_DIR = os.path.join(BASE_DIR, "templates")
STATIC_DIR = os.path.join(BASE_DIR, "static")

app = Flask(__name__, template_folder=TEMPLATES_DIR, static_folder=STATIC_DIR)

# Cargar artefactos preentrenados
try:
    scaler = joblib.load(os.path.join(MODELS_DIR, "scaler.joblib"))
    modelo_lr = joblib.load(os.path.join(MODELS_DIR, "modelo_regresion_logistica.joblib"))
    modelo_ann = tf.keras.models.load_model(os.path.join(MODELS_DIR, "modelo_ann.keras"))

    with open(os.path.join(MODELS_DIR, "features_config.json"), "r", encoding="utf-8") as f:
        config_features = json.load(f)
    feature_names = config_features.get("features", config_features.get("features_orden", []))

    with open(os.path.join(MODELS_DIR, "metricas_modelos.json"), "r", encoding="utf-8") as f:
        metricas_modelos = json.load(f)

    logger.info("Artefactos de ML y configuraciones cargados correctamente.")
except Exception as e:
    logger.error(f"Error cargando modelos o configuraciones: {e}")
    sys.exit(1)


@app.route("/")
def index():
    """Renderiza el dashboard analítico principal."""
    return render_template(
        "index.html",
        metricas=metricas_modelos,
        metricas_json=json.dumps(metricas_modelos)
    )


@app.route("/api/metricas", methods=["GET"])
def api_metricas():
    """Retorna las métricas técnicas y matrices de confusión de ambos modelos."""
    return jsonify(metricas_modelos)


@app.route("/api/predecir", methods=["POST"])
def api_predecir():
    """
    Inferencia clínica simultánea para ambos modelos:
    - Regresión Logística (Scikit-Learn, AUC 0.971)
    - Red Neuronal Artificial (TensorFlow ANN, Recall 100%)
    - Consenso Ensamble Promedio
    """
    try:
        data = request.get_json(force=True)
        modelo_sel = str(data.get("modelo", "logistica")).lower()

        # 1. Variables primarias
        edad_gt_6 = int(data.get("edad_mayor_6", 0))
        fem = int(data.get("genero_femenino", 0))
        fiebre = float(data.get("duracion_fiebre", 4.0))
        hipotension = int(data.get("hipotension", 0))
        vomitos = int(data.get("vomitos", 0))
        dolor_abd = int(data.get("dolor_abdominal", 0))
        sangrado = int(data.get("sangrado", 0))
        organomegalia = int(data.get("organomegalia", 0))
        hb = float(data.get("hb", 13.0))
        pcv = float(data.get("pcv", 39.0))
        wbc = float(data.get("highest_wbc", 5000.0))
        plaquetas = float(data.get("platelet_count", 120000.0))
        alt = float(data.get("alt", 25.0))

        # 2. Features derivadas según pipeline F1000Research
        pcv_ge_42 = 1 if pcv >= 42.0 else 0
        plaquetas_le_75k = 1 if plaquetas <= 75000.0 else 0
        wbc_ge_7k = 1 if wbc >= 7000.0 else 0
        alt_ge_70 = 1 if alt >= 70.0 else 0
        fiebre_ge_6d = 1 if fiebre >= 6.0 else 0

        # Score Clínico Ponderado F1000Research (0 a 7 puntos)
        score_clinico = (
            hipotension * 3 +
            pcv_ge_42 * 1 +
            plaquetas_le_75k * 1 +
            wbc_ge_7k * 1 +
            alt_ge_70 * 1
        )
        indice_hemo_plaqueta = (pcv / (plaquetas + 1e-5)) * 100000.0
        hb_pcv_ratio = hb / (pcv + 1e-5)

        vector_map = {
            'EDAD_MAYOR_6': edad_gt_6,
            'GENERO_FEMENINO': fem,
            'DURATION OF FEVER': fiebre,
            'VOMITING': vomitos,
            'ABDOMINAL PAIN': dolor_abd,
            'BLEEDING': sangrado,
            'HIPOTENSION': hipotension,
            'ORGANOMEGALY': organomegalia,
            'HB': hb,
            'PCV': pcv,
            'HIGHEST WBC': wbc,
            'PLATELET COUNT': plaquetas,
            'ALT': alt,
            'PCV_GE_42': pcv_ge_42,
            'PLAQUETAS_LE_75K': plaquetas_le_75k,
            'WBC_GE_7K': wbc_ge_7k,
            'ALT_GE_70': alt_ge_70,
            'FIEBRE_GE_6D': fiebre_ge_6d,
            'SCORE_CLINICO': score_clinico,
            'INDICE_HEMO_PLAQUETA': indice_hemo_plaqueta,
            'HB_PCV_RATIO': hb_pcv_ratio
        }

        X_raw = np.array([[vector_map[col] for col in feature_names]], dtype=np.float32)
        X_scaled = scaler.transform(X_raw)

        # 3. Predicciones simultáneas de ambos modelos
        prob_lr = float(modelo_lr.predict_proba(X_scaled)[0][1])
        prob_ann = float(modelo_ann.predict(X_scaled, verbose=0)[0][0])
        prob_ensemble = float((prob_lr + prob_ann) / 2.0)

        # Seleccionar modelo para la probabilidad primaria
        if "ann" in modelo_sel:
            prob_principal = prob_ann
            nombre_modelo = "Red Neuronal Artificial (ANN)"
        elif "ensamble" in modelo_sel or "consenso" in modelo_sel:
            prob_principal = prob_ensemble
            nombre_modelo = "Consenso Ensamble (LR + ANN)"
        else:
            prob_principal = prob_lr
            nombre_modelo = "Regresión Logística"

        # 4. Auditoría de Criterios de Alarma Activos
        factores = []
        if hipotension:
            factores.append({"tipo": "critico", "texto": "Hipotensión arterial / Signos de Choque al ingreso (+3 pts)"})
        if pcv_ge_42:
            factores.append({"tipo": "laboratorio", "texto": f"Hemoconcentración crítica: PCV {pcv:.1f}% ≥ 42% (+1 pt)"})
        if plaquetas_le_75k:
            factores.append({"tipo": "laboratorio", "texto": f"Trombocitopenia severa: {int(plaquetas):,} plaquetas/mm³ ≤ 75k (+1 pt)"})
        if wbc_ge_7k:
            factores.append({"tipo": "laboratorio", "texto": f"Leucocitosis reactiva: {int(wbc):,} WBC/mm³ ≥ 7k (+1 pt)"})
        if alt_ge_70:
            factores.append({"tipo": "laboratorio", "texto": f"Injuria hepática aguda: ALT {alt:.0f} U/L ≥ 70 U/L (+1 pt)"})
        if sangrado:
            factores.append({"tipo": "clinico", "texto": "Manifestaciones de sangrado activo de mucosas o petequias"})
        if organomegalia:
            factores.append({"tipo": "clinico", "texto": "Hepatomegalia dolorosa (> 2 cm bajo reborde costal)"})
        if vomitos:
            factores.append({"tipo": "clinico", "texto": "Vómitos persistentes / intolerancia a la vía oral"})
        if dolor_abd:
            factores.append({"tipo": "clinico", "texto": "Dolor abdominal continuo e intenso"})
        if fiebre_ge_6d:
            factores.append({"tipo": "clinico", "texto": f"Fiebre prolongada ({fiebre:.0f} días) en fase crítica"})

        # 5. Estratificación Clínica y Conducta de Triaje
        # Umbrales concordantes con la práctica pediátrica (F1000Research y Guías OPS/OMS)
        if score_clinico >= 3 or prob_principal >= 0.70 or (hipotension and prob_principal >= 0.50):
            nivel = "ALTO"
            nivel_badge = "Riesgo Crítico / Choque por Dengue (DSS)"
            color = "rose"
            conducta = "Criterio de ingreso urgente a Unidad de Cuidados Intensivos Pediátricos (UCIP). Iniciar reanimación hemodinámica inmediata protocolizada con bolos de cristaloides isotónicos, monitorización invasiva continua, balance de diuresis estricto y tipificación de hemoderivados."
        elif score_clinico >= 2 or prob_principal >= 0.35:
            nivel = "MODERADO"
            nivel_badge = "Riesgo Moderado / Dengue con Signos de Alarma"
            color = "amber"
            conducta = "Hospitalización obligatoria inmediata en sala pediátrica para vigilancia hemodinámica estrecha. Hidratación parenteral de mantenimiento con reposición de pérdidas, control seriado de hematocrito y plaquetas cada 12 horas y evaluación de fuga plasmática."
        else:
            nivel = "BAJO"
            nivel_badge = "Riesgo Bajo / Dengue No Complicado"
            color = "emerald"
            conducta = "Candidato a manejo ambulatorio supervisado con control en 24 horas. Reposo en cama, hidratación oral abundante (SRO), antipiréticos (únicamente paracetamol, evitar AINEs) y educación rigurosa a padres sobre signos de alarma de consulta inmediata."

        # 6. Respuesta enriquecida
        return jsonify({
            "status": "success",
            "modelo_seleccionado": modelo_sel,
            "nombre_modelo": nombre_modelo,
            "probabilidad": round(prob_principal * 100, 2),
            "prob_lr": round(prob_lr * 100, 2),
            "prob_ann": round(prob_ann * 100, 2),
            "prob_ensemble": round(prob_ensemble * 100, 2),
            "nivel": nivel,
            "nivel_badge": nivel_badge,
            "color": color,
            "score": score_clinico,
            "conducta": conducta,
            "factores": factores,
            "indices": {
                "indice_hemo_plaqueta": round(indice_hemo_plaqueta, 2),
                "hb_pcv_ratio": round(hb_pcv_ratio, 3)
            }
        })

    except Exception as e:
        logger.error(f"Error procesando inferencia: {e}", exc_info=True)
        return jsonify({"status": "error", "message": str(e)}), 500


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    print(f"Servidor clínico CDSS activo en http://127.0.0.1:{port}")
    app.run(host="0.0.0.0", port=port, debug=False)
