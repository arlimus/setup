package main

import (
	"testing"
)

func TestStripPR(t *testing.T) {
	tests := []struct {
		in, want string
	}{
		{"add login form (#72)", "add login form"},
		{"fix bug (#1)", "fix bug"},
		{"no pr suffix here", "no pr suffix here"},
		{"has parens (not a pr)", "has parens (not a pr)"},
		{"multiple (#1) (#2)", "multiple (#1)"},
		{"", ""},
		{"trailing space (#99) ", "trailing space (#99) "},
	}
	for _, tt := range tests {
		if got := stripPR(tt.in); got != tt.want {
			t.Errorf("stripPR(%q) = %q, want %q", tt.in, got, tt.want)
		}
	}
}

func TestBuildTitleSet(t *testing.T) {
	mainLog := "add login form (#72)\nfix header\nupdate readme (#3)"
	titles := buildTitleSet(mainLog)

	for _, want := range []string{
		"add login form (#72)",
		"fix header",
		"update readme (#3)",
		"add login form",
		"update readme",
	} {
		if !titles[want] {
			t.Errorf("expected title %q in set", want)
		}
	}

	if titles["something else"] {
		t.Error("unexpected title in set")
	}
}

func TestBuildTitleSetEmpty(t *testing.T) {
	titles := buildTitleSet("")
	if len(titles) != 0 {
		t.Errorf("expected empty set, got %d entries", len(titles))
	}
}

func TestParseCommits(t *testing.T) {
	titles := map[string]bool{
		"add login form": true,
		"fix header":     true,
	}

	branchLog := "abc1234 add login form\ndef5678 new feature\nghi9012 fix header"
	commits := parseCommits(branchLog, titles)

	if len(commits) != 3 {
		t.Fatalf("expected 3 commits, got %d", len(commits))
	}

	want := []struct {
		hash   string
		title  string
		merged bool
	}{
		{"abc1234", "add login form", true},
		{"def5678", "new feature", false},
		{"ghi9012", "fix header", true},
	}
	for i, w := range want {
		c := commits[i]
		if c.hash != w.hash || c.title != w.title || c.merged != w.merged {
			t.Errorf("commit[%d] = {%q, %q, %v}, want {%q, %q, %v}",
				i, c.hash, c.title, c.merged, w.hash, w.title, w.merged)
		}
	}
}

func TestParseCommitsEmpty(t *testing.T) {
	commits := parseCommits("", map[string]bool{"x": true})
	if len(commits) != 0 {
		t.Errorf("expected 0 commits, got %d", len(commits))
	}
}

func TestBranchMergedCount(t *testing.T) {
	b := branch{
		name: "test",
		commits: []commit{
			{merged: true},
			{merged: false},
			{merged: true},
			{merged: true},
		},
	}
	if got := b.mergedCount(); got != 3 {
		t.Errorf("mergedCount() = %d, want 3", got)
	}
}

func TestBranchMergedCountEmpty(t *testing.T) {
	b := branch{name: "empty"}
	if got := b.mergedCount(); got != 0 {
		t.Errorf("mergedCount() = %d, want 0", got)
	}
}

func TestPRSuffixMatchIntegration(t *testing.T) {
	mainLog := "add feature (#72)\nfix bug (#10)"
	titles := buildTitleSet(mainLog)

	branchLog := "abc1234 add feature\ndef5678 fix bug\nghi9012 new thing"
	commits := parseCommits(branchLog, titles)

	if len(commits) != 3 {
		t.Fatalf("expected 3 commits, got %d", len(commits))
	}
	if !commits[0].merged {
		t.Error("'add feature' should match 'add feature (#72)' on main")
	}
	if !commits[1].merged {
		t.Error("'fix bug' should match 'fix bug (#10)' on main")
	}
	if commits[2].merged {
		t.Error("'new thing' should not be merged")
	}
}
