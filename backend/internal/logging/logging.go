// Package logging は Cloud Logging が読める 1 行 1 JSON の slog ロガーを作る。
package logging

import (
	"io"
	"log/slog"
)

// New は w に JSON で書き出す slog.Logger を返す。
// キーは Cloud Logging の構造化ログに合わせて msg → message、level → severity に置き換える。
func New(w io.Writer) *slog.Logger {
	return slog.New(slog.NewJSONHandler(w, &slog.HandlerOptions{
		Level:       slog.LevelInfo,
		ReplaceAttr: replaceAttr,
	}))
}

func replaceAttr(groups []string, a slog.Attr) slog.Attr {
	if len(groups) > 0 {
		return a
	}
	switch a.Key {
	case slog.MessageKey:
		a.Key = "message"
	case slog.LevelKey:
		a.Key = "severity"
		if lvl, ok := a.Value.Any().(slog.Level); ok {
			a.Value = slog.StringValue(severity(lvl))
		}
	}
	return a
}

func severity(l slog.Level) string {
	switch {
	case l >= slog.LevelError:
		return "ERROR"
	case l >= slog.LevelWarn:
		return "WARNING"
	case l >= slog.LevelInfo:
		return "INFO"
	default:
		return "DEBUG"
	}
}
