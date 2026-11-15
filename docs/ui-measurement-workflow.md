# Flujo de pantallas del prototipo

- **Resumen:** registra una muestra y presenta una revisión del registro más reciente, con estados y aclaraciones disponibles.
- **Registro de muestra:** al guardar, selecciona la muestra y abre el Mapa corporal para añadir malestares y contexto asociados.
- **Mapa corporal:** almacena síntomas y contexto mediante los endpoints existentes. Los colores representan gravedad de síntomas auto-reportados, no cortisol ni diagnóstico.
- **Muestras:** historial de solo lectura y ficha detallada de la muestra seleccionada, incluyendo resultados, método, calidad, contexto y síntomas vinculados.

## Integración con sensor

La aplicación actual no tiene una conexión de hardware ni un protocolo de transporte del sensor. Por ahora muestra el estado «esperando resultado» y solo presenta resultados existentes guardados por la API. No calcula cortisol a partir de señales crudas ni fabrica valores. Cuando se defina la integración real, el adaptador deberá guardar valor original, unidad, método/calibración y procedencia por medio de los endpoints de assay results.

El resumen de estado refleja el estado del registro y del control de calidad disponibles. No es diagnóstico clínico ni evaluación de aptitud.
