<script>
    // 1. IMPORTACIONES
    import { onMount } from "svelte";
    import {
        json,
        geoPath,
        geoMercator,
        // D3 Imports para la gráfica de línea de Movilidad:
        scaleLinear,
        line,
        select,
        axisBottom,
        axisLeft,
        group,
        // D3 Imports para la gráfica de barras de Renta Centiles:
        scaleBand,
        max,
        format,
    } from "d3";

    // 2. VARIABLES DE ESTADO Y CONFIGURACIÓN

    // --- VARIABLES DE VISUALIZACIÓN PRINCIPAL ---
    let geojson;
    let mostrarMapa = false;
    let contenidoTexto = "";
    let ranking = []; 

    // --- GRÁFICA 1: Movilidad (Línea) ---
    let mostrarGraficaMovilidad = false; // Estado para el gráfico de línea
    let graphDataMovilidad = []; // Datos para el gráfico de línea
    let loadingGraphMovilidad = false;
    let graphErrorMovilidad = null;
    let graphPathsMovilidad = [];

    let xAxisNodeMovilidad; 
    let yAxisNodeMovilidad; 
    let xScaleMovilidad;
    let yScaleMovilidad;
    let lineGeneratorMovilidad;

    // --- GRÁFICA 2: Renta Centiles (Barras) ---
    let mostrarGraficaCentiles = false; // Estado para el gráfico de barras
    let centilSelectedKey = null; // Clave seleccionada para el gráfico ('Hijos', 'Padres')
    let centilesHijosData = [];
    let centilesPadresData = [];
    let dataLoadingCentiles = false;
    let centilesError = null;
    
    // Configuración fija para el gráfico de barras
    const centilesKeys = ['Hijos', 'Padres'];
    const centilesColors = { 'Hijos': '#3b82f6', 'Padres': '#f97316' }; // blue-500, orange-500
    
    let xScaleBar; // Escala X para el gráfico de barras
    let yScaleBar; // Escala Y para el gráfico de barras
    let yFormatBar = format(".2s"); // Formato para el eje Y (ej. 10k)
    let xAxisBarNode;
    let yAxisBarNode;

    // --- GENERAL: Tooltip, Popup, URLs y Dimensiones ---
    let tooltip = { x: 0, y: 0, visible: false, text: "" };
    let popup = { visible: false, x: 0, y: 0, text: "" };

    const geojsonPath =
        "https://raw.githubusercontent.com/codeforgermany/click_that_hood/refs/heads/main/public/data/spain-communities.geojson";
    const mapaApiUrl = "http://localhost:5174/api/csv/ranking-ccaa";
    const graficaMovilidadApiUrl = "http://localhost:5174/api/csv/movilidad-nacional";
    
    // Nuevas URLs de la gráfica de barras (basadas en tu snippet)
    const centilesHijosApiUrl = "http://localhost:5174/api/csv/centiles-hijos";
    const centilesPadresApiUrl = "http://localhost:5174/api/csv/centiles-padres";


    // DIMENSIONES REACTIVAS
    let containerWidth = 800; 
    let graphHeight = 550; 
    const graphMargin = { top: 30, right: 30, bottom: 60, left: 80 }; // Mayor margen izquierdo para el gráfico de barras
    
    let graphInnerWidth; 
    let graphInnerHeight; 

    // CÁLCULOS REACTIVOS CLAVE PARA RESPONSIVIDAD:
    $: graphHeight = containerWidth * (containerWidth > 600 ? 0.6 : 1.0); 
    $: graphInnerHeight = graphHeight - graphMargin.top - graphMargin.bottom;
    $: graphInnerWidth = containerWidth - graphMargin.left - graphMargin.right;


    // 3. FUNCIONES DE CARGA Y LÓGICA

    onMount(async () => {
        geojson = await json(geojsonPath);
        console.log("Comunidades en geojson cargadas.");
    });

    function penínsulaYBaleares() {
        return geojson.features.filter((f) => f.properties.name !== "Canarias");
    }

    function canarias() {
        return geojson.features.filter((f) => f.properties.name === "Canarias");
    }
    
    // --- FUNCIÓN 1: GRÁFICO DE BARRAS (RENTA CENTILES) ---
    async function fetchAndShowCentilesChart() {
        // Reiniciar otros estados
        mostrarMapa = false;
        mostrarGraficaMovilidad = false; 
        contenidoTexto = "";
        centilesError = null;
        popup.visible = false; 

        mostrarGraficaCentiles = true;
        
        // Si los datos ya están cargados, solo mostramos
        if (centilesHijosData.length > 0 && centilesPadresData.length > 0) {
            if (!centilSelectedKey) centilSelectedKey = 'Hijos';
            return;
        }

        dataLoadingCentiles = true; 

        try {
            // Nota: Se recomienda añadir manejo de errores más específico aquí si es necesario
            const [resHijos, resPadres] = await Promise.all([
                fetch(centilesHijosApiUrl),
                fetch(centilesPadresApiUrl)
            ]);

            if (!resHijos.ok || !resPadres.ok) {
                throw new Error(`Error al cargar datos. Hijos: ${resHijos.status}, Padres: ${resPadres.status}`);
            }

            const dataHijos = await resHijos.json();
            const dataPadres = await resPadres.json();

            // Función para procesar los datos (centil como string, renta como float)
            const processData = (data) => data.map((d) => ({
                centil: d.centil,
                renta: parseFloat(d.renta),
            }));
            
            centilesHijosData = processData(dataHijos);
            centilesPadresData = processData(dataPadres);
            centilSelectedKey = 'Hijos'; // Selecciona Hijos por defecto al cargar

        } catch (err) {
            console.error("Error cargando datos de centiles:", err);
            centilesHijosData = [];
            centilesPadresData = [];
            centilesError = `No se pudieron cargar los datos de centiles. Mensaje: ${err.message}.`;
            centilSelectedKey = null;
        } finally {
            dataLoadingCentiles = false; 
        }
    }
    
    // Manejador de selección para el gráfico de barras
    function selectCentilData(key) {
        centilSelectedKey = key;
    }


    // --- FUNCIÓN 2: MAPA (RANKING CCAA) ---
    async function mostrarMapaFunc() {
        // Reiniciar otros estados
        mostrarGraficaCentiles = false;
        mostrarGraficaMovilidad = false;
        centilSelectedKey = null;
        centilesError = null;
        contenidoTexto = "";
        popup.visible = false; 

        mostrarMapa = true;
        
        try {
            const res = await fetch(mapaApiUrl);
            const data = await res.json();
            ranking = data.map((d) => ({
                ccaa: d.ccaa,
                centil: parseFloat(d.centil_hijo_loess),
            }));
        } catch (err) {
            console.error("Error cargando ranking:", err);
        }
    }

    // --- FUNCIÓN 3: GRÁFICO DE LÍNEA (MOVILIDAD INTERGENERACIONAL) ---
    async function showMovilidadLineChart() {
        // Reiniciar otros estados
        mostrarMapa = false;
        mostrarGraficaCentiles = false;
        centilSelectedKey = null;
        centilesError = null;
        contenidoTexto = "";
        popup.visible = false; 
        
        mostrarGraficaMovilidad = true;
        loadingGraphMovilidad = true;
        graphErrorMovilidad = null;

        try {
            const res = await fetch(graficaMovilidadApiUrl);
            const data = await res.json();
            
            // FILTRADO INTERNO (valores fijos: "total" e "individual")
            graphDataMovilidad = data
                .map(d => ({
                    centilPadres: parseInt(d.centil_padres), 
                    promedio: d.promedio, 
                    centilHijo: parseFloat(d.centil_hijo_loess),
                    sexo: d.sexo,
                    tipo_renta: d.tipo_renta,
                }))
                .filter(d => 
                    d.sexo === "total" && 
                    d.tipo_renta === "individual" &&
                    parseInt(d.centilPadres) < 100 && 
                    !isNaN(d.centilHijo)
                ); 

        } catch (err) {
            console.error("Error cargando datos de la gráfica de Movilidad:", err);
            graphErrorMovilidad = "No se pudieron cargar los datos de la gráfica de Movilidad.";
        } finally {
            loadingGraphMovilidad = false;
        }
    }


    // --- LÓGICA DE MAPA (funciones auxiliares) ---

    // Colores discretos según el centil (para el mapa)
    function getColor(ccaa) {
        const item = ranking.find((r) => r.ccaa === ccaa);
        if (!item) return "#d1d5db"; // gray-300
        const value = item.centil;
        if (value > 50) return "#10b981"; // emerald-500 (Alto)
        else if (value > 45) return "#facc15"; // yellow-400 (Medio-Alto)
        else if (value > 40) return "#fb923c"; // orange-400 (Medio-Bajo)
        else return "#ef4444"; // red-500 (Bajo)
    }

    function showPopup(event, ccaa) {
        const item = ranking.find((r) => r.ccaa === ccaa);
        if (!item) return;
        
        popup = {
            x: event.clientX,
            y: event.clientY,
            visible: true,
            text: `${ccaa}: ${item.centil.toFixed(2)}`,
        };
    }

    function hidePopup() {
        popup.visible = false;
    }


    // 4. BLOQUES REACTIVOS DE D3

    // --- BLOQUE REACTIVO GRÁFICO 1: Movilidad (Línea) ---
    $: {
        if (mostrarGraficaMovilidad && graphDataMovilidad && graphDataMovilidad.length > 0 && graphInnerWidth > 0) {
            
            const groupedData = group(graphDataMovilidad, d => d.promedio); 

            xScaleMovilidad = scaleLinear().domain([0, 100]).range([0, graphInnerWidth]); 
            yScaleMovilidad = scaleLinear().domain([0, 100]).range([graphInnerHeight, 0]); 

            if (xAxisNodeMovilidad) {
                // Redibujar ejes D3
                select(xAxisNodeMovilidad).call(axisBottom(xScaleMovilidad).ticks(containerWidth < 400 ? 5 : 10));
            }
            if (yAxisNodeMovilidad) {
                // Redibujar ejes D3
                select(yAxisNodeMovilidad).call(axisLeft(yScaleMovilidad).ticks(10));
            }

            lineGeneratorMovilidad = line()
                .x((d) => xScaleMovilidad(d.centilPadres))
                .y((d) => yScaleMovilidad(d.centilHijo));
            
            graphPathsMovilidad = Array.from(groupedData, ([key, value]) => ({
                promedio: key,
                path: lineGeneratorMovilidad(value.sort((a,b) => a.centilPadres - b.centilPadres)),
                color: key === 'media' ? '#3b82f6' : '#f97316'
            }));
        } else if (mostrarGraficaMovilidad && !loadingGraphMovilidad) {
            graphPathsMovilidad = [];
        }
    }

    // --- BLOQUE REACTIVO GRÁFICO 2: Centiles (Barras) ---

    // Obtener los datos correctos según la selección
    $: selectedDataCentiles = centilSelectedKey === 'Hijos' ? centilesHijosData : centilSelectedKey === 'Padres' ? centilesPadresData : [];
    $: barColor = centilSelectedKey ? centilesColors[centilSelectedKey] : '#ccc';

    // Cálculo de escalas D3 para el gráfico de barras y dibujo de ejes
    $: {
        if (mostrarGraficaCentiles && centilesHijosData.length > 0 && graphInnerWidth > 0) {
            let centilValues = centilesHijosData.map(d => d.centil);
            const maxHijos = max(centilesHijosData, (d) => d.renta);
            const maxPadres = max(centilesPadresData, (d) => d.renta);
            const globalMax = max([maxHijos, maxPadres]) || 0;
            
            xScaleBar = scaleBand()
                .domain(centilValues)
                .range([0, graphInnerWidth])
                .padding(0.2);

            yScaleBar = scaleLinear()
                .domain([0, globalMax * 1.1])
                .range([graphInnerHeight, 0]);
            
            // Dibujo de Ejes (usando los nodos enlazados con bind:this)
            if (xAxisBarNode) {
                // Redibujar ejes D3
                select(xAxisBarNode).call(axisBottom(xScaleBar).tickValues(xScaleBar.domain().filter(d => parseInt(d, 10) === 1 || parseInt(d, 10) % 10 === 0)));
                // Remover la línea principal del eje X para que solo quede la línea del eje Y abajo
                select(xAxisBarNode).select(".domain").remove();
            }
            if (yAxisBarNode) {
                 // Redibujar ejes D3
                select(yAxisBarNode).call(axisLeft(yScaleBar).tickFormat(yFormatBar));
            }
        }
    }

</script>

<!-- Contenedor Principal con fondo suave, centrado y con fuente Inter -->
<div class="min-h-screen bg-gray-50 p-4 sm:p-8 flex flex-col items-center">
    
    <!-- Título Principal -->
    <h1 class="text-2xl sm:text-4xl font-extrabold text-gray-800 mb-2 text-center">
        Dashboard de Análisis de Movilidad y Renta
    </h1>
    
    <!-- Separador -->
    <div class="border-b border-indigo-300 w-full max-w-4xl mx-auto mb-6"></div>

    <!-- Contenedor de Botones (Responsive: apilados en móvil, en fila en desktop) -->
    <div class="flex flex-col sm:flex-row flex-wrap justify-center gap-3 sm:space-x-4 mb-8 mt-4 w-full max-w-4xl">
        
        <!-- BOTÓN 1 - Gráfico de Barras de Renta Centiles -->
        <button on:click={fetchAndShowCentilesChart} class="w-full sm:w-auto px-5 py-3 bg-indigo-600 text-white font-semibold rounded-lg shadow-md hover:bg-indigo-700 transition duration-200 focus:outline-none focus:ring-4 focus:ring-indigo-500 focus:ring-opacity-50" class:active={mostrarGraficaCentiles}>
            Mostrar Gráfico (Renta Centiles)
        </button>
        
        <!-- BOTÓN 2 - Mapa -->
        <button on:click={mostrarMapaFunc} class="w-full sm:w-auto px-5 py-3 bg-indigo-600 text-white font-semibold rounded-lg shadow-md hover:bg-indigo-700 transition duration-200 focus:outline-none focus:ring-4 focus:ring-indigo-500 focus:ring-opacity-50" class:active={mostrarMapa}>
            Mostrar Mapa (Ranking CCAA)
        </button>
        
        <!-- BOTÓN 3 - Gráfico de Línea de Movilidad -->
        <button on:click={showMovilidadLineChart} class="w-full sm:w-auto px-5 py-3 bg-indigo-600 text-white font-semibold rounded-lg shadow-md hover:bg-indigo-700 transition duration-200 focus:outline-none focus:ring-4 focus:ring-indigo-500 focus:ring-opacity-50" class:active={mostrarGraficaMovilidad}>
            Mostrar Gráfico (Movilidad)
        </button>

    </div>
    
    <!-- Texto de Contexto -->
    <div class="text-base sm:text-lg font-medium text-gray-700 mb-4 w-full max-w-4xl mx-auto px-2">
        {#if mostrarMapa}
            Distribución de Renta por Comunidad Autónoma.
        {:else if mostrarGraficaMovilidad}
            Movilidad Intergeneracional: Centil de Renta de los Padres vs. Centil de Renta de los Hijos.
        {:else if mostrarGraficaCentiles}
            Renta Media por Centil de Población: {centilSelectedKey ? centilSelectedKey : 'Selecciona Hijos o Padres arriba.'}
        {/if}
    </div>

    <!-- Área Dinámica Principal (Contenedor tipo tarjeta) -->
    <div
        class="w-full max-w-4xl min-h-[400px] sm:min-h-[550px] border border-gray-200 p-2 sm:p-6 bg-white rounded-xl shadow-2xl focus:outline-none focus:ring-4 focus:ring-indigo-500 focus:ring-opacity-50 transition duration-300"
        tabindex="0"
        role="button"
        aria-label="Área interactiva"
        on:click={hidePopup}
        on:keydown={(e) => e.key === "Enter" && hidePopup()}
        bind:clientWidth={containerWidth} 
    >
        
        {#if dataLoadingCentiles || loadingGraphMovilidad}
            <div class="flex justify-center items-center h-[400px] text-indigo-500">
                <svg class="animate-spin -ml-1 mr-3 h-8 w-8 text-indigo-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                    <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                <span class="text-lg">Cargando datos de la gráfica...</span>
            </div>
        {:else if centilesError || graphErrorMovilidad}
            <div class="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative text-left" role="alert">
                <strong class="font-bold">Error de Carga:</strong>
                <span class="block sm:inline">{centilesError || graphErrorMovilidad}</span>
            </div>
        
        <!-- --- RENDERIZADO DEL GRÁFICO DE BARRAS (RENTA CENTILES) --- -->
        {:else if mostrarGraficaCentiles && centilesHijosData.length > 0} 
            
            <!-- Botones de Selección del Gráfico de Barras (Hijos/Padres) - AHORA DENTRO -->
            <div class="flex justify-center gap-4 mb-4 mt-0 w-full px-4"> 
                <button on:click={() => selectCentilData('Hijos')} class:active={centilSelectedKey === 'Hijos'} class="px-4 py-2 text-sm rounded-md border-2 border-indigo-400 font-medium transition duration-150" style="background-color: {centilSelectedKey === 'Hijos' ? '#3b82f6' : 'white'}; color: {centilSelectedKey === 'Hijos' ? 'white' : '#3b82f6'};">
                    Renta Hijos
                </button>
                <button on:click={() => selectCentilData('Padres')} class:active={centilSelectedKey === 'Padres'} class="px-4 py-2 text-sm rounded-md border-2 border-indigo-400 font-medium transition duration-150" style="background-color: {centilSelectedKey === 'Padres' ? '#f97316' : 'white'}; color: {centilSelectedKey === 'Padres' ? 'white' : '#f97316'};">
                    Renta Padres
                </button>
            </div>

            <!-- Mostrar el SVG o un mensaje de selección -->
            {#if centilSelectedKey}
                <svg width="{containerWidth}" height="{graphHeight}" class="mx-auto block" style="overflow: visible;">
                    <g transform="translate({graphMargin.left}, {graphMargin.top})">
                        
                        <!-- Eje Y y Gridlines -->
                        <g class="text-xs sm:text-sm text-gray-500" bind:this={yAxisBarNode}>
                            <!-- D3 dibujará aquí el eje Y -->
                            <!-- Gridlines (manualmente para mejor control) -->
                            {#if yScaleBar}
                                {#each yScaleBar.ticks(10) as tick}
                                    <line x1="0" y1={yScaleBar(tick)} x2={graphInnerWidth} stroke="#e5e7eb" stroke-dasharray="2,2" />
                                {/each}
                            {/if}
                        </g>
                        
                        <!-- Barras Individuales -->
                        {#if xScaleBar && yScaleBar}
                            {#each selectedDataCentiles as d, i (i)}
                                <rect
                                    x={xScaleBar(d.centil)}
                                    y={yScaleBar(d.renta)}
                                    width={xScaleBar.bandwidth()}
                                    height={graphInnerHeight - yScaleBar(d.renta)}
                                    fill={barColor}
                                    class="transition-all duration-300 hover:opacity-80"
                                    aria-label={`${centilSelectedKey}, Centil ${d.centil}: ${d.renta.toFixed(2)}€`}
                                />
                            {/each}
                        {/if}

                        <!-- Eje X -->
                        <g class="text-xs sm:text-sm text-gray-500" bind:this={xAxisBarNode} transform="translate(0, {graphInnerHeight})"></g>
                        
                        <!-- Etiqueta del Eje Y -->
                        <text 
                            class="text-sm font-medium fill-gray-600" 
                            transform="rotate(-90)" 
                            x={-graphInnerHeight / 2} 
                            y={-graphMargin.left + 20} 
                            text-anchor="middle"
                        >
                            Renta (€)
                        </text>
                        
                        <!-- Etiqueta del Eje X -->
                        <text 
                            class="text-sm font-medium fill-gray-600" 
                            x={graphInnerWidth / 2} 
                            y={graphInnerHeight + graphMargin.bottom - 10} 
                            text-anchor="middle"
                        >
                            Centil de Población
                        </text>
                    </g>
                </svg>
            {:else}
                <div class="p-6 text-gray-600 space-y-3 flex justify-center items-center h-full">
                    <h3 class='text-xl font-semibold text-gray-700'>Por favor, selecciona Renta Hijos o Renta Padres arriba para visualizar el gráfico.</h3>
                </div>
            {/if}
            
        <!-- --- RENDERIZADO DEL GRÁFICO DE LÍNEA (MOVILIDAD) --- -->
        {:else if mostrarGraficaMovilidad && graphDataMovilidad.length > 0}
            <svg width="{containerWidth}" height="{graphHeight}" class="mx-auto block" style="overflow: visible;">
                <g transform="translate({graphMargin.left}, {graphMargin.top})">
                    
                    <!-- Ejes -->
                    <g class="text-xs sm:text-sm text-gray-500" bind:this={xAxisNodeMovilidad} transform="translate(0, {graphInnerHeight})"></g>
                    <g class="text-xs sm:text-sm text-gray-500" bind:this={yAxisNodeMovilidad}></g>
                    
                    <!-- Etiquetas de Ejes -->
                    <text 
                        class="text-xs sm:text-sm font-medium fill-gray-600" 
                        transform="rotate(-90)" 
                        x={-graphInnerHeight / 2} 
                        y={-graphMargin.left + (containerWidth < 400 ? 10 : 15)} 
                        text-anchor="middle"
                    >
                        Centil de Renta de los Hijos
                    </text>
                    <text 
                        class="text-xs sm:text-sm font-medium fill-gray-600" 
                        x={graphInnerWidth / 2} 
                        y={graphInnerHeight + graphMargin.bottom - 10} 
                        text-anchor="middle"
                    >
                        Centil de Renta de los Padres
                    </text>
                    
                    <!-- Línea de 45 grados (Perfecta Movilidad) -->
                    {#if xScaleMovilidad && yScaleMovilidad}
                        <line 
                            x1={xScaleMovilidad(0)} 
                            y1={yScaleMovilidad(0)} 
                            x2={xScaleMovilidad(100)} 
                            y2={yScaleMovilidad(100)} 
                            stroke="#ef4444" 
                            stroke-dasharray="4 4" 
                            opacity="0.6"
                            stroke-width="2"
                        />
                    {/if}

                    <!-- Líneas de la Gráfica (Media y Mediana) -->
                    {#each graphPathsMovilidad as p}
                        <path
                            d={p.path}
                            stroke={p.color}
                            stroke-width="3"
                            fill="none"
                            class="shadow-md"
                        />
                    {/each}
                    
                    <!-- Leyenda -->
                    <g transform="translate({graphInnerWidth - 180}, 10)" class="font-sans text-xs sm:text-sm">
                        {#each graphPathsMovilidad as p, i}
                            <rect x="0" y={i * 25} width="12" height="12" fill={p.color} rx="2"></rect>
                            <text x="20" y={i * 25 + 10} class="fill-gray-700">{p.promedio.charAt(0).toUpperCase() + p.promedio.slice(1)}</text>
                        {/each}
                        <rect x="0" y={2 * 25} width="12" height="12" fill="#ef4444" rx="2"></rect>
                        <text x="20" y={2 * 25 + 10} class="fill-gray-700">Movilidad Perfecta (45°)</text>
                    </g>

                </g>
            </svg>

        <!-- --- RENDERIZADO DEL MAPA --- -->
        {:else if mostrarMapa && geojson && ranking.length > 0}
            <div class="flex justify-center w-full h-full">
                <svg width="{containerWidth}" height="{graphHeight}" role="img" class="bg-blue-100 rounded-lg shadow-inner">
                    <!-- Mapa Península y Baleares -->
                    {#each penínsulaYBaleares() as feature}
                        <path
                            d={geoPath().projection(
                                geoMercator().fitSize([containerWidth, graphHeight * 0.8], {
                                    type: "FeatureCollection",
                                    features: penínsulaYBaleares(),
                                })
                            )(feature)}
                            fill={getColor(feature.properties.name)}
                            stroke="#ffffff"
                            stroke-width="1.5"
                            role="button"
                            tabindex="0"
                            aria-label="{feature.properties.name}: {ranking.find((r) => r.ccaa === feature.properties.name)?.centil.toFixed(2)}"
                            on:click|stopPropagation={(e) => showPopup(e, feature.properties.name)}
                            on:keydown={(e) => e.key === "Enter" && showPopup(e, feature.properties.name)}
                            class="cursor-pointer transition-all duration-150 hover:stroke-gray-900 hover:stroke-[3px]"
                        />
                    {/each}

                    <!-- Islas Canarias -->
                    {#each canarias() as feature}
                        <path
                            d={geoPath().projection(
                                geoMercator().center([-16, 28.5]).scale(containerWidth * 2).translate([containerWidth * 0.15, graphHeight * 0.85])
                            )(feature)}
                            fill={getColor(feature.properties.name)}
                            stroke="#ffffff"
                            stroke-width="1.5"
                            role="button"
                            tabindex="0"
                            aria-label="{feature.properties.name}: {ranking.find((r) => r.ccaa === feature.properties.name)?.centil.toFixed(2)}"
                            on:click|stopPropagation={(e) => showPopup(e, feature.properties.name)}
                            on:keydown={(e) => e.key === "Enter" && showPopup(e, feature.properties.name)}
                            class="cursor-pointer transition-all duration-150 hover:stroke-gray-900 hover:stroke-[3px]"
                        />
                    {/each}
                </svg>
            </div>

            <!-- Popup Fijo -->
            {#if popup.visible}
                <div class="fixed z-50 pointer-events-none" style="top:{popup.y + 10}px; left:{popup.x + 10}px;">
                    <div class="bg-gray-800 text-white p-3 rounded-xl shadow-2xl flex items-center gap-3 whitespace-nowrap pointer-events-auto">
                        <span class="font-semibold">{popup.text}</span>
                        <div class="w-px h-5 bg-gray-600"></div>
                        <button class="bg-transparent border-none text-white text-xl font-bold cursor-pointer opacity-80 hover:opacity-100 transition duration-150" on:click={hidePopup} aria-label="Cerrar popup">
                            &times;
                        </button>
                    </div>
                </div>
            {/if}

        {:else}
            <!-- Estado Inicial / No hay datos seleccionados -->
            <div class="p-6 text-gray-600 space-y-3">
                <h3 class='text-xl font-semibold text-gray-700'>Selecciona una de las opciones superiores para ver los datos.</h3>
            </div>
        {/if}
    </div>
</div>