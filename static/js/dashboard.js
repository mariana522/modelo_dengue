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

  // ============================================================================
  // MÓDULO DE PREDICCIÓN Y TRIAJE POR LOTES (BATCH PREDICTION) ⭐
  // ============================================================================
  const tabNavIndividual = document.getElementById("tab-nav-individual");
  const tabNavLotes = document.getElementById("tab-nav-lotes");
  const viewIndividual = document.getElementById("view-individual");
  const viewLotes = document.getElementById("view-lotes");
  const headerPresets = document.getElementById("header-presets-container");

  let batchModel = "ann";
  let batchDataActual = null;
  let batchDonutChart = null;
  let batchScoreBarChart = null;
  let archivoLoteSeleccionado = null;
  let filtroRiesgoActual = "todos";
  let busquedaActual = "";

  // 1. Toggles de Navegación entre Individual y Lotes
  if (tabNavIndividual && tabNavLotes && viewIndividual && viewLotes) {
    tabNavIndividual.addEventListener("click", () => {
      tabNavIndividual.className = "flex-1 sm:flex-none px-4 py-2.5 rounded-xl text-xs font-bold transition flex items-center justify-center gap-2 bg-sky-500 text-white shadow-md shadow-sky-500/25";
      tabNavLotes.className = "flex-1 sm:flex-none px-4 py-2.5 rounded-xl text-xs font-bold transition flex items-center justify-center gap-2 text-slate-400 hover:text-white hover:bg-slate-800/80 border border-transparent hover:border-slate-700";
      viewIndividual.classList.remove("hidden");
      viewLotes.classList.add("hidden");
      if (headerPresets) headerPresets.classList.remove("hidden");
      if (window.lucide) lucide.createIcons();
    });

    tabNavLotes.addEventListener("click", () => {
      tabNavLotes.className = "flex-1 sm:flex-none px-4 py-2.5 rounded-xl text-xs font-bold transition flex items-center justify-center gap-2 bg-purple-600 text-white shadow-md shadow-purple-600/25";
      tabNavIndividual.className = "flex-1 sm:flex-none px-4 py-2.5 rounded-xl text-xs font-bold transition flex items-center justify-center gap-2 text-slate-400 hover:text-white hover:bg-slate-800/80 border border-transparent hover:border-slate-700";
      viewIndividual.classList.add("hidden");
      viewLotes.classList.remove("hidden");
      if (headerPresets) headerPresets.classList.add("hidden");
      if (window.lucide) lucide.createIcons();
      if (!batchDataActual) {
        ejecutarLoteDemo();
      }
    });
  }

  // 2. Selector de Modelo para Lotes
  const batchModelTabs = document.querySelectorAll(".batch-model-tab");
  batchModelTabs.forEach(tab => {
    tab.addEventListener("click", () => {
      batchModelTabs.forEach(t => {
        t.className = "batch-model-tab py-1.5 px-2.5 rounded-lg font-bold text-center transition bg-slate-800 text-slate-400 hover:text-white flex items-center justify-center gap-1";
      });
      tab.className = "batch-model-tab py-1.5 px-2.5 rounded-lg font-bold text-center transition bg-purple-600 text-white shadow-sm flex items-center justify-center gap-1";
      batchModel = tab.dataset.batchModel || "ann";
      if (archivoLoteSeleccionado) {
        procesarArchivoLote(archivoLoteSeleccionado);
      } else if (batchDataActual) {
        ejecutarLoteDemo();
      }
    });
  });

  // 3. Dropzone & File Input
  const dropzoneLote = document.getElementById("dropzone-lote");
  const inputArchivoLote = document.getElementById("input-archivo-lote");
  const btnProcesarArchivo = document.getElementById("btn-procesar-archivo-cargado");
  const dropzoneTextoPrincipal = document.getElementById("dropzone-texto-principal");
  const dropzoneTextoSecundario = document.getElementById("dropzone-texto-secundario");
  const btnCargarDemoLote = document.getElementById("btn-cargar-demo-lote");

  if (dropzoneLote && inputArchivoLote) {
    dropzoneLote.addEventListener("click", () => inputArchivoLote.click());

    ["dragenter", "dragover"].forEach(evtName => {
      dropzoneLote.addEventListener(evtName, (e) => {
        e.preventDefault();
        dropzoneLote.classList.add("border-purple-400", "bg-purple-950/30");
      });
    });

    ["dragleave", "drop"].forEach(evtName => {
      dropzoneLote.addEventListener(evtName, (e) => {
        e.preventDefault();
        dropzoneLote.classList.remove("border-purple-400", "bg-purple-950/30");
      });
    });

    dropzoneLote.addEventListener("drop", (e) => {
      if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        manejarArchivoSeleccionado(e.dataTransfer.files[0]);
      }
    });

    inputArchivoLote.addEventListener("change", (e) => {
      if (e.target.files && e.target.files.length > 0) {
        manejarArchivoSeleccionado(e.target.files[0]);
      }
    });
  }

  function manejarArchivoSeleccionado(file) {
    archivoLoteSeleccionado = file;
    dropzoneTextoPrincipal.innerHTML = `📄 Archivo cargado: <span class="text-purple-300 font-mono">${file.name}</span> (${(file.size / 1024).toFixed(1)} KB)`;
    dropzoneTextoSecundario.textContent = "Haga clic en 'Procesar Archivo Seleccionado' o cargue otro archivo para reemplazar.";
    if (btnProcesarArchivo) {
      btnProcesarArchivo.disabled = false;
      btnProcesarArchivo.className = "w-full py-2.5 px-3 rounded-xl bg-purple-600 hover:bg-purple-500 text-white border border-purple-500 text-xs font-bold flex items-center justify-center gap-1.5 shadow-md shadow-purple-950 transition cursor-pointer";
    }
  }

  if (btnProcesarArchivo) {
    btnProcesarArchivo.addEventListener("click", () => {
      if (archivoLoteSeleccionado) {
        procesarArchivoLote(archivoLoteSeleccionado);
      }
    });
  }

  if (btnCargarDemoLote) {
    btnCargarDemoLote.addEventListener("click", ejecutarLoteDemo);
  }

  // 4. Inferencia por Lotes vía API
  async function procesarArchivoLote(file) {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("modelo", batchModel);

    mostrarCargandoLote(true);
    try {
      const resp = await fetch("/api/predecir_lote", {
        method: "POST",
        body: formData
      });
      const data = await resp.json();
      if (data.status === "success") {
        renderizarResultadosLote(data);
      } else {
        alert("Error al procesar el lote: " + (data.message || "Error desconocido"));
      }
    } catch (err) {
      console.error("Error en petición de lote:", err);
      alert("Error de conexión al procesar el lote.");
    } finally {
      mostrarCargandoLote(false);
    }
  }

  async function ejecutarLoteDemo() {
    mostrarCargandoLote(true);
    try {
      const resp = await fetch("/api/predecir_lote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ demo: true, modelo: batchModel })
      });
      const data = await resp.json();
      if (data.status === "success") {
        archivoLoteSeleccionado = null;
        if (dropzoneTextoPrincipal) {
          dropzoneTextoPrincipal.innerHTML = `⚡ Lote de Demostración Activo: <span class="text-purple-300 font-mono">Cohorte F1000Research (30 Pacientes)</span>`;
          dropzoneTextoSecundario.textContent = "Datos clínicos reales extraídos del estudio hospitalario de dengue pediátrico.";
        }
        renderizarResultadosLote(data);
      } else {
        alert("Error al cargar demo: " + (data.message || ""));
      }
    } catch (err) {
      console.error("Error cargando demo:", err);
    } finally {
      mostrarCargandoLote(false);
    }
  }

  function mostrarCargandoLote(cargando) {
    const contenedor = document.getElementById("contenedor-resultados-lote");
    if (cargando) {
      if (btnCargarDemoLote) btnCargarDemoLote.innerHTML = `<i data-lucide="loader" class="w-4 h-4 animate-spin text-white"></i><span>Procesando Lote con IA...</span>`;
      if (window.lucide) lucide.createIcons();
    } else {
      if (btnCargarDemoLote) btnCargarDemoLote.innerHTML = `<i data-lucide="sparkles" class="w-4 h-4 text-amber-300"></i><span>⚡ Cargar Lote Demo (30 Pacientes)</span>`;
      if (contenedor) contenedor.classList.remove("hidden");
      if (window.lucide) lucide.createIcons();
    }
  }

  // 5. Renderizado del Dashboard y Gráficas del Lote
  function renderizarResultadosLote(data) {
    batchDataActual = data;
    const r = data.resumen;

    // Actualizar KPIs
    document.getElementById("batch-kpi-total").textContent = r.total;
    document.getElementById("batch-kpi-prob-promedio").textContent = `${r.probabilidad_promedio.toFixed(1)}%`;

    document.getElementById("batch-kpi-alto").textContent = r.conteo_alto;
    document.getElementById("batch-kpi-alto-pct").textContent = `(${r.porcentaje_alto}%)`;

    document.getElementById("batch-kpi-moderado").textContent = r.conteo_moderado;
    document.getElementById("batch-kpi-moderado-pct").textContent = `(${r.porcentaje_moderado}%)`;

    document.getElementById("batch-kpi-bajo").textContent = r.conteo_bajo;
    document.getElementById("batch-kpi-bajo-pct").textContent = `(${r.porcentaje_bajo}%)`;

    document.getElementById("chart-legend-bajo").textContent = `${r.conteo_bajo} (${r.porcentaje_bajo}%)`;
    document.getElementById("chart-legend-moderado").textContent = `${r.conteo_moderado} (${r.porcentaje_moderado}%)`;
    document.getElementById("chart-legend-alto").textContent = `${r.conteo_alto} (${r.porcentaje_alto}%)`;

    document.getElementById("batch-tasa-hipo").textContent = `${r.tasa_hipotension}%`;
    document.getElementById("batch-tasa-trombo").textContent = `${r.tasa_trombocitopenia}%`;

    // Filtros contadores
    document.getElementById("count-filter-todos").textContent = r.total;
    document.getElementById("count-filter-alto").textContent = r.conteo_alto;
    document.getElementById("count-filter-mod").textContent = r.conteo_moderado;
    document.getElementById("count-filter-bajo").textContent = r.conteo_bajo;

    // Renderizar Gráfica de Dona
    renderizarDonutLote(r.chart_data_riesgo);

    // Renderizar Histograma de Scores F1000
    renderizarHistogramaScore(r.distribucion_scores);

    // Renderizar Tabla con Filtros
    filtrarYRenderizarTabla();
  }

  function renderizarDonutLote(dataArr) {
    const ctx = document.getElementById("batchDonutChart");
    if (!ctx) return;

    if (batchDonutChart) {
      batchDonutChart.destroy();
    }

    batchDonutChart = new Chart(ctx, {
      type: "doughnut",
      data: {
        labels: ["Riesgo Bajo (Ambulatorio)", "Riesgo Moderado (Sala)", "Riesgo Crítico (UCIP)"],
        datasets: [{
          data: dataArr,
          backgroundColor: [
            "rgba(16, 185, 129, 0.85)",
            "rgba(245, 158, 11, 0.85)",
            "rgba(239, 68, 68, 0.85)"
          ],
          borderColor: ["#10b981", "#f59e0b", "#ef4444"],
          borderWidth: 2,
          hoverOffset: 6
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: "#0f172a",
            borderColor: "#334155",
            borderWidth: 1,
            callbacks: {
              label: (c) => ` ${c.label}: ${c.raw} pacientes`
            }
          }
        },
        cutout: "70%"
      }
    });
  }

  function renderizarHistogramaScore(scoresArr) {
    const ctx = document.getElementById("batchScoreBarChart");
    if (!ctx) return;

    if (batchScoreBarChart) {
      batchScoreBarChart.destroy();
    }

    const labels = ["0 pts", "1 pt", "2 pts", "3 pts", "4 pts", "5 pts", "6 pts", "7 pts"];
    const barColors = scoresArr.map((_, idx) => {
      if (idx >= 3) return "rgba(239, 68, 68, 0.85)";
      if (idx === 2) return "rgba(245, 158, 11, 0.85)";
      return "rgba(16, 185, 129, 0.85)";
    });

    batchScoreBarChart = new Chart(ctx, {
      type: "bar",
      data: {
        labels: labels,
        datasets: [{
          label: "Pacientes con este Score",
          data: scoresArr,
          backgroundColor: barColors,
          borderRadius: 6,
          borderSkipped: false
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: "#0f172a",
            borderColor: "#334155",
            borderWidth: 1
          }
        },
        scales: {
          y: {
            beginAtZero: true,
            ticks: { color: "#94a3b8", precision: 0 },
            grid: { color: "rgba(51, 65, 85, 0.4)" }
          },
          x: {
            ticks: { color: "#94a3b8" },
            grid: { display: false }
          }
        }
      }
    });
  }

  // 6. Filtros y Búsqueda en la Tabla de Lotes
  const filterBtns = document.querySelectorAll(".btn-batch-filter");
  filterBtns.forEach(btn => {
    btn.addEventListener("click", () => {
      filterBtns.forEach(b => {
        b.className = "btn-batch-filter px-3 py-1.5 rounded-lg font-bold bg-slate-800 text-slate-400 hover:text-white border border-transparent";
      });
      btn.className = "btn-batch-filter active-filter px-3 py-1.5 rounded-lg font-bold bg-sky-500 text-white shadow-sm";
      filtroRiesgoActual = btn.dataset.filter;
      filtrarYRenderizarTabla();
    });
  });

  const inputBusqueda = document.getElementById("input-busqueda-lote");
  if (inputBusqueda) {
    inputBusqueda.addEventListener("input", (e) => {
      busquedaActual = e.target.value.toLowerCase().trim();
      filtrarYRenderizarTabla();
    });
  }

  function filtrarYRenderizarTabla() {
    if (!batchDataActual || !batchDataActual.pacientes) return;

    let pacientes = batchDataActual.pacientes;

    if (filtroRiesgoActual !== "todos") {
      pacientes = pacientes.filter(p => p.nivel === filtroRiesgoActual);
    }

    if (busquedaActual) {
      pacientes = pacientes.filter(p => 
        p.id.toLowerCase().includes(busquedaActual) ||
        p.edad.toLowerCase().includes(busquedaActual) ||
        p.nivel.toLowerCase().includes(busquedaActual) ||
        p.conducta.toLowerCase().includes(busquedaActual) ||
        (p.alertas && p.alertas.some(a => a.toLowerCase().includes(busquedaActual)))
      );
    }

    const tbody = document.getElementById("batch-tabla-body");
    const contador = document.getElementById("batch-tabla-contador");
    tbody.innerHTML = "";

    contador.textContent = `Mostrando ${pacientes.length} de ${batchDataActual.pacientes.length} pacientes evaluados`;

    if (pacientes.length === 0) {
      tbody.innerHTML = `<tr><td colspan="10" class="py-8 text-center text-slate-500 italic">No se encontraron pacientes con los criterios de búsqueda aplicados.</td></tr>`;
      return;
    }

    pacientes.forEach(p => {
      const tr = document.createElement("tr");
      tr.className = "hover:bg-slate-800/40 transition border-b border-slate-800/60";

      let badgeHtml = "";
      let barColor = "";
      if (p.nivel === "ALTO") {
        badgeHtml = `<span class="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-rose-500/20 text-rose-300 border border-rose-500/40 inline-flex items-center gap-1"><span class="w-1.5 h-1.5 rounded-full bg-rose-400 pulse-led"></span>Crítico</span>`;
        barColor = "bg-rose-500";
      } else if (p.nivel === "MODERADO") {
        badgeHtml = `<span class="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-amber-500/20 text-amber-300 border border-amber-500/40 inline-flex items-center gap-1"><span class="w-1.5 h-1.5 rounded-full bg-amber-400"></span>Alarma</span>`;
        barColor = "bg-amber-500";
      } else {
        badgeHtml = `<span class="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 inline-flex items-center gap-1"><span class="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>Bajo</span>`;
        barColor = "bg-emerald-500";
      }

      const hipoBadge = p.hipotension 
        ? `<span class="text-rose-400 font-bold bg-rose-500/10 px-1.5 py-0.5 rounded border border-rose-500/30">Hipotenso (+3)</span>` 
        : `<span class="text-slate-500">Normal</span>`;

      const pcvHighlight = p.pcv >= 42.0 ? `text-rose-300 font-bold` : `text-slate-300`;
      const platHighlight = p.plaquetas <= 75000 ? `text-rose-300 font-bold` : `text-slate-300`;

      tr.innerHTML = `
        <td class="py-2.5 px-3 font-bold text-white">${p.id}</td>
        <td class="py-2.5 px-3 text-slate-300">${p.edad} &bull; ${p.genero[0]}</td>
        <td class="py-2.5 px-3 text-slate-300">${p.fiebre}d</td>
        <td class="py-2.5 px-3">${hipoBadge}</td>
        <td class="py-2.5 px-3 ${pcvHighlight}">${p.pcv.toFixed(1)}%</td>
        <td class="py-2.5 px-3 ${platHighlight}">${p.plaquetas.toLocaleString()}</td>
        <td class="py-2.5 px-3 font-black text-sky-400">${p.score_clinico}/7</td>
        <td class="py-2.5 px-3">
          <div class="flex items-center gap-2">
            <span class="font-bold text-white min-w-[38px]">${p.probabilidad.toFixed(1)}%</span>
            <div class="w-14 bg-slate-800 rounded-full h-1.5 overflow-hidden">
              <div class="${barColor} h-1.5 rounded-full" style="width: ${Math.min(100, Math.max(5, p.probabilidad))}%"></div>
            </div>
          </div>
        </td>
        <td class="py-2.5 px-3">${badgeHtml}</td>
        <td class="py-2.5 px-3 text-[11px] text-slate-300 max-w-[220px] truncate" title="${p.conducta}">${p.conducta}</td>
      `;

      tbody.appendChild(tr);
    });

    if (window.lucide) lucide.createIcons();
  }

  // 7. Exportación del Lote a CSV
  const btnExportarCsvLote = document.getElementById("btn-exportar-csv-lote");
  if (btnExportarCsvLote) {
    btnExportarCsvLote.addEventListener("click", () => {
      if (!batchDataActual || !batchDataActual.pacientes) {
        alert("Primero debe cargar o procesar un lote de pacientes.");
        return;
      }

      const headers = [
        "id_paciente", "edad_grupo", "genero", "dias_fiebre", "hipotension",
        "pcv_hematocrito", "plaquetas", "leucocitos_wbc", "alt_transaminasa",
        "score_clinico_f1000", "probabilidad_complicacion_pct", "nivel_riesgo", "conducta_recomendada"
      ];

      const rows = batchDataActual.pacientes.map(p => [
        `"${p.id}"`,
        `"${p.edad}"`,
        `"${p.genero}"`,
        p.fiebre,
        p.hipotension ? 1 : 0,
        p.pcv,
        p.plaquetas,
        p.wbc,
        p.alt,
        p.score_clinico,
        p.probabilidad,
        `"${p.nivel}"`,
        `"${p.conducta.replace(/"/g, '""')}"`
      ]);

      const csvContent = "\uFEFF" + [headers.join(","), ...rows.map(r => r.join(","))].join("\r\n");
      const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `resultados_prediccion_lote_dengue_${new Date().toISOString().slice(0, 10)}.csv`;
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
