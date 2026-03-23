package main

import (
	"fmt"
	"os"
	"os/exec"
	"strings"
	"time"
)

const (
	device  = "wlan0"
	network = "Zero"
)

func main() {
	if os.Geteuid() != 0 {
		fmt.Println("Re-running with sudo...")
		args := append([]string{os.Args[0]}, os.Args[1:]...)
		cmd := exec.Command("sudo", args...)
		cmd.Stdout = os.Stdout
		cmd.Stderr = os.Stderr
		cmd.Stdin = os.Stdin
		os.Exit(run(cmd))
	}

	steps := []struct {
		name string
		fn   func() error
	}{
		{"Ensuring iwd is running", ensureIwd},
		{"Scanning for networks", scan},
		{"Connecting to " + network, connect},
		{"Obtaining IP address", obtainIP},
		{"Verifying connectivity", verifyPing},
	}

	for _, s := range steps {
		fmt.Printf("→ %s...\n", s.name)
		if err := s.fn(); err != nil {
			fmt.Fprintf(os.Stderr, "  ✗ %s: %v\n", s.name, err)
			os.Exit(1)
		}
		fmt.Printf("  ✓ done\n")
	}

	fmt.Println("\nConnected to tether network.")
}

func run(cmd *exec.Cmd) int {
	if err := cmd.Run(); err != nil {
		if exit, ok := err.(*exec.ExitError); ok {
			return exit.ExitCode()
		}
		return 1
	}
	return 0
}

func ensureIwd() error {
	out, _ := exec.Command("systemctl", "is-active", "iwd").Output()
	if strings.TrimSpace(string(out)) == "active" {
		fmt.Println("  iwd already active")
		return nil
	}
	fmt.Println("  starting iwd...")
	return exec.Command("systemctl", "start", "iwd").Run()
}

func scan() error {
	// check if network is already known
	out, _ := exec.Command("iwctl", "station", device, "get-networks").Output()
	if strings.Contains(string(out), network) {
		fmt.Printf("  %s already visible, skipping scan\n", network)
		return nil
	}

	if err := exec.Command("iwctl", "station", device, "scan").Run(); err != nil {
		return fmt.Errorf("scan failed: %w", err)
	}
	// give scan a moment to discover networks
	time.Sleep(3 * time.Second)
	return nil
}

func connect() error {
	// check if already connected
	out, _ := exec.Command("iwctl", "station", device, "show").Output()
	if strings.Contains(string(out), "Connected network") && strings.Contains(string(out), network) {
		fmt.Printf("  already connected to %s\n", network)
		return nil
	}

	if err := exec.Command("iwctl", "station", device, "connect", network).Run(); err != nil {
		return fmt.Errorf("connect failed: %w", err)
	}
	// wait for connection to establish
	time.Sleep(2 * time.Second)
	return nil
}

func obtainIP() error {
	// check if we already have an IP
	out, _ := exec.Command("ip", "addr", "show", device).Output()
	if strings.Contains(string(out), "inet ") {
		for line := range strings.SplitSeq(string(out), "\n") {
			line = strings.TrimSpace(line)
			if strings.HasPrefix(line, "inet ") {
				fmt.Printf("  %s\n", line)
				return nil
			}
		}
	}

	// request IP via dhcpcd
	fmt.Println("  requesting DHCP lease...")
	if err := exec.Command("dhcpcd", device).Run(); err != nil {
		return fmt.Errorf("dhcpcd failed: %w", err)
	}

	// wait and verify
	time.Sleep(3 * time.Second)
	out, _ = exec.Command("ip", "addr", "show", device).Output()
	for line := range strings.SplitSeq(string(out), "\n") {
		line = strings.TrimSpace(line)
		if strings.HasPrefix(line, "inet ") {
			fmt.Printf("  %s\n", line)
			return nil
		}
	}
	return fmt.Errorf("no IP assigned on %s", device)
}

func verifyPing() error {
	cmd := exec.Command("ping", "-c", "3", "-W", "5", "1.1.1.1")
	cmd.Stdout = os.Stdout
	if err := cmd.Run(); err != nil {
		return fmt.Errorf("ping failed: %w", err)
	}
	return nil
}
