---
categories:
- stop-copy-paste
date: "2025-10-11T00:00:00-03:00"
description: Cómo detener nuestras aplicaciones en Go de manera elegante
  sin dejar procesos colgados ni recursos abiertos.
tags:
- best-practices
- golang
- goroutines
title: Graceful shutdown y goroutines
toc: true
---


En esta publicación quiero compartir un tema que suele pasarse por alto
cuando desarrollamos aplicaciones en Go: **graceful
shutdown**.

Parece un detalle, pero no lo es. Si trabajás con servidores HTTP,
workers, consumidores de colas o cualquier proceso concurrente con
*goroutines*, manejar correctamente el apagado puede evitar pérdidas de
datos, conexiones colgadas o comportamientos erráticos.

## Preámbulo

El concepto de graceful shutdown no es nuevo. Se trata, simplemente, de
**darle tiempo a nuestra aplicación para que termine lo que está
haciendo** antes de morir.

El problema es que en Go solemos subestimar su complejidad. Por ejemplo,
lanzamos un servidor HTTP y varias *goroutines* de background, y
asumimos que con `ctrl + c` o un `SIGTERM` todo se apaga como por arte
de magia.

Spoiler: no. 😅

## Anti patrón

Imaginemos el siguiente código:

``` go
package main

import (
    "log"
    "net/http"
)

func main() {
    http.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
        w.Write([]byte("hola mundo"))
    })

    log.Println("server listening on :8080")
    http.ListenAndServe(":8080", nil)
}
```

A simple vista funciona. Pero si ejecutamos el binario y lo detenemos
con `ctrl + c`, el proceso muere abruptamente.\
Cualquier request en curso se corta, los recursos abiertos
(conexexiones, archivos, etc.) no se liberan y no hay oportunidad de
realizar tareas de limpieza.

## Propuesta/aprendizaje

La solución es implementar un **graceful shutdown** usando los paquetes
`context` y `os/signal`.

``` go
package main

import (
    "context"
    "log"
    "net/http"
    "os"
    "os/signal"
    "syscall"
    "time"
)

func main() {
    server := &http.Server{Addr: ":8080"}

    // Canal para escuchar señales del sistema
    stop := make(chan os.Signal, 1)
    signal.Notify(stop, os.Interrupt, syscall.SIGTERM)

    go func() {
        log.Println("server listening on :8080")
        if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
            log.Fatalf("listen: %s
", err)
        }
    }()

    <-stop // bloquea hasta recibir señal
    log.Println("shutdown signal received")

    ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
    defer cancel()

    if err := server.Shutdown(ctx); err != nil {
        log.Fatalf("server forced to shutdown: %v", err)
    }

    log.Println("server stopped gracefully")
}
```

Ahora, cuando el proceso recibe una señal (`SIGTERM` o `SIGINT`), se le
da un tiempo (en este caso 5 segundos) para terminar las requests
activas antes de cerrar.

### El cuidado con las goroutines

Acá viene el punto delicado.

Si además del servidor tenés *goroutines* de background ---por ejemplo
workers que consumen de una cola o procesan tareas---, **debés
asegurarte de que también respeten el contexto de cancelación**.

Un error común es lanzar *goroutines* sin una forma de detenerlas:

``` go
go func() {
    for {
        processJob() // nunca termina
    }
}()
```

El resultado: cuando tu servidor apaga, esta *goroutine* sigue viva... o
muere abruptamente, dejando el trabajo a medias.

El enfoque correcto:

``` go
ctx, cancel := context.WithCancel(context.Background())
defer cancel()

go func(ctx context.Context) {
    for {
        select {
        case <-ctx.Done():
            log.Println("worker stopped gracefully")
            return
        default:
            processJob()
        }
    }
}(ctx)
```

Cuando el proceso recibe una señal, `cancel()` se ejecuta y todas las
*goroutines* escuchando ese contexto terminan ordenadamente.

### Casos borde

-   **Bloqueos en goroutines**: si una *goroutine* espera en un canal
    que nadie cierra, el shutdown no completa.\
    Solución: asegurarse de que todos los canales se cierren en la
    secuencia correcta.
-   **Timeout insuficiente**: si el `context.WithTimeout` es demasiado
    corto, puede abortar tareas legítimas. Ajustalo según la carga real
    del sistema.
-   **Uso de `defer` dentro de goroutines**: recordá que los `defer` se
    ejecutan cuando la *goroutine* retorna. Si no retornan, nunca se
    ejecutan.

## Conclusiones

El graceful shutdown no es opcional; es parte esencial de la salud de un
servicio en producción.

Usar contextos correctamente y respetar los tiempos de cierre es una
forma simple de evitar *bugs* difíciles de reproducir y mejorar la
estabilidad de nuestras apps.

Para no aburrirte y por el momento hagamos una pausa.

¡Hasta pronto! 👋🏽

------------------------------------------------------------------------

## Fuentes y lecturas recomendadas

-   [Go Blog: Go Concurrency Patterns ---
    Context](https://go.dev/blog/context)\
-   [Documentación oficial del paquete
    `context`](https://pkg.go.dev/context)\
-   [Documentación oficial del paquete
    `os/signal`](https://pkg.go.dev/os/signal)\
-   [Documentación oficial del paquete
    `net/http`](https://pkg.go.dev/net/http#Server.Shutdown)\
-   [Wiki oficial de Go: Signal
    Handling](https://go.dev/wiki/SignalHandling)
