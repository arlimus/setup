package main

import (
	"fmt"
	"os"
	"os/exec"
	"strings"

	tea "charm.land/bubbletea/v2"
	"charm.land/lipgloss/v2"
)

// styles

var (
	titleSt  = lipgloss.NewStyle().Bold(true).Foreground(lipgloss.Color("12"))
	okSt     = lipgloss.NewStyle().Foreground(lipgloss.Color("10"))
	failSt   = lipgloss.NewStyle().Foreground(lipgloss.Color("9"))
	dimSt    = lipgloss.NewStyle().Foreground(lipgloss.Color("245"))
	selSt    = lipgloss.NewStyle().Bold(true).Foreground(lipgloss.Color("10"))
	hashSt   = lipgloss.NewStyle().Foreground(lipgloss.Color("245"))
	accentSt = lipgloss.NewStyle().Foreground(lipgloss.Color("12"))
)

func pane(w int) lipgloss.Style {
	return lipgloss.NewStyle().
		Border(lipgloss.RoundedBorder()).
		BorderForeground(lipgloss.Color("8")).
		Width(w).
		Padding(0, 1)
}

// model

type deleted struct {
	branch branch
	sha    string
	index  int
}

type model struct {
	branches []branch
	cursor   int
	width    int
	height   int
	msg      string
	msgErr   bool
	undos    []deleted
}

func (m model) Init() tea.Cmd { return nil }

func (m model) Update(msg tea.Msg) (tea.Model, tea.Cmd) {
	switch msg := msg.(type) {
	case tea.WindowSizeMsg:
		m.width = msg.Width
		m.height = msg.Height
	case tea.KeyPressMsg:
		k := msg.Key()
		if k.Code == 'c' && k.Mod.Contains(tea.ModCtrl) {
			return m, tea.Quit
		}
		m.msg = ""
		switch k.Code {
		case 'q', tea.KeyEscape:
			return m, tea.Quit
		case tea.KeyUp, 'k':
			if m.cursor > 0 {
				m.cursor--
			}
		case tea.KeyDown, 'j':
			if m.cursor < len(m.branches)-1 {
				m.cursor++
			}
		case 'd':
			if len(m.branches) == 0 {
				break
			}
			b := m.branches[m.cursor]
			sha, err := git("rev-parse", b.name)
			if err != nil {
				m.msg = fmt.Sprintf("cannot resolve %s", b.name)
				m.msgErr = true
				break
			}
			if err := exec.Command("git", "branch", "-D", b.name).Run(); err != nil {
				m.msg = fmt.Sprintf("cannot delete %s", b.name)
				m.msgErr = true
			} else {
				m.undos = append(m.undos, deleted{branch: b, sha: sha, index: m.cursor})
				m.msg = fmt.Sprintf("deleted %s", b.name)
				m.msgErr = false
				m.branches = append(m.branches[:m.cursor], m.branches[m.cursor+1:]...)
				if m.cursor >= len(m.branches) && m.cursor > 0 {
					m.cursor--
				}
			}
		case 'u':
			if len(m.undos) == 0 {
				break
			}
			last := m.undos[len(m.undos)-1]
			if err := exec.Command("git", "branch", last.branch.name, last.sha).Run(); err != nil {
				m.msg = fmt.Sprintf("cannot restore %s", last.branch.name)
				m.msgErr = true
			} else {
				m.undos = m.undos[:len(m.undos)-1]
				idx := last.index
				if idx > len(m.branches) {
					idx = len(m.branches)
				}
				m.branches = append(m.branches[:idx], append([]branch{last.branch}, m.branches[idx:]...)...)
				m.cursor = idx
				m.msg = fmt.Sprintf("restored %s", last.branch.name)
				m.msgErr = false
			}
		}
	}
	return m, nil
}

func (m model) View() tea.View {
	if len(m.branches) == 0 {
		s := dimSt.Render("no local branches to clean")
		if m.msg != "" {
			s = okSt.Render("✓ "+m.msg) + "\n" + s
		}
		return tea.NewView(s + "\n")
	}

	w := m.width - 2
	if w < 40 {
		w = 78
	}

	b := m.branches[m.cursor]

	// main pane: commit comparison
	var main strings.Builder

	mc, total := b.mergedCount(), len(b.commits)
	var summary string
	switch {
	case total == 0:
		summary = dimSt.Render("no commits")
	case mc == total:
		summary = okSt.Render(fmt.Sprintf("✓ %d/%d on main", mc, total))
	default:
		summary = failSt.Render(fmt.Sprintf("%d/%d on main", mc, total))
	}
	main.WriteString(titleSt.Render(b.name) + "  " + summary + "\n")

	maxC := m.height - 16
	if maxC < 5 {
		maxC = 20
	}
	commits := b.commits
	if len(commits) > maxC {
		commits = commits[:maxC]
	}
	for _, c := range commits {
		if c.merged {
			main.WriteString(okSt.Render("  ✓ ") + hashSt.Render(c.hash) + " " + dimSt.Render(c.title) + "\n")
		} else {
			main.WriteString(failSt.Render("  ✗ ") + hashSt.Render(c.hash) + " " + c.title + "\n")
		}
	}
	if len(b.commits) > maxC {
		main.WriteString(dimSt.Render(fmt.Sprintf("  … %d more", len(b.commits)-maxC)) + "\n")
	}

	mainBox := pane(w).Render(strings.TrimRight(main.String(), "\n"))

	// bottom pane: branch list
	var bot strings.Builder
	bot.WriteString(accentSt.Render(fmt.Sprintf("branches · %d total", len(m.branches))) + "\n")

	maxShow := 5
	start := m.cursor - 2
	if start < 0 {
		start = 0
	}
	end := start + maxShow
	if end > len(m.branches) {
		end = len(m.branches)
		start = end - maxShow
		if start < 0 {
			start = 0
		}
	}
	for i := start; i < end; i++ {
		br := m.branches[i]
		cur, ns := "  ", dimSt
		if i == m.cursor {
			cur = selSt.Render("▸ ")
			ns = selSt
		}
		mc, total := br.mergedCount(), len(br.commits)
		var st string
		switch {
		case total == 0:
			st = dimSt.Render("—")
		case mc == total:
			st = okSt.Render("✓")
		default:
			st = failSt.Render(fmt.Sprintf("%d/%d", mc, total))
		}
		bot.WriteString(fmt.Sprintf("%s%s  %s\n", cur, ns.Render(br.name), st))
	}

	botBox := pane(w).Render(strings.TrimRight(bot.String(), "\n"))

	var out strings.Builder
	out.WriteString(mainBox + "\n")
	out.WriteString(botBox + "\n")

	if m.msg != "" {
		if m.msgErr {
			out.WriteString("  " + failSt.Render("✗ "+m.msg) + "\n")
		} else {
			out.WriteString("  " + okSt.Render("✓ "+m.msg) + "\n")
		}
	}

	out.WriteString(dimSt.Render("  d: delete · u: undo · ↑↓: navigate · q: quit") + "\n")

	return tea.NewView(out.String())
}

func main() {
	p := tea.NewProgram(model{branches: loadBranches()})
	if _, err := p.Run(); err != nil {
		fmt.Fprintf(os.Stderr, "error: %v\n", err)
		os.Exit(1)
	}
}
