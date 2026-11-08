# Predictor Clínico de Dengue Pediátrico | Colab & Web Minimalista

> **Proyecto Universitario de Analítica de Datos y Triaje Médico Asistido por Inteligencia Artificial**  
> **Estudio Base:** *F1000Research (2022) — "Predictive scoring system for risk of complications in pediatric dengue infection"*  
> **Autores del Estudio:** Dr. Monisha Bhaskar, Dr. Soundarya Mahalingam, Dr. Harish M M, Dr. Basavaprabhu Achappa (Kasturba Medical College, Mangalore / Manipal Academy of Higher Education, India).  
> **DOI:** [10.12688/f1000research.111214.1](https://doi.org/10.12688/f1000research.111214.1)

---

## 📂 1. Estructura Exacta del Proyecto

El proyecto está diseñado bajo una arquitectura estrictamente profesional y minimalista:

```text
modelo_dengue_colab/
├── data/
│   ├── MASTER_CHART_F1000Research.xlsx     # Dataset real anonimizado (303 registros clínicos)
│   ├── plantilla_pacientes_dengue.csv      # Plantilla CSV estandarizada para predicción por lotes
│   └── lote_pacientes_demostracion.csv     # Lote clínico real de prueba (30 pacientes)
├── models/
│   ├── scaler.joblib                       # StandardScaler entrenado
│   ├── modelo_regresion_logistica.joblib   # Clasificador lineal Scikit-Learn (AUC 0.971)
│   ├── modelo_ann.keras                    # Red Neuronal Artificial TensorFlow/Keras (Recall 100%)
│   ├── features_config.json                # Configuración y orden canónico de features
│   └── metricas_modelos.json               # Métricas técnicas de validación independiente
├── templates/
│   └── index.html                          # Dashboard web con Triaje Individual y por Lotes
├── static/
│   ├── css/
│   │   └── dashboard.css                   # Estilos clínicos personalizados en modo oscuro
│   └── js/
│       └── dashboard.js                    # Lógica frontend reactiva, Chart.js y procesamiento batch
├── analisis_y_modelos.ipynb                # Cuaderno Jupyter estructurado (Google Colab con Lotes)
├── app.py                                  # Servidor Flask con API REST y módulo de inferencia masiva
├── requirements.txt                        # Lista estricta de dependencias
└── README.md                               # Documentación técnica, metodológica y universitaria
```

---

## 📓 2. Cuaderno Jupyter (`analisis_y_modelos.ipynb`)

El notebook está organizado en cuatro celdas ejecutables secuenciales, totalmente compatibles con Google Colab y JupyterLab:

### • Celda 1: Carga, Limpieza, Tratamiento de Nulos y Feature Engineering
- **Carga de Datos:** Lectura directa del archivo Excel maestro ($N = 303$ registros pediátricos).
- **Tratamiento de Nulos:** Imputación de `ALT` ($25.0 \text{ U/L}$) y `CREATININE` ($0.5 \text{ mg/dL}$) en la fila 283 con la mediana clínica del grupo no complicado, preservando la fidelidad biológica.
- **Eliminación Justificada de Columnas:**
  - `FERRITIN`: 112 valores nulos ($37.0\%$). Excluida por falta de disponibilidad en urgencias primarias y alto costo.
  - `IV FLUIDS`, `ANTIBIOTICS`, `ANTIPYRETICS`, `STEROIDS`: Eliminados para erradicar la **fuga de datos (Target Leakage)**, ya que son intervenciones terapéuticas administradas tras el ingreso.
  - `BREATHLESSNESS`: Solo 2 casos positivos en toda la cohorte ($p = 0.307$).
  - `LOWEST WBC`: Colineal con `HIGHEST WBC` ($r > 0.88$).
- **Recodificación Categórica y Alerta de Presión:**
  - `GROUPS`: $1 \rightarrow 0$ (Dengue no complicado), $2 \rightarrow 1$ (Dengue complicado).
  - `BP AT ADMISSION`: En el Excel original $1 = \text{Normotensión}$ y $2 = \text{Hipotensión}$. Se normaliza a `HIPOTENSION` ($1 =$ Hipotensión, $0 =$ Normal) para evitar invertir el predictor clínico más fuerte ($\text{OR} = 20.11$).
- **Feature Engineering Médico:**
  - `PCV_GE_42`: Hematocrito $\ge 42\%$ (hemoconcentración / fuga capilar).
  - `PLAQUETAS_LE_75K`: Plaquetas $\le 75,000 / \text{mm}^3$ (trombocitopenia de alto riesgo).
  - `WBC_GE_7K`: Leucocitos $\ge 7,000 / \text{mm}^3$ (respuesta inflamatoria).
  - `ALT_GE_70`: Transaminasa ALT $\ge 70 \text{ U/L}$ (daño hepático).
  - `SCORE_CLINICO`: Score ponderado validado en F1000Research:
    $$\text{Score} = (\text{Hipotensión} \times 3) + (\text{PCV} \ge 42 \times 1) + (\text{Plaquetas} \le 75000 \times 1) + (\text{WBC} \ge 7000 \times 1) + (\text{ALT} \ge 70 \times 1)$$
    Rango de 0 a 7 puntos. Punto de corte $\ge 2$ puntos según el Índice de Youden.
  - `INDICE_HEMO_PLAQUETA`: Bioíndice compuesto $\frac{\text{PCV}}{\text{Plaquetas}} \times 10^5$.

---

### • Celda 2: Modelado Predictivo y Evaluación Comparativa
División estratificada $80/20$ ($N_{\text{train}} = 242$, $N_{\text{test}} = 61$). Se entrenan dos modelos:
1. **Regresión Logística (Scikit-Learn):** Regularización $L_2$ ($C=0.5$), `class_weight='balanced'`.
2. **Red Neuronal Artificial - ANN (TensorFlow/Keras):** Arquitectura multicapa (Input 21 $\rightarrow$ Dense 32 ReLU + L2 + Dropout 0.3 $\rightarrow$ Dense 16 ReLU + L2 + Dropout 0.2 $\rightarrow$ Dense 8 ReLU $\rightarrow$ Dense 1 Sigmoide) con ponderación analítica de clases para mitigar el desbalance ($4:1$).

#### Resultados Comparativos en el Conjunto de Prueba Independiente:
| Métrica | Regresión Logística (Scikit-Learn) | Red Neuronal (ANN - Keras) |
| :--- | :---: | :---: |
| **Accuracy** | **81.97%** | **81.97%** |
| **Precision** | **54.55%** | **54.17%** |
| **Recall (Sensibilidad en Complicados)** | **92.31%** (12/13) | **100.00%** (13/13) 🎯 |
| **F1-Score** | **0.6857** | **0.7027** |
| **ROC-AUC** | **0.9712** | **0.9519** |
| **Matriz de Confusión** | $\begin{bmatrix} 38 & 10 \\ 1 & 12 \end{bmatrix}$ | $\begin{bmatrix} 37 & 11 \\ 0 & 13 \end{bmatrix}$ (0 Falsos Negativos) |

---

### • Celda 3: Exportación de Modelos
Exportación a la carpeta `models/`:
- `scaler.joblib`: Preprocesador de normalización.
- `modelo_regresion_logistica.joblib`: Clasificador lineal exportado.
- `modelo_ann.keras`: Red neuronal guardada en formato nativo Keras.
- `features_config.json`: Metadatos de features consumidos por `app.py`.

---

### • Celda 4: Predicción por Lotes y Análisis Epidemiológico de Cohortes ⭐
- Ejecuta inferencia masiva sobre tandas completas de pacientes cargadas desde un CSV.
- Computa de forma vectorizada el Score Clínico F1000Research, las probabilidades de complicación y las categorías de riesgo (Bajo / Moderado / Crítico).
- Genera el reporte epidemiológico agregado del turno (conteo de pacientes, tasa de hipotensión, tasa de trombocitopenia y promedio de riesgo).
- Exporta los resultados predichos a `data/resultados_lote_demostracion.csv`.

---

## 🌐 3. Aplicación Web Integral (`app.py`)

Desarrollada en Flask con dos modos de operación clínica:

### A. Modo 1: Triaje Individual (1 Paciente en Tiempo Real)
- Formulario clínico intuitivo con sliders y campos de laboratorio.
- Botones de casos clínicos de prueba: *"🟢 Leve"*, *"🟡 Alarma"* y *"🔴 Crítico"*.
- Tacómetro semafórico con probabilidad calculada, gráfica comparativa dinámica (LR vs ANN con Chart.js) y Score Clínico F1000.
- Exportación directa de la ficha clínica en formato imprimible PDF o texto plano (.TXT).

### B. Modo 2: Predicción y Triaje por Lotes (Batch Prediction) ⭐
- **Carga de Archivos Drag & Drop:** Soporte completo para archivos `.CSV` y `.XLSX`.
- **Botón de Demostración Inmediata:** Permite cargar y evaluar instantáneamente un lote clínico real de **30 pacientes** con solo 1 clic.
- **Plantilla Descargable:** Botón para descargar `plantilla_pacientes_dengue.csv` con columnas preformateadas.
- **KPIs Epidemiológicos del Lote:** Conteo y porcentaje de pacientes en **Criterio UCIP (Crítico)**, **Observación en Sala** y **Manejo Ambulatorio**.
- **Gráficas de Cohorte (Chart.js):**
  - Gráfica de Dona: Proporción semafórica de la cohorte.
  - Histograma: Distribución de Scores F1000Research ($0$ a $7$ puntos).
- **Tabla Dinámica con Filtros:** Filtro rápido por severidad (`Todos`, `Solo Críticos`, `Solo Moderados`, `Solo Bajos`) y buscador por ID.
- **Exportación de Resultados a CSV:** Descarga el listado completo de pacientes con sus predicciones y recomendaciones clínicas añadidas.

---

## 🏛️ 4. Criterios Universitarios y Profesionales

### A. Justificación del Volumen Esperado ($N = 303$) y Estructura de Datos
- **Fórmula de Tamaño Muestral:** Basada en la metodología de Pongpan et al.:
  $$n = \frac{Z^2 \cdot p \cdot q}{d^2}$$
  Con nivel de confianza del $95\%$ ($Z = 1.96$), prevalencia de interés $p = 0.51$, $q = 1 - p = 0.49$ y precisión relativa $d = 0.06$. El tamaño muestral mínimo exigido fue de $270$ pacientes. Con **303 registros consecutivos** analizados a lo largo de 5 años (2016-2020), la muestra supera holgadamente el rigor estadístico requerido.

### B. Frecuencia de Consulta y Privacidad de Datos Pediátricos
- **Frecuencia Operativa:** En brotes epidémicos estacionales vinculados a la temporada de lluvias o monzones, los servicios de urgencias pediátricas reciben entre **50 y 300 pacientes diarios**. La predicción por lotes resuelve el cuello de botella del triaje manual.
- **Privacidad Pediátrica (HIPAA / RGPD):**
  - **Inferencia en Memoria Efímera (*Stateless*):** La aplicación procesa los archivos CSV/Excel en la memoria RAM y no persiste registros en bases de datos hospitalarias sin autorización.
  - **Desidentificación Estricta (*Safe Harbor*):** No se recopilan nombres ni historiales médicos; se emplean códigos alfanuméricos (`PAC-001`).

### C. Costos Asociados y Casos Sectoriales de Aplicación
1. **Hospitales Pediátricos Universitarios (Tercer Nivel):**
   - Una cama de cuidados intensivos pediátricos (UCIP) cuesta entre **$800 y $3,500 USD por día**.
   - El sistema optimiza el flujo de camas críticas al detectar con precisión matemática qué niños requieren vigilancia invasiva vs. observación en piso.
2. **Ministerios de Salud y Vigilancia Epidemiológica:**
   - La predicción por lotes permite procesar censos diarios de centros de atención primaria para redistribuir oportunamente expansores plasmáticos (Lactato de Ringer) y concentrados plaquetarios.
3. **Centros de Salud Periféricos y Zonas Rurales Endémicas:**
   - Facilita a los coordinadores de urgencias rurales decidir qué pacientes deben ser derivados en ambulancia medicalizada hacia centros de mayor complejidad antes de que se instale el choque irreversible.

---

## 🚀 5. Ejecución Rápida

### 1. Instalar dependencias
```bash
pip install -r requirements.txt
```

### 2. Iniciar la Aplicación Web
```bash
python app.py
```
Abra en el navegador: **`http://127.0.0.1:5000`**

### 3. Probar la Predicción por Lotes
1. En la parte superior, haga clic en la pestaña **"Predicción por Lotes (Batch)"**.
2. Presione el botón **"⚡ Cargar Lote Demo (30 Pacientes)"** o suba su propio archivo CSV.
3. Observe el cálculo instantáneo de los KPIs epidemiológicos, las gráficas de cohorte y la tabla con filtros.
4. Haga clic en **"Descargar CSV"** para exportar el archivo con las predicciones generadas.
