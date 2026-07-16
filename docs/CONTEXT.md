# CONTEXT.md - AxisPanel Ubiquitous Language

Este documento define el lenguaje ubicuo y los conceptos clave del dominio de AxisPanel.

## Glosario de Términos

### 1. Leads y CRM
*   **Lead**: Un contacto o prospecto comercial. Contiene información básica (nombre, categoría, teléfono, sitio web), un score (puntuación de prioridad) y pertenece a un **CRM Stage**.
*   **CRM Stage (Etapa del CRM)**: Estado actual del Lead en el pipeline. Las etapas válidas son:
    *   `new` (Nuevo)
    *   `contacted` (Contactado)
    *   `responded` (Respondió)
    *   `qualified` (Calificado)
    *   `proposal` (Propuesta)
    *   `client` (Cliente)
    *   `closed` (Cerrado)
    *   `lost` (Perdido)
    *   `ignored` (Ignorado)
*   **Kanban Board**: Vista de tablero organizada por columnas correspondientes a los **CRM Stages** para mover Leads arrastrándolos.

### 2. Navegación e Interfaz
*   **macOS Dock**: Menú de navegación flotante inferior que permite alternar de forma activa entre los diferentes módulos (Dashboard, Scraping, CRM, etc.).

### 3. Herramientas Auxiliares y Chat
*   **AxisChat**: Interfaz de chat integrada (anteriormente referida como Chat IA Hermes). Es el canal de comunicación con el asistente y el punto de entrada para flujos automatizados.
*   **OpenPencil**: Módulo de pizarra/canvas interactivo y chat de dibujo.

## Flujos de Trabajo (Workflows)

### 1. Flujo Conversacional de Scraping (AxisChat ↔ Scraper)
*   **Disparador**: El usuario escribe una frase de intención como *"necesito clientes"*.
*   **Comportamiento**: AxisChat inicia un cuestionario interactivo de **una pregunta a la vez** para recopilar los parámetros requeridos por el Scraper de Google Maps:
    1.  **Keyword / Búsqueda**: Qué tipo de negocios buscar (ej. *Dentistas*).
    2.  **Ubicación / Ciudad**: Dónde buscar (ej. *Santiago*).
    3.  **Categoría del Lead**: Cómo clasificar los leads resultantes (ej. *clinicas_dentales*).
*   **Resultado**: Al completar las respuestas, AxisChat inicia el **Scraper de Google Maps** en segundo plano con esos parámetros para extraer y registrar nuevos Leads.

