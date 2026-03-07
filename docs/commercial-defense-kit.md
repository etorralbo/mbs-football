# Kit de defensa comercial — Mettle Performance

## 1) Auditoría ejecutiva (en clave comercial)

### Tesis de venta
**Mettle Performance no es “otra app de entrenamientos”: es un sistema operativo de equipos deportivos con trazabilidad de activación y ejecución en cancha.**

### Qué vende muy bien hoy (fortalezas reales del proyecto)
1. **Problema claro y caro**: desorden operativo entre coach, atleta y planificación semanal.
2. **Propuesta end-to-end**: onboarding, creación de equipo, invitaciones, plantillas, asignaciones, ejecución y analítica.
3. **Diferencial de negocio**: embudo de activación instrumentado server-side (eventos transaccionales), útil para decisiones de producto y ventas.
4. **Arquitectura escalable para B2B**: multi-tenant robusto con aislamiento por equipo y control de roles por membresía.
5. **IA aplicable al flujo real**: generación asistida de borradores de plantillas (no “IA de escaparate”), conectada al catálogo de ejercicios.
6. **Calidad técnica demostrable**: suite de tests amplia, guardrails de arquitectura y migraciones controladas.

### Riesgos percibidos en una defensa (y cómo neutralizarlos)
1. **“¿Es solo para fútbol?”** → posicionar como plataforma para rendimiento por equipo, iniciando en fútbol.
2. **“¿Cómo sé que la gente realmente la usa?”** → mostrar funnel con North Star (SESSION_COMPLETED < 48h).
3. **“¿Qué evita que se vuelva caótica a escala?”** → enseñar multi-tenant + RBAC + separación frontend/backend.
4. **“¿La IA inventa cosas?”** → explicar modo fallback/stub + matching con biblioteca real de ejercicios.

### Oportunidades de impacto rápido (sin rehacer producto)
1. Publicar un **caso de uso tipo “semana 0 a semana 2”** con métricas de activación.
2. Añadir en dashboard un **widget de retención semanal** por equipo.
3. Crear un **pitch one-liner por vertical** (academias, clubes semi-pro, staff privado).
4. Estandarizar demo comercial de 5 minutos con el guion de video de este documento.

---

## 2) Mensaje comercial maestro

## One-liner
**“Mettle Performance transforma la planificación del coach en ejecución medible del atleta, en una sola plataforma.”**

## Mensaje de valor (30 segundos)
- Los coaches diseñan y asignan sesiones sin fricción.
- Los atletas ejecutan y reportan desde su vista operativa.
- El staff mide adopción real con eventos de producto, no intuición.

## Prueba de credibilidad
- Arquitectura multi-tenant y roles robustos.
- Eventos de funnel persistidos en backend (sin depender de tracking frágil en cliente).
- Cobertura de procesos críticos: alta de equipo, invitación, asignación, ejecución de sesión.

---

## 3) Propuesta de deck (sliders) para presentación

## Slide 1 — Portada de impacto
**Título**: _“De planificación dispersa a ejecución medible”_
- Problema: información fragmentada entre coach/atleta.
- Promesa: una sola operación con métricas de activación.

## Slide 2 — Dolor del mercado
- Planificaciones en chats/hojas/notas.
- Baja adherencia del atleta por falta de seguimiento.
- Casi nula visibilidad de qué acciones generan progreso.

## Slide 3 — Nuestra solución
- Gestión de equipo y membresías.
- Plantillas y sesiones reutilizables.
- Ejecución detallada por atleta.
- Analítica de embudo para adopción.

## Slide 4 — Flujo principal del producto
**Coach crea equipo → invita atleta → asigna sesión → atleta ejecuta → plataforma mide activación.**

## Slide 5 — Diferenciales competitivos
- **Operación + analítica** (no solo biblioteca de ejercicios).
- **Arquitectura enterprise-ready** (multi-tenant + RBAC).
- **IA orientada a productividad** (drafts accionables).

## Slide 6 — Métrica North Star
- `% de usuarios que completan sesión en < 48 horas desde signup`.
- Explicar por qué esta métrica correlaciona con valor real entregado.

## Slide 7 — Embudo medible
- `TEAM_CREATED`
- `INVITE_ACCEPTED`
- `SESSION_COMPLETED`
- Mostrar que los eventos se guardan en backend de forma transaccional.

## Slide 8 — Experiencia coach
- Crear plantilla manual o asistida por IA.
- Asignar sesiones a atletas con contexto del equipo.
- Visibilidad de ejecución y progreso.

## Slide 9 — Experiencia atleta
- Ingreso simple por invitación.
- Vista clara de sesiones asignadas.
- Registro de ejecución set por set.

## Slide 10 — Seguridad y escalabilidad
- Token JWT verificado por JWKS.
- Team scoping en backend.
- Separación de responsabilidades por capas.

## Slide 11 — Tracción / hipótesis comercial
- Pilotos con 1–3 equipos.
- Meta: elevar conversión de onboarding a primera sesión completada.
- Caso esperado: reducción del tiempo de activación del staff.

## Slide 12 — Cierre y CTA
**“No vendemos software; vendemos rendimiento operativo medible.”**
- CTA: piloto de 30 días con objetivos de activación definidos.

---

## 4) Flujos recomendados para video de defensa

## Video 1 — “Aha moment” (90 segundos)
**Objetivo**: mostrar el valor completo en menos de 2 minutos.
1. Coach inicia sesión.
2. Crea equipo.
3. Invita atleta.
4. Crea/selecciona plantilla y asigna sesión.
5. Atleta entra y completa una sesión.
6. Mostrar evento de activación reflejado en analítica.

**Mensaje narrado**: “En un flujo continuo pasamos de alta a ejecución verificable.”

## Video 2 — “Flujo Coach Productivo” (2–3 minutos)
**Objetivo**: vender ahorro de tiempo y consistencia técnica.
1. Biblioteca de ejercicios (filtros/favoritos).
2. Construcción de plantilla por bloques.
3. Opción IA para draft inicial.
4. Asignación a atleta(s).
5. Revisión de sesiones generadas.

**Mensaje narrado**: “La plataforma reduce fricción y estandariza metodología.”

## Video 3 — “Flujo Atleta Sin Fricción” (90–120 segundos)
**Objetivo**: demostrar adopción fácil.
1. Ingreso por link de invitación.
2. Visualización clara de sesión.
3. Carga de logs por set.
4. Finalización de sesión.

**Mensaje narrado**: “La experiencia del atleta está enfocada en completar, no en aprender la herramienta.”

## Video 4 — “Flujo de Confianza Técnica” (2 minutos)
**Objetivo**: convencer jurado técnico/inversor.
1. Breve mapa de arquitectura (frontend, backend, auth, DB).
2. Multi-tenant y RBAC en lenguaje de negocio (“cada equipo aislado”).
3. Eventos de funnel transaccionales.
4. Mention de tests/guardrails.

**Mensaje narrado**: “Está diseñado para crecer sin romper seguridad ni operación.”

---

## 5) Storytelling sugerido para la defensa oral

## Estructura 3 actos
1. **Caos actual (dolor)**: fragmentación operativa y baja visibilidad.
2. **Transformación (producto)**: flujo unificado coach-atleta con ejecución real.
3. **Escalado (negocio)**: métricas de activación + arquitectura lista para múltiples equipos.

## Frases potentes para vender
- “Lo que no se mide, no se mejora; por eso medimos activación real, no clics vacíos.”
- “Cada sesión completada no es un dato, es una evidencia de valor entregado.”
- “Mettle convierte planificación técnica en resultados operativos trazables.”

---

## 6) Checklist de preparación para defensa

### Producto
- [ ] Tener usuario coach y atleta de demo listos.
- [ ] Tener un equipo demo preconfigurado.
- [ ] Tener una plantilla corta lista para asignar.

### Métricas
- [ ] Mostrar North Star y funnel básico.
- [ ] Preparar 1 ejemplo de mejora esperada (antes/después).

### Presentación
- [ ] Deck de 12 slides con foco en problema→valor→evidencia.
- [ ] Videos exportados en 1080p con subtítulos breves.
- [ ] Script oral ensayado en 7–10 minutos.

---

## 7) Cierre estratégico

Si la defensa busca “vender” el proyecto, el posicionamiento ganador es:

**“Mettle Performance es una plataforma de ejecución deportiva medible: conecta planificación, acción y adopción en tiempo real para equipos que quieren rendimiento, no improvisación.”**
