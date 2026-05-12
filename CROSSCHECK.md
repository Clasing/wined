# CROSSCHECK.md — Wined: Auditoría SPEC.md vs PLAN.md

> Auditor: agente técnico. Fecha: 2026-05-11.
> Objetivo: detectar gaps, contradicciones y decisiones técnicas sin respaldo entre SPEC.md (producto) y PLAN.md (técnico). Ambos generados en paralelo.

---

## 1. Cobertura User Story → Step (MUST y SHOULD)

Leyenda: **GAP** = ningún step lo implementa explícitamente. **PARCIAL** = se cubre la mecánica pero el AC del SPEC no queda satisfecho. **OK** = step(s) cubren AC.

### 1.1 Núcleo compartido (NUC)

| User Story | Priority | Step(s) PLAN | Estado | Nota |
|---|---|---|---|---|
| NUC-01 signup + selección vertical | M | 30 | OK | Onboarding pide `product` (sommelier/cellar/both), pero NO ramifica wizard por rol detectado. |
| NUC-02 invitar miembros con RBAC | M | 30 (parcial), schema memberships | PARCIAL | Schema `memberships` con roles existe, pero NO hay step de "Members" UI ni endpoint de invitación. |
| NUC-03 memoria persistente editable (GDPR) | M | — (sólo guest-memory) | **GAP** | No hay entidad "memoria de usuario" cross-conversación editable/borrable. `tenant_kb` no es por-usuario. |
| NUC-04 KB privada aislada cross-tenant | M | 7 (RLS), 17 (tenant-guard), riesgo #4 | OK | RLS + partition por org. |
| NUC-05 query ES, fuente EN, respuesta ES | M | 14, 16 (Cohere multilingual) | PARCIAL | Embeddings multilingual pero el AC dice "cita en idioma original + traducción de la frase citada" — no hay step que implemente traducción de cita. |
| NUC-06 citas verificables, "no tengo evidencia" | M | 12, 13 (system prompts mencionan `[doc:<id>]`) | PARCIAL | No hay step que implemente UI click-en-cita → fragmento, ni mecanismo "no tengo evidencia". Eval rubric cubre `citation` pero no la abstención. |
| NUC-07 toggle ES/EN en cabecera | M | 36, 37 (next-intl) | PARCIAL | i18n de UI implementada; falta toggle que cambie el idioma de **salida del agente** sin tocar KB. |
| NUC-08 dashboard de consumo + alertas 80% | S | 54 (parcial) | PARCIAL | `/admin/metrics` muestra 4 KPIs; no hay alertas al 80% del plan ni vista por miembro. |
| NUC-09 export GDPR Art.20 (ZIP+JSON+PDFs) | M | — | **GAP** | No hay step de export. Mencionado en riesgos pero no implementado. |
| NUC-10 audit log inmutable + export CSV | S | 21 | PARCIAL | Audit log se escribe; falta filtro UI y export CSV. |
| NUC-11 search full-text + semántico en chat histórico | S | — | **GAP** | No hay índice ni endpoint de búsqueda sobre `messages`. |
| NUC-12 bookmarks de respuestas | C | — | GAP (C — aceptable) | |
| NUC-13 conflicto privado vs global, configurable | M | — | **GAP** | No hay setting `org.kb_preference` ni lógica en RAG. |
| NUC-14 feedback 👍/👎 estructurado | M | — | **GAP** | No hay tabla `message_feedback` ni endpoint. |
| NUC-15 PII consent gate bloqueante | M | 25 (detección) | PARCIAL | Detecta y flagea, pero NO hay diálogo bloqueante ni "consent UI" antes de indexar. |
| NUC-16 disclaimer "soy IA" en 1ª respuesta | M | — | **GAP** | No hay step que añada disclaimer a la primera respuesta de sesión. |

### 1.2 Ingestion (ING)

| User Story | Priority | Step(s) | Estado | Nota |
|---|---|---|---|---|
| ING-01 subir cualquier archivo y clasificar | M | 15, 23 | PARCIAL | SPEC dice "PDF, Word, Excel, CSV, imagen, audio". PLAN cubre PDF/XLSX/DOCX/imagen. **CSV no parser**, **audio no parser**. |
| ING-02 PDF carta → tabla estructurada >90% recall | M | 24 (extractor wine_list) | OK | |
| ING-03 Excel inventario → entidad vino | M | 15 (xlsx), 24, 34 | OK | |
| ING-04 ficha lab → parámetros (alcohol/pH/AT/AV/SO₂/azúcar) | M | 24 (technical_sheet) | PARCIAL | Schema cubre alcohol, pH, totalAcidity, residualSugar. **Falta AV (acidez volátil), SO₂ libre/total, unidades, alertas fuera de rango**. SPEC pide "alertas si fuera de rango"; PLAN no lo entrega. |
| ING-05 detección PII + consent bloqueante | M | 25 | PARCIAL | Ver NUC-15. |
| ING-06 versionado carta primavera vs invierno | M | 28, schema (parent_doc_id, version) | OK | Selector activo NO implementado en UI. |
| ING-07 re-embedding incremental | S | 28 | OK | |
| ING-08 OCR low-confidence warning | M | 15 (fallback OCR) | PARCIAL | Fallback existe; no hay score de confianza ni UI de aviso. |
| ING-09 estados de procesamiento visibles | M | 20, 33 | OK | |
| ING-10 límites por plan | S | — | **GAP** | Sólo cap de tokens embeddings (Step 27); no límites de tamaño/tipo por tenant/plan. |
| ING-11 libros técnicos (Peynaud, Ribéreau-Gayon) citables por página | M | — | **GAP** | No hay parser book-aware (capítulos/páginas), ni respeto de copyright explícito. |
| ING-12 ingestar URL (BOE/DOUE) | C | — | GAP (C — aceptable) | |

### 1.3 Sommelier (SOM)

| ID | Pri | Step(s) | Estado | Nota |
|---|---|---|---|---|
| SOM-01 subir carta PDF e indexar en <5 min | M | 19, 20, 33 | PARCIAL | Pipeline existe; el SLA <5min/500 refs no está garantizado en código. |
| SOM-02 maridaje 3 opciones con justificación + in-stock | M | 12 (pairing) | OK | |
| SOM-03 filtro por presupuesto | M | 12 (`maxPriceEur`) | OK | |
| SOM-04 canvas lateral con ficha+mapa+nota | M | 32 | PARCIAL | Chat UI mencionada; canvas lateral con mapa NO especificado. |
| SOM-05 "modo servicio" respuestas <40 palabras | M | — | **GAP** | No hay toggle ni system-prompt variant. |
| SOM-06 entidad "cliente del tenant" + histórico | M | 12 (guest-memory), 35 | PARCIAL | Guest memory pero NO entidad "pedidos" ni resumen al entrar. |
| SOM-07 preferencias/aversiones cliente | M | 12, 35 | OK | |
| SOM-08 traducción carta ES→EN + glosario + export PDF | M | — | **GAP** | No hay step de traducción de carta ni glosario controlado ni export PDF EN. |
| SOM-09 multi-establecimiento (5 hoteles desde un workspace) | M | schema `workspaces` | PARCIAL | Tabla existe; UI/permisos cross-hotel NO implementados; "reporting cross-hotel" GAP. |
| SOM-10 onboarding sommelier <15min, wizard 5 pasos | M | 30 (parcial) | PARCIAL | No hay wizard de 5 pasos como SPEC §7.1 detalla (subir carta, vista extracción con revisión, configuración rápida, 3 prompts demo). |
| SOM-11 alternativas si cliente rechaza | S | — | **GAP** | Requiere lógica conversacional dedicada. |
| SOM-12 export multi-formato (PDF imprimible, móvil, JSON) | S | — | **GAP** | |
| SOM-13 análisis rotación (cruce carta×ventas) | S | — | **GAP** | No hay entidad "ventas" ni step de ingest de ventas. |
| SOM-14 modo formación tipo examen | C | — | GAP (C — aceptable) | |
| SOM-15 versiones de carta + activa | M | schema, 28 | PARCIAL | Versionado de doc existe; "carta activa" como concepto de dominio NO. |
| SOM-16 NL2query sobre carta tenant | M | 12 (search_tenant_inventory) | OK | |
| SOM-17 distribuidor NL2query catálogo | M | 12 | PARCIAL | Mismo motor; no hay vertical "distribuidor" diferenciada. SPEC §7.3 pide onboarding distribuidor distinto — **GAP**. |
| SOM-18 fichas comerciales PDF brandeadas | S | — | **GAP** | |
| SOM-19 alertas a sumiller cuando llega vino que encaja con cliente | C | — | GAP (C — aceptable) | |
| SOM-20 link efímero QR para cliente | C | — | GAP (C — aceptable) | |
| SOM-21 ingestion menú degustación, entidad plato | S | — | **GAP** | doc_type no incluye `menu`; no hay entidad `dish`. |

### 1.4 Cellar (CEL)

| ID | Pri | Step(s) | Estado | Nota |
|---|---|---|---|---|
| CEL-01 respuesta técnica con citas OIV/UE/lit. | M | 13 (compliance, enology), 52 | PARCIAL | Falta corpus seed de OIV y normativa UE (Step 52 sólo carga 1000 vinos, no OIV/EUR-Lex). **GAP corpus**. |
| CEL-02 calculadora SO₂ activo + cita Reg. UE 2019/934 | M | 13 (sulfitesDose) | PARCIAL | Cálculo OK; cita normativa NO se inyecta en respuesta (no hay tabla de límites UE referenciada). |
| CEL-03 ajuste acidez (tartárico/málico/láctico) | M | 13 (CalcTools menciona placeholder) | PARCIAL | Mencionado pero no schema definido en código del plan. |
| CEL-04 dosis clarificantes (bentonita/gelatina/caseína) + test previo | M | — | **GAP** | No está en CalcTools. |
| CEL-05 Baumé/Brix/grado alcohólico | M | — | **GAP** | No está en CalcTools (chaptalization sí, pero no conversión Baumé). |
| CEL-06 diario vinificación por depósito/lote/añada | M | 13 (journal), 42 | PARCIAL | `tenant_kb` key — sin entidad de primera clase "lote", sin tabla. **No es timeline relacional**. |
| CEL-07 detección anomalías fermentación | M | 13 (anomaly), 45 | OK | |
| CEL-08 ingestion ficha lab → asoc. lote → flags rango DO | M | 24 | PARCIAL | Extrae datos; asociación a lote NO; flags DO NO. |
| CEL-09 "esto permitido en DO Rioja?" con cita al pliego | M | 13 (compliance) | **GAP CORPUS** | No hay step que cargue los 70+ pliegos DO. Step 14 menciona `do-spain.ts` con "70+ DOs" pero sólo taxonomía, no pliegos completos citables. |
| CEL-10 histórico bodega "qué hicimos en 2023?" | M | 13 (journal) | PARCIAL | Depende de NUC-11 (búsqueda semántica en histórico). |
| CEL-11 registro entradas uva en vendimia | M | — | **GAP** | No hay form ni schema "entrada uva". |
| CEL-12 alertas si fuera de histórico finca | S | — | **GAP** | |
| CEL-13 resumen técnico de añada | S | — | **GAP** | |
| CEL-14 corpus Reg. UE 1308/2013, 2019/934, OIV | M | — | **GAP CORPUS** | Step 52 NO incluye este corpus. Crítico para CEL-01/02/09/14. |
| CEL-15 calendario operaciones | S | — | **GAP** | |
| CEL-17 etiquetar lotes por DO/variedad/viñedo/parcela | M | — | **GAP** | No hay taxonomía editable de lotes. |
| CEL-18 comparar dos añadas | S | — | **GAP** | |
| CEL-19 sugerir bibliografía relevante | M | — | **GAP** | Sin libros indexados, imposible. |
| CEL-20 onboarding cellar <15min con lote demo + 1 pregunta | M | 39 (parcial) | PARCIAL | Wizard demo NO implementado como SPEC §7.2. |
| CEL-21 modo asistente operativo, checklists | S | — | **GAP** | |
| CEL-23 trazabilidad razonamiento "show your work" | M | — | **GAP** | No hay UI que muestre tools usadas, citas consideradas/descartadas (a pesar de tener `agent_invocations` en DB). |
| CEL-24 acceso temporal consultor externo | C | — | GAP (C — aceptable) | |

---

## 2. Inconsistencias detectadas SPEC ↔ PLAN

| # | SPEC dice | PLAN dice | Conflicto |
|---|---|---|---|
| I-1 | NUC-05/SPEC §9: cita siempre en idioma original + traducción de la frase citada. ES↔EN nativo. | PLAN usa Cohere multilingual y prompts en EN; no especifica retorno bilingüe de citas. | Medio. Requiere step adicional de "cita formatter". |
| I-2 | ING-01: subir "cualquier archivo (PDF, Word, Excel, CSV, **imagen, audio**)". | PLAN parsers: pdf/xlsx/docx/image-ocr. **Sin CSV, sin audio (Whisper)**. | Alto. SPEC explícito; PLAN omite. |
| I-3 | Edge 18: catalán, gallego, euskera indexables y query soportados. | PLAN no menciona idiomas regionales; tesseract usa `eng+spa`. | Medio. Cohere multilingual los soporta, pero PLAN no lo hace explícito ni añade `cat/glg/eus` a tesseract. |
| I-4 | Métricas §8: WAU/MAU, churn logo, NPS, hallucination rate, cache hit, coste/usuario. | PLAN observabilidad cubre p50/95/99, tokens, cache hit, eval score, error rate. **No** WAU/MAU, **no** churn, **no** NPS pipelines, **no** coste/usuario. | Alto. Ver §5. |
| I-5 | SPEC §4 persona 2 (hotel): DE/FR deseables. | PLAN i18n sólo ES/EN. | Bajo (deseable, no Must). |
| I-6 | NUC-07: toggle ES/EN cambia idioma de salida del agente sin tocar memoria/KB. | PLAN: `next-intl` para UI; no hay flag de output language en agentes. | Medio. |
| I-7 | Edge 5: "el agente responde 'no tengo evidencia'". SPEC §9 voz: "Nunca finge experiencia humana. Si no sabe, lo dice". | PLAN no codifica abstención explícita en system prompts (sólo `Cite source documents`). | Alto. Eval rubric tampoco penaliza alucinación si no hay cita. |
| I-8 | NUC-13: configurable privado-primero vs global-primero. Default privado-primero. | PLAN: prompts no menciona prioridad. RAG (`ragCorpus` en AgentDef) sólo lista `docTypes`. | Medio. |
| I-9 | Edge 10: jerarquía normativa > consenso técnico > literatura cuando hay conflicto. | PLAN no implementa ranking de fuentes ni metadata "source tier". | Medio-Alto. |
| I-10 | SPEC §8: "tiempo medio de respuesta p95 <6s chat, <15s análisis lote". | PLAN no traza ni alerta sobre estos umbrales por categoría. | Medio. |
| I-11 | SPEC §8: "% respuestas técnicas con cita = 100%". | PLAN judge mide `citation` (0..1) pero **no hay gate** que bloquee respuestas sin cita. | Alto. |
| I-12 | SPEC §10 fuera de scope: "Modo offline en sala — Fase 3". | PLAN no lo menciona; coherente. | — |
| I-13 | SPEC §6 Edge 13: borrar workspace self-service, soft-delete 30d + hard-delete. | PLAN no implementa step de delete + retención. | Alto (GDPR). |
| I-14 | SPEC §8 coste: <8€/usuario/mes. | PLAN §11 estima ~$0.011/conversación, ~$6,600/mes para 100 tenants × 200 conv/día. Tenant ≠ usuario; el ratio queda sin atar. | Bajo. Requiere alinear unidades. |
| I-15 | SPEC NUC-15: "log de decisión" tras consent PII. | PLAN: audit_log existe, pero no hay step explícito que registre decisión PII. | Bajo. |
| I-16 | SPEC §9: "Nunca afirma sin respaldo" (Wined-Cellar). | PLAN: prompts cellar (enology) no especificados en código; sólo placeholders. | Medio. |
| I-17 | SPEC §3: "Corpus avalado por expertos de España". | PLAN: ningún step para curaduría humana de corpus / workflow de review. | Medio. |

---

## 3. Decisiones técnicas del PLAN sin respaldo en SPEC

| Decisión PLAN | SPEC respaldo | Veredicto |
|---|---|---|
| **Stack Next.js 14 + Hono + Drizzle + Clerk** | SPEC neutro; no exige stack. | Libre elección razonable. |
| **Cohere `embed-multilingual-v3.0`** (vs OpenAI text-embedding-3-large) | SPEC: ES nativo + EN. | Consistente con NUC-05 — defendible. Validar coste vs OIV en libros largos. |
| **Postgres + pgvector, HNSW, 16 particiones HASH por org** | SPEC: aislamiento + KB privada. | Consistente. Riesgo de re-partition al crecer (PLAN lo reconoce). |
| **BullMQ + Redis para ingestion async** | SPEC: estado de procesamiento visible (ING-09). | Consistente. |
| **Claude Haiku para router + Sonnet para specialists** | SPEC: coste <8€/usuario/mes. | Consistente con riesgo de coste. |
| **Modelos `claude-haiku-4` y `claude-sonnet-4`** | SPEC no menciona modelos. | Defendible. Validar disponibilidad de SDK al codificar. |
| **Vercel para web + Fly.io para api** | SPEC neutro. | Libre. |
| **Langfuse self-host** | SPEC neutro. | Libre. |
| **Clerk para auth + orgs** | SPEC: SSO Google (NUC-01). | Consistente. |
| **`tenant_kb` JSONB para inventario/guests/journal** | SPEC: entidades dominio (cliente, lote, plato). | **CONFLICTO**. SPEC trata estos como entidades de primera clase; PLAN los aplasta en JSONB sin schema, perdiendo queryability/integridad. Especialmente grave para CEL-06 (lote/depósito/añada) y CEL-17 (taxonomía editable). |
| **`vector(1024)` fijo** | SPEC neutro. | Atado a Cohere; si se cambia provider, migración costosa. |
| **Apify para scraping Vivino** | SPEC §10: no marketplace. SPEC neutro sobre fuente catálogo. | Libre, pero riesgo legal (ToS Vivino). Validar con humano. |
| **`organizations.product` enum (sommelier|cellar|both)** | SPEC: 2 verticales + distribuidor (variante sommelier). | **GAP**. PLAN no tiene "distributor" como producto. SPEC §7.3 pide onboarding distribuidor distinto. |
| **Tesseract `eng+spa` para OCR** | Edge 18: cat/glg/eus. | Inconsistente. |
| **Semantic-cache TTL 24h, umbral 0.93** | SPEC: cache hit >60% (§8). | Defendible. Validar TTL para datos volátiles (inventario). |
| **Rate-limit 60 req/min, 200k tokens/min default** | SPEC neutro. | Libre. |

---

## 4. Edge cases SPEC §6 — cobertura en PLAN

| # | Edge case | PLAN | Tratado |
|---|---|---|---|
| 1 | PDF malformado / escaneo bajo OCR | Step 15 fallback OCR | PARCIAL (sin score confianza ni UI re-subida) |
| 2 | PII detectada + diálogo | Step 25 | PARCIAL (sin UI bloqueante) |
| 3 | Conflicto KB privada vs global | — | **NO** |
| 4 | Scaling tenant + alertas 80% plan | — | **NO** |
| 5 | Pregunta fuera del corpus → "no tengo evidencia" | — | **NO** (no system prompt explícito) |
| 6 | Usuario ES, fuente EN | Cohere multilingual | PARCIAL (sin formatter de cita bilingüe) |
| 7 | Versionado carta + selector activo | Schema versioning | PARCIAL (sin "active version" en UI) |
| 8 | Re-embedding diff chunk | Step 28 | SÍ |
| 9 | Sala sin conectividad | Fuera de scope MVP | SÍ (out-of-scope coherente) |
| 10 | Conflicto OIV vs Reg. UE → jerarquía | — | **NO** |
| 11 | Calculadora inputs absurdos | Step 13 (`pH` Zod 2.5-4.5) | SÍ (parcial — sólo SO₂) |
| 12 | Pregunta médica/legal → declina | — | **NO** (sin guardrail en prompts) |
| 13 | Borrar workspace + retención | — | **NO** |
| 14 | Locks suaves edición concurrente KB | — | **NO** |
| 15 | Hallucination reportada → revisión | — | **NO** (no hay feedback loop) |
| 16 | Cita rota (doc borrado) | — | **NO** |
| 17 | Catálogo masivo 10k refs | BullMQ | PARCIAL (cola sí, emails no) |
| 18 | Idiomas minoritarios (cat/glg/eus) | — | **NO** |
| 19 | Pregunta comercialmente sensible | — | **NO** |
| 20 | Onboarding interrumpido + email recordatorio | — | **NO** |

**Score cobertura edge cases**: 2/20 SÍ, 5/20 PARCIAL, 13/20 NO.

---

## 5. Métricas SPEC §8 vs observabilidad PLAN

| Métrica SPEC | PLAN puede medirla? | Step |
|---|---|---|
| Time-to-first-value <15min | NO | Falta event tracking de onboarding completion. |
| % signups que completan onboarding | NO | Falta funnel events. |
| % tenants con ≥1 doc en D7 | PARCIAL | Query DB ad-hoc, no dashboard. |
| WAU/MAU | NO | No hay event tracking de sesiones de uso. |
| Churn mensual logo | NO | No hay Stripe ni signal cancelación. |
| Docs acumulados M3 | PARCIAL | Query DB. |
| % respuestas técnicas con cita | PARCIAL | Eval mide `citation`; falta gate runtime y dashboard. |
| Hallucination rate <2% | PARCIAL | Sólo en evals, no en producción (no feedback humano). |
| Precision@5 NL2query KB privada | NO | Sin dataset per-tenant medido. |
| Recall parsing carta >90% | NO | Sin métrica automatizada. |
| Tasa 👍 >75% | NO | Sin tabla feedback. |
| p95 chat <6s, análisis <15s | PARCIAL | Langfuse mide latencia general; falta separar categorías. |
| NPS por vertical | NO | Sin captura. |
| Coste LLM/usuario/mes <8€ | NO | PLAN calcula por conversación, no por usuario. |
| Cache hit ratio >60% | SÍ | Langfuse §7.5 lo lista (aunque PLAN puso target >40%). |
| Coste por doc ingestado <0,20€ | NO | Sin tracking de coste por documento. |

**Veredicto**: ~3/16 métricas medibles con el PLAN actual. **Brecha de observabilidad severa**.

---

## 6. Top 10 gaps críticos (ordenados por severidad)

1. **Corpus normativo y técnico ausente**. PLAN no carga OIV, Reg. UE 1308/2013, 2019/934, ni pliegos DO. CEL-01/02/09/14 (todos MUST) son inviables sin esto. Step 52 sólo carga 1000 vinos. **Bloqueante para vertical cellar entero**.
2. **Entidades de dominio del cellar aplastadas en `tenant_kb` JSONB**. Lote/depósito/añada, entrada uva, ficha lab asociada, taxonomía DO/variedad/parcela. SPEC los pide como first-class; PLAN los entierra. CEL-06/08/11/17 quedan PARCIAL/GAP.
3. **Citas sin gate runtime**. SPEC exige 100% respuestas técnicas con cita. PLAN no bloquea respuestas sin cita, no formatea citas bilingües, no implementa "no tengo evidencia", no maneja cita rota.
4. **GDPR endpoints ausentes**. Export Art.20 (NUC-09 MUST), borrado workspace soft+hard (Edge 13), edición/borrado memoria usuario (NUC-03 MUST). Riesgo legal real.
5. **Memoria de usuario inexistente**. NUC-03 MUST. No hay schema `user_memory` ni endpoint. `tenant_kb` es por org, no por usuario.
6. **Feedback loop ausente**. NUC-14 MUST (👍/👎). No hay tabla, endpoint, ni signal para evals. Sin esto no hay hallucination rate ni mejora continua.
7. **Distribuidor no es first-class**. SPEC §7.3 + SOM-17/18 lo tratan como onboarding y vertical propio. PLAN no tiene `product='distributor'`, ni fichas comerciales, ni onboarding distinto.
8. **Modo servicio + onboarding wizards no implementados**. SOM-05 MUST (modo servicio), SOM-10 MUST (wizard 5 pasos), CEL-20 MUST (wizard cellar). Step 30/39 son demasiado superficiales.
9. **Observabilidad de producto inexistente**. WAU/MAU, NPS, time-to-value, churn, feedback rate — métricas centrales del SPEC §8 imposibles de medir. Sólo cubre métricas técnicas (latencia/tokens).
10. **CSV + audio + idiomas regionales (cat/glg/eus) + libros técnicos no parseables**. ING-01 MUST y ING-11 MUST quedan incompletos; Edge 18 ignorado.

---

## 7. Recomendaciones accionables

### Steps a AÑADIR (numeración sugerida tras Step 56)

- **Step 57 — Corpus normativo seed**: cargar Reg. UE 1308/2013, 2019/934 (EUR-Lex), OIV resoluciones, 70 pliegos DO ES en `wine_catalog_global` o tabla nueva `regulatory_corpus` con metadata source-tier.
- **Step 58 — Entidades dominio cellar**: tablas `wine_lots`, `lot_operations`, `lab_analyses`, `grape_intakes`, `vineyards`, con FK a `organizations`. Refactor agentes cellar para usar estas tablas.
- **Step 59 — Citation gate + abstention**: middleware en gateway que verifica que respuestas marcadas `technical=true` lleven ≥1 cita; si retrieval = ∅ → respuesta "no tengo evidencia" obligatoria. System-prompt update.
- **Step 60 — GDPR endpoints**: `POST /v1/me/export` (ZIP), `DELETE /v1/orgs/:id` (soft+hard delete con grace 30d), `DELETE /v1/me/memory`.
- **Step 61 — User memory schema**: tabla `user_memory` (user_id, organization_id, content JSONB) + endpoints CRUD.
- **Step 62 — Feedback API**: tabla `message_feedback` + `POST /v1/messages/:id/feedback` + dashboard.
- **Step 63 — Distributor product type**: añadir enum value, onboarding §7.3, fichas comerciales PDF generator.
- **Step 64 — Onboarding wizards completos**: 3 wizards (sommelier/cellar/distributor) siguiendo SPEC §7 paso a paso, con event tracking (`onboarding.step_completed`).
- **Step 65 — Modo servicio sommelier**: toggle UI + system-prompt variant <40 palabras.
- **Step 66 — Product analytics**: PostHog (o equivalente) con events: signup, onboarding_completed, document_uploaded, message_sent, feedback_given, churn signals. Pipelines WAU/MAU/NPS.
- **Step 67 — Parsers adicionales**: CSV, audio (Whisper API), tesseract con `cat+glg+eus`. Confidence score OCR + UI warning.
- **Step 68 — Conflict resolution KB**: setting `org.kb_preference`, lógica RAG re-ranking, UI flag visible.
- **Step 69 — Source tier ranking**: metadata `source_tier` (regulation > consensus > literature) en chunks, weighting en retrieval.
- **Step 70 — Calc tools cellar completas**: acidez (tartárico/málico/láctico), clarificantes (bentonita/gelatina/caseína), Baumé/Brix/ABV, todas con cita normativa inyectada.
- **Step 71 — Guardrails legales/médicos**: prompt-level guardrail + classifier que detecta intentos y responde con redirección.
- **Step 72 — Cita rota detection**: cron que valida que `[doc:<id>]` referenciados en `messages` siguen existiendo; marca obsoleto si no.
- **Step 73 — Traducción de citas bilingüe**: formatter que para citas en idioma ≠ locale usuario añade traducción de la frase.

### Steps a MODIFICAR

- **Step 24** (extractor): añadir AV (acidez volátil), SO₂ libre/total, unidades, alertas rango DO.
- **Step 25** (PII): añadir consent dialog UI bloqueante + audit_log entry obligatoria.
- **Step 30** (onboarding): reemplazar por wizards detallados (ver Step 64).
- **Step 49** (golden datasets): añadir 10 ejemplos de "no tengo evidencia" y de citas bilingües.
- **Step 52** (seed corpus): ampliar con CEL-01/02/09/14 corpus, no sólo vinos.
- **Step 54** (metrics): añadir dashboard funnel + cohort + cost/user/mes + cache hit ratio target 60%.

### Validar con humano antes de codificar

1. ¿Distribuidor es vertical separado o variante de sommelier? (Afecta schema y onboarding).
2. ¿Apify Vivino — riesgo ToS? ¿Existe alternativa licenciada?
3. ¿Cohere acceptable, o preferir provider con datacenter UE por compliance?
4. ¿Audio/Whisper en MVP o Fase 2 (SPEC §10 menciona "modo voz" como Fase 2/3, pero ING-01 lista audio como MUST)?
5. ¿Idiomas regionales (cat/glg/eus) cubiertos en MVP o Fase 2?
6. ¿`product` enum incluye `distributor`?
7. ¿Tier de plan y límites (ING-10, NUC-08) — quién los define?
8. ¿Corpus de libros técnicos Peynaud/Ribéreau-Gayon — licencia?

---

## Resumen ejecutivo (<300 palabras)

El PLAN cubre **bien la infraestructura** (multi-tenant, RLS, ingestion básico, agentes router/specialist, evals con LLM-judge, observabilidad técnica) pero presenta **gaps severos en producto y corpus** que lo harían no-entregable como MVP del SPEC.

**Top gaps críticos**:

1. **Corpus normativo ausente** (OIV, Reg. UE, pliegos DO). Sin esto, vertical cellar entero (~10 MUST stories) es inviable. Bloqueante.
2. **Entidades de dominio aplastadas en JSONB** (`tenant_kb`). Lote/depósito/añada, ficha lab, taxonomía DO, cliente del restaurante. SPEC los pide first-class; PLAN los entierra.
3. **Citas sin enforcement runtime**: el SPEC exige 100% respuestas técnicas con cita y "no tengo evidencia" cuando falte; PLAN sólo mide en evals offline, no bloquea producción.
4. **GDPR**: export Art.20, borrado workspace, memoria usuario — todos MUST sin steps.
5. **Feedback loop 👍/👎** (NUC-14 MUST) totalmente ausente. Sin esto no hay mejora continua ni hallucination rate medible.
6. **Distribuidor no es first-class** pese a onboarding propio y 3 user stories MUST.
7. **Observabilidad de producto inexistente**: ~13/16 métricas del SPEC §8 imposibles de medir (WAU/MAU, NPS, churn, time-to-value, cost/user/mes).
8. **Edge cases SPEC §6**: sólo 2/20 plenamente tratados.
9. **Onboarding wizards** (SOM-10, CEL-20, distribuidor) reducidos a un Step 30 superficial.
10. **CSV/audio/idiomas regionales (cat/glg/eus)/libros técnicos** no parseables; SPEC lo exige.

**Recomendación**: añadir Steps 57-73 (17 steps) antes de codificar, modificar Steps 24/25/30/49/52/54, y validar 8 preguntas con humano (especialmente: distribuidor como vertical, corpus normativo licencias, Cohere vs alternativa UE). Sin estos cambios el PLAN entrega un esqueleto técnico válido pero un producto que no cumple la mitad de los MUST del SPEC.
