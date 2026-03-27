package main

import (
	"os/exec"
	"regexp"
	"strings"
)

type commit struct {
	hash   string
	title  string
	merged bool
}

type branch struct {
	name    string
	commits []commit
}

func (b branch) mergedCount() int {
	n := 0
	for _, c := range b.commits {
		if c.merged {
			n++
		}
	}
	return n
}

// title matching

var prSuffix = regexp.MustCompile(`\s+\(#\d+\)$`)

func stripPR(s string) string {
	return prSuffix.ReplaceAllString(s, "")
}

func buildTitleSet(mainLog string) map[string]bool {
	titles := map[string]bool{}
	for _, t := range strings.Split(mainLog, "\n") {
		if t = strings.TrimSpace(t); t != "" {
			titles[t] = true
			titles[stripPR(t)] = true
		}
	}
	return titles
}

func parseCommits(branchLog string, titles map[string]bool) []commit {
	var commits []commit
	for _, line := range strings.Split(branchLog, "\n") {
		if line = strings.TrimSpace(line); line == "" {
			continue
		}
		if p := strings.SplitN(line, " ", 2); len(p) == 2 {
			commits = append(commits, commit{
				hash:   p[0],
				title:  p[1],
				merged: titles[p[1]],
			})
		}
	}
	return commits
}

// git helpers

func git(args ...string) (string, error) {
	out, err := exec.Command("git", args...).Output()
	return strings.TrimSpace(string(out)), err
}

func mainRef() string {
	for _, ref := range []string{"origin/main", "origin/master", "main", "master"} {
		if _, err := git("rev-parse", "--verify", ref); err == nil {
			return ref
		}
	}
	return "main"
}

func loadBranches() []branch {
	ref := mainRef()
	out, err := git("branch", "--format=%(refname:short)")
	if err != nil {
		return nil
	}
	cur, _ := git("rev-parse", "--abbrev-ref", "HEAD")

	var result []branch
	for _, name := range strings.Split(out, "\n") {
		name = strings.TrimSpace(name)
		if name == "" || name == "main" || name == "master" || name == cur {
			continue
		}

		b := branch{name: name}
		base, err := git("merge-base", ref, name)
		if err != nil {
			result = append(result, b)
			continue
		}

		branchLog, _ := git("log", "--format=%h %s", base+".."+name)
		mainLog, _ := git("log", "--format=%s", base+".."+ref)

		titles := buildTitleSet(mainLog)
		b.commits = parseCommits(branchLog, titles)
		result = append(result, b)
	}
	return result
}
