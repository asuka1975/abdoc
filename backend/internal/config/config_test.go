package config

import "testing"

func TestLoadDefaultPort(t *testing.T) {
	t.Setenv("PORT", "")

	cfg, err := Load()
	if err != nil {
		t.Fatalf("Load() error = %v", err)
	}
	if cfg.Port != "8080" {
		t.Errorf("Port = %q, want %q", cfg.Port, "8080")
	}
	if got, want := cfg.Addr(), ":8080"; got != want {
		t.Errorf("Addr() = %q, want %q", got, want)
	}
}

func TestLoadPortFromEnv(t *testing.T) {
	t.Setenv("PORT", "9090")

	cfg, err := Load()
	if err != nil {
		t.Fatalf("Load() error = %v", err)
	}
	if cfg.Port != "9090" {
		t.Errorf("Port = %q, want %q", cfg.Port, "9090")
	}
	if got, want := cfg.Addr(), ":9090"; got != want {
		t.Errorf("Addr() = %q, want %q", got, want)
	}
}

func TestLoadInvalidPort(t *testing.T) {
	for _, port := range []string{"abc", "0", "65536", "-1"} {
		t.Run(port, func(t *testing.T) {
			t.Setenv("PORT", port)
			if _, err := Load(); err == nil {
				t.Errorf("Load() with PORT=%q: want error, got nil", port)
			}
		})
	}
}
