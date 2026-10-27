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

	"cloud.google.com/go/firestore"

	"github.com/asuka1975/abdoc/backend/internal/app"
	"github.com/asuka1975/abdoc/backend/internal/config"
	"github.com/asuka1975/abdoc/backend/internal/logging"
	bqstore "github.com/asuka1975/abdoc/backend/internal/store/bigquery"
	fsstore "github.com/asuka1975/abdoc/backend/internal/store/firestore"
	"github.com/asuka1975/abdoc/backend/internal/store/memory"
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

	svc, closeStores, err := newService(ctx, cfg, logger)
	if err != nil {
		logger.Error("failed to set up stores", slog.Any("error", err))
		return err
	}
	defer closeStores()

	srv := &http.Server{
		Addr:              cfg.Addr(),
		Handler:           transport.NewRouter(svc, logger),
		ReadHeaderTimeout: 10 * time.Second,
		ErrorLog:          slog.NewLogLogger(logger.Handler(), slog.LevelError),
	}

	errCh := make(chan error, 1)
	go func() {
		logger.Info("server starting", slog.String("addr", srv.Addr))
		if cfg.InMemory() {
			logger.Warn("GOOGLE_CLOUD_PROJECT is not set; using in-memory stores (data is lost on restart)")
		}
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

// newService は設定に応じてストアを組み立てる。戻り値の関数でクライアントを閉じる。
func newService(ctx context.Context, cfg config.Config, logger *slog.Logger) (*app.Service, func(), error) {
	if cfg.InMemory() {
		return app.NewService(memory.NewReactionStore(), &memory.EventWriter{}, logger), func() {}, nil
	}

	fs, err := firestore.NewClient(ctx, cfg.Project)
	if err != nil {
		return nil, nil, fmt.Errorf("firestore client: %w", err)
	}
	bq, err := bqstore.NewClient(ctx, cfg.Project, cfg.BigQueryEmulatorHost)
	if err != nil {
		_ = fs.Close()
		return nil, nil, err
	}
	closeAll := func() {
		if err := fs.Close(); err != nil {
			logger.Error("failed to close firestore client", slog.Any("error", err))
		}
		if err := bq.Close(); err != nil {
			logger.Error("failed to close bigquery client", slog.Any("error", err))
		}
	}
	svc := app.NewService(fsstore.NewReactionStore(fs), bqstore.NewEventWriter(bq, cfg.BigQueryDataset), logger)
	return svc, closeAll, nil
}
