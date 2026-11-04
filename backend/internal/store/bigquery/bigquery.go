// Package bigquery は分析用のイベントを BigQuery に書き込む。
// データセットとテーブルは本番では Terraform、ローカルではエミュレータの初期データ（compose/bigquery/data.yaml）で作る。
// このパッケージはテーブルを作らない。
package bigquery

import (
	"context"
	"fmt"
	"strings"
	"time"

	"cloud.google.com/go/bigquery"
	"google.golang.org/api/option"

	"github.com/asuka1975/abdoc/backend/internal/domain"
)

// テーブル名（列の定義は compose/bigquery/data.yaml と README を正とする）。
const (
	EngagementTable = "engagement_events"
	ReactionTable   = "reaction_events"
)

type engagementRow struct {
	Slug            string    `bigquery:"slug"`
	Variant         string    `bigquery:"variant"`
	VisitorID       string    `bigquery:"visitor_id"`
	MaxScrollDepth  int64     `bigquery:"max_scroll_depth"`
	DurationSeconds float64   `bigquery:"duration_seconds"`
	Timestamp       time.Time `bigquery:"timestamp"`
}

type reactionRow struct {
	Slug             string    `bigquery:"slug"`
	Variant          string    `bigquery:"variant"`
	VisitorID        string    `bigquery:"visitor_id"`
	Reaction         string    `bigquery:"reaction"`
	PreviousReaction string    `bigquery:"previous_reaction"`
	Timestamp        time.Time `bigquery:"timestamp"`
}

// EventWriter は app.EventWriter の BigQuery 実装（ストリーミング挿入）。
type EventWriter struct {
	engagement *bigquery.Inserter
	reaction   *bigquery.Inserter
}

// NewEventWriter は dataset のテーブルへ書き込む EventWriter を作る。
func NewEventWriter(client *bigquery.Client, dataset string) *EventWriter {
	ds := client.Dataset(dataset)
	return &EventWriter{
		engagement: ds.Table(EngagementTable).Inserter(),
		reaction:   ds.Table(ReactionTable).Inserter(),
	}
}

// NewClient は BigQuery のクライアントを作る。emulatorHost（BIGQUERY_EMULATOR_HOST）が空でなければ、
// 認証なしでそのエミュレータへ接続する。
func NewClient(ctx context.Context, project, emulatorHost string) (*bigquery.Client, error) {
	var opts []option.ClientOption
	if emulatorHost != "" {
		endpoint := emulatorHost
		if !strings.Contains(endpoint, "://") {
			endpoint = "http://" + endpoint
		}
		opts = append(opts, option.WithEndpoint(endpoint), option.WithoutAuthentication())
	}
	c, err := bigquery.NewClient(ctx, project, opts...)
	if err != nil {
		return nil, fmt.Errorf("bigquery client: %w", err)
	}
	return c, nil
}

// WriteEngagement は engagement_events に 1 行追加する。
func (w *EventWriter) WriteEngagement(ctx context.Context, e domain.Engagement) error {
	row := engagementRow{
		Slug:            e.Slug,
		Variant:         string(e.Variant),
		VisitorID:       e.VisitorID,
		MaxScrollDepth:  int64(e.MaxScrollDepth),
		DurationSeconds: e.DurationSeconds,
		Timestamp:       e.Timestamp,
	}
	if err := w.engagement.Put(ctx, row); err != nil {
		return fmt.Errorf("insert %s: %w", EngagementTable, err)
	}
	return nil
}

// WriteReaction は reaction_events に 1 行追加する。
func (w *EventWriter) WriteReaction(ctx context.Context, e domain.ReactionEvent) error {
	row := reactionRow{
		Slug:             e.Slug,
		Variant:          string(e.Variant),
		VisitorID:        e.VisitorID,
		Reaction:         string(e.Reaction),
		PreviousReaction: string(e.PreviousReaction),
		Timestamp:        e.Timestamp,
	}
	if err := w.reaction.Put(ctx, row); err != nil {
		return fmt.Errorf("insert %s: %w", ReactionTable, err)
	}
	return nil
}
