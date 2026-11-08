"""
=================================================================================
PREDICTOR CLÍNICO DE DENGUE PEDIÁTRICO (F1000Research Cohort)
Dashboard Clínico y Analítico con Triaje Individual y Predicción por Lotes
Flask + Tailwind CSS + Chart.js
=================================================================================
"""

import os
import sys
import json
import logging
import io
import joblib
import numpy as np
import pandas as pd

# Suprimir advertencias y telemetría de TensorFlow
os.environ['TF_CPP_MIN_LOG_LEVEL'] = '2'
os.environ['TF_ENABLE_ONEDNN_OPTS'] = '0'
import tensorflow as tf
from flask import Flask, request, jsonify, render_template, send_file, Response

logging.basicConfig(level=logging.INFO, format='%(asctime)s [%(levelname)s] %(message)s')
logger = logging.getLogger("AppDengueDashboard")

# Configuración de rutas y Flask
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
MODELS_DIR = os.path.join(BASE_DIR, "models")
DATA_DIR = os.path.join(BASE_DIR, "data")
TEMPLATES_DIR = os.path.join(BASE_DIR, "templates")
STATIC_DIR = os.path.join(BASE_DIR, "static")

app = Flask(__name__, template_folder=TEMPLATES_DIR, static_folder=STATIC_DIR)
app.config['TEMPLATES_AUTO_RELOAD'] = True

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


def procesar_lote_dataframe(df: pd.DataFrame, modelo_sel: str = "ann") -> dict:
    """
    Procesa un DataFrame con múltiples pacientes para inferencia masiva por lotes.
    Soporta nombres de columnas tanto en español como del dataset original en inglés.
    """
    df_in = df.copy()
    # Normalizar nombres de columnas a minúsculas sin espacios
    col_map = {c: c.strip().lower().replace(" ", "_") for c in df_in.columns}
    df_in.rename(columns=col_map, inplace=True)

    def get_col(candidates, default_val=0.0):
        for c in candidates:
            if c in df_in.columns:
                return df_in[c]
        return pd.Series([default_val] * len(df_in), index=df_in.index)

    # Identificador de paciente
    id_series = get_col(["id_paciente", "id", "paciente", "patient_id", "codigo"], None)
    if id_series.iloc[0] is None:
        id_series = pd.Series([f"PAC-{i+1:03d}" for i in range(len(df_in))], index=df_in.index)

    # Extraer y normalizar variables clínicas
    # Edad: si viene como 1/2 (dataset original) o 0/1
    raw_edad = get_col(["edad_mayor_6", "edad", "age"], 1)
    edad_gt_6 = raw_edad.apply(lambda v: 1 if v in [1, 2, "1", "2", "> 6 años", ">6", True] and int(v) in [1, 2] and v == 2 else (1 if v in [1, "1", "> 6 años", ">6", True] else 0)).astype(int)

    raw_gen = get_col(["genero_femenino", "genero", "gender", "sexo"], 0)
    genero_fem = raw_gen.apply(lambda v: 1 if v in [2, "2", "f", "femenino", "female", 1, "1"] and (v == 2 or str(v).lower().startswith("f")) else 0).astype(int)

    fiebre = pd.to_numeric(get_col(["duracion_fiebre", "fiebre", "duration_of_fever", "dias_fiebre"], 4.0), errors="coerce").fillna(4.0)

    # Hipotensión: en dataset original 1=Normal, 2=Hipotensión. En plantilla 1=Hipotensión, 0=Normal.
    raw_hipo = get_col(["hipotension", "bp_at_admission", "blood_pressure", "presion_baja"], 0)
    hipotension = raw_hipo.apply(lambda v: 1 if v == 2 or v in [1, "1", "si", "sí", True, "yes"] and str(v).lower() not in ["0", "no", "false"] else 0).astype(int)

    # Síntomas (1=Presente, 0=Ausente)
    def parse_binary(col_names):
        s = get_col(col_names, 0)
        return s.apply(lambda v: 1 if v in [1, "1", "si", "sí", True, "yes"] else 0).astype(int)

    vomitos = parse_binary(["vomitos", "vomiting", "vomito"])
    dolor_abd = parse_binary(["dolor_abdominal", "abdominal_pain", "dolor"])
    sangrado = parse_binary(["sangrado", "bleeding", "hemorragia"])
    organomegalia = parse_binary(["organomegalia", "organomegaly", "hepatomegalia"])

    # Laboratorios
    hb = pd.to_numeric(get_col(["hb", "hemoglobina", "haemoglobin"], 13.0), errors="coerce").fillna(13.0)
    pcv = pd.to_numeric(get_col(["pcv", "hematocrito", "packed_cell_volume"], 39.0), errors="coerce").fillna(39.0)
    wbc = pd.to_numeric(get_col(["highest_wbc", "wbc", "leucocitos", "leucocitos_max"], 5000.0), errors="coerce").fillna(5000.0)
    plaquetas = pd.to_numeric(get_col(["platelet_count", "plaquetas", "platelet", "recuento_plaquetas"], 120000.0), errors="coerce").fillna(120000.0)
    alt = pd.to_numeric(get_col(["alt", "transaminasa_alt", "alanina_aminotransferasa"], 25.0), errors="coerce").fillna(25.0)

    # Features derivadas según pipeline F1000Research
    pcv_ge_42 = (pcv >= 42.0).astype(int)
    plaquetas_le_75k = (plaquetas <= 75000.0).astype(int)
    wbc_ge_7k = (wbc >= 7000.0).astype(int)
    alt_ge_70 = (alt >= 70.0).astype(int)
    fiebre_ge_6d = (fiebre >= 6.0).astype(int)

    score_clinico = (
        hipotension * 3 +
        pcv_ge_42 * 1 +
        plaquetas_le_75k * 1 +
        wbc_ge_7k * 1 +
        alt_ge_70 * 1
    )
    indice_hemo_plaqueta = (pcv / (plaquetas + 1e-5)) * 100000.0
    hb_pcv_ratio = hb / (pcv + 1e-5)

    # Matriz para inferencia
    feature_dict = {
        'EDAD_MAYOR_6': edad_gt_6,
        'GENERO_FEMENINO': genero_fem,
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

    X_raw = np.column_stack([feature_dict[col].values for col in feature_names])
    X_scaled = scaler.transform(X_raw)

    # Predicción por lotes vectorizada
    prob_lr = modelo_lr.predict_proba(X_scaled)[:, 1]
    prob_ann = modelo_ann.predict(X_scaled, verbose=0).ravel()
    prob_ens = (prob_lr + prob_ann) / 2.0

    modelo_sel_norm = str(modelo_sel).lower()
    if "ann" in modelo_sel_norm:
        prob_final = prob_ann
        nombre_modelo = "Red Neuronal Artificial (ANN)"
    elif "ensamble" in modelo_sel_norm or "consenso" in modelo_sel_norm:
        prob_final = prob_ens
        nombre_modelo = "Consenso Ensamble (LR + ANN)"
    else:
        prob_final = prob_lr
        nombre_modelo = "Regresión Logística"

    # Construir lista de pacientes y métricas agregadas
    pacientes_out = []
    conteo_alto = 0
    conteo_moderado = 0
    conteo_bajo = 0
    distribucion_scores = [0] * 8  # 0 a 7

    for i in range(len(df_in)):
        p = float(prob_final[i])
        sc = int(score_clinico.iloc[i])
        hipo_flag = bool(hipotension.iloc[i] == 1)

        if sc >= 3 or p >= 0.70 or (hipo_flag and p >= 0.50):
            nivel = "ALTO"
            nivel_badge = "Riesgo Crítico / UCIP"
            color = "rose"
            conducta = "Ingreso urgente a UCIP. Reanimación hemodinámica inmediata protocolizada."
            conteo_alto += 1
        elif sc >= 2 or p >= 0.35:
            nivel = "MODERADO"
            nivel_badge = "Riesgo Moderado / Sala"
            color = "amber"
            conducta = "Hospitalización obligatoria en sala pediátrica para observación estrecha de 12-24h."
            conteo_moderado += 1
        else:
            nivel = "BAJO"
            nivel_badge = "Riesgo Bajo / Ambulatorio"
            color = "emerald"
            conducta = "Manejo ambulatorio con vigilancia de signos de alarma e hidratación oral."
            conteo_bajo += 1

        if 0 <= sc <= 7:
            distribucion_scores[sc] += 1

        # Alertas individuales activas
        alertas = []
        if hipo_flag: alertas.append("Hipotensión (+3 pts)")
        if pcv_ge_42.iloc[i]: alertas.append("PCV ≥ 42% (+1 pt)")
        if plaquetas_le_75k.iloc[i]: alertas.append(f"Plaquetas ≤ 75k ({int(plaquetas.iloc[i]):,})")
        if wbc_ge_7k.iloc[i]: alertas.append(f"WBC ≥ 7k ({int(wbc.iloc[i]):,})")
        if alt_ge_70.iloc[i]: alertas.append(f"ALT ≥ 70 ({alt.iloc[i]:.0f} U/L)")
        if sangrado.iloc[i]: alertas.append("Sangrado activo")
        if organomegalia.iloc[i]: alertas.append("Organomegalia")

        pacientes_out.append({
            "id": str(id_series.iloc[i]),
            "edad": "> 6 años" if edad_gt_6.iloc[i] else "≤ 6 años",
            "genero": "Femenino" if genero_fem.iloc[i] else "Masculino",
            "fiebre": float(fiebre.iloc[i]),
            "hipotension": hipo_flag,
            "pcv": float(pcv.iloc[i]),
            "plaquetas": int(plaquetas.iloc[i]),
            "wbc": int(wbc.iloc[i]),
            "alt": float(alt.iloc[i]),
            "score_clinico": sc,
            "probabilidad": round(p * 100, 2),
            "prob_lr": round(float(prob_lr[i]) * 100, 2),
            "prob_ann": round(float(prob_ann[i]) * 100, 2),
            "nivel": nivel,
            "nivel_badge": nivel_badge,
            "color": color,
            "conducta": conducta,
            "alertas": alertas
        })

    total_pacientes = len(df_in)
    resumen = {
        "total": total_pacientes,
        "modelo_utilizado": nombre_modelo,
        "conteo_alto": conteo_alto,
        "porcentaje_alto": round((conteo_alto / total_pacientes) * 100, 1) if total_pacientes else 0,
        "conteo_moderado": conteo_moderado,
        "porcentaje_moderado": round((conteo_moderado / total_pacientes) * 100, 1) if total_pacientes else 0,
        "conteo_bajo": conteo_bajo,
        "porcentaje_bajo": round((conteo_bajo / total_pacientes) * 100, 1) if total_pacientes else 0,
        "probabilidad_promedio": round(float(np.mean(prob_final)) * 100, 2) if total_pacientes else 0,
        "tasa_hipotension": round((int(hipotension.sum()) / total_pacientes) * 100, 1) if total_pacientes else 0,
        "tasa_trombocitopenia": round((int(plaquetas_le_75k.sum()) / total_pacientes) * 100, 1) if total_pacientes else 0,
        "distribucion_scores": distribucion_scores,
        "chart_data_riesgo": [conteo_bajo, conteo_moderado, conteo_alto]
    }

    return {"resumen": resumen, "pacientes": pacientes_out}


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
    """Inferencia individual para un paciente."""
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


@app.route("/api/predecir_lote", methods=["POST"])
def api_predecir_lote():
    """
    Inferencia por lotes: procesa múltiples pacientes a partir de un archivo subido
    (CSV / Excel), o un lote de demostración clínico precargado.
    """
    try:
        modelo_sel = request.form.get("modelo", "ann")

        # 1. Caso: archivo subido
        if "file" in request.files and request.files["file"].filename != "":
            uploaded_file = request.files["file"]
            filename = uploaded_file.filename.lower()
            if filename.endswith(".csv"):
                df = pd.read_csv(uploaded_file)
            elif filename.endswith((".xls", ".xlsx")):
                df = pd.read_excel(uploaded_file)
            else:
                return jsonify({"status": "error", "message": "Formato de archivo no soportado. Suba un .csv o .xlsx."}), 400

        # 2. Caso: JSON payload con demo o lista de pacientes
        elif request.is_json:
            json_data = request.get_json(force=True)
            modelo_sel = json_data.get("modelo", modelo_sel)
            if json_data.get("demo") is True:
                demo_path = os.path.join(DATA_DIR, "lote_pacientes_demostracion.csv")
                df = pd.read_csv(demo_path)
            elif "pacientes" in json_data:
                df = pd.DataFrame(json_data["pacientes"])
            else:
                return jsonify({"status": "error", "message": "No se encontraron datos de pacientes."}), 400

        # 3. Fallback: cargar demostración si se solicita por parámetro form o query string
        elif request.form.get("demo") == "true" or request.args.get("demo") == "true":
            demo_path = os.path.join(DATA_DIR, "lote_pacientes_demostracion.csv")
            df = pd.read_csv(demo_path)
        else:
            return jsonify({"status": "error", "message": "Debe subir un archivo CSV/Excel o solicitar el lote demo."}), 400

        if df.empty:
            return jsonify({"status": "error", "message": "El archivo o lote no contiene registros."}), 400

        resultado_lote = procesar_lote_dataframe(df, modelo_sel=modelo_sel)
        return jsonify({"status": "success", **resultado_lote})

    except Exception as e:
        logger.error(f"Error en inferencia por lotes: {e}", exc_info=True)
        return jsonify({"status": "error", "message": f"Error procesando lote: {str(e)}"}), 500


@app.route("/api/descargar_plantilla", methods=["GET"])
def api_descargar_plantilla():
    """Descarga la plantilla CSV con el formato exacto de variables."""
    plantilla_path = os.path.join(DATA_DIR, "plantilla_pacientes_dengue.csv")
    if os.path.exists(plantilla_path):
        return send_file(
            plantilla_path,
            mimetype="text/csv",
            as_attachment=True,
            download_name="plantilla_pacientes_dengue.csv"
        )
    return jsonify({"error": "Plantilla no disponible"}), 404


@app.route("/api/descargar_lote_demo", methods=["GET"])
def api_descargar_lote_demo():
    """Descarga el lote de demostración clínica (30 pacientes) para pruebas."""
    demo_path = os.path.join(DATA_DIR, "lote_pacientes_demostracion.csv")
    if os.path.exists(demo_path):
        return send_file(
            demo_path,
            mimetype="text/csv",
            as_attachment=True,
            download_name="lote_pacientes_demostracion.csv"
        )
    return jsonify({"error": "Lote demo no disponible"}), 404


@app.route("/api/exportar_lote_csv", methods=["POST"])
def api_exportar_lote_csv():
    """Recibe los resultados procesados en JSON y retorna un CSV descargable."""
    try:
        data = request.get_json(force=True)
        pacientes = data.get("pacientes", [])
        if not pacientes:
            return jsonify({"error": "No hay pacientes para exportar"}), 400

        df_export = pd.DataFrame(pacientes)
        csv_buffer = io.StringIO()
        df_export.to_csv(csv_buffer, index=False, encoding="utf-8-sig")

        return Response(
            csv_buffer.getvalue(),
            mimetype="text/csv",
            headers={"Content-Disposition": "attachment; filename=resultados_prediccion_lote_dengue.csv"}
        )
    except Exception as e:
        logger.error(f"Error exportando CSV: {e}")
        return jsonify({"error": str(e)}), 500


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    print(f"Servidor clínico CDSS activo en http://127.0.0.1:{port}")
    app.run(host="0.0.0.0", port=port, debug=False)
