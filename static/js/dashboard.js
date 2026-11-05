/**
 * ==============================================================================
 * DENGUERISK AI - CLINICAL DASHBOARD CLIENT SCRIPT
 * Full-Stack CDSS Client Logic (Live Sync, Chart.js, Clinical Presets, PDF/TXT Export)
 * ==============================================================================
 */

document.addEventListener("DOMContentLoaded", () => {
  // Inicializar iconos Lucide
  if (window.lucide) {
    lucide.createIcons();
  }

  // Elementos de Formulario
  const inputs = {
    edad: document.getElementById("input-edad"),
    genero: document.getElementById("input-genero"),
    fiebre: document.getElementById("input-fiebre"),
    fiebreVal: document.getElementById("val-fiebre"),
    hipotension: document.getElementById("input-hipotension"),
    hipotensionCard: document.getElementById("card-hipotension"),
    vomitos: document.getElementById("input-vomitos"),
    dolor: document.getElementById("input-dolor"),
    sangrado: document.getElementById("input-sangrado"),
    organomegalia: document.getElementById("input-organomegalia"),
    hb: document.getElementById("input-hb"),
    pcv: document.getElementById("input-pcv"),
    wbc: document.getElementById("input-wbc"),
    platelets: document.getElementById("input-platelets"),
    alt: document.getElementById("input-alt"),
  };

  // Badges Reactivos de Umbrales de Laboratorio
  const badges = {
    pcv: document.getElementById("badge-pcv-critico"),
    platelets: document.getElementById("badge-platelets-critico"),
    wbc: document.getElementById("badge-wbc-critico"),
    alt: document.getElementById("badge-alt-critico"),
    fiebre: document.getElementById("badge-fiebre-critico"),
  };

  // Elementos del Panel de Resultados
  const ui = {
    probPrincipal: document.getElementById("res-prob-principal"),
    badgeNivel: document.getElementById("res-badge-nivel"),
    nombreModelo: document.getElementById("res-nombre-modelo"),
    gaugeFill: document.getElementById("res-gauge-fill"),
    scoreNumero: document.getElementById("res-score-numero"),
    scoreBarra: document.getElementById("res-score-barra"),
    scoreDetalle: document.getElementById("res-score-detalle"),
    conductaTexto: document.getElementById("res-conducta-texto"),
    conductaCard: document.getElementById("res-conducta-card"),
    conductaIcono: document.getElementById("res-conducta-icono"),
    factoresLista: document.getElementById("res-factores-lista"),
    indiceHp: document.getElementById("res-indice-hp"),
    indiceHbPcv: document.getElementById("res-indice-hb-pcv"),
    deltaDiff: document.getElementById("res-delta-diff"),
    concordanciaBadge: document.getElementById("res-concordancia-badge"),
  };

  // Estado del modelo seleccionado y último resultado de inferencia
  let modeloActivo = "logistica";
  let comparisonChart = null;
  let debounceTimer = null;
  let ultimoResultado = null;

  // Inicializar Gráfica Comparativa de Modelos con Chart.js
  function initCharts() {
    const ctx = document.getElementById("comparisonChart");
    if (!ctx) return;

    comparisonChart = new Chart(ctx, {
      type: "bar",
      data: {
        labels: ["Regresión Logística", "Red Neuronal ANN", "Consenso Ensamble"],
        datasets: [
          {
            label: "% Probabilidad de Complicación Grave",
            data: [0, 0, 0],
            backgroundColor: [
              "rgba(14, 165, 233, 0.85)", // Sky Blue para Regresión Logística
              "rgba(168, 85, 247, 0.85)", // Purple para Red Neuronal ANN
              "rgba(59, 130, 246, 0.85)",  // Blue para Consenso
            ],
            borderColor: [
              "#38bdf8",
              "#c084fc",
              "#60a5fa",
            ],
            borderWidth: 1.5,
            borderRadius: 8,
            borderSkipped: false,
            barPercentage: 0.65,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: {
          duration: 400,
          easing: "easeOutQuart",
        },
        plugins: {
          legend: {
            display: false,
          },
          tooltip: {
            backgroundColor: "rgba(15, 23, 42, 0.95)",
            titleColor: "#f8fafc",
            bodyColor: "#cbd5e1",
            borderColor: "#334155",
            borderWidth: 1,
            padding: 10,
            displayColors: true,
            callbacks: {
              label: function (context) {
                return ` Riesgo Estimado: ${context.parsed.y.toFixed(1)}%`;
              },
            },
          },
        },
        scales: {
          y: {
            min: 0,
            max: 100,
            ticks: {
              color: "#64748b",
              font: { family: "'JetBrains Mono', monospace", size: 10 },
              callback: (val) => `${val}%`,
              stepSize: 25,
            },
            grid: {
              color: "rgba(51, 65, 85, 0.35)",
              drawBorder: false,
            },
          },
          x: {
            ticks: {
              color: "#94a3b8",
              font: { family: "'Plus Jakarta Sans', sans-serif", size: 11, weight: "600" },
            },
            grid: {
              display: false,
            },
          },
        },
      },
    });
  }

  // Actualizar visual de badges en tiempo real
  function actualizarBadgesReactivos() {
    const pcvVal = parseFloat(inputs.pcv.value) || 0;
    const plateletsVal = parseFloat(inputs.platelets.value) || 0;
    const wbcVal = parseFloat(inputs.wbc.value) || 0;
    const altVal = parseFloat(inputs.alt.value) || 0;
    const fiebreVal = parseFloat(inputs.fiebre.value) || 0;

    // Actualizar valor numérico de fiebre
    if (inputs.fiebreVal) {
      inputs.fiebreVal.textContent = `${fiebreVal} ${fiebreVal === 1 ? 'día' : 'días'}`;
    }

    // Hematocrito >= 42%
    if (badges.pcv) {
      if (pcvVal >= 42.0) {
        badges.pcv.classList.remove("hidden");
      } else {
        badges.pcv.classList.add("hidden");
      }
    }

    // Plaquetas <= 75k
    if (badges.platelets) {
      if (plateletsVal > 0 && plateletsVal <= 75000) {
        badges.platelets.classList.remove("hidden");
      } else {
        badges.platelets.classList.add("hidden");
      }
    }

    // Leucocitos >= 7,000
    if (badges.wbc) {
      if (wbcVal >= 7000) {
        badges.wbc.classList.remove("hidden");
      } else {
        badges.wbc.classList.add("hidden");
      }
    }

    // ALT >= 70 U/L
    if (badges.alt) {
      if (altVal >= 70) {
        badges.alt.classList.remove("hidden");
      } else {
        badges.alt.classList.add("hidden");
      }
    }

    // Fiebre >= 6 días
    if (badges.fiebre) {
      if (fiebreVal >= 6) {
        badges.fiebre.classList.remove("hidden");
      } else {
        badges.fiebre.classList.add("hidden");
      }
    }

    // Hipotensión Hero Card Highlight
    if (inputs.hipotension && inputs.hipotensionCard) {
      if (inputs.hipotension.checked) {
        inputs.hipotensionCard.classList.add("border-rose-500", "bg-rose-950/20", "clinical-card-glow-rose");
        inputs.hipotensionCard.classList.remove("border-slate-800", "bg-slate-900/40");
      } else {
        inputs.hipotensionCard.classList.remove("border-rose-500", "bg-rose-950/20", "clinical-card-glow-rose");
        inputs.hipotensionCard.classList.add("border-slate-800", "bg-slate-900/40");
      }
    }
  }

  // Función Principal de Inferencia y Actualización UI
  async function ejecutarInferencia() {
    actualizarBadgesReactivos();

    const payload = {
      modelo: modeloActivo,
      edad_mayor_6: parseInt(inputs.edad.value) || 0,
      genero_femenino: parseInt(inputs.genero.value) || 0,
      duracion_fiebre: parseFloat(inputs.fiebre.value) || 4.0,
      hipotension: inputs.hipotension.checked ? 1 : 0,
      vomitos: inputs.vomitos.checked ? 1 : 0,
      dolor_abdominal: inputs.dolor.checked ? 1 : 0,
      sangrado: inputs.sangrado.checked ? 1 : 0,
      organomegalia: inputs.organomegalia.checked ? 1 : 0,
      hb: parseFloat(inputs.hb.value) || 13.0,
      pcv: parseFloat(inputs.pcv.value) || 39.0,
      highest_wbc: parseFloat(inputs.wbc.value) || 5000.0,
      platelet_count: parseFloat(inputs.platelets.value) || 120000.0,
      alt: parseFloat(inputs.alt.value) || 25.0,
    };

    try {
      const response = await fetch("/api/predecir", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) throw new Error("Error en el servidor de inferencia");
      const res = await response.json();
      ultimoResultado = { ...res, payload };

      renderizarResultados(res);
    } catch (err) {
      console.error("Error al predecir:", err);
    }
  }

  // Renderizar Resultados en el Dashboard
  function renderizarResultados(data) {
    const prob = data.probabilidad;
    const probLr = data.prob_lr;
    const probAnn = data.prob_ann;
    const probEns = data.prob_ensemble;

    // 1. Probabilidad Principal y Tacómetro Visual
    ui.probPrincipal.textContent = `${prob.toFixed(1)}%`;
    ui.nombreModelo.textContent = data.nombre_modelo;

    // Arco semicircular (SVG stroke-dashoffset)
    const dashMax = 251.2;
    const offset = dashMax - (dashMax * Math.min(100, Math.max(0, prob))) / 100;
    ui.gaugeFill.style.strokeDashoffset = offset;

    // Color del tacómetro según nivel
    let colorHex = "#10b981"; // Emerald
    let badgeClass = "bg-emerald-500/15 text-emerald-400 border-emerald-500/30";
    let conductaCardClass = "border-emerald-500/30 bg-emerald-950/20";
    let iconName = "check-circle";

    if (data.nivel === "ALTO") {
      colorHex = "#ef4444"; // Rose / Red
      badgeClass = "bg-rose-500/20 text-rose-400 border-rose-500/40 shadow-rose-950/50";
      conductaCardClass = "border-rose-500/40 bg-rose-950/25";
      iconName = "alert-octagon";
    } else if (data.nivel === "MODERADO") {
      colorHex = "#f59e0b"; // Amber / Yellow
      badgeClass = "bg-amber-500/20 text-amber-300 border-amber-500/40 shadow-amber-950/50";
      conductaCardClass = "border-amber-500/40 bg-amber-950/25";
      iconName = "alert-triangle";
    }

    ui.gaugeFill.style.stroke = colorHex;
    ui.badgeNivel.className = `px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border shadow-sm transition-all duration-300 flex items-center gap-1.5 ${badgeClass}`;
    ui.badgeNivel.innerHTML = `<span class="w-1.5 h-1.5 rounded-full pulse-led" style="background-color: ${colorHex}"></span>${data.nivel_badge}`;

    // 2. Gráfica Comparativa de Modelos
    if (comparisonChart) {
      comparisonChart.data.datasets[0].data = [probLr, probAnn, probEns];
      comparisonChart.update();
    }

    // Análisis de Concordancia entre modelos
    const delta = Math.abs(probLr - probAnn);
    ui.deltaDiff.textContent = `Δ ${delta.toFixed(1)}%`;
    if (delta <= 15) {
      ui.concordanciaBadge.className = "px-1.5 py-0.2 rounded text-[10px] font-semibold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30";
      ui.concordanciaBadge.textContent = "Alta Concordancia";
    } else if (delta <= 30) {
      ui.concordanciaBadge.className = "px-1.5 py-0.2 rounded text-[10px] font-semibold bg-amber-500/15 text-amber-300 border border-amber-500/30";
      ui.concordanciaBadge.textContent = "Divergencia Moderada";
    } else {
      ui.concordanciaBadge.className = "px-1.5 py-0.2 rounded text-[10px] font-semibold bg-rose-500/15 text-rose-300 border border-rose-500/30";
      ui.concordanciaBadge.textContent = "Discrepancia Notoria";
    }

    // 3. Score Clínico F1000Research
    ui.scoreNumero.textContent = `${data.score} / 7`;
    const scorePct = Math.min(100, (data.score / 7) * 100);
    ui.scoreBarra.style.width = `${scorePct}%`;
    
    if (data.score >= 3) {
      ui.scoreBarra.className = "h-2 rounded-full bg-rose-500 transition-all duration-500";
      ui.scoreDetalle.textContent = "≥ 3 pts: Criterio directo de Choque y Fuga Plasmática";
      ui.scoreDetalle.className = "text-[11px] text-rose-400 font-medium";
    } else if (data.score >= 2) {
      ui.scoreBarra.className = "h-2 rounded-full bg-amber-500 transition-all duration-500";
      ui.scoreDetalle.textContent = "2 pts: Signos de alarma presentes. Vigilancia obligatoria";
      ui.scoreDetalle.className = "text-[11px] text-amber-400 font-medium";
    } else {
      ui.scoreBarra.className = "h-2 rounded-full bg-emerald-500 transition-all duration-500";
      ui.scoreDetalle.textContent = "< 2 pts: Sin criterios de complicación por score";
      ui.scoreDetalle.className = "text-[11px] text-slate-400";
    }

    // 4. Índices Calculados
    if (data.indices) {
      ui.indiceHp.textContent = data.indices.indice_hemo_plaqueta.toFixed(1);
      ui.indiceHbPcv.textContent = data.indices.hb_pcv_ratio.toFixed(2);
    }

    // 5. Conducta Médica
    ui.conductaTexto.textContent = data.conducta;
    ui.conductaCard.className = `p-3 rounded-xl border text-xs leading-relaxed transition-all duration-300 flex items-start gap-2.5 ${conductaCardClass}`;
    ui.conductaIcono.setAttribute("data-lucide", iconName);

    // 6. Factores de Riesgo / Criterios Activos
    ui.factoresLista.innerHTML = "";
    if (data.factores && data.factores.length > 0) {
      data.factores.forEach((f) => {
        const item = document.createElement("div");
        let itemClass = "bg-slate-800/60 border-slate-700/60 text-slate-300";
        let dotColor = "bg-cyan-400";

        if (f.tipo === "critico") {
          itemClass = "bg-rose-950/30 border-rose-500/40 text-rose-300 font-medium";
          dotColor = "bg-rose-500 animate-pulse";
        } else if (f.tipo === "laboratorio") {
          itemClass = "bg-amber-950/30 border-amber-500/40 text-amber-200 font-medium";
          dotColor = "bg-amber-400";
        }

        item.className = `flex items-center gap-2 p-1.5 rounded-lg border text-xs ${itemClass}`;
        item.innerHTML = `<span class="w-1.5 h-1.5 rounded-full ${dotColor} shrink-0"></span><span>${f.texto}</span>`;
        ui.factoresLista.appendChild(item);
      });
    } else {
      const item = document.createElement("div");
      item.className = "p-2 rounded-lg border border-dashed border-slate-800 text-xs text-slate-400 italic text-center";
      item.textContent = "Ningún criterio mayor o alteración de laboratorio detectada.";
      ui.factoresLista.appendChild(item);
    }

    // Refrescar iconos Lucide inyectados
    if (window.lucide) {
      lucide.createIcons();
    }
  }

  // Listener con Debounce para cambios en inputs
  function onInputChange() {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      ejecutarInferencia();
    }, 120);
  }

  // Registrar listeners en todos los controles
  Object.values(inputs).forEach((input) => {
    if (input) {
      input.addEventListener("input", onInputChange);
      input.addEventListener("change", onInputChange);
    }
  });

  // Selector de Modelo (Tabs)
  const modelTabs = document.querySelectorAll(".model-tab-btn");
  modelTabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      modelTabs.forEach((t) => {
        t.classList.remove("active-tab", "bg-sky-500", "text-white");
        t.classList.add("bg-slate-800/80", "text-slate-400", "hover:text-slate-200");
      });
      tab.classList.add("active-tab", "bg-sky-500", "text-white");
      tab.classList.remove("bg-slate-800/80", "text-slate-400", "hover:text-slate-200");
      
      modeloActivo = tab.getAttribute("data-model");
      ejecutarInferencia();
    });
  });

  // Función Central de Reseteo a Valores Basales
  function restaurarFormulario() {
    inputs.edad.value = "1";
    inputs.genero.value = "0";
    inputs.fiebre.value = "4";
    inputs.hipotension.checked = false;
    inputs.vomitos.checked = false;
    inputs.dolor.checked = false;
    inputs.sangrado.checked = false;
    inputs.organomegalia.checked = false;
    inputs.hb.value = "13.0";
    inputs.pcv.value = "38.5";
    inputs.wbc.value = "5000";
    inputs.platelets.value = "135000";
    inputs.alt.value = "25";
    ejecutarInferencia();
  }

  // Botón de Limpiar Formulario (al pie del formulario)
  const btnLimpiarBottom = document.getElementById("btn-limpiar-formulario-bottom");
  if (btnLimpiarBottom) {
    btnLimpiarBottom.addEventListener("click", restaurarFormulario);
  }

  // Presets Clínicos
  const btnPresets = {
    leve: document.getElementById("btn-preset-leve"),
    moderado: document.getElementById("btn-preset-moderado"),
    grave: document.getElementById("btn-preset-grave"),
  };

  if (btnPresets.leve) {
    btnPresets.leve.addEventListener("click", () => {
      inputs.edad.value = "1";
      inputs.genero.value = "0";
      inputs.fiebre.value = "3";
      inputs.hipotension.checked = false;
      inputs.vomitos.checked = false;
      inputs.dolor.checked = false;
      inputs.sangrado.checked = false;
      inputs.organomegalia.checked = false;
      inputs.hb.value = "12.4";
      inputs.pcv.value = "36.5";
      inputs.wbc.value = "4200";
      inputs.platelets.value = "175000";
      inputs.alt.value = "22";
      ejecutarInferencia();
    });
  }

  if (btnPresets.moderado) {
    btnPresets.moderado.addEventListener("click", () => {
      inputs.edad.value = "0";
      inputs.genero.value = "1";
      inputs.fiebre.value = "5";
      inputs.hipotension.checked = false;
      inputs.vomitos.checked = true;
      inputs.dolor.checked = true;
      inputs.sangrado.checked = false;
      inputs.organomegalia.checked = false;
      inputs.hb.value = "14.2";
      inputs.pcv.value = "43.0"; // Hemoconcentración (+1 pt)
      inputs.wbc.value = "6800";
      inputs.platelets.value = "82000";
      inputs.alt.value = "48";
      ejecutarInferencia();
    });
  }

  if (btnPresets.grave) {
    btnPresets.grave.addEventListener("click", () => {
      inputs.edad.value = "1";
      inputs.genero.value = "1";
      inputs.fiebre.value = "4";
      inputs.hipotension.checked = true; // +3 pts
      inputs.vomitos.checked = true;
      inputs.dolor.checked = true;
      inputs.sangrado.checked = true;
      inputs.organomegalia.checked = true;
      inputs.hb.value = "16.8";
      inputs.pcv.value = "49.5"; // +1 pt
      inputs.wbc.value = "11800"; // +1 pt
      inputs.platelets.value = "24000"; // +1 pt
      inputs.alt.value = "195"; // +1 pt
      ejecutarInferencia();
    });
  }

  // ==========================================================================
  // EXPORTACIÓN A PDF (PRINT) Y TXT
  // ==========================================================================
  const btnExportarPdf = document.getElementById("btn-exportar-pdf");
  const btnExportarTxt = document.getElementById("btn-exportar-txt");

  function poblarPlantillaImpresion() {
    if (!ultimoResultado) return;
    const now = new Date();
    const idUnico = `CDSS-${now.getFullYear()}${String(now.getMonth()+1).padStart(2,'0')}${String(now.getDate()).padStart(2,'0')}-${Math.floor(1000 + Math.random() * 9000)}`;

    document.getElementById("print-fecha").textContent = now.toLocaleString("es-ES");
    document.getElementById("print-id").textContent = idUnico;

    document.getElementById("print-edad").textContent = inputs.edad.value === "0" ? "≤ 6 años (Primera Infancia)" : "> 6 años (Escolar / Adolescente)";
    document.getElementById("print-genero").textContent = inputs.genero.value === "1" ? "Femenino" : "Masculino";
    document.getElementById("print-fiebre").textContent = `${inputs.fiebre.value} días de evolución`;

    const listaSignos = document.getElementById("print-signos");
    listaSignos.innerHTML = "";
    const signos = [];
    if (inputs.hipotension.checked) signos.push("Hipotensión arterial / Signos de Choque (+3 pts)");
    if (inputs.vomitos.checked) signos.push("Vómitos persistentes / intolerancia oral");
    if (inputs.dolor.checked) signos.push("Dolor abdominal continuo e intenso");
    if (inputs.sangrado.checked) signos.push("Sangrado espontáneo (petequias / mucosas)");
    if (inputs.organomegalia.checked) signos.push("Organomegalia (Hepatomegalia > 2 cm)");

    if (signos.length > 0) {
      signos.forEach(s => {
        const li = document.createElement("li");
        li.textContent = s;
        listaSignos.appendChild(li);
      });
    } else {
      const li = document.createElement("li");
      li.textContent = "Sin signos clínicos de alarma al examen físico inicial.";
      listaSignos.appendChild(li);
    }

    document.getElementById("print-hb").textContent = inputs.hb.value;
    document.getElementById("print-pcv").textContent = inputs.pcv.value;
    document.getElementById("print-platelets").textContent = Number(inputs.platelets.value).toLocaleString("es-ES");
    document.getElementById("print-wbc").textContent = Number(inputs.wbc.value).toLocaleString("es-ES");
    document.getElementById("print-alt").textContent = inputs.alt.value;

    document.getElementById("print-prob-lr").textContent = `${ultimoResultado.prob_lr.toFixed(1)}%`;
    document.getElementById("print-prob-ann").textContent = `${ultimoResultado.prob_ann.toFixed(1)}%`;
    document.getElementById("print-prob-ens").textContent = `${ultimoResultado.prob_ensemble.toFixed(1)}%`;

    document.getElementById("print-score").textContent = `${ultimoResultado.score} / 7 puntos`;
    document.getElementById("print-nivel").textContent = `${ultimoResultado.nivel_badge} (Modelo activo: ${ultimoResultado.nombre_modelo})`;
    document.getElementById("print-conducta").textContent = ultimoResultado.conducta;
  }

  if (btnExportarPdf) {
    btnExportarPdf.addEventListener("click", () => {
      poblarPlantillaImpresion();
      window.print();
    });
  }

  if (btnExportarTxt) {
    btnExportarTxt.addEventListener("click", () => {
      if (!ultimoResultado) return;
      const now = new Date();
      const fechaStr = now.toISOString().slice(0, 10);
      const edadStr = inputs.edad.value === "0" ? "≤ 6 años" : "> 6 años";
      const generoStr = inputs.genero.value === "1" ? "Femenino" : "Masculino";

      let factoresStr = "";
      if (ultimoResultado.factores && ultimoResultado.factores.length > 0) {
        factoresStr = ultimoResultado.factores.map(f => `  * ${f.texto}`).join("\n");
      } else {
        factoresStr = "  * Sin criterios de alarma detectados.";
      }

      const txtContent = `================================================================================
INFORME CLÍNICO DE TRIAJE Y PREDICCIÓN DE DENGUE PEDIÁTRICO (CDSS)
Cohorte F1000Research - Antigravity AI
================================================================================
Fecha de emisión: ${now.toLocaleString("es-ES")}
ID de Evaluación: CDSS-${Date.now()}

1. DATOS DEMOGRÁFICOS Y ANAMNESIS:
   - Grupo Etario: ${edadStr}
   - Género: ${generoStr}
   - Días de Fiebre: ${inputs.fiebre.value} días

2. CONSTANTES CLÍNICAS Y EXAMEN FÍSICO:
   - Hipotensión / Signos de Choque: ${inputs.hipotension.checked ? "SÍ (+3 pts F1000Research)" : "NO"}
   - Vómitos Persistentes: ${inputs.vomitos.checked ? "SÍ" : "NO"}
   - Dolor Abdominal Continuo: ${inputs.dolor.checked ? "SÍ" : "NO"}
   - Sangrado Espontáneo: ${inputs.sangrado.checked ? "SÍ" : "NO"}
   - Organomegalia (> 2 cm): ${inputs.organomegalia.checked ? "SÍ" : "NO"}

3. PARÁMETROS HEMATOLÓGICOS Y HEPÁTICOS:
   - Hemoglobina (Hb): ${inputs.hb.value} g/dL (Ref: 11.5 - 15.5)
   - Hematocrito (PCV): ${inputs.pcv.value}% (Alarma si >= 42%)
   - Plaquetas: ${Number(inputs.platelets.value).toLocaleString("es-ES")} /mm³ (Alarma si <= 75,000)
   - Leucocitos (WBC): ${Number(inputs.wbc.value).toLocaleString("es-ES")} /mm³ (Alarma si >= 7,000)
   - ALT Transaminasa: ${inputs.alt.value} U/L (Alarma si >= 70)
   - Ratio Hb/PCV: ${ultimoResultado.indices ? ultimoResultado.indices.hb_pcv_ratio : "--"}
   - Índice Hemo-Plaquetario: ${ultimoResultado.indices ? ultimoResultado.indices.indice_hemo_plaqueta : "--"}

4. RESULTADOS DE LOS MODELOS DE MACHINE LEARNING:
   - Modelo Primario Seleccionado: ${ultimoResultado.nombre_modelo}
   - Probabilidad Complicación Grave (LR): ${ultimoResultado.prob_lr.toFixed(1)}% (ROC-AUC 97.1%)
   - Probabilidad Complicación Grave (ANN): ${ultimoResultado.prob_ann.toFixed(1)}% (Recall 100%)
   - Probabilidad Consenso Ensamble: ${ultimoResultado.prob_ensemble.toFixed(1)}%
   - Score F1000Research: ${ultimoResultado.score} / 7 puntos
   - Estratificación de Riesgo: ${ultimoResultado.nivel_badge}

5. CRITERIOS DE ALARMA DETECTADOS:
${factoresStr}

6. CONDUCTA MÉDICA PROTOCOLIZADA:
${ultimoResultado.conducta}

================================================================================
Documento generado como soporte para la toma de decisiones clínicas pediátricas.
================================================================================`;

      const blob = new Blob([txtContent], { type: "text/plain;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `ficha_triaje_dengue_${fechaStr}_${now.getHours()}${now.getMinutes()}.txt`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    });
  }

  // Modal de Métricas Técnicas y Matrices de Confusión
  const modalMetricas = document.getElementById("modal-metricas");
  const btnAbrirModal = document.getElementById("btn-abrir-modal-metricas");
  const btnCerrarModal = document.getElementById("btn-cerrar-modal-metricas");

  if (btnAbrirModal && modalMetricas) {
    btnAbrirModal.addEventListener("click", () => {
      modalMetricas.classList.remove("hidden");
    });
  }

  if (btnCerrarModal && modalMetricas) {
    btnCerrarModal.addEventListener("click", () => {
      modalMetricas.classList.add("hidden");
    });
  }

  if (modalMetricas) {
    modalMetricas.addEventListener("click", (e) => {
      if (e.target === modalMetricas) {
        modalMetricas.classList.add("hidden");
      }
    });
    window.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && !modalMetricas.classList.contains("hidden")) {
        modalMetricas.classList.add("hidden");
      }
    });
  }

  // Inicialización
  initCharts();
  ejecutarInferencia();
});
