---
categories:
- stop-copy-paste
date: "2025-10-11T00:00:00-03:00"
description: How to gracefully stop Go applications without leaving
  hanging processes or open resources.
tags:
- best-practices
- golang
- goroutines
title: Graceful shutdown and goroutines
toc: true
---


In this post, I want to share a topic that often gets overlooked when
developing Go applications: **the graceful shutdown**.

It might seem like a minor detail, but it's not. If you work with HTTP
servers, workers, queue consumers, or any concurrent process using
*goroutines*, handling shutdown properly can prevent data loss, hanging
connections, or erratic behavior.

## Preamble

The concept of graceful shutdown is simple: **give your application time
to finish what it's doing** before dying.

The problem is that in Go, we often underestimate its complexity. For
example, we start an HTTP server and a few background *goroutines*,
assuming that `ctrl + c` or a `SIGTERM` will magically stop everything
cleanly.

Spoiler: it won't. 😅

## Anti-pattern

Let's look at this code:

``` go
package main

import (
    "log"
    "net/http"
)

func main() {
    http.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
        w.Write([]byte("hello world"))
    })

    log.Println("server listening on :8080")
    http.ListenAndServe(":8080", nil)
}
```

At first glance, it works. But if you run this binary and stop it with
`ctrl + c`, the process dies abruptly.

Any ongoing requests are cut off, open resources (connections, files,
etc.) aren't released, and there's no opportunity to perform cleanup.

## Proposal / Learning

The solution is to implement a **graceful shutdown** using Go's
`context` and `os/signal` packages.

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

    // Channel to listen for system signals
    stop := make(chan os.Signal, 1)
    signal.Notify(stop, os.Interrupt, syscall.SIGTERM)

    go func() {
        log.Println("server listening on :8080")
        if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
            log.Fatalf("listen: %s
", err)
        }
    }()

    <-stop // block until a signal is received
    log.Println("shutdown signal received")

    ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
    defer cancel()

    if err := server.Shutdown(ctx); err != nil {
        log.Fatalf("server forced to shutdown: %v", err)
    }

    log.Println("server stopped gracefully")
}
```

Now, when the process receives a signal (`SIGTERM` or `SIGINT`), it has
time (5 seconds in this case) to finish ongoing requests before closing.

### Mind your goroutines

Here's where things get tricky.

If you have background *goroutines* ---like workers consuming from a
queue or processing tasks---, **you need to ensure they also respect the
cancellation context**.

A common mistake is to spawn *goroutines* that never stop:

``` go
go func() {
    for {
        processJob() // never stops
    }
}()
```

The result: when your server shuts down, this *goroutine* keeps
running... or dies abruptly, leaving half-done work.

The correct approach:

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

When the process receives a signal, `cancel()` is called, and all
*goroutines* listening to that context exit gracefully.

### Edge cases

-   **Blocked goroutines**: if a *goroutine* is waiting on a channel
    that no one closes, shutdown won't complete.\
    Solution: ensure channels are closed properly in the right sequence.
-   **Short timeout**: if `context.WithTimeout` is too short, it might
    abort valid tasks. Tune it based on your real workload.
-   **Using `defer` inside goroutines**: remember that `defer`
    statements execute when the *goroutine* returns. If it never
    returns, they never run.

## Conclusions

Graceful shutdown isn't optional; it's a fundamental part of building
reliable production services.

Using contexts properly and respecting shutdown timeouts is a simple way
to avoid hard-to-reproduce bugs and improve the stability of your Go
apps.

To avoid boring you for now, let's pause here.

See you soon! 👋🏽

------------------------------------------------------------------------

## Sources and recommended readings

-   [Go Blog: Go Concurrency Patterns ---
    Context](https://go.dev/blog/context)
-   [Official Go `context` package docs](https://pkg.go.dev/context)
-   [Official Go `os/signal` package
    docs](https://pkg.go.dev/os/signal)
-   [Official Go `net/http` package docs ---
    Server.Shutdown](https://pkg.go.dev/net/http#Server.Shutdown)
-   [Go Wiki: Signal
    Handling](https://go.dev/wiki/SignalHandling)
