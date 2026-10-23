// Command abdoc は abdoc の API サーバ。Cloud Run で動かす前提で、PORT で待ち受ける。
package main

import (
	"context"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/asuka1975/abdoc/backend/internal/config"
	"github.com/asuka1975/abdoc/backend/internal/logging"
	transport "github.com/asuka1975/abdoc/backend/internal/transport/http"
)

// shutdownTimeout は SIGTERM 後に処理中のリクエストを待つ上限（Cloud Run の猶予 10 秒より短く）。
const shutdownTimeout = 8 * time.Second

func main() {
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	if err := run(ctx, os.Stdout); err != nil {
		os.Exit(1)
	}
}

// run は ctx がキャンセルされるまでサーバを動かし、終了時に graceful shutdown する。
func run(ctx context.Context, logOut io.Writer) error {
	logger := logging.New(logOut)

	cfg, err := config.Load()
	if err != nil {
		logger.Error("failed to load config", slog.Any("error", err))
		return err
	}

	srv := &http.Server{
		Addr:              cfg.Addr(),
		Handler:           transport.NewRouter(),
		ReadHeaderTimeout: 10 * time.Second,
		ErrorLog:          slog.NewLogLogger(logger.Handler(), slog.LevelError),
	}

	errCh := make(chan error, 1)
	go func() {
		logger.Info("server starting", slog.String("addr", srv.Addr))
		if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			errCh <- err
		}
		close(errCh)
	}()

	select {
	case err := <-errCh:
		if err != nil {
			logger.Error("server failed", slog.Any("error", err))
			return fmt.Errorf("listen: %w", err)
		}
		return nil
	case <-ctx.Done():
	}

	logger.Info("server shutting down")
	shutdownCtx, cancel := context.WithTimeout(context.Background(), shutdownTimeout)
	defer cancel()
	if err := srv.Shutdown(shutdownCtx); err != nil {
		logger.Error("shutdown failed", slog.Any("error", err))
		return fmt.Errorf("shutdown: %w", err)
	}
	logger.Info("server stopped")
	return nil
}
