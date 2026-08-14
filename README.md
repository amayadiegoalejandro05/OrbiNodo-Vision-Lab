# Recorrido virtual 360° de una vivienda

Aplicación web local para recorrer una vivienda mediante panoramas equirectangulares.

## Estado actual

La Fase 5 está implementada con dos pisos y ocho panoramas ficticios:

- Primer piso: Parqueadero, Pasillo y Cocina.
- Escaleras: base en el primer piso y descanso en el segundo.
- Segundo piso: Cuarto 1 a la derecha, Cuarto 2 a la izquierda y Estudio.
- Ruta izquierda: Cuarto 2 continúa hacia el Estudio.

Todas las conexiones tienen regreso. El menú permite abrir cualquier punto, muestra
la ubicación activa y funciona con teclado y en pantallas móviles.

## Uso local

```bash
npm install
npm run dev
```

Vite mostrará la dirección local. Si existe una versión anterior en el navegador,
usa una recarga forzada.

## Verificación

```bash
npm run check
```

Este comando ejecuta ESLint, seis pruebas con Vitest, TypeScript, la construcción de
Vite y una prueba real en Microsoft Edge. La prueba recorre ambos pisos, las ramas
derecha e izquierda, el Estudio y todos los regresos.

## Documentación

Todos los TXT se conservan en `documentacion/`:

- `comandos_necesarios.txt`
- `guia_completa_de_fases.txt`
- `explicacion_de_archivos_y_codigo.txt`
- `preguntas_y_respuestas_por_fase.txt`

## Privacidad

Los ocho panoramas actuales son ficticios. Las fotografías reales deben guardarse
en `public/panoramas/private/`. Git ignora su contenido, pero una construcción local
puede copiarlo a `dist/`; ambas carpetas deben revisarse antes de compartir archivos.

No se realiza publicación ni `git push` automáticamente.

## Próxima fase

La nueva Fase 6 publicará Orbinodo como una demo HTTPS accesible desde cualquier red.
Mostrará un formulario de usuario y contraseña antes de montar el recorrido.

Será una barrera básica ejecutada en el navegador: las panorámicas artificiales
seguirán siendo públicas y no se utilizará esta solución para contenido sensible.
La contraseña se comparará mediante SHA-256 y la sesión durará la pestaña actual.

Solo se prevé instalar la CLI de Vercel. No se usarán Supabase, base de datos,
backend ni almacenamiento privado. La publicación todavía no se ha ejecutado y
requerirá una cuenta de Vercel y autorización explícita.

Las fases posteriores continúan numeradas como 7, 8 y 9.
