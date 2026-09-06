# Arquitectura de finanzas y notificaciones

## Decisión

No guardar pagos ni recordatorios mutables dentro de `students`. El alumno es
la identidad; los cobros, movimientos y comunicaciones son eventos con su
propio ciclo de vida e historial.

Tampoco conviene que una única tabla `pagos` represente simultáneamente deudas,
ingresos y gastos. Para saber cuánto se debe, cuánto ingresó y cuál fue la
ganancia se necesitan conceptos separados.

## Modelo recomendado

### `obligaciones_financieras`

Representa lo que debe cobrarse.

- `id`
- `student_id` (nullable para conceptos no asociados a un alumno)
- `concepto`: mensualidad, matrícula, créditos, uniforme u otro
- `periodo`: por ejemplo `2026-09`
- `monto_total`
- `monto_pagado`
- `fecha_vencimiento`
- `estado`: pendiente, parcial, pagada, vencida o anulada
- `metadata`
- `created_at`, `updated_at`

### `movimientos_financieros`

Es el libro real de caja. Cada fila es dinero que entró o salió.

- `id`
- `student_id` (opcional)
- `obligacion_id` (opcional)
- `direccion`: ingreso o egreso
- `concepto`: mensualidad, matrícula, créditos, uniforme, alquiler, planilla,
  servicios, equipamiento u otro
- `monto`
- `metodo`: efectivo, Yape, Plin, transferencia u otro
- `estado`: confirmado, reembolsado o anulado
- `fecha_movimiento`
- `referencia`, `descripcion`, `metadata`
- `created_by`, `created_at`

La utilidad se calcula a partir de movimientos confirmados:

`ganancia = ingresos - egresos`

Nunca debe guardarse como un número editable porque se desincronizaría.

### `historial_notificaciones`

Registra cada intento y permite una cola programada. La migración
`20260905_historial_notificaciones_rls.sql` conserva los campos actuales y
añade estado, programación, reintentos y vínculo lógico con una obligación.

## Ciclo correcto de cobranza

1. Al iniciar un periodo se crea una obligación pendiente.
2. La cola programa un recordatorio asociado a esa obligación.
3. Al enviarlo se conserva el evento como `enviada`; no se borra.
4. Si falla, pasa a `fallida` y aumenta `intentos`.
5. Cuando se registra el pago, la obligación pasa a `pagada` y los avisos aún
   pendientes pasan a `cancelada` o `resuelta`.
6. La pantalla de Cobranzas muestra obligaciones abiertas, no una bandera
   guardada en `students`.

## Migración desde el sistema actual

1. Proteger `historial_notificaciones` con RLS.
2. Crear las obligaciones y movimientos sin eliminar `mensualidades`.
3. Copiar las mensualidades históricas como ingresos confirmados usando una
   referencia única para evitar duplicados.
4. Durante una versión, escribir en el modelo nuevo y mantener lectura del
   histórico anterior.
5. Comparar totales y recién entonces retirar la dependencia de
   `mensualidades`.

Esta transición debe ser aditiva y ejecutarse con respaldo previo de la base.
