# Wined — SPEC.md

> Plataforma SaaS B2B multi-tenant que ofrece un copiloto agéntico vertical para el mundo del vino, con dos productos en un mismo núcleo: **wined-sommelier** (sala, hotel, distribución) y **wined-cellar** (bodega, enología). Mercado inicial: España. Catálogo: vinos del mundo.

---

## 1. Resumen ejecutivo

Wined es el primer copiloto agéntico vertical en español para profesionales del vino. A diferencia de motores de recomendación (Preferabli, Tastry), cartas digitales (SommOne, VINU) o ERPs de bodega (InnoVint, Vintrace), Wined combina:

1. **Agentes Claude Sonnet especializados** con citas obligatorias a fuentes (OIV, regulación UE, DOs españolas, literatura técnica, KB privada del cliente).
2. **Multi-tenant con KB privada subible** — cada restaurante o bodega sube su carta, fichas técnicas, históricos de vinificación y análisis de laboratorio. Genera switching cost alto.
3. **Red de expertos top de España** (sumilleres y enólogos premiados) como advisors del corpus, lo que da legitimidad y diferenciación cultural frente a productos US-céntricos.

El producto se vende a dos verticales con onboarding diferenciado pero núcleo compartido (auth multi-tenant, ingestion, memoria, citas, multi-idioma ES/EN). Web-first; móvil en Fase 3.

**Tesis comercial:** Los sumilleres y enólogos de élite ya colaboran como design partners. Hay deadline blando, equipo amplio y compromiso de cobertura exhaustiva. La oportunidad es construir el "Cursor del vino" antes de que un player US lo localice.

**Estado:** definición de producto (este documento). Sin código aún.

---

## 2. Problema y oportunidad

### Pain points observados

**Sumilleres**:
- Construir y mantener la carta de vinos es manual: PDFs, Excel, cambios de temporada, traducciones EN para hotel/cadena.
- Maridaje en sala con clientes que piden explicaciones requiere memoria enciclopédica + memoria del propio cliente del restaurante (qué pidió la última vez, alergias, presupuesto).
- Formar a nuevo personal de sala es lento; el conocimiento queda en cabeza del jefe de sala.
- Distribuidores recomiendan a HoReCa con catálogos estáticos.

**Enólogos / bodegueros**:
- Decisiones técnicas (corrección de SO₂, ajuste de acidez, dosificación de clarificantes, intervenciones ante anomalías de fermentación) se toman consultando libros, foros y experiencia. No hay un asistente que combine la **normativa UE/DOs**, los **estándares OIV**, la **literatura técnica** y el **histórico propio** de la bodega.
- Las calculadoras existen como hojas Excel sueltas; no están integradas con el diario de vinificación.
- Cumplir normativa UE (residuos, etiquetado, prácticas enológicas autorizadas) y consejos reguladores de DO consume tiempo administrativo.

### Benchmark de competencia

| Producto | País | Foco | Limitación frente a Wined |
|---|---|---|---|
| **Preferabli** | US | Motor de recomendación B2C+B2B, 1M vinos, validado por MWs | No es agente conversacional, no sube KB privada, sin español nativo, sin vertical cellar |
| **Tastry** | US | Recomendación por química sensorial | No es asistente, no maridaje conversacional |
| **Aivin** | EU | Genérico, recomendación | Sin cobertura DO ES, sin agente, sin cellar |
| **Sommify** | EU | Wholesale matching | Solo distribución, no sala ni cellar |
| **Sommelier.bot** | — | Chat genérico | Sin citas, sin KB privada, sin multi-tenant |
| **SommOne / VINU / eSommelier** | EU | Cartas digitales para clientes finales | Sin IA, sin maridaje explicable, sin vertical cellar |
| **InnoVint / Vintrace / VINAI** | US/AU | ERP de bodega | Sin agente conversacional, sin citas, no responde "¿qué hago si la fermentación se estanca?" |

**Gap claro:** ningún producto cubre la unión **(agente conversacional con citas) × (multi-tenant con KB privada subible) × (cobertura sommelier + cellar) × (ES nativo, normativa UE/DO)**.

### Oportunidad

- Mercado España: ~12.000 restaurantes con carta de vinos relevante, ~4.300 bodegas inscritas, ~70 DOs/IGPs. HoReCa premium y bodegas pequeñas-medianas son segmentos sub-digitalizados.
- Design partners ya comprometidos → ciclo de feedback corto.
- Expansión natural a Italia, Francia, Portugal (mismos verticales, ajuste de corpus normativo).

---

## 3. Posicionamiento y diferenciación

**Posicionamiento (one-liner interno):**
> Wined es el copiloto agéntico vertical del vino: agentes que **citan, recuerdan y aprenden de tu casa** — para sala y para bodega.

### Tres pilares diferenciales

1. **Agente que cita o calla.** Toda respuesta técnica (química, normativa, ficha de vino) lleva citas a fuente. Cuando no hay evidencia en el corpus, el agente lo dice explícitamente. Esto es lo opuesto al chatbot genérico.
2. **KB privada por tenant + KB global curada.** El cliente sube su carta, su histórico, sus análisis. El agente combina lo privado con lo global. Switching cost alto: irse implica perder años de memoria estructurada.
3. **Corpus avalado por expertos de España.** Sumilleres y enólogos top revisan el corpus y son advisors visibles. Marca de confianza local imposible de replicar rápido por player extranjero.

### Anti-posicionamiento (qué NO somos)

- No somos una carta digital para el comensal.
- No somos un ERP de bodega.
- No somos un marketplace de vino.
- No somos un producto B2C.

---

## 4. Personas detalladas

### Persona 1 — Sumiller de restaurante premium ("Carla")

- **Contexto:** restaurante 1-2 estrellas Michelin o gastronómico independiente. Carta de 200-1.500 referencias. 2-4 personas en el equipo de sala.
- **Goals:** (1) tener la carta siempre actualizada y traducida, (2) maridar en sala con justificación, (3) formar a nuevo personal, (4) recordar al cliente recurrente.
- **Pain points:** la carta vive en un Excel desordenado; las traducciones EN son inconsistentes; el conocimiento del cliente se queda en su cabeza; en hora punta no tiene tiempo de consultar libros.
- **Jobs-to-be-done:**
  - "Cuando entra un cliente, quiero saber en 5 segundos qué pidió la última vez y si tenemos algo afín hoy."
  - "Cuando un cliente pide maridaje para un plato del menú degustación, quiero 3 opciones con justificación en una frase cada una."
  - "Cuando llega un vino nuevo del distribuidor, quiero incorporarlo a la carta y que el agente lo entienda."

### Persona 2 — Sumiller de hotel / cadena hotelera ("Iván")

- **Contexto:** hotel 5* o cadena con 3-15 establecimientos. Carta multi-restaurante, multi-idioma. Equipo rotativo.
- **Goals:** (1) consistencia entre establecimientos, (2) multi-idioma ES/EN obligatorio (DE/FR deseables), (3) reporting de rotación de carta, (4) onboarding rápido de personal.
- **Pain points:** cada hotel mantiene su Excel; la matriz pide reporting; el personal rota cada temporada.
- **Jobs-to-be-done:**
  - "Quiero ver la carta de los 5 hoteles desde un solo workspace."
  - "Quiero que un nuevo sumiller en sala se ponga al día en 2 días, no en 2 meses."
  - "Quiero respuestas del agente en EN para clientes internacionales sin tener que traducirlas yo."

### Persona 3 — Distribuidor / wholesale ("Mar")

- **Contexto:** importador o distribuidor regional con 200-2.000 referencias. Vende a HoReCa.
- **Goals:** (1) recomendar a sus clientes HoReCa el vino correcto, (2) educar a sumilleres sobre su portfolio, (3) reducir devoluciones y stocks muertos.
- **Pain points:** el comercial conoce 50 referencias bien, las otras 1.500 son nombres en un PDF; cuando un sumiller pregunta "tienes algo de Jura con poco sulfuroso", tarda horas en buscar.
- **Jobs-to-be-done:**
  - "Quiero buscar en mi catálogo por criterios técnicos (tipo, región, perfil, precio, stock) en lenguaje natural."
  - "Quiero generar fichas comerciales para mis clientes con citas técnicas verificadas."

### Persona 4 — Enólogo de bodega pequeña-mediana ("Marta")

- **Contexto:** bodega 50.000-500.000 botellas/año. Enólogo único o pequeño equipo. DO conocida.
- **Goals:** (1) decisiones técnicas con respaldo (citas a OIV, normativa UE, literatura), (2) detección temprana de anomalías de vinificación, (3) cumplimiento normativo, (4) trazabilidad de decisiones.
- **Pain points:** los libros están en estantería; el histórico de añadas anteriores está en cuadernos; las calculadoras son hojas Excel desperdigadas; pedir a un consultor externo es caro y lento.
- **Jobs-to-be-done:**
  - "Cuando la fermentación se estanca a 1010 de densidad, quiero saber qué intervenciones son razonables y qué hicimos en añadas anteriores en esta misma bodega."
  - "Cuando ajusto SO₂, quiero la dosificación calculada y la cita normativa de límite UE para esta categoría."
  - "Cuando subo el análisis de laboratorio, quiero que el agente detecte si algo está fuera de rango."

### Persona 5 — Bodeguero / responsable de producción ("Joan")

- **Contexto:** responsable de bodega en operativa diaria, vendimia, llenado de depósitos. Puede o no ser enólogo titulado.
- **Goals:** (1) operativa diaria sin interrumpir al enólogo para cada duda, (2) registro estructurado de operaciones, (3) consulta rápida de normativa.
- **Pain points:** dudas operativas constantes que se resuelven por WhatsApp con el enólogo; el cuaderno de bodega se llena de notas a mano.
- **Jobs-to-be-done:**
  - "Cuando llega la uva en vendimia, quiero registrar parámetros (Baumé, pH, sanidad) y que el agente alerte si hay algo raro."
  - "Quiero preguntar 'esto se puede hacer en DO Rioja?' y recibir cita normativa, no opinión."

---

## 5. User stories por vertical

> Formato: `[ID] Como [persona], quiero [acción] para [beneficio].` + Acceptance Criteria (AC) + Priority MoSCoW (M = Must, S = Should, C = Could, W = Won't en MVP).

### 5.1 Núcleo compartido (15+ stories)

| ID | User story | AC | Priority |
|---|---|---|---|
| **NUC-01** | Como nuevo usuario, quiero registrarme con email corporativo y elegir vertical (sommelier/cellar) para entrar al workspace correcto. | Email + password o SSO Google. Detección de rol guía onboarding distinto. Crea organización por defecto. | M |
| **NUC-02** | Como admin de organización, quiero invitar miembros con roles (admin, editor, viewer) para colaborar. | Invitación por email. RBAC aplicado en KB y chat. Audit log de accesos. | M |
| **NUC-03** | Como usuario, quiero que el agente recuerde mis preferencias y contexto entre sesiones para no repetirme. | Memoria de usuario persistente. Editable y borrable por el usuario (GDPR). | M |
| **NUC-04** | Como organización, quiero una KB privada aislada del resto de tenants para garantizar confidencialidad. | Aislamiento lógico verificado. Cifrado at-rest. No cross-tenant leakage en RAG. | M |
| **NUC-05** | Como usuario, quiero hacer preguntas en español y recibir respuestas en español aunque la fuente esté en inglés. | Pivote ES↔EN. Cita siempre en idioma original + traducción de la frase citada. | M |
| **NUC-06** | Como usuario, quiero que las respuestas técnicas incluyan citas verificables a la fuente. | Toda respuesta técnica lleva al menos 1 cita. Click en cita abre el documento al fragmento. Si no hay fuente, el agente dice "no tengo evidencia". | M |
| **NUC-07** | Como usuario, quiero pasar al modo inglés con un toggle para atender clientes/clientes internacionales. | Toggle ES/EN en cabecera. La memoria y la KB no se duplican; solo cambia el idioma de salida. | M |
| **NUC-08** | Como admin, quiero ver consumo (tokens, queries, almacenamiento) por miembro para gestionar plan. | Dashboard de uso. Alertas al 80% del plan. | S |
| **NUC-09** | Como usuario, quiero exportar mis datos (KB, conversaciones, memoria) en formato abierto para portabilidad. | Export ZIP con JSON + PDFs originales. GDPR Art. 20. | M |
| **NUC-10** | Como admin, quiero un log auditable de quién consultó qué para cumplimiento. | Audit log inmutable. Filtros por usuario/fecha. Export CSV. | S |
| **NUC-11** | Como usuario, quiero buscar dentro de mis conversaciones pasadas para retomar análisis. | Search full-text + semántico sobre histórico de chat. | S |
| **NUC-12** | Como usuario, quiero marcar respuestas como "guardadas" para revisarlas después. | Sistema de bookmarks. Colección personal. | C |
| **NUC-13** | Como admin, quiero configurar el comportamiento del agente cuando hay conflicto entre KB privada y KB global. | Preferencia: privado-primero, global-primero, o mostrar ambas con flag. Default: privado-primero. | M |
| **NUC-14** | Como usuario, quiero dar feedback (👍/👎 + comentario) a respuestas del agente para mejorar el modelo. | Feedback estructurado. Alimenta evals. No es training data sin consentimiento. | M |
| **NUC-15** | Como admin, quiero forzar consentimiento explícito antes de subir documentos con PII. | Detector de PII en ingestion. Bloqueo + diálogo de consentimiento. Log. | M |
| **NUC-16** | Como usuario, quiero que el agente se identifique como IA y no como humano para transparencia. | Disclaimer en primera respuesta de sesión. Configurable en branding. | M |

### 5.2 Ingestion Agent (10+ stories)

| ID | User story | AC | Priority |
|---|---|---|---|
| **ING-01** | Como usuario, quiero subir cualquier archivo (PDF, Word, Excel, CSV, imagen, audio) y que el sistema lo clasifique solo. | Clasificación automática: carta, ficha de vino, análisis lab, normativa, libro, anotación. Confirmación al usuario antes de indexar. | M |
| **ING-02** | Como usuario, quiero subir un PDF de carta de vinos y que se extraiga a tabla estructurada (referencia, productor, añada, precio, tipo). | Parsing OCR si es escaneo. Extracción >90% recall en cartas bien estructuradas. Revisión manual de filas dudosas. | M |
| **ING-03** | Como usuario, quiero subir un Excel de inventario y que se mapee a la entidad "vino" del sistema. | Detección de columnas heurística + confirmación. Persistencia con identificadores. | M |
| **ING-04** | Como usuario, quiero subir una ficha de análisis de laboratorio y que se extraigan parámetros (alcohol, pH, AT, AV, SO₂ libre/total, azúcar residual, etc.). | Parser específico para fichas estándar de laboratorios ES. Detección de unidades. Alertas si fuera de rango. | M |
| **ING-05** | Como sistema, quiero detectar PII en documentos subidos y pedir consentimiento. | Detector de DNI, email, teléfono, nombres. Diálogo bloqueante. Opción de redactar antes de indexar. | M |
| **ING-06** | Como usuario, quiero versionar mis cartas y fichas (carta primavera 2026 vs invierno 2025). | Versionado por fecha + label. El agente usa la versión activa por defecto. | M |
| **ING-07** | Como usuario, quiero que cuando actualice un documento, el re-embedding sea incremental, no reindexar todo. | Diff a nivel chunk. Sólo se re-embeden chunks cambiados. | S |
| **ING-08** | Como usuario, quiero subir un PDF escaneado de baja calidad y que el sistema avise si la OCR no es fiable. | Score de confianza OCR. Aviso si <70%. Opción de re-subir mejor escaneo. | M |
| **ING-09** | Como usuario, quiero ver el estado de procesamiento de cada documento en cola. | Estados: subido → clasificando → parseando → embedding → indexado / error. UI con progreso. | M |
| **ING-10** | Como admin, quiero limitar el tamaño y tipo de archivos por plan. | Límites por tenant. Mensajes claros al alcanzarlos. | S |
| **ING-11** | Como usuario, quiero subir un libro técnico (Peynaud, Ribéreau-Gayon) y que sea citable. | Parsing de libros largos. Citas a página/sección. Respeto de copyright (uso interno tenant). | M |
| **ING-12** | Como usuario, quiero ingestar URL (sitio web, normativa publicada en BOE/DOUE) directamente. | Fetcher + indexador. Refresco programable. Detección de cambios. | C |

### 5.3 Sommelier vertical (20+ stories)

| ID | User story | AC | Priority |
|---|---|---|---|
| **SOM-01** | Como sumiller, quiero subir mi carta de vinos en PDF y que el agente la entienda al instante. | Tras subida e indexado (<5 min para 500 refs), el agente responde preguntas sobre la carta. | M |
| **SOM-02** | Como sumiller, quiero pedir maridaje para un plato del menú y recibir 3 opciones de mi carta con justificación. | Cada opción: vino, motivo en una frase, intensidad/perfil. Solo vinos en stock activo. | M |
| **SOM-03** | Como sumiller, quiero filtrar la recomendación por presupuesto del cliente. | Slider o input de rango. El agente respeta el filtro. | M |
| **SOM-04** | Como sumiller, quiero un canvas lateral con ficha del vino, mapa de la región y nota de cata cuando el agente lo recomienda. | Panel lateral plegable. Datos cargados desde KB + global. | M |
| **SOM-05** | Como sumiller, quiero un "modo servicio" con respuestas cortas (1-2 líneas, sin canvas) para usar en sala discretamente. | Toggle modo servicio. Respuestas <40 palabras. UI minimal. | M |
| **SOM-06** | Como sumiller, quiero registrar al cliente del restaurante y lo que pidió para recordarlo en su próxima visita. | Entidad "cliente del tenant" (consentimiento explícito si PII). Histórico de pedidos. Resumen al entrar. | M |
| **SOM-07** | Como sumiller, quiero anotar preferencias y aversiones del cliente (alergias, "no tánico", "le encantó el Borgoña X"). | Memoria estructurada por cliente. Editable. Buscable. | M |
| **SOM-08** | Como sumiller, quiero traducir la carta a EN automáticamente con glosario controlado. | Traducción ES→EN con glosario de términos (DO, crianza, etc.). Editable. Export PDF EN. | M |
| **SOM-09** | Como sumiller jefe de cadena hotelera, quiero ver y gestionar las cartas de los 5 hoteles en un solo workspace. | Multi-establecimiento. Permisos por hotel. Reporting cross-hotel. | M |
| **SOM-10** | Como sumiller, quiero un onboarding guiado de 10 minutos que termine con mi carta indexada y una conversación de prueba. | Wizard 5 pasos. Métricas: time-to-first-value <15 min. | M |
| **SOM-11** | Como sumiller, quiero que el agente sugiera maridajes alternativos si el cliente rechaza el primero. | El agente recuerda la conversación. Diversidad en alternativas (no solo región distinta). | S |
| **SOM-12** | Como sumiller, quiero exportar la carta en distintos formatos (PDF imprimible, app móvil de restaurante, JSON). | Export multi-formato. Plantillas de branding. | S |
| **SOM-13** | Como sumiller, quiero pedirle al agente "qué vinos están rotando poco" y que cruce mi carta con ventas (si he subido ventas). | Cruce KB carta × ventas. Análisis de rotación. Sugerencias de retirada/promoción. | S |
| **SOM-14** | Como sumiller, quiero formación interactiva: el agente me hace preguntas tipo examen sobre regiones, DOs, productores. | Modo formación. Preguntas adaptativas. Tracking de progreso por miembro. | C |
| **SOM-15** | Como sumiller, quiero gestionar versiones de carta (temporada actual vs anterior) y que el agente sepa cuál está activa. | Selector de carta activa. Histórico consultable. | M |
| **SOM-16** | Como sumiller, quiero buscar en mi carta por criterios técnicos en lenguaje natural ("blancos atlánticos < 40€"). | NL2query sobre la KB del tenant. | M |
| **SOM-17** | Como distribuidor (persona Mar), quiero buscar en mi catálogo "tinto Jura bajo sulfuroso stock>0" y obtener resultados con ficha. | NL2query + stock + ficha técnica. | M |
| **SOM-18** | Como distribuidor, quiero generar fichas comerciales con citas técnicas para enviar a mis clientes HoReCa. | Generador de ficha PDF brandeada. Citas verificables. | S |
| **SOM-19** | Como sumiller, quiero que el agente me alerte cuando llega un vino que encaja con una preferencia registrada de un cliente recurrente. | Notificación push/email. Opt-in del cliente final. | C |
| **SOM-20** | Como sumiller, quiero compartir una recomendación generada con el cliente (QR o link efímero) para que la lea en la mesa. | Link único, expira en 24h. Sin PII en el link. | C |
| **SOM-21** | Como sumiller, quiero que el agente reconozca platos del menú degustación al subir el menú en PDF. | Ingestion menú. Entidad "plato" con descriptores. | S |
| **SOM-22** | Como sumiller, quiero modo offline en sala (Fase 3 móvil). | Respuestas cacheadas para últimas N consultas. | W (MVP) |

### 5.4 Cellar vertical (20+ stories)

| ID | User story | AC | Priority |
|---|---|---|---|
| **CEL-01** | Como enólogo, quiero preguntar en lenguaje natural temas técnicos y recibir respuesta con citas a OIV/normativa UE/literatura. | Toda respuesta técnica con ≥1 cita verificable a fuente conocida. | M |
| **CEL-02** | Como enólogo, quiero calcular la corrección de SO₂ activo a partir de SO₂ libre + pH y obtener la dosificación recomendada con cita al límite normativo UE. | Calculadora como tool del agente. Inputs validados. Output: dosis g/hL + cita Reg. UE 2019/934. | M |
| **CEL-03** | Como enólogo, quiero calcular el ajuste de acidez (AT objetivo) usando ácido tartárico/málico/láctico con cálculo de dosis. | Tool calculadora acidez. Soporta tartárico, málico, cítrico. Cita normativa. | M |
| **CEL-04** | Como enólogo, quiero dosificar clarificantes (bentonita, gelatina, caseína) según volumen y test de laboratorio. | Tool. Test previo guiado. Recomendación con margen de seguridad. | M |
| **CEL-05** | Como enólogo, quiero convertir entre Baumé, Brix y grado alcohólico probable con curva oficial. | Tool conversión. Fuente OIV citada. | M |
| **CEL-06** | Como enólogo, quiero llevar un diario de vinificación estructurado por depósito/lote/añada. | Entidad "lote". Registro de operaciones (trasiego, sulfitado, ajuste, análisis). Timeline. | M |
| **CEL-07** | Como enólogo, quiero que cuando registre datos de fermentación, el agente detecte anomalías (fermentación estancada, temperatura alta, AV en aumento). | Reglas + razonamiento del agente. Alerta con causas posibles + intervenciones sugeridas con cita. | M |
| **CEL-08** | Como enólogo, quiero subir el análisis de laboratorio de un lote y que se incorpore al historial del lote. | Ingestion ficha lab → asociación a lote → flags si fuera de rango DO. | M |
| **CEL-09** | Como enólogo, quiero preguntar "esto está permitido en DO Rioja?" y recibir respuesta con cita al pliego de la DO. | Corpus de pliegos DO ES. Cita a artículo. | M |
| **CEL-10** | Como enólogo, quiero consultar el histórico de mi bodega: "qué hicimos cuando la fermentación se estancó en 2023?". | Búsqueda semántica sobre diario. Resúmenes por situación. | M |
| **CEL-11** | Como bodeguero, quiero registrar entradas de uva en vendimia con parámetros (peso, Baumé, pH, sanidad). | Formulario rápido. Validación. Cierre de vendimia agregado. | M |
| **CEL-12** | Como bodeguero, quiero que el agente alerte si los parámetros de entrada de uva están fuera del histórico de la finca. | Comparación con histórico. Alerta + posibles explicaciones. | S |
| **CEL-13** | Como enólogo, quiero generar el resumen técnico de una añada para informe interno o comunicación comercial. | Plantilla de informe. Datos del lote + narrativa generada con citas. | S |
| **CEL-14** | Como enólogo, quiero consultar normativa UE sobre prácticas enológicas autorizadas en lenguaje natural. | Corpus Reg. UE 1308/2013, 2019/934, OIV. NL2query. | M |
| **CEL-15** | Como enólogo, quiero un calendario de operaciones (sulfitados programados, trasiegos, análisis pendientes). | Vista calendario. Recordatorios. | S |
| **CEL-16** | Como enólogo, quiero conectar al agente con sensores IoT (temperatura, densidad) en Fase 3. | Ingestion stream. Alertas en tiempo real. | W (MVP) |
| **CEL-17** | Como enólogo, quiero etiquetar lotes por DO, variedad, viñedo, parcela. | Taxonomía editable. Filtros. | M |
| **CEL-18** | Como enólogo, quiero pedir al agente que compare dos añadas en parámetros clave. | Comparador. Tabla + interpretación. | S |
| **CEL-19** | Como enólogo, quiero que el agente sugiera bibliografía relevante (libros del corpus) para una situación. | Recomendación con citas. Link a la sección si está indexada. | M |
| **CEL-20** | Como enólogo, quiero un onboarding que termine con un lote demo creado y una pregunta técnica respondida con citas. | Wizard. Time-to-first-cited-answer <15 min. | M |
| **CEL-21** | Como bodeguero, quiero hablar con el agente en modo "asistente operativo" con respuestas accionables paso a paso. | Modo guiado. Checklists. | S |
| **CEL-22** | Como enólogo, quiero exportar el cuaderno de bodega a formato exigido por Consejo Regulador. | Export por plantilla DO. | C |
| **CEL-23** | Como enólogo, quiero pedir que el agente me explique una decisión que tomó (qué citas usó, qué descartó). | Trazabilidad de razonamiento. "Show your work". | M |
| **CEL-24** | Como admin de bodega, quiero que un consultor enólogo externo tenga acceso temporal con permisos limitados. | Invitación temporal. Scope por lotes. Expiración. | C |

---

## 6. Edge cases (tratamiento exhaustivo)

| # | Caso | Tratamiento esperado |
|---|---|---|
| 1 | PDF malformado o escaneado de baja calidad | Pipeline: OCR fallback (Tesseract/AWS Textract). Score de confianza. Si <70%, alerta UI + opción de re-subida o revisión manual chunk a chunk. |
| 2 | Documento con PII detectada | Bloqueo previo a indexado. Diálogo: "Hemos detectado [DNI/email/...]. ¿Redactar, mantener con consentimiento, o cancelar?". Log de decisión. |
| 3 | Conflicto KB privada vs KB global | Configurable por admin (default: privado-primero). El agente muestra ambas con flag visible: "según tu KB: X; según OIV: Y". |
| 4 | Cliente cambia de plan / añade miembros | Tenant scaling automático. Avisos al 80% de límite. Sin downtime al upgrade. |
| 5 | Pregunta fuera del corpus | El agente responde "no tengo evidencia en mi corpus" + sugiere qué documento subir. Nunca alucina cita. |
| 6 | Usuario en ES, fuente en EN | Respuesta en ES. Cita textual en EN entre comillas + traducción de la frase citada. Link a documento original. |
| 7 | Versionado de carta de restaurante | Múltiples versiones coexisten. Selector de versión activa. Histórico siempre consultable. El agente solo recomienda sobre versión activa salvo que el usuario lo pida explícito. |
| 8 | Re-embedding de PDF actualizado | Diff a nivel chunk. Solo se re-embeben chunks cambiados. La versión anterior queda archivada, no borrada. |
| 9 | Sumiller en sala sin conectividad | **No resuelto en MVP.** Documentado como requirement Fase 3 (PWA + cache de últimas N consultas + sync diferido). |
| 10 | Conflicto entre dos fuentes técnicas (OIV vs Reg. UE) | El agente presenta ambas con jerarquía explícita: normativa aplicable > consenso técnico > literatura. |
| 11 | Calculadora del cellar con inputs absurdos (pH=14, SO₂ negativo) | Validación. El agente se niega y explica rangos plausibles. |
| 12 | Usuario pide ayuda médica/legal/inversión | El agente declina y redirige al ámbito profesional adecuado. |
| 13 | Cliente quiere borrar todos sus datos | Self-service "borrar workspace". Soft-delete 30 días + hard-delete. Confirmación doble. |
| 14 | Múltiples admins editando KB a la vez | Locks suaves por documento. Historial de cambios. Conflict resolution UI. |
| 15 | Hallazgo de alucinación reportado por usuario (👎) | Flag en la conversación. Pipeline de revisión humana. Penaliza el chunk-source en futuras retrievals si se confirma. |
| 16 | Cita rota (documento eliminado por usuario) | El agente avisa: "esta respuesta se basaba en un documento que ya no está en tu KB". Marca la respuesta como obsoleta. |
| 17 | Distribuidor sube catálogo masivo (10.000+ refs) | Procesamiento por lotes con cola visible. Avisos por email al completar. |
| 18 | Idioma minoritario (catalán, gallego, euskera) en KB del tenant | Indexado y query soportados. Cita en idioma original. Respuesta en idioma elegido por usuario. |
| 19 | Cliente que pide algo legal/comercialmente sensible ("¿este vino es mejor que el de la competencia?") | El agente compara solo por parámetros objetivos con citas. Nunca opinión subjetiva como hecho. |
| 20 | Onboarding interrumpido a mitad | Estado guardado. Reanudable. Email de recordatorio al día 3. |

---

## 7. Flujos de onboarding

### 7.1 Onboarding sumiller (objetivo: time-to-first-value <15 min)

1. **Signup** (email/SSO) + selección de vertical "Sommelier".
2. **Tipo de negocio**: restaurante / hotel-cadena / distribuidor → ramifica wizard.
3. **Subir carta** (PDF/Excel) — opción "uso de plantilla demo" si no tiene aún.
4. **Vista de extracción**: muestra tabla parseada, deja revisar/corregir filas dudosas.
5. **Configuración rápida**: idiomas activos, moneda, modo servicio on/off.
6. **Primera conversación guiada**: el sistema sugiere 3 prompts típicos ("recomienda maridaje para un solomillo a la pimienta", "tradúceme esta ficha a EN", "qué blanco atlántico tengo bajo 30€").
7. **Cierre con CTA**: invitar al equipo / configurar memoria de cliente / subir documento adicional.

### 7.2 Onboarding enólogo (objetivo: time-to-first-cited-answer <15 min)

1. **Signup** + selección "Cellar".
2. **Tipo**: bodega / consultoría enológica / centro de investigación.
3. **DO/región principal** (auto-carga el pliego DO al corpus accesible del tenant).
4. **Crear lote demo** (variedad, depósito, fecha de vendimia simulada).
5. **Subir un documento técnico** opcional (ficha de análisis, ficha técnica de añada anterior). Plantilla demo si no.
6. **Primera pregunta técnica guiada**: "¿qué dosis de SO₂ activo necesito para 5 mg/L a pH 3.4?" → calculadora ejecutada + cita normativa.
7. **Cierre con CTA**: configurar diario de vinificación / invitar al equipo / programar primer análisis.

### 7.3 Onboarding distribuidor (objetivo: catálogo navegable <30 min)

1. **Signup** + "Distribuidor" dentro de vertical sommelier.
2. **Subida masiva de catálogo** (Excel/CSV). Pipeline en cola con progreso.
3. **Mapeo de columnas** asistido (referencia, productor, DO, tipo, stock, precio coste/PVP).
4. **Búsqueda de prueba** en lenguaje natural sobre el catálogo.
5. **Generar primera ficha comercial** demo para un cliente HoReCa ficticio.
6. **Cierre con CTA**: invitar al equipo comercial / subir documentación técnica adicional.

---

## 8. Métricas de éxito

### Activación

| Métrica | Objetivo MVP |
|---|---|
| Time-to-first-value (sommelier) | <15 min desde signup |
| Time-to-first-cited-answer (cellar) | <15 min desde signup |
| % de signups que completan onboarding | >65% |
| % de tenants con al menos 1 documento subido en D7 | >70% |

### Retención

| Métrica | Objetivo MVP |
|---|---|
| WAU/MAU sommelier | >50% |
| WAU/MAU cellar | >40% (uso más esporádico, por campaña) |
| Churn mensual logo | <4% |
| Documentos acumulados por tenant en M3 | mediana >20 |

### Calidad LLM

| Métrica | Objetivo MVP |
|---|---|
| % de respuestas técnicas con cita | 100% |
| Hallucination rate (cita rota o inventada, eval manual) | <2% |
| Precision@5 en NL2query sobre KB privada | >85% |
| Recall en parsing de carta PDF estructurada | >90% |
| Tasa 👍 sobre respuestas evaluadas | >75% |
| Tiempo medio de respuesta (p95) | <6s para chat, <15s para análisis de lote |

### NPS por vertical

| Métrica | Objetivo MVP |
|---|---|
| NPS sumilleres design partners | >50 |
| NPS enólogos design partners | >40 |
| NPS distribuidores | >30 |

### Coste y eficiencia

| Métrica | Objetivo MVP |
|---|---|
| Coste medio LLM por usuario activo/mes | <8€ (con caching agresivo) |
| Cache hit rate prompt cache | >60% |
| Coste por documento ingestado | <0,20€ |

---

## 9. Naming, branding y tono de voz

### Marca

**Wined** — nombre dado. Lectura: "wined" como participio inglés de _wine_ ("vinizado") + eco a _wired_ (conectado, inteligente). Pronunciable en ES e internacional.

### Taglines propuestos — ES

1. **"El copiloto del vino. Cita, recuerda, aprende."**
2. **"Vino con criterio. IA con citas."**
3. **"Tu bodega, tu sala, tu memoria. Con la IA que cita."**

### Taglines propuestos — EN

1. **"The wine copilot. Cited. Trained on your house."**
2. **"Wine intelligence, with sources."**
3. **"Your cellar, your floor, your memory — AI included."**

### Dominio sugerido (no chequeado)

- `wined.com` — premium, primera opción si disponible.
- `wined.app` — alternativa moderna SaaS.
- `wined.ai` — refuerza la propuesta IA.
- `wined.io` — fallback técnico.
- `wined.es` — alternativa local España para SEO.

Recomendación: intentar `wined.com` y `wined.app` en paralelo.

### Tono de voz por vertical

**Wined-Sommelier**:
- Cálido, culto, contenido. No pedante.
- Frases cortas en modo servicio.
- Usa terminología profesional sin sobrecargar.
- Ejemplo: _"Para el solomillo a la pimienta, prueba el Mencía de Bierzo del 21: cuerpo medio, especiado, fruta roja sin exceso de extracción."_

**Wined-Cellar**:
- Técnico, preciso, prudente.
- Cita siempre. Nunca afirma sin respaldo.
- Tono de colega senior, no de oráculo.
- Ejemplo: _"Para 5 mg/L de SO₂ activo a pH 3.4 y 14 % vol., dosis estimada 38 g/hL de K₂S₂O₅ (cálculo OIV §2.1.18). Límite UE para tinto seco: 150 mg/L SO₂ total (Reg. UE 2019/934 Anexo I, Parte B)."_

### Voz transversal

- Habla en primera persona del agente solo cuando aporta.
- Nunca finge experiencia humana. Si no sabe, lo dice.
- Idioma siempre el del usuario; cita en el idioma original.

---

## 10. Fuera de scope MVP

Explícitamente **no** se incluye en el MVP:

1. **Aplicación móvil nativa** (iOS/Android) — Fase 3. MVP es web-first responsive.
2. **Modo voz / dictado** — Fase 2/3.
3. **Integraciones con POS de restaurante** (Lightspeed, Square, Ágora, TPVs).
4. **Integraciones con ERPs de bodega** (Vintrace, InnoVint, SAP).
5. **Conexión con sensores IoT de bodega** (densidad, temperatura, presión).
6. **Producto B2C** para el comensal final / consumidor.
7. **Marketplace de compra-venta** de vino.
8. **Pagos y facturación entre distribuidor y HoReCa** dentro de la app.
9. **Gestión de stock en tiempo real con inventario físico** (solo importación estática de stock).
10. **Modo offline en sala** (PWA con caché) — Fase 3.
11. **Reconocimiento de imagen de etiqueta** (foto botella → ficha) — Fase 2.
12. **Generación de etiquetas y mockups visuales** para bodega.
13. **Cobertura de mercados fuera de España** (FR, IT, PT, US) — Fase 2+ (corpus normativo distinto).
14. **Funcionalidades de comunidad/red social** entre tenants.
15. **Marketplace de plugins/agentes de terceros.**

---

## Apéndice — Riesgos clave a vigilar

| Riesgo | Mitigación temprana |
|---|---|
| Alucinaciones en respuestas técnicas (cellar) | Citas obligatorias + evals con enólogos advisors + abstención explícita |
| Copyright de libros técnicos en corpus global | Uso interno por tenant + licencias + opción de subir su propia copia |
| Coste LLM disparado por tenants pesados | Prompt caching agresivo + límites por plan + modelos escalonados (Haiku/Sonnet) según tarea |
| Switching difícil por dependencia de KB privada (riesgo para el cliente) | Export GDPR completo siempre disponible (transparencia genera confianza) |
| PII de clientes del restaurante (memoria de cliente) | Consentimiento explícito + RBAC + cifrado + retención configurable |
| Adopción lenta en bodegas tradicionales | Design partners visibles + casos de uso operativos (calculadoras, no solo chat) |

---

**Fin SPEC.md — Wined**
